// "go ad-free" subscription: stripe-hosted checkout + a stateless, email-keyed
// ad-free identity (no reader accounts). a signed cookie marks a device ad-free;
// a magic link re-establishes it on other devices. stripe is the source of
// truth — the webhook keeps each subscriber's status current, and /status checks
// that live status, so a lapsed/cancelled subscription stops hiding ads even
// while the cookie lingers. every path no-ops when its secret is unset, so the
// blog is unchanged until stripe is wired.

import type { FastifyInstance } from 'fastify'
import type { Database } from '@matthesketh/utopia-database'
import nodemailer from 'nodemailer'
import Stripe from 'stripe'

import { config } from './config.js'
import { db } from './db.js'
import { makeMagic, normalise, readCookie, readMagic, setAdfreeCookie } from './adfree-token.js'

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null
const mailer = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null

// ----- subscriber store ----------------------------------------------------

interface Subscriber {
  email: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: string
  cancel_at_period_end: boolean
}

function table() {
  return (db as Database).query('subscribers')
}

// active subscriptions hide ads; a cancel-at-period-end stays 'active' until the
// period ends, when stripe fires subscription.deleted and we mark it cancelled.
const isActive = (s: Subscriber | null) => !!s && (s.status === 'active' || s.status === 'trialing')

async function getByEmail(email: string): Promise<Subscriber | null> {
  const row = await table().where({ email: normalise(email) }).first()
  return (row as unknown as Subscriber) ?? null
}

async function getByCustomer(customerId: string): Promise<Subscriber | null> {
  const row = await table().where({ stripe_customer_id: customerId }).first()
  return (row as unknown as Subscriber) ?? null
}

async function upsert(sub: {
  email: string
  customerId?: string | null
  subscriptionId?: string | null
  status: string
  cancelAtPeriodEnd?: boolean
  periodEnd?: string | null
}): Promise<void> {
  const email = normalise(sub.email)
  const now = new Date().toISOString()
  const fields = {
    stripe_customer_id: sub.customerId ?? null,
    stripe_subscription_id: sub.subscriptionId ?? null,
    status: sub.status,
    cancel_at_period_end: sub.cancelAtPeriodEnd ?? false,
    current_period_end: sub.periodEnd ?? null,
    updated_at: now,
  }
  const existing = await table().where({ email }).first()
  if (existing) {
    await table().where({ email }).update(fields)
  } else {
    await table().insert({ email, created_at: now, ...fields })
  }
}

// stripe moved current_period_end onto subscription items in recent api
// versions; read defensively from either location, best-effort (nullable).
function periodEndIso(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined
  const secs = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end
  return typeof secs === 'number' ? new Date(secs * 1000).toISOString() : null
}

const customerId = (c: string | Stripe.Customer | Stripe.DeletedCustomer | null) =>
  typeof c === 'string' ? c : (c?.id ?? null)

// ----- mailer --------------------------------------------------------------

async function sendMagicLink(email: string, url: string): Promise<void> {
  if (!mailer) return
  await mailer.sendMail({
    from: config.mailFrom,
    to: email,
    subject: 'Your ad-free link for the blog',
    text: `Open this link on this device to go ad-free:\n\n${url}\n\nThe link works once and expires in 30 minutes.`,
    html: `<p>Open this link on this device to go ad-free:</p><p><a href="${url}">Go ad-free</a></p><p style="color:#666;font-size:13px">The link works once and expires in 30 minutes.</p>`,
  })
}

// ----- routes --------------------------------------------------------------

export function registerAdfreeRoutes(app: FastifyInstance): void {
  // start a hosted checkout for the monthly ad-free subscription.
  app.post('/api/adfree/checkout', async (req, reply) => {
    if (!stripe || !config.stripePriceId) return reply.code(503).send({ error: 'not configured' })
    const { email } = (req.body ?? {}) as { email?: string }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: config.stripePriceId, quantity: 1 }],
      customer_email: email ? normalise(email) : undefined,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      success_url: `${config.publicUrl}/adfree?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.publicUrl}/adfree?cancelled=1`,
    })
    return { url: session.url }
  })

  // stripe webhook: keep each subscriber's status current. raw body is stashed
  // by the content-type parser in index.ts for signature verification.
  app.post('/api/adfree/webhook', async (req, reply) => {
    if (!stripe || !config.stripeWebhookSecret) return reply.code(503).send({ error: 'not configured' })
    const sig = req.headers['stripe-signature']
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody
    if (!sig || !raw) return reply.code(400).send({ error: 'missing signature' })
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(raw, sig, config.stripeWebhookSecret)
    } catch (err) {
      return reply.code(400).send({ error: `signature: ${(err as Error).message}` })
    }
    try {
      await handleEvent(event)
    } catch (err) {
      req.log.error(err, 'adfree webhook handler failed')
      return reply.code(500).send({ error: 'handler failed' })
    }
    return { received: true }
  })

  // is THIS device ad-free? reads the signed cookie, then checks live status.
  app.get('/api/adfree/status', async (req) => {
    const email = readCookie(req.cookies[config.adfreeCookieName])
    if (!email) return { adFree: false }
    return { adFree: isActive(await getByEmail(email)) }
  })

  // right after checkout: confirm the session paid, link the subscriber, and set
  // the cookie so the subscribing device is ad-free immediately (independent of
  // webhook timing).
  app.post('/api/adfree/claim-session', async (req, reply) => {
    if (!stripe) return reply.code(503).send({ error: 'not configured' })
    const { sessionId } = (req.body ?? {}) as { sessionId?: string }
    if (!sessionId) return reply.code(400).send({ error: 'sessionId required' })
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] })
    const email = session.customer_details?.email || session.customer_email
    const sub = session.subscription as Stripe.Subscription | null
    if (!email || !sub || !isActive({ status: sub.status } as Subscriber)) {
      return { adFree: false }
    }
    await upsert({
      email,
      customerId: customerId(session.customer),
      subscriptionId: sub.id,
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      periodEnd: periodEndIso(sub),
    })
    setAdfreeCookie(reply, email)
    return { adFree: true, email }
  })

  // ask for a magic link to go ad-free on this device. always 200 (never reveals
  // whether an address is a subscriber).
  app.post('/api/adfree/magic', async (req) => {
    const { email } = (req.body ?? {}) as { email?: string }
    if (email && isActive(await getByEmail(email))) {
      const url = `${config.publicUrl}/adfree/login?token=${makeMagic(email)}`
      await sendMagicLink(normalise(email), url).catch(() => undefined)
    }
    return { ok: true }
  })

  // magic-link target: verify, set the cookie, bounce back to /adfree.
  app.get('/adfree/login', async (req, reply) => {
    const { token } = (req.query ?? {}) as { token?: string }
    const email = readMagic(token)
    if (email && isActive(await getByEmail(email))) {
      setAdfreeCookie(reply, email)
      return reply.redirect(`${config.publicUrl}/adfree?claimed=1`)
    }
    return reply.redirect(`${config.publicUrl}/adfree?error=link`)
  })

  // self-serve manage/cancel via the stripe customer portal.
  app.post('/api/adfree/portal', async (req, reply) => {
    if (!stripe) return reply.code(503).send({ error: 'not configured' })
    const email = readCookie(req.cookies[config.adfreeCookieName])
    const sub = email ? await getByEmail(email) : null
    if (!sub?.stripe_customer_id) return reply.code(400).send({ error: 'no subscription on this device' })
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${config.publicUrl}/adfree`,
    })
    return { url: session.url }
  })
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const email = session.customer_details?.email || session.customer_email
      if (!email || !stripe) return
      const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
      if (!subId) return
      const sub = await stripe.subscriptions.retrieve(subId)
      await upsert({
        email,
        customerId: customerId(session.customer),
        subscriptionId: sub.id,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        periodEnd: periodEndIso(sub),
      })
      return
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const existing = await getByCustomer(customerId(sub.customer) ?? '')
      if (!existing) return // not linked yet; checkout.session.completed links it
      await upsert({
        email: existing.email,
        customerId: customerId(sub.customer),
        subscriptionId: sub.id,
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        periodEnd: periodEndIso(sub),
      })
      return
    }
    default:
      return
  }
}

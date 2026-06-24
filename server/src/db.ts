import { createDatabase } from '@matthesketh/utopia-database'
import { createPostgresAdapter } from '@matthesketh/utopia-database/postgres'

export const db = createDatabase(createPostgresAdapter({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'blog_admin',
  user: process.env.DB_USER || 'blog_admin',
  password: process.env.DB_PASSWORD || '',
  pool: { min: 1, max: 5 },
}))

export const SESSION_MIGRATION = {
  name: '001_create_sessions',
  up: `CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  down: 'DROP TABLE IF EXISTS sessions',
}

// ad-free subscribers. keyed by lower-cased email (the identity a reader proves
// via the magic link); stripe is the source of truth and the webhook keeps
// status/period current. no foreign key — readers are not admin users.
export const SUBSCRIBERS_MIGRATION = {
  name: '003_create_subscribers',
  up: `CREATE TABLE IF NOT EXISTS subscribers (
    email VARCHAR(320) PRIMARY KEY,
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'incomplete',
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  down: 'DROP TABLE IF EXISTS subscribers',
}


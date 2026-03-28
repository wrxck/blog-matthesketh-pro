# Blog Admin Panel — Design Spec

## Overview

Add a backend admin panel to `blog.matthesketh.pro` where Matt can log in via passkey and publish rich blog posts using a visual split-pane markdown editor. The existing static blog architecture is preserved — the admin writes markdown files and triggers rebuilds.

## Architecture

### Current state

- UtopiaJS static SPA built at deploy time
- Markdown posts in `content/blog/` processed by `@matthesketh/utopia-content` at build time
- Served by nginx in a Docker container on port 60612
- No backend, no database, no auth

### New state

- Node.js server (Fastify) replaces nginx as the process inside the container
- Serves the static blog from `dist/` (same build output as before)
- Serves the admin SPA from `dist-admin/`
- Exposes API routes under `/api/admin/*`
- Triggers `utopia build` on publish to regenerate the static site
- Passkey auth with session cookies

### Request routing

```
blog.matthesketh.pro/              → static files from dist/
blog.matthesketh.pro/blog/:slug    → static files from dist/ (SPA fallback)
blog.matthesketh.pro/admin         → admin SPA from dist-admin/
blog.matthesketh.pro/admin/*       → admin SPA from dist-admin/ (SPA fallback)
blog.matthesketh.pro/api/admin/*   → Fastify API routes (auth required)
```

## Authentication

### Technology

- **@simplewebauthn/server** (server-side WebAuthn)
- **@simplewebauthn/browser** (client-side WebAuthn)
- Session cookies (httpOnly, secure, sameSite strict)

### Flow

1. **First visit** — no credentials file exists → `/admin` shows registration form
   - User enters a display name (e.g. "Matt")
   - Browser prompts for passkey creation (biometric/PIN)
   - Server stores credential public key to `data/credentials.json`
   - Registration endpoint is permanently locked after first credential is stored
2. **Login** — credentials exist → `/admin` shows login prompt
   - Server generates challenge
   - Browser prompts for passkey verification
   - Server verifies assertion, sets session cookie
3. **Session** — in-memory session store, 7-day expiry
   - All `/api/admin/*` routes check for valid session
   - `/api/admin/auth/status` endpoint for the admin SPA to check auth state

### Security

- Registration locked after first credential (single-user only)
- CSRF protection via sameSite cookies
- Challenge stored server-side, validated once (replay protection)
- No passwords anywhere in the system

## Data Storage

### Posts — filesystem

Posts remain as markdown files in `content/blog/`:

```
content/blog/
  hello-world.md
  agenttop.md
  my-new-post.md
```

Each file has YAML frontmatter:

```yaml
---
title: "Post Title"
description: "A short description"
date: 2026-03-27
tags: ["tag1", "tag2"]
draft: false
---

Markdown body here...
```

### Credentials — JSON file

```
data/credentials.json
```

Contains the registered passkey credential(s) and user info. Persisted via Docker volume.

### Sessions — in-memory

No persistence needed. Server restart = re-login (acceptable for single user).

## Admin UI

### Stack

- Separate UtopiaJS app in `admin/` directory
- Built separately to `dist-admin/`
- Same design system: DM Mono, black/white, sharp borders, no border-radius

### Pages

#### `/admin` — Auth page

- If no credentials registered: registration form with display name input + "Register Passkey" button
- If credentials exist: "Login with Passkey" button
- Minimal centered layout matching the blog aesthetic

#### `/admin/posts` — Post list (dashboard)

- Header: "POSTS" title + "New Post" button
- Search input (same style as blog homepage search)
- List of all posts showing: title, date, status pill (DRAFT/PUBLISHED), edit button
- Posts sorted by date descending
- Click to edit

#### `/admin/posts/new` — New post editor

- Frontmatter fields above editor:
  - Title (text input)
  - Description (text input)
  - Tags (comma-separated text input)
  - Date (date input, defaults to today)
  - Draft toggle (checkbox)
- Split-pane below:
  - Left: Milkdown editor in markdown mode, DM Mono font
  - Right: live HTML preview using the blog's `.prose` CSS
- Toolbar: bold, italic, headings (h2/h3), code (inline + block), link, image, blockquote, ordered/unordered list, horizontal rule
- Action buttons: "Save Draft", "Publish", "Back to Posts"

#### `/admin/posts/:slug/edit` — Edit existing post

- Same layout as new post editor
- Loaded with existing post content and frontmatter
- Additional button: "Delete" (with confirmation)

### Theming

All admin UI uses these design tokens (matching blog `global.css`):

- Font: `DM Mono, monospace` for everything
- Colors: `#000` text, `#fff` background, `#333` muted, `#000` borders
- Dark mode: `#fff` text, `#000` background, `#ccc` muted, `#fff` borders
- Border radius: `0px` everywhere
- Hover states: invert (black bg, white text)
- Inputs: 1px solid border, no radius, DM Mono font

## API Routes

All routes under `/api/admin/` require valid session except auth endpoints.

### Auth

```
POST /api/admin/auth/register-options    → generate registration options
POST /api/admin/auth/register            → verify and store credential
POST /api/admin/auth/login-options       → generate authentication options
POST /api/admin/auth/login               → verify assertion, set session
POST /api/admin/auth/logout              → clear session
GET  /api/admin/auth/status              → { registered: bool, authenticated: bool }
```

### Posts

```
GET    /api/admin/posts                  → list all posts (frontmatter only)
GET    /api/admin/posts/:slug            → get single post (frontmatter + body)
POST   /api/admin/posts                  → create new post
PUT    /api/admin/posts/:slug            → update existing post
DELETE /api/admin/posts/:slug            → delete post file
POST   /api/admin/posts/:slug/publish    → set draft:false + trigger rebuild
POST   /api/admin/posts/rebuild          → manually trigger utopia build
```

### Post body format (create/update)

```json
{
  "title": "Post Title",
  "description": "Short description",
  "date": "2026-03-27",
  "tags": ["tag1", "tag2"],
  "draft": true,
  "body": "Markdown content here..."
}
```

## Publish Flow

1. User writes/edits post in admin editor
2. "Save Draft" → `POST/PUT` with `draft: true` → writes `.md` file, no rebuild
3. "Publish" → `POST /api/admin/posts/:slug/publish` → sets `draft: false` in frontmatter, triggers `utopia build`
4. Build runs in background (child process: `npx utopia build`)
5. Build output overwrites `dist/` — Fastify serves updated static files immediately
6. API returns build status (success/error)

## Docker Changes

### Dockerfile

```dockerfile
FROM node:20-alpine AS blog-builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine AS admin-builder
WORKDIR /app
COPY admin/package.json admin/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY admin/ .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY server/ .
COPY --from=blog-builder /app/dist ./dist
COPY --from=admin-builder /app/dist ./dist-admin
COPY content/ ./content
COPY package.json pnpm-lock.yaml ./blog-src/
COPY src/ ./blog-src/src/
COPY public/ ./blog-src/public/
COPY index.html vite.config.ts tsconfig.json ./blog-src/
EXPOSE 60612
USER node
CMD ["node", "index.js"]
```

### docker-compose.yml changes

```yaml
services:
  blog-matthesketh-pro:
    build:
      context: .
    container_name: blog-matthesketh-pro
    ports:
      - "127.0.0.1:60612:60612"
    volumes:
      - blog-data:/app/data
      - blog-content:/app/content
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 512M

volumes:
  blog-data:
  blog-content:
```

Note: CPU/memory limits increased (0.25→0.50 CPU, 128M→512M) to accommodate Node server + build process.

## Package Dependencies

### Server (`server/package.json`)

- **fastify** — HTTP server
- **@fastify/static** — static file serving
- **@fastify/cookie** — cookie parsing
- **@simplewebauthn/server** — WebAuthn server operations
- **gray-matter** — frontmatter parsing for reading/writing posts
- **@matthesketh/utopia-cli** — used for triggering builds (or direct vite build)

### Admin (`admin/package.json`)

- **@matthesketh/utopia-core** — signals, reactivity
- **@matthesketh/utopia-runtime** — mounting
- **@matthesketh/utopia-router** — SPA routing
- **@simplewebauthn/browser** — WebAuthn browser operations
- **@milkdown/core** — editor core
- **@milkdown/prose** — ProseMirror integration
- **@milkdown/preset-commonmark** — markdown syntax support
- **@milkdown/preset-gfm** — GitHub Flavored Markdown (tables, strikethrough, etc.)
- **@milkdown/theme-nord** — base theme (we'll override to match our black/white design)
- **@milkdown/plugin-listener** — editor change events
- **@milkdown/plugin-prism** — code syntax highlighting in preview

### Dev dependencies

- **@matthesketh/utopia-cli** — build tooling
- **@matthesketh/utopia-vite-plugin** — vite integration
- **typescript**
- **vite**

## File Structure

```
blog-matthesketh-pro/
  content/blog/              ← existing markdown posts
  src/                       ← existing blog frontend
  public/                    ← existing static assets
  admin/                     ← NEW: admin SPA
    src/
      main.ts
      App.utopia
      global.css
      pages/
        +page.utopia         ← auth (login/register)
        posts/
          +page.utopia       ← post list
          new/
            +page.utopia     ← new post editor
          [slug]/
            +page.utopia     ← edit post editor
      components/
        Editor.utopia        ← milkdown split-pane editor
        Toolbar.utopia       ← editor toolbar
        PostForm.utopia      ← frontmatter fields
    package.json
    vite.config.ts
    index.html
    tsconfig.json
  server/                    ← NEW: Fastify backend
    index.ts                 ← server entry, static serving, route registration
    auth.ts                  ← passkey registration/login routes
    posts.ts                 ← post CRUD routes
    session.ts               ← session middleware
    build.ts                 ← utopia build trigger
    package.json
    tsconfig.json
  data/                      ← NEW: persisted via volume
    credentials.json         ← passkey credentials
  Dockerfile                 ← updated
  docker-compose.yml         ← updated (volumes added)
```

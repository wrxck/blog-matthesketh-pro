# Blog with Admin Panel

A config-driven blog with a built-in admin panel for writing and publishing posts. Built with [UtopiaJS](https://github.com/wrxck/utopiajs), Fastify, and Vite.

## Features

- Markdown blog with tags, search, and RSS/Atom feeds
- Admin panel with WebAuthn passkey authentication (no passwords)
- Inline markdown editor with live preview
- One-click publish with automatic site rebuild
- Dark mode support

## Quick Start

1. Clone this repo
2. Edit `site.config.ts` with your details
3. Install and build:

```bash
pnpm install
pnpm build
```

The build will fail if `site.config.ts` still contains placeholder values.

## Configuration

### site.config.ts

Edit `site.config.ts` at the project root:

| Field | Description |
|-------|-------------|
| `name` | Your name (used in header, footer, feeds) |
| `title` | Blog title (used in page title) |
| `description` | One-line description for meta tags and feeds |
| `locale` | Locale code (e.g. `en_GB`) |
| `themeColor` | Browser theme color (hex) |
| `url` | Blog's canonical URL |
| `author.name` | Author name for structured data |
| `author.url` | Link to your main site |
| `nav.cv` | URL to your CV site (header link) |
| `nav.github` | URL to your GitHub (header link) |
| `admin.hostname` | Admin panel hostname (e.g. `admin.yourdomain.com`) |
| `admin.rpId` | WebAuthn relying party ID (your root domain) |
| `admin.origin` | Admin panel origin URL |

### docker-compose.yml

Set the admin panel domain in the `environment` section:

```yaml
environment:
  - ADMIN_HOST=admin.yourdomain.com
  - RP_ID=yourdomain.com
  - ORIGIN=https://admin.yourdomain.com
```

## Local Development

```bash
pnpm dev          # Blog frontend on http://localhost:5173
cd server && pnpm dev  # API server on http://localhost:60612
cd admin && pnpm dev   # Admin panel on http://localhost:5174
```

## Deployment

### Docker

```bash
docker compose up -d --build
```

The server runs on port `60612` and handles:
- Blog frontend (static)
- Admin panel (served on the admin subdomain)
- API endpoints (`/api/admin/*`)

### Admin Panel Setup

The admin panel requires a subdomain (e.g. `admin.yourdomain.com`).

1. **DNS:** Add an A/CNAME record for `admin.yourdomain.com` pointing to your server
2. **Reverse proxy:** Configure nginx (or similar) to proxy `admin.yourdomain.com` to `localhost:60612`:

```nginx
server {
    listen 443 ssl;
    server_name admin.yourdomain.com;

    # SSL certificate config here

    location / {
        proxy_pass http://127.0.0.1:60612;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. **Register your passkey:** Visit `admin.yourdomain.com` and click "Register" to set up your WebAuthn passkey. This only needs to be done once. Only the first registration is accepted — no one else can register after you.

### Blog-Only (No Admin)

To use this as a blog without the admin panel, write markdown files directly in `content/blog/`:

```markdown
---
title: My First Post
description: A short description
date: 2026-01-01
tags: [hello, world]
draft: false
---

Your markdown content here.
```

Run `pnpm build` to regenerate the static site.

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

export const POSTS_MIGRATION = {
  name: '002_create_posts',
  up: `CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    date DATE NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    draft BOOLEAN NOT NULL DEFAULT true,
    body TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  down: 'DROP TABLE IF EXISTS posts',
}

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


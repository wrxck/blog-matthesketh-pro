# --- Stage 1: Build blog static output ---
FROM node:20-alpine AS blog-builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY src/ ./src/
COPY public/ ./public/
COPY content/ ./content/
COPY index.html vite.config.ts tsconfig.json ./
RUN pnpm build

# --- Stage 2: Build admin SPA ---
FROM node:20-alpine AS admin-builder
WORKDIR /app
RUN corepack enable
COPY admin/package.json admin/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY admin/src/ ./src/
COPY admin/index.html admin/vite.config.ts admin/tsconfig.json ./
RUN pnpm build

# --- Stage 3: Build server ---
FROM node:20-alpine AS server-builder
WORKDIR /app
RUN corepack enable
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/src/ ./src/
COPY server/tsconfig.json ./
RUN pnpm build

# --- Stage 4: Runtime ---
FROM node:20-alpine
WORKDIR /app
RUN corepack enable

# Server runtime deps
COPY server/package.json server/pnpm-lock.yaml ./server/
RUN cd server && pnpm install --frozen-lockfile --prod

# Server compiled output
COPY --from=server-builder /app/dist ./server/dist/

# Blog static output (initial build, may be overwritten by volume)
COPY --from=blog-builder /app/dist ./dist/

# Admin static output
COPY --from=admin-builder /app/dist ./dist-admin/

# Blog source + deps for in-container rebuilds
COPY package.json pnpm-lock.yaml ./blog/
RUN cd blog && pnpm install --frozen-lockfile
COPY src/ ./blog/src/
COPY public/ ./blog/public/
COPY content/ ./blog/content/
COPY index.html vite.config.ts tsconfig.json ./blog/

# Data directory for credentials (writable by node user)
RUN mkdir -p data && chown node:node data

ENV NODE_ENV=production
ENV PORT=60612
ENV DIST_DIR=/app/dist
ENV DIST_ADMIN_DIR=/app/dist-admin
ENV CONTENT_DIR=/app/blog/content
ENV DATA_DIR=/app/data
ENV BLOG_DIR=/app/blog
ENV ADMIN_HOST=admin.localhost
ENV RP_ID=localhost
ENV ORIGIN=http://admin.localhost

EXPOSE 60612

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:60612/ || exit 1

USER node
CMD ["node", "server/dist/index.js"]

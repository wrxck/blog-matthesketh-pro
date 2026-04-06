#!/bin/sh
set -e

# fix ownership of volume-mounted directories
# docker named volumes are created as root — node user (1000) needs write access
chown -R node:node /app/blog/content
chown -R node:node /app/data

# vite writes temp config files next to vite.config.ts during build
chown node:node /app/blog

# drop to node user and exec the server
exec su-exec node "$@"

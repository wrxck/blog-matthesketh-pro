#!/bin/sh
set -e

# fix ownership of volume-mounted directories
# docker named volumes are created as root — node user (1000) needs write access
chown -R node:node /app/blog/content
chown -R node:node /app/data

# vite writes temp files during build
mkdir -p /app/blog/node_modules/.vite-temp
chown -R node:node /app/blog/node_modules/.vite-temp

# drop to node user and exec the server
exec su-exec node "$@"

FROM node:18-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY database ./database

# Generate Prisma client
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# ============================================================
FROM node:18-alpine AS production

RUN apk add --no-cache openssl mariadb-client

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_HOST=db
ENV DB_PORT=3306
ENV DB_NAME=campusops
ENV DB_USER=campusops
ENV REDIS_URL=redis://redis:6379
ENV STORAGE_PATH=/data/storage
ENV LOG_PATH=/logs
ENV BACKUP_PATH=/backups
ENV LOG_LEVEL=info
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node
ENV TZ=America/New_York

# Copy built app and production deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/database ./database
COPY package*.json ./

# Copy entrypoint (handles secret → DATABASE_URL)
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create required runtime directories
RUN mkdir -p /data/storage /logs /backups

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=45s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/src/server.js"]

FROM node:18-alpine AS builder

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
ENV TZ=America/New_York
ENV SEED_ADMIN_PASSWORD=CHANGE_ME_ADMIN_PASSWORD
ENV SEED_OPS_MANAGER_PASSWORD=CHANGE_ME_OPS_PASSWORD
ENV SEED_SUPERVISOR_PASSWORD=CHANGE_ME_SUPERVISOR_PASSWORD
ENV SEED_CS_AGENT_PASSWORD=CHANGE_ME_CS_PASSWORD
ENV SEED_AUDITOR_PASSWORD=CHANGE_ME_AUDITOR_PASSWORD

# Copy built app and production deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

# Copy entrypoint (handles secret → DATABASE_URL)
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create required runtime directories
RUN mkdir -p /data/storage /logs /backups

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=45s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]

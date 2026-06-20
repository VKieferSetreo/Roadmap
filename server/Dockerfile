FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production \
    PORT=8095 \
    REQUIRE_AUTH=true \
    TZ=UTC

EXPOSE 8095

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8095/api/health || exit 1

# Migrate-on-boot, dann Server
CMD ["sh", "-c", "node scripts/migrate.js && node src/index.js"]

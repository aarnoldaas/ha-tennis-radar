ARG BUILD_FROM

# ==========================================
# Stage 1: Compile TypeScript
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN NODE_OPTIONS="--max-old-space-size=256" npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build && npm prune --production

# ==========================================
# Stage 2: HA Add-on Runtime
# ==========================================
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

COPY public/ ./public/
COPY rootfs /

RUN chmod +x /etc/s6-overlay/s6-rc.d/*/run 2>/dev/null || true

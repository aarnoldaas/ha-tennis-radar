ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production --ignore-scripts && npm cache clean --force && apk del npm

COPY dist/ ./dist/
COPY public/ ./public/
COPY rootfs /

RUN chmod +x /etc/s6-overlay/s6-rc.d/*/run 2>/dev/null || true

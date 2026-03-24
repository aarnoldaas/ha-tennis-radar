ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs

WORKDIR /app

COPY dist/bundle.cjs ./dist/
COPY public/ ./public/
COPY rootfs /

RUN chmod +x /etc/s6-overlay/s6-rc.d/*/run 2>/dev/null || true

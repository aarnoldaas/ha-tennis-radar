ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm

WORKDIR /app

# Cache-bust: forces fresh COPY on every version
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=${BUILD_VERSION}
RUN echo "version=${BUILD_VERSION}"

COPY package.json build.mjs ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm install && npm run build && rm -rf node_modules src build.mjs package.json

COPY rootfs /

RUN chmod +x /etc/s6-overlay/s6-rc.d/*/run 2>/dev/null || true

ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs

WORKDIR /app

# Cache-bust: forces fresh COPY on every version
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=${BUILD_VERSION}
RUN echo "version=${BUILD_VERSION}"

COPY dist/bundle.cjs ./dist/
COPY public/ ./public/
COPY rootfs /

RUN chmod +x /etc/s6-overlay/s6-rc.d/*/run 2>/dev/null || true

FROM oven/bun:latest

RUN apt-get update && apt-get install -y apache2-utils --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . ./

RUN chmod +x /app/docker-entrypoint.sh \
  && mkdir -p /app/storage \
  && chown -R bun:bun /app

# Build version arguments
ARG BUILD_VERSION=development
ARG BUILD_TIMESTAMP

# Set as environment variables
ENV BUILD_VERSION=${BUILD_VERSION}
ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}

EXPOSE 3000

USER bun

ENTRYPOINT ["/app/docker-entrypoint.sh"]

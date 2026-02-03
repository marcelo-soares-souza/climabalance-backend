FROM oven/bun:latest

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . ./

RUN chmod +x /app/docker-entrypoint.sh

# Build version arguments
ARG BUILD_VERSION=development
ARG BUILD_TIMESTAMP

# Set as environment variables
ENV BUILD_VERSION=${BUILD_VERSION}
ENV BUILD_TIMESTAMP=${BUILD_TIMESTAMP}

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]

FROM oven/bun:latest

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . ./

RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]

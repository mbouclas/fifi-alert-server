# fifi-alert-server API image.
#
# Runs the TypeScript sources directly under Bun (same as development and the
# former pm2 setup): no nest build step, no dist/. Nunjucks email templates are
# resolved from src/notifications/email at runtime, so src/ must be present.
#
# Build context is the repo root; see .dockerignore for what is excluded.
# The container entrypoint applies pending Prisma migrations, then starts the API.

FROM oven/bun:1.4.2-debian

# Prisma's engines want OpenSSL; curl is for the compose healthcheck.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first so this layer is cached until the lockfile changes.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Regenerate the Prisma client for this platform (the committed copy under
# src/generated/prisma was produced on the developer's machine). `prisma
# generate` does not connect, but prisma.config.ts reads the URLs eagerly, so
# give it placeholders for the duration of this one command.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    SHADOW_DATABASE_URL=postgresql://build:build@localhost:5432/build_shadow \
    bunx prisma generate

RUN mkdir -p logs uploads \
  && chown -R bun:bun /app \
  && chmod +x docker/entrypoint.sh

USER bun

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3113

EXPOSE 3113

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["bun", "src/main.ts"]

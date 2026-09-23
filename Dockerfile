# ============================================================
# Stage 1: Install all dependencies (dev + prod for build)
# ============================================================
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ============================================================
# Stage 2: Build client (Vite) and server (TypeScript)
# ============================================================
FROM deps AS build

COPY tsconfig.json tsconfig.server.json tsconfig.client.json vite.config.ts ./
COPY server/ ./server/
COPY client/ ./client/
COPY shared/ ./shared/
# Release artwork imported by the client bundle.
COPY docs/evidence/changelog/ ./docs/evidence/changelog/

RUN pnpm run build

# tsconfig.server.json has rootDir: "." so the compiled entry point lands at
# dist/server/server/index.js, which finds the client at dist/client
# (see clientDistCandidates in server/index.ts).

# ============================================================
# Stage 3: Production image (minimal)
# ============================================================
FROM node:22-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build --chown=appuser:appgroup /app/dist ./dist
# Public deployment configuration; credentials are supplied through runtime secrets.
COPY --chown=appuser:appgroup config/ ./config/

# Only /app itself needs to be writable (for example a local .data database);
# a recursive chown would store node_modules and dist a second time.
RUN chown appuser:appgroup /app

ENV NODE_ENV=production
ENV PORT=4242
ENV HOST=0.0.0.0

EXPOSE 4242

USER appuser

CMD ["node", "dist/server/server/index.js"]

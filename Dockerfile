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

RUN pnpm run build

# tsconfig.server.json has rootDir: "." so the compiled entry point
# lands at dist/server/server/index.js. It resolves __dirname-relative
# paths for the client dist and server-config.json — fix the layout:
RUN mkdir -p dist/server/dist && \
    cp -r dist/client dist/server/dist/client

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

COPY --from=build /app/dist ./dist

# Copy optional server-config.json to the location the compiled server expects.
# Glob pattern avoids failure if the file is absent from the build context.
COPY server-config.jso[n] ./dist/server/server-config.json

RUN chown -R appuser:appgroup /app

ENV NODE_ENV=production
ENV PORT=4242
ENV HOST=0.0.0.0

EXPOSE 4242

USER appuser

CMD ["node", "dist/server/server/index.js"]

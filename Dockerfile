# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Keep only production dependencies (prisma client is already generated).
RUN npm prune --omit=dev

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --chown=app:app package.json ./

USER app
EXPOSE 3000

# Migrations are applied by the deploy pipeline / compose migrate service,
# not at container start, so replicas don't race each other.
CMD ["node", "dist/main.js"]

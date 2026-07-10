# Orion: game + community server in one container.
# Build:  docker build -t orion .
# Run:    docker run -p 8787:8787 -v orion-data:/data orion
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server

ENV PORT=8787 \
    ORION_SERVE_DIST=1 \
    ORION_DB=/data/orion.db
# CLERK_PUBLISHABLE_KEY=pk_... CLERK_SECRET_KEY=sk_...  (enables Clerk sign-in)
# GOOGLE_CLIENT_ID=...   (optional, enables direct Google sign-in)

VOLUME /data
EXPOSE 8787
CMD ["node", "server/index.mjs"]

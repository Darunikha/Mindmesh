# Mindmesh: one container serving the API and the built web app on a single origin.
#   docker build -t mindmesh .
#   docker run -p 4000:4000 --env-file server/.env -e NODE_ENV=production mindmesh
# Persist uploads by mounting a volume at /app/server/uploads.

# ── Build stage: install everything and build the frontend ────────────────
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
# Skip the MongoDB binary download used only by tests.
ENV MONGOMS_DISABLE_POSTINSTALL=1
RUN npm ci --ignore-scripts
COPY client client
RUN npm run build -w client

# ── Runtime stage: production dependencies, server source, built client ──
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=4000 \
    SERVE_CLIENT=true \
    CLIENT_DIST=/app/client/dist \
    UPLOAD_DIR=/app/server/uploads
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false --ignore-scripts && npm cache clean --force
COPY server/src server/src
COPY server/scripts server/scripts
COPY --from=build /app/client/dist client/dist
RUN mkdir -p server/uploads && chown -R node:node server/uploads
USER node
WORKDIR /app/server
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "src/index.js"]

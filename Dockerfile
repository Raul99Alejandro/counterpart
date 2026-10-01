# syntax=docker/dockerfile:1

# Build: TypeScript and UIs, with every dependency.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY seed ./seed
COPY infra ./infra
COPY ui ./ui
RUN npm run build

# Final: production dependencies, compiled code and UI bundles.
FROM node:24-slim
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/build/ui ./build/ui
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/ping').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/src/index.js"]

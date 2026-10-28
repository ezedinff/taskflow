FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY packages/contracts/package.json packages/contracts/
COPY services/project-service/package.json services/project-service/
COPY services/task-service/package.json services/task-service/
COPY apps/web/package.json apps/web/
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; npm ci --no-audit
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY services/project-service services/project-service
RUN npm run build -w @taskflow/contracts && npm run generate -w @taskflow/project-service && npm run build -w @taskflow/project-service
RUN npm prune --omit=dev --ignore-scripts --no-audit
FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/contracts ./packages/contracts
COPY --from=build --chown=node:node /app/services/project-service ./services/project-service
USER node
WORKDIR /app/services/project-service
EXPOSE 3001
CMD ["node","dist/index.js"]

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY packages/contracts/package.json packages/contracts/
COPY services/project-service/package.json services/project-service/
COPY services/task-service/package.json services/task-service/
COPY apps/web/package.json apps/web/
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; npm ci --no-audit
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN npm run build -w @taskflow/web
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
CMD ["nginx","-g","daemon off;"]

# TaskFlow

A responsive project task board built with **exactly two custom backend microservices**, private PostgreSQL schemas, and independently scalable Kubernetes Deployments.

Project Service owns projects/members. Task Service owns tasks and validates references through real REST calls. A persistent write-permit protocol coordinates deletion across replicas. React uses relative API paths; a static Nginx frontend supplies the single external entry point.

## Quick start

Requires Docker Compose v2 and Node 24 LTS.

```sh
npm ci
node scripts/configure.mjs
docker compose up --build -d --wait
npm run smoke
npm run seed
```

Open [TaskFlow](http://localhost:8080). Configuration generates unique local passwords; it refuses to overwrite an existing `.env`. Demo data is opt-in and is never reapplied on startup.

```sh
docker compose down
# WARNING: permanently deletes this stack's database volume.
docker compose down -v
```

## Repository

```text
apps/web/                    React, Router, TanStack Query, Vite, Tailwind
services/project-service/    Fastify API, project business logic, private Prisma schema/migrations
services/task-service/       Fastify API, task business logic, typed REST client, Prisma schema/migrations
packages/contracts/          Shared Zod inputs, error contract, server and HTTP utilities
infrastructure/kubernetes/   Namespace, database/PVC, Deployments, Services, Jobs, HPA, policies
scripts/                     Configure, isolated integration tests, smoke, seed, image build/deploy
.github/workflows/           CI and manually triggered Docker Hub publication
```

## Verification

```sh
npm run generate
npm run build -w @taskflow/contracts
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
BASE_URL=http://localhost:8080 npm run smoke
```

Integration tests use a newly created disposable database container; they do not use development data. See [verification results](docs/verification.md) for checks actually executed and remaining external requirements.

## Kubernetes

```sh
minikube start -p taskflow --driver=docker --cpus=2 --memory=3072 --kubernetes-version=v1.34.0
./scripts/build-images.sh
minikube -p taskflow image load taskflow-project-service:dev taskflow-task-service:dev taskflow-web:dev postgres:17-alpine
./scripts/deploy-local.sh
kubectl port-forward -n taskflow service/web 8081:8080
```

Open [Kubernetes TaskFlow](http://localhost:8081), then in another terminal:

```sh
BASE_URL=http://localhost:8081 npm run smoke
kubectl scale deployment/project-service --replicas=3 -n taskflow
kubectl scale deployment/task-service --replicas=2 -n taskflow
kubectl get pods -n taskflow
kubectl delete pod postgres-0 -n taskflow
kubectl wait --for=condition=ready pod/postgres-0 -n taskflow --timeout=180s
```

The PVC survives pod recreation. Deleting the cluster or PVC is destructive. [Deployment instructions](docs/deployment.md) cover NodePort browser access, kind, logs, migration jobs, immutable registry tags, development, recovery, and cleanup.

## Docker Hub

After committing the reviewed source, authorizing publication, and configuring your account (see the deployment guide):

```sh
export DOCKERHUB_USERNAME=your-dockerhub-username
export TAG=$(git rev-parse HEAD)
docker login --username "$DOCKERHUB_USERNAME"
./scripts/build-images.sh
./scripts/publish-images.sh
```

The manual GitHub workflow uses `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` secrets, an approval-protected `dockerhub` environment, SHA tags and multi-platform builds. No remote repository, published image or recorded video is implied by this source tree.

## Documentation

- [Architecture and patterns](docs/architecture.md), [Mermaid diagram](docs/architecture-diagram.md)
- [Design decisions](docs/design-decisions.md), [security and limitations](docs/security.md)
- [Deployment and commands](docs/deployment.md), [scaling, failure and persistence demos](docs/scaling.md)
- [Eight-minute speaking notes and terminal commands](docs/demo-script.md)
- [Executed verification and acceptance evidence](docs/verification.md)

Local Swagger UIs are available at `/docs` on each backend, or `/docs/projects/` and `/docs/tasks/` through the static frontend. API inputs use Zod, errors have `{error:{code,message,requestId}}`, and every response includes a generated request ID.

This university MVP has no end-user authentication. A production deployment needs authentication, project authorization, TLS, backups, hardened secret management, and capacity planning. A small task board would normally be a monolith; the architecture documents explain when the additional operational cost becomes reasonable.

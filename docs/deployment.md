# Deployment and operations

Run commands from the repository root. Prerequisites: Node 24 LTS, npm, Docker Compose v2; for Kubernetes, kubectl and minikube (or kind). Do not deploy this unauthenticated university MVP publicly. Local verification results are recorded separately in `verification.md`.

## Install and configure

```sh
npm ci
node scripts/configure.mjs
npm run generate
npm run build -w @taskflow/contracts
```

`configure.mjs` refuses to overwrite existing secrets. Preserve `.env` when reusing database volumes. PostgreSQL initialization runs only on an empty volume: changing `.env` does not rotate existing database passwords. The same generated values are written into `.taskflow/secrets.yaml` for local Kubernetes.

## Docker Compose

```sh
docker compose up --build -d --wait
BASE_URL=http://localhost:8080 npm run smoke
npm run seed
```

Open [TaskFlow](http://localhost:8080). Foreground alternative: `docker compose up --build`. Separate one-shot migration services wait for database health; backends start after migrations succeed, and Nginx starts after backend readiness. Migrations are never run by application replicas. Do not run two deployment commands concurrently.

```sh
docker compose logs -f project-service task-service
docker compose down
# DESTRUCTIVE: removes this Compose project's database volume and all stored TaskFlow data.
docker compose down -v
```

After initial startup, `docker compose up` uses existing data; no seed/reset runs automatically.

## Host development

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
set -a
. ./.env
set +a
DATABASE_URL="$PROJECT_DATABASE_URL" npm run migrate -w @taskflow/project-service
DATABASE_URL="$TASK_DATABASE_URL" npm run migrate -w @taskflow/task-service
```

In separate terminals, load `.env` as above, then run:

```sh
DATABASE_URL="$PROJECT_DATABASE_URL" TASK_SERVICE_URL=http://localhost:3002 npm run dev -w @taskflow/project-service
```

```sh
DATABASE_URL="$TASK_DATABASE_URL" PROJECT_SERVICE_URL=http://localhost:3001 npm run dev -w @taskflow/task-service
```

```sh
npm run dev -w @taskflow/web
```

Open [Vite](http://localhost:5173). Vite proxies relative API requests to the two services. Direct Swagger UIs: [projects](http://localhost:3001/docs), [tasks](http://localhost:3002/docs). Through Nginx: `/docs/projects/` and `/docs/tasks/`. The backends' original OpenAPI JSON is available on their `/docs/json` route.

## Checks

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

Unit and frontend tests use Vitest. Integration tests start their own uniquely named disposable PostgreSQL container with random credentials, apply both migrations, start both real Fastify services on ephemeral ports, test actual HTTP/SQL interaction and permission isolation, then remove only that test container. They never reuse development database URLs. Docker must be running. The smoke test creates uniquely named project data and cleans it up; use an appropriate environment. It accepts `BASE_URL` for either Compose or Kubernetes.

## Build images

```sh
./scripts/build-images.sh
```

Multi-stage Dockerfiles build strict TypeScript / Vite outputs and run non-root. Backends retain Prisma CLI for explicit migration jobs but remove development dependencies. PostgreSQL and Nginx are standard infrastructure images, not additional custom business services.

## Local Kubernetes: minikube

```sh
minikube start -p taskflow --driver=docker --cpus=2 --memory=3072 --kubernetes-version=v1.34.0
kubectl config use-context taskflow
./scripts/build-images.sh
minikube -p taskflow image load taskflow-project-service:dev taskflow-task-service:dev taskflow-web:dev postgres:17-alpine
./scripts/deploy-local.sh
kubectl get deployments,statefulsets,services,pods,pvc -n taskflow
```

The script applies the namespace/Secret, initializes PostgreSQL, waits for database readiness, runs one migration Job per service and waits for completion, then deploys the applications. Jobs use Prisma `migrate deploy`; never use `db push`. Re-running replaces completed Jobs and applies any pending migrations. Image tags are `:dev` for local loaded images. When rebuilding a running local image with that same tag, reload it and run `kubectl rollout restart deployment/project-service deployment/task-service deployment/web -n taskflow`. Use immutable SHA tags outside local development.

macOS Docker-driver NodePort access uses a minikube tunnel (keep running):

```sh
minikube -p taskflow service web -n taskflow --url
```

Open the printed URL. A convenient fixed loopback endpoint is also available; keep this terminal running:

```sh
kubectl port-forward -n taskflow service/web 8080:8080 --address 127.0.0.1
```

```sh
BASE_URL=http://localhost:8080 npm run smoke
npm run seed
```

If Compose is already using port 8080, stop its web container first (`docker compose stop web`) or forward `8081:8080` and set `BASE_URL=http://localhost:8081`. Linux with reachable node networking can use `http://$(minikube -p taskflow ip):30080` directly. Only web has a NodePort; database and business Services remain private.

## Alternative: kind

```sh
cat > .taskflow/kind.yaml <<'YAML'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080
        hostPort: 8080
        listenAddress: 127.0.0.1
YAML
kind create cluster --name taskflow --config .taskflow/kind.yaml
kind load docker-image --name taskflow taskflow-project-service:dev taskflow-task-service:dev taskflow-web:dev postgres:17-alpine
./scripts/deploy-local.sh
BASE_URL=http://localhost:8080 npm run smoke
```

Use a default storage class supplied by kind/minikube. PVC manifests intentionally do not hardcode a cloud storage class. The complete Kubernetes configuration can be inspected with `kubectl kustomize infrastructure/kubernetes`.

## Docker Hub publication

No images are pushed automatically by local build/deploy scripts. The SHA-tag commands require a source commit. In a newly initialized repository, first review the files and create it:

```sh
git add .
git commit -m "Implement TaskFlow microservices application"
```

To publish the source after creating an authorized remote repository, set `REPOSITORY_URL` to its clone URL, then run `git remote add origin "$REPOSITORY_URL"` and `git push -u origin main`. No remote has been created by the implementation scripts.

Obtain registry credentials and authorize image publication before running:

```sh
export DOCKERHUB_USERNAME=your-dockerhub-username
export TAG=$(git rev-parse HEAD)
docker login --username "$DOCKERHUB_USERNAME"
./scripts/build-images.sh
./scripts/publish-images.sh
```

Alternatively configure `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` GitHub secrets in an approval-protected `dockerhub` environment and manually run the Publish Docker Hub images workflow. It builds both amd64 and arm64 images tagged with the full commit SHA. No remote repository or published image is claimed until this is done.

For registry-backed Kubernetes deployment, create a separate overlay that replaces all three image names and both migration Job images with `$DOCKERHUB_USERNAME/taskflow-…:$TAG` before applying. The script below prepares the manifests without modifying source:

```sh
node scripts/registry-manifests.mjs "$DOCKERHUB_USERNAME" "$TAG"
# Review .taskflow/registry before applying; same namespace, secrets and PVC as local deploy.
kubectl apply -f infrastructure/kubernetes/namespace.yaml
kubectl apply -f .taskflow/secrets.yaml
kubectl apply -f infrastructure/kubernetes/postgres
kubectl rollout status statefulset/postgres -n taskflow --timeout=180s
for name in project task; do
  kubectl delete job "$name-migrate" -n taskflow --ignore-not-found
  kubectl apply -f ".taskflow/registry/migrations/$name.yaml"
  kubectl wait --for=condition=complete "job/$name-migrate" -n taskflow --timeout=300s
done
kubectl apply -k .taskflow/registry
```

## Recovering stuck coordination

Do not blindly delete permits or reset DELETING state. First stop Task Service replicas (and any old terminating replicas), establish that no task database writes are still running and resolve commit uncertainty by inspecting the tasks schema. Back up the database. Pause external writes during recovery. Failed permits remain fail-closed; deletion is unavailable until repaired.

Inspect through the PostgreSQL pod as an authorized administrator:

```sh
kubectl scale deployment/task-service --replicas=0 -n taskflow
kubectl wait --for=delete pod -l app=task-service -n taskflow --timeout=120s
kubectl exec -it postgres-0 -n taskflow -- psql -U postgres -d taskflow
```

Inside psql, inspect `TABLE projects."WritePermit";`, `SELECT id,name,state FROM projects."Project";`, and `TABLE tasks."Task";`. After proving no writers remain and reconciling committed task rows, remove only the identified stale permit with `DELETE FROM projects."WritePermit" WHERE id = 'the-reviewed-permit-uuid';`. A stuck project can be restored with `UPDATE projects."Project" SET state='ACTIVE' WHERE id='the-reviewed-project-uuid' AND state='DELETING';`. Retry the normal API deletion so it rechecks task existence; do not manually delete project data. Restore Task Service replicas and normal access. This is an explicit operator procedure, not an automated distributed transaction.

## Cleanup

```sh
kubectl delete deployment,service,configmap,job,hpa,networkpolicy --all -n taskflow
# StatefulSet/PVC deliberately retained by the command above.
# DESTRUCTIVE: deletes all TaskFlow resources including its PVC and data.
kubectl delete namespace taskflow
# DESTRUCTIVE: removes the dedicated local cluster and local node storage.
minikube delete -p taskflow
```

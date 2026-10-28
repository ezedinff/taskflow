# Scaling and persistence demonstrations

```sh
kubectl scale deployment/project-service --replicas=3 -n taskflow
kubectl scale deployment/task-service --replicas=2 -n taskflow
kubectl rollout status deployment/project-service -n taskflow
kubectl rollout status deployment/task-service -n taskflow
kubectl get pods -n taskflow
```

With the frontend reachable on localhost:8080, separate requests traverse Services to replicas:

```sh
for i in $(seq 1 15); do curl -sD - -o /dev/null http://localhost:8080/api/projects | grep -i x-service-instance; done
kubectl logs -n taskflow -l app=project-service --prefix --tail=20
kubectl logs -n taskflow -l app=task-service --prefix --tail=20
BASE_URL=http://localhost:8080 npm run smoke
```

Each response exposes `x-service-instance` with a pod hostname. Distribution is connection based, not guaranteed round-robin. See individual pod logs to corroborate requests. No backend depends on process-local state for correctness.

Optional CPU autoscaling requires Metrics Server:

```sh
minikube -p taskflow addons enable metrics-server
kubectl apply -f infrastructure/kubernetes/hpa
kubectl get hpa -n taskflow
kubectl top pods -n taskflow
```

CPU requests are 100m per backend. HPA targets 70% and allows 1–5 replicas. Manual scaling and HPA should be demonstrated separately: HPA may override manual replica counts. Remove HPAs for a manual demo with `kubectl delete hpa --all -n taskflow`. Database capacity and connection pools remain shared bottlenecks; horizontal application scaling does not scale PostgreSQL.

## Persistence

Create a project/task through the UI (or run `npm run seed`) and keep the board open:

```sh
kubectl get pvc -n taskflow
kubectl delete pod postgres-0 -n taskflow
kubectl wait --for=condition=ready pod/postgres-0 -n taskflow --timeout=180s
kubectl get pvc,pods -n taskflow
```

Refresh the browser; the same project/task remains. A short database outage may show a retryable UI error. No startup seed or reset runs. A pod's writable layer is disposable; `data-postgres-0` is retained and mounted by its replacement. Local default storage survives pod replacement but is stored inside the local Kubernetes node. Deleting the cluster, host disk loss, or deleting PVCs can lose data; PVC retention is not a backup or a promise of durability across infrastructure destruction.

## Failure isolation

Record the original replica count and select an existing project in the UI:

```sh
kubectl get deployment/project-service -n taskflow
kubectl scale deployment/project-service --replicas=0 -n taskflow
# UI: task listing/status updates work; creating a task fails with a clear error.
kubectl scale deployment/project-service --replicas=3 -n taskflow
kubectl rollout status deployment/project-service -n taskflow
```

New tasks/assignments fail 503 because validation is required. During a Task Service outage, project deletion fails 503 and restores ACTIVE state. Neither dependency outage causes liveness restarts. Restore replica counts appropriate to the environment after demonstrations.

## Automated demonstration verification

With the dedicated TaskFlow cluster selected and web forwarded on port 8081:

```sh
BASE_URL=http://localhost:8081 node scripts/verify-kubernetes.mjs
```

This creates its own labeled project/task, scales Project Service to 3 and Task Service to 2, checks responses from multiple pod instances, replaces only the PostgreSQL pod and checks the same PVC/data, then temporarily stops Project Service to verify failure isolation. It restores Project Service to 3 replicas and removes its own test data. It briefly interrupts database/API availability; run in the local demonstration environment.

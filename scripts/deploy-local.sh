#!/bin/sh
set -eu
# Run from repository root; targeted cluster operations never touch other namespaces.
[ -f .taskflow/secrets.yaml ] || { echo 'Run node scripts/configure.mjs first'; exit 1; }
kubectl apply -f infrastructure/kubernetes/namespace.yaml
kubectl apply -f .taskflow/secrets.yaml
kubectl apply -f infrastructure/kubernetes/postgres/init.yaml -f infrastructure/kubernetes/postgres/service.yaml -f infrastructure/kubernetes/postgres/statefulset.yaml
kubectl rollout status statefulset/postgres -n taskflow --timeout=180s
for name in project task; do
 kubectl delete job "$name-migrate" -n taskflow --ignore-not-found
 kubectl apply -f "infrastructure/kubernetes/migrations/$name.yaml"
 kubectl wait --for=condition=complete "job/$name-migrate" -n taskflow --timeout=300s
done
kubectl apply -k infrastructure/kubernetes
for name in project-service task-service web; do
 kubectl rollout status "deployment/$name" -n taskflow --timeout=180s
done

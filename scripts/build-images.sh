#!/bin/sh
set -eu
if [ -n "${NPM_CA_FILE:-}" ]; then
 set -- --secret "id=npm_ca,src=$NPM_CA_FILE"
else
 set --
fi
for name in project-service task-service; do
 docker build "$@" -t "taskflow-$name:dev" -f "services/$name/Dockerfile" .
done
docker build "$@" -t taskflow-web:dev -f apps/web/Dockerfile .

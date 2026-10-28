#!/bin/sh
set -eu
: "${DOCKERHUB_USERNAME:?Set your Docker Hub username}"
TAG=${TAG:-$(git rev-parse HEAD)}
for image in project-service task-service web; do
 docker tag "taskflow-$image:dev" "$DOCKERHUB_USERNAME/taskflow-$image:$TAG"
 docker push "$DOCKERHUB_USERNAME/taskflow-$image:$TAG"
done

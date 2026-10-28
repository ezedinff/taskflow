# Component and deployment diagram

```mermaid
flowchart TD
    U[Browser: React + TanStack Query] -->|one external entry: NodePort 30080| W[Static frontend / Nginx :8080]
    W -->|/api/projects| P[Project Service :3001\n1..N replicas]
    W -->|/api/tasks| T[Task Service :3002\n1..N replicas]
    T -->|REST validation + authenticated permits\nKubernetes DNS| P
    P -->|authenticated REST task existence check| T
    P -->|project_user only| PS[(PostgreSQL projects schema)]
    T -->|task_user only| TS[(PostgreSQL tasks schema)]
    subgraph PostgreSQL StatefulSet
      PS
      TS
    end
    PS --- V[PersistentVolumeClaim: data-postgres-0]
    TS --- V
```

Nginx is a prebuilt static web server; only Project Service and Task Service contain custom backend business logic. PostgreSQL runs separately. ClusterIP Services select replicas, and the PVC exists independently of database pods.

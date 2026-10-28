import { ServiceClient, start } from '@taskflow/contracts';
import { PrismaClient } from '../generated/client/index.js';
import { Tasks } from './business.js';
import { buildApp } from './app.js';
const db = new PrismaClient();
const token = process.env.INTERNAL_TOKEN ?? '';
const service = new Tasks(
  db,
  new ServiceClient(process.env.PROJECT_SERVICE_URL ?? 'http://project-service:3001', token),
  (obj, message) => console.log(JSON.stringify({ level: 30, ...(obj as object), msg: message })),
);
const app = await buildApp(service, () => db.$queryRaw`SELECT 1`, token);
await start(app, Number(process.env.PORT ?? 3002), () => db.$disconnect());

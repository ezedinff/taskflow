import { ServiceClient, start } from '@taskflow/contracts';
import { PrismaClient } from '../generated/client/index.js';
import { Projects } from './business.js';
import { buildApp } from './app.js';
const db = new PrismaClient();
const token = process.env.INTERNAL_TOKEN ?? '';
const app = await buildApp(
  new Projects(
    db,
    new ServiceClient(process.env.TASK_SERVICE_URL ?? 'http://task-service:3002', token),
  ),
  () => db.$queryRaw`SELECT 1`,
  token,
);
await start(app, Number(process.env.PORT ?? 3001), () => db.$disconnect());

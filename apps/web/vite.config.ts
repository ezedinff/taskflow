import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    proxy: {
      '/api/projects': process.env.PROJECT_SERVICE_URL ?? 'http://localhost:3001',
      '/api/tasks': process.env.TASK_SERVICE_URL ?? 'http://localhost:3002',
    },
  },
});

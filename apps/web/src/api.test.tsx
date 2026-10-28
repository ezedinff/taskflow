import { it, expect, vi, afterEach } from 'vitest';
import { api } from './api';
afterEach(() => vi.unstubAllGlobals());
it('shows a readable connection error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  await expect(api('/api/projects')).rejects.toThrow('Unable to reach TaskFlow');
});
it('shows a readable proxy outage error when the response is HTML', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 })),
  );
  await expect(api('/api/tasks?projectId=test')).rejects.toThrow(
    'TaskFlow is temporarily unavailable',
  );
});

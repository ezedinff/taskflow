export type Member = { id: string; name: string; email: string; role: 'OWNER' | 'MEMBER' };
export type Project = {
  id: string;
  name: string;
  description: string;
  members?: Member[];
  state: string;
};
export type Task = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  assigneeId: string | null;
  position: number;
};
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Unable to reach TaskFlow. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      res.status >= 500
        ? 'TaskFlow is temporarily unavailable. Please try again.'
        : 'TaskFlow returned an unexpected response. Please try again.',
    );
  }
  if (!res.ok) throw new Error(data.error?.message ?? 'The request failed. Try again.');
  return data as T;
}

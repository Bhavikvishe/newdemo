import type { DepartmentId, Detection, SignupInput } from '../types';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  username: string;
  department: DepartmentId;
  role: 'operator' | 'supervisor' | 'manager' | 'admin';
  createdAt: string;
  lastLoginAt: string | null;
}

function cookie(name: string): string | null {
  const part = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

async function csrf(): Promise<string> {
  let token = cookie('anvesha_csrf');
  if (token) return token;

  const response = await fetch(`${API_BASE}/api/auth/csrf`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Could not initialize security token.');

  token = cookie('anvesha_csrf');
  if (!token) throw new Error('Security token was not returned by the server.');
  return token;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-CSRF-Token', await csrf());
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with HTTP ${response.status}.`);
  }
  return payload as T;
}

export async function me() {
  await csrf();
  return apiFetch<{ authenticated: boolean; user: ApiUser | null }>('/api/auth/me');
}

export async function loginApi(
  identifier: string,
  password: string,
  department: DepartmentId,
  remember: boolean,
) {
  return apiFetch<{ ok: boolean; user: ApiUser }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password, department, remember }),
  });
}

export async function registerApi(input: SignupInput) {
  return apiFetch<{ ok: boolean; user: ApiUser }>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function logoutApi() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

export async function saveDetectionApi(detection: Detection) {
  return apiFetch<{ detection: Detection; created: boolean }>('/api/detections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(detection),
  });
}

export async function listDetectionsApi() {
  return apiFetch<{ detections: Detection[] }>('/api/detections');
}

export async function deleteDetectionApi(id: string) {
  await apiFetch(`/api/detections/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

import type { DepartmentId } from '../types';
import { apiFetch } from './api';

export interface DirectoryUser {
  id: string;
  name: string;
  username: string;
  department: DepartmentId | string;
  role: string;
  isActive: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
}

export async function listUsersApi(department?: DepartmentId): Promise<DirectoryUser[]> {
  const query = department ? `?department=${encodeURIComponent(department)}` : '';
  const response = await apiFetch<{ ok: boolean; users: DirectoryUser[] }>(`/api/users${query}`);
  return response.users;
}

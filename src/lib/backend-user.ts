import type { DepartmentId, SessionUser, UserRole } from '../types';
import type { ApiUser } from './api';
import { deptById } from './mock';

export function toSessionUser(user: ApiUser): SessionUser {
  const department = deptById(user.department as DepartmentId);

  return {
    username: user.username,
    name: user.name,
    department: user.department as DepartmentId,
    role: user.role as UserRole,
    departmentLabel: department.name,
    departmentIdLabel: department.shortName,
    color: department.color,
  };
}

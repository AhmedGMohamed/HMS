import { api } from "@/lib/api"
import type {
  AdminRole,
  CreateRolePayload,
  Permission,
  UpdateRolePayload,
} from "@/pages/Admin/Roles/types/role"

/**
 * Roles admin API.
 *
 * `GET /api/roles` returns every non-system role in one array — the automation
 * `System` role is filtered server-side, and the list is small enough that
 * pagination would add noise.
 */
export function listRoles() {
  return api.get<AdminRole[]>("/roles")
}

export function listPermissions() {
  return api.get<Permission[]>("/permissions")
}

export function createRole(payload: CreateRolePayload) {
  return api.post<AdminRole>("/roles", payload)
}

export function updateRole(roleId: number, payload: UpdateRolePayload) {
  return api.put<AdminRole>(`/roles/${roleId}`, payload)
}

export function deleteRole(roleId: number) {
  return api.delete<void>(`/roles/${roleId}`)
}

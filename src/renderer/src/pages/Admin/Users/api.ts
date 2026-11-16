import { api } from "@/lib/api"
import type { PaginatedResponse } from "@/types"
import {
  SORT_COLUMN_MAP,
  type AdminUser,
  type CreateUserPayload,
  type ListUsersParams,
  type UpdateUserPayload,
} from "@/pages/Admin/Users/types/user"

/**
 * Users admin API.
 *
 * Query params are passed through verbatim (no case conversion), matching the
 * other list endpoints: `roleId` is camelCase on the wire. Bodies are
 * snake_cased by `lib/api.ts`, so `roleId` / `isActive` arrive as `role_id` /
 * `is_active`.
 */
export function listUsers(params: ListUsersParams) {
  return api.get<PaginatedResponse<AdminUser>>("/users", {
    page: params.page,
    pageSize: params.pageSize,
    q: params.q || undefined,
    roleId: params.roleId ?? undefined,
    sort: params.sort ? SORT_COLUMN_MAP[params.sort] ?? params.sort : undefined,
    order: params.order || undefined,
  })
}

export function createUser(payload: CreateUserPayload) {
  return api.post<AdminUser>("/users", payload)
}

export function updateUser(userId: number, payload: UpdateUserPayload) {
  return api.put<AdminUser>(`/users/${userId}`, payload)
}

export function deleteUser(userId: number) {
  return api.delete<void>(`/users/${userId}`)
}

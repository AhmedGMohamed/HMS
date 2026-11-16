/**
 * Admin console user shapes.
 *
 * `lib/api.ts` camelCases every response and snake_cases every request body, so
 * these types are camelCase end-to-end even though Postgres columns are
 * snake_case. `lastLogin` is a formatted timestamp string from the server (see
 * `pgDateOverride`) or `null` for an account that has never signed in.
 */
export interface AdminUser {
  userId: number
  username: string
  roleId: number
  roleName: string
  isActive: boolean
  /** Automation accounts are hidden server-side; present for completeness. */
  isSystem: boolean
  lastLogin: string | null
  createdAt: string
}

export interface CreateUserPayload {
  username: string
  password: string
  roleId: number
  isActive?: boolean
}

export interface UpdateUserPayload {
  username?: string
  password?: string
  roleId?: number
  isActive?: boolean
}

export interface ListUsersParams {
  page: number
  pageSize: number
  q?: string
  roleId?: number
  sort?: string
  order?: "asc" | "desc"
}

/**
 * Client column id → server column key.
 *
 * The server whitelists these identifiers in `UserModel.SORTABLE_COLUMNS`;
 * anything else silently falls back to `username`, so the mapping has to stay
 * in sync or sorting appears to do nothing.
 */
export const SORT_COLUMN_MAP: Record<string, string> = {
  username: "username",
  roleName: "roleName",
  status: "status",
  lastLogin: "lastLogin",
  createdAt: "createdAt",
}

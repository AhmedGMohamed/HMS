/**
 * Admin console role shapes.
 *
 * `userCount` excludes automation accounts (the server filters
 * `"User".is_system = FALSE`) and `permissions` is always an array — the
 * server's LATERAL aggregate returns `[]`, never `[null]`.
 */
export interface Permission {
  permissionId: number
  featureName: string
  description: string | null
}

export interface AdminRole {
  roleId: number
  name: string
  isSystem: boolean
  permissions: Permission[]
  userCount: number
}

export interface CreateRolePayload {
  name: string
  permissions: number[]
}

export interface UpdateRolePayload {
  name?: string
  permissions?: {
    add?: number[]
    remove?: number[]
  }
}

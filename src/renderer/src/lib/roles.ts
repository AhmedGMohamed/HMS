/**
 * Privileged-role mirror of `src/app/utils/roles.ts`.
 *
 * Two roles bypass permission checks: `Admin` (human administrators) and
 * `System` (the automation/cron principal). `Role.is_system` flags the
 * automation role only — Admin is a normal, visible role that is privileged
 * solely because its name is a code contract.
 *
 * Keep this list in sync with the server; `test/adminRoles.spec.ts` asserts
 * the parity that matters.
 */

export const PRIVILEGED_ROLE_NAMES = ["Admin", "System"] as const

export function isPrivilegedRole(
  role: string | undefined | null
): boolean {
  if (!role) return false
  return (PRIVILEGED_ROLE_NAMES as readonly string[]).includes(role)
}

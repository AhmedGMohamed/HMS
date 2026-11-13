// src/app/utils/roles.ts
/**
 * Privilege helpers.
 *
 * Two roles bypass permission checks: `Admin` (human administrators) and
 * `System` (the automation/cron principal). They are distinct concepts —
 * `Role.is_system` flags the automation role only — but both are privileged,
 * and every gate used to hardcode `role === "Admin"`, which silently locked
 * the automation account out once it stopped borrowing the Admin role.
 *
 * The names are a code contract, so `Role.model` refuses to rename or delete
 * either of them. That is what makes a name comparison safe here.
 */

export const PRIVILEGED_ROLE_NAMES = ["Admin", "System"] as const;

export function isPrivilegedRole(
	roleName: string | null | undefined
): boolean {
	if (!roleName) return false;
	return (PRIVILEGED_ROLE_NAMES as readonly string[]).includes(roleName);
}

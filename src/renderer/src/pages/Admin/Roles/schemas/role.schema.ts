import { z } from "zod"

/**
 * Role create/edit form schema.
 *
 * Messages are i18n keys, resolved at render (see `users/schemas/user.schema.ts`).
 * The name bounds mirror the legacy `admin/roles.html` input (`minlength="3"`
 * `maxlength="50"`) and the server-side uniqueness check.
 *
 * `permissions` is a set of permission ids; the modal diffs it against the
 * loaded role before sending a delta.
 */
export function roleFormSchema() {
  return z.object({
    name: z
      .string()
      .trim()
      .min(3, "roles.validation.roleNameLength")
      .max(50, "roles.validation.roleNameLength"),
    permissions: z.array(z.number()),
  })
}

export type RoleFormValues = z.infer<ReturnType<typeof roleFormSchema>>

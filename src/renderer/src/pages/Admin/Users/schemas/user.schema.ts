import { z } from "zod"

/**
 * User create/edit form schema.
 *
 * Messages are **i18n keys**, resolved at render time — same convention as
 * `pages/Services/schemas/service.schema.ts`. Zod never sees a translated
 * string, so switching language re-renders the errors correctly.
 *
 * Password rules differ by mode: required on create, "leave blank to keep the
 * current one" on edit (but still ≥ 8 when supplied).
 */
export function userFormSchema(mode: "create" | "edit") {
  return z.object({
    username: z
      .string()
      .trim()
      .min(3, "users.validation.usernameLength")
      .max(50, "users.validation.usernameLength"),
    password: z.string().superRefine((value, ctx) => {
      if (mode === "create" && value.length < 8) {
        ctx.addIssue({
          code: "custom",
          message: "users.validation.passwordLength",
        })
        return
      }
      if (mode === "edit" && value.length > 0 && value.length < 8) {
        ctx.addIssue({
          code: "custom",
          message: "users.validation.passwordLength",
        })
      }
    }),
    roleId: z.string().min(1, "users.validation.roleRequired"),
    isActive: z.boolean(),
  })
}

export type UserFormValues = z.infer<ReturnType<typeof userFormSchema>>

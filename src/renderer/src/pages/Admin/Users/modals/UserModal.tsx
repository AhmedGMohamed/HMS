import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { userFormSchema, type UserFormValues } from "@/pages/Admin/Users/schemas/user.schema"
import type {
  AdminUser,
  CreateUserPayload,
  UpdateUserPayload,
} from "@/pages/Admin/Users/types/user"
import type { AdminRole } from "@/pages/Admin/Roles/types/role"

export interface UserModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` opens the modal in create mode. */
  user: AdminUser | null
  roles: AdminRole[]
  /** True when the edited row is the signed-in user. */
  isSelf: boolean
  onSubmit: (
    payload: CreateUserPayload | UpdateUserPayload
  ) => Promise<void>
}

/**
 * Create/edit user dialog.
 *
 * Self-editing rules (mirrored server-side):
 *   - the role select and the status switch are disabled for your own row;
 *   - those two fields are **omitted from the payload** rather than sent
 *     unchanged, because the server rejects any self `role_id` outright.
 *
 * Validation messages are i18n keys (see `user.schema.ts`); they are translated
 * here at render so a language switch updates existing errors.
 */
export function UserModal({
  open,
  onOpenChange,
  user,
  roles,
  isSelf,
  onSubmit,
}: UserModalProps) {
  const { t } = useTranslation()
  const mode = user ? "edit" : "create"
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema(mode)),
    mode: "onBlur",
    defaultValues: {
      username: user?.username ?? "",
      password: "",
      roleId: user ? String(user.roleId) : roles[0] ? String(roles[0].roleId) : "",
      isActive: user?.isActive ?? true,
    },
  })

  const { reset, setError, formState } = form

  // Re-seed whenever the dialog opens for a different row.
  useEffect(() => {
    if (!open) return
    reset({
      username: user?.username ?? "",
      password: "",
      roleId: user ? String(user.roleId) : roles[0] ? String(roles[0].roleId) : "",
      isActive: user?.isActive ?? true,
    })
    setShowPassword(false)
  }, [open, user, roles, reset])

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      if (mode === "create") {
        await onSubmit({
          username: values.username,
          password: values.password,
          roleId: Number(values.roleId),
          isActive: values.isActive,
        })
      } else {
        const payload: UpdateUserPayload = {}
        if (values.username !== user!.username) payload.username = values.username
        if (values.password.length > 0) payload.password = values.password
        // Omitted for self edits — the server rejects any self role change.
        if (!isSelf && Number(values.roleId) !== user!.roleId) {
          payload.roleId = Number(values.roleId)
        }
        if (!isSelf && values.isActive !== user!.isActive) {
          payload.isActive = values.isActive
        }
        await onSubmit(payload)
      }
      onOpenChange(false)
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: string }).code
          : undefined
      if (code === "USERNAME_EXISTS") {
        setError("username", { message: "users.messages.usernameTaken" })
      } else {
        // The page owns the toast for everything else.
        throw error
      }
    } finally {
      setSubmitting(false)
    }
  })

  const errors = formState.errors

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("users.createNewUser") : t("users.editUser")}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? t("users.modal.createDescription")
              : t("users.modal.editDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="user-username">
              {t("users.fields.username")}
            </FieldLabel>
            <Input
              id="user-username"
              autoComplete="off"
              aria-invalid={Boolean(errors.username) || undefined}
              {...form.register("username")}
            />
            {errors.username ? (
              <FieldError>{t(errors.username.message as string)}</FieldError>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="user-password">
              {t("users.fields.password")}
            </FieldLabel>
            <div className="relative">
              <Input
                id="user-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password) || undefined}
                className="pe-10"
                {...form.register("password")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute inset-e-1.5 top-1/2 -translate-y-1/2"
                aria-label={
                  showPassword
                    ? t("users.buttons.hidePassword")
                    : t("users.buttons.showPassword")
                }
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
            </div>
            {mode === "edit" ? (
              <p className="text-xs text-muted-foreground">
                {t("users.fields.passwordHint")}
              </p>
            ) : null}
            {errors.password ? (
              <FieldError>{t(errors.password.message as string)}</FieldError>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="user-role">{t("users.fields.role")}</FieldLabel>
            <NativeSelect
              id="user-role"
              disabled={isSelf}
              aria-invalid={Boolean(errors.roleId) || undefined}
              {...form.register("roleId")}
            >
              {roles.map((role) => (
                <NativeSelectOption key={role.roleId} value={String(role.roleId)}>
                  {role.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {isSelf ? (
              <p className="text-xs text-muted-foreground">
                {t("users.messages.selfRoleBlocked")}
              </p>
            ) : null}
            {errors.roleId ? (
              <FieldError>{t(errors.roleId.message as string)}</FieldError>
            ) : null}
          </Field>

          <Field orientation="horizontal">
            <Switch
              id="user-active"
              checked={form.watch("isActive")}
              disabled={isSelf}
              onCheckedChange={(checked) => form.setValue("isActive", checked)}
            />
            <FieldLabel htmlFor="user-active">
              {t("users.fields.active")}
            </FieldLabel>
          </Field>
          {isSelf ? (
            <p className="text-xs text-muted-foreground">
              {t("users.messages.selfDeactivateBlocked")}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {submitting ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

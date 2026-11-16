import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"

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
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { PermissionGrid } from "@/pages/Admin/Roles/components/PermissionGrid"
import {
  roleFormSchema,
  type RoleFormValues,
} from "@/pages/Admin/Roles/schemas/role.schema"
import {
  diffPermissions,
  isEmptyDiff,
} from "@/pages/Admin/shared/diffPermissions"
import { isPrivilegedRole } from "@/lib/roles"
import type {
  AdminRole,
  CreateRolePayload,
  Permission,
  UpdateRolePayload,
} from "@/pages/Admin/Roles/types/role"

export interface RoleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` opens the modal in create mode. */
  role: AdminRole | null
  permissions: Permission[]
  permissionsLoading: boolean
  onSubmit: (payload: CreateRolePayload | UpdateRolePayload) => Promise<void>
}

/**
 * Create/edit role dialog.
 *
 * Edit mode sends a **delta** (`permissions: { add, remove }`) because that is
 * the endpoint's contract; `diffPermissions` computes it from the loaded role.
 * Unchanged fields are omitted entirely so a no-op save cannot fail on an
 * unrelated guard.
 *
 * Privileged roles (`Admin`, `System`) cannot be renamed — the server refuses,
 * because `isPrivilegedRole` is a name-based contract — so the name input is
 * disabled and explained instead of letting the user submit into a 400.
 */
export function RoleModal({
  open,
  onOpenChange,
  role,
  permissions,
  permissionsLoading,
  onSubmit,
}: RoleModalProps) {
  const { t } = useTranslation()
  const mode = role ? "edit" : "create"
  const nameLocked = role != null && isPrivilegedRole(role.name)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema()),
    mode: "onBlur",
    defaultValues: { name: role?.name ?? "", permissions: [] },
  })

  const { reset, setError, formState } = form

  useEffect(() => {
    if (!open) return
    reset({
      name: role?.name ?? "",
      permissions: role?.permissions.map((p) => p.permissionId) ?? [],
    })
  }, [open, role, reset])

  const selectedIds = form.watch("permissions")

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      if (mode === "create") {
        await onSubmit({
          name: values.name,
          permissions: values.permissions,
        })
      } else {
        const payload: UpdateRolePayload = {}
        if (!nameLocked && values.name !== role!.name) payload.name = values.name

        const diff = diffPermissions(
          role!.permissions.map((p) => p.permissionId),
          values.permissions
        )
        if (!isEmptyDiff(diff)) {
          payload.permissions = {
            ...(diff.add.length ? { add: diff.add } : {}),
            ...(diff.remove.length ? { remove: diff.remove } : {}),
          }
        }

        if (payload.name === undefined && payload.permissions === undefined) {
          // Nothing changed — close without a request.
          onOpenChange(false)
          return
        }
        await onSubmit(payload)
      }
      onOpenChange(false)
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: string }).code
          : undefined
      if (code === "ROLE_NAME_EXISTS") {
        setError("name", { message: "roles.messages.roleNameTaken" })
      } else {
        throw error
      }
    } finally {
      setSubmitting(false)
    }
  })

  const errors = formState.errors

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("roles.createNewRole") : t("roles.editRole")}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? t("roles.modal.createDescription")
              : t("roles.modal.editDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="role-name">
              {t("roles.fields.roleName")}
            </FieldLabel>
            <Input
              id="role-name"
              autoComplete="off"
              disabled={nameLocked}
              aria-invalid={Boolean(errors.name) || undefined}
              {...form.register("name")}
            />
            {nameLocked ? (
              <p className="text-xs text-muted-foreground">
                {t("roles.messages.roleNameImmutable")}
              </p>
            ) : null}
            {errors.name ? (
              <FieldError>{t(errors.name.message as string)}</FieldError>
            ) : null}
          </Field>

          <PermissionGrid
            permissions={permissions}
            loading={permissionsLoading}
            value={selectedIds}
            onChange={(next) =>
              form.setValue("permissions", next, { shouldDirty: true })
            }
          />

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

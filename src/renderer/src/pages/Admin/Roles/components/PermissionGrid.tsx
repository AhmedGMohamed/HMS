import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import {
  permissionLabel,
  sortPermissions,
} from "@/pages/Admin/shared/permissionKeys"
import type { Permission } from "@/pages/Admin/Roles/types/role"

export interface PermissionGridProps {
  permissions: Permission[]
  loading?: boolean
  /** Selected permission ids. */
  value: number[]
  onChange: (next: number[]) => void
  disabled?: boolean
}

/**
 * Permission checkbox grid for the role modal.
 *
 * The catalogue comes from `GET /api/permissions`, not a hardcoded list, so a
 * permission added by a migration appears without a client release. Labels fall
 * back to the raw `feature_name` when `roles.permissions.<name>` is missing —
 * the map already lags the seed by one entry (`manage_supplies`).
 */
export function PermissionGrid({
  permissions,
  loading,
  value,
  onChange,
  disabled,
}: PermissionGridProps) {
  const { t } = useTranslation()
  const selected = useMemo(() => new Set(value), [value])
  const ordered = useMemo(() => sortPermissions(permissions), [permissions])
  const allSelected =
    ordered.length > 0 && ordered.every((p) => selected.has(p.permissionId))

  const toggle = (permissionId: number, checked: boolean) => {
    const next = checked
      ? [...value, permissionId]
      : value.filter((id) => id !== permissionId)
    onChange(next)
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-border">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {t("roles.permissionsLabel")}
          <span className="ms-2 text-xs font-normal text-muted-foreground">
            {value.length} / {ordered.length}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled || allSelected}
            onClick={() => onChange(ordered.map((p) => p.permissionId))}
          >
            {t("roles.selectAll")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled || value.length === 0}
            onClick={() => onChange([])}
          >
            {t("roles.deselectAll")}
          </Button>
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto rounded-md border border-border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {ordered.map((permission) => {
            const id = `perm-${permission.permissionId}`
            const checked = selected.has(permission.permissionId)
            return (
              <div key={permission.permissionId} className="flex items-start gap-2">
                <Checkbox
                  id={id}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(next) =>
                    toggle(permission.permissionId, next === true)
                  }
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <label
                    htmlFor={id}
                    className="cursor-pointer text-sm leading-tight text-foreground"
                  >
                    {permissionLabel(permission.featureName, t)}
                  </label>
                  {permission.description ? (
                    <p className="text-xs text-muted-foreground">
                      {permission.description}
                    </p>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("roles.noPermissions")}
        </p>
      ) : null}
    </div>
  )
}

import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import {
  permissionLabel,
  sortPermissions,
} from "@/pages/Admin/shared/permissionKeys"
import { cn } from "@/lib/utils"
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
            const labelId = `${id}-label`
            const descriptionId = `${id}-description`
            const checked = selected.has(permission.permissionId)
            const label = permissionLabel(permission.featureName, t)
            return (
              <div
                key={permission.permissionId}
                // Pointer hit area only — the tile is deliberately NOT a
                // `role="button"`: keyboard users tab to the Radix checkbox
                // and Space toggles it. The visible label below names that
                // checkbox via `aria-labelledby`.
                onClick={(event) => {
                  if (disabled) return
                  // Radix mirrors the checkbox into a hidden `input` that sits
                  // *beside* the button, and dispatches a bubbling synthetic
                  // `click` on it every time `checked` flips. That click lands
                  // here with `target` set to the input — toggling again would
                  // flip the value straight back, re-arm the same dispatch and
                  // loop forever ("Maximum update depth exceeded"). So ignore
                  // anything that is not the tile's own text.
                  const target = event.target as HTMLElement
                  if (target.closest('[role="checkbox"], input')) return
                  toggle(permission.permissionId, !checked)
                }}
                className={cn(
                  "flex items-start gap-2 rounded-md border p-2 transition-colors",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                  checked
                    ? "border-primary/30 bg-primary/10"
                    : "border-transparent hover:bg-muted/60"
                )}
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  disabled={disabled}
                  aria-labelledby={labelId}
                  aria-describedby={
                    permission.description ? descriptionId : undefined
                  }
                  onCheckedChange={(next) =>
                    toggle(permission.permissionId, next === true)
                  }
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  {/* Was a `<label htmlFor>` pointing at a Radix button, which
                      never forwarded the click. The tile handles it now; the
                      checkbox takes its accessible name from this span. */}
                  <span
                    id={labelId}
                    className={cn(
                      "block text-sm leading-tight text-foreground",
                      checked && "font-medium"
                    )}
                  >
                    {label}
                  </span>
                  {permission.description ? (
                    <p
                      id={descriptionId}
                      className="text-xs text-muted-foreground"
                    >
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

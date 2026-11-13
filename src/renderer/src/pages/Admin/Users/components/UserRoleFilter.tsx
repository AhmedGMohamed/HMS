import { useTranslation } from "react-i18next"

import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import type { AdminRole } from "@/pages/Admin/Roles/types/role"

export interface UserRoleFilterProps {
  roles: AdminRole[]
  /** `undefined` means "all roles" — the filter is then omitted from the query. */
  value: number | undefined
  onChange: (roleId: number | undefined) => void
  disabled?: boolean
}

/**
 * Role filter for the users table toolbar.
 *
 * The filter is server-side (`?roleId=`): the list is a 25-row page, so
 * filtering the visible rows would silently answer the wrong question. Selecting
 * "All Roles" clears the filter rather than sending a sentinel value.
 */
export function UserRoleFilter({
  roles,
  value,
  onChange,
  disabled,
}: UserRoleFilterProps) {
  const { t } = useTranslation()

  return (
    <NativeSelect
      aria-label={t("users.filters.allRoles")}
      value={value == null ? "" : String(value)}
      disabled={disabled || roles.length === 0}
      onChange={(event) => {
        const next = event.currentTarget.value
        onChange(next === "" ? undefined : Number(next))
      }}
      className="w-full sm:w-48"
    >
      <NativeSelectOption value="">
        {t("users.filters.allRoles")}
      </NativeSelectOption>
      {roles.map((role) => (
        <NativeSelectOption key={role.roleId} value={String(role.roleId)}>
          {role.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

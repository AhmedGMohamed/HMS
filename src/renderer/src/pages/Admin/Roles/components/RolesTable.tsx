import { useTranslation } from "react-i18next"
import { LockIcon, MoreHorizontalIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  DataTable,
  type ColumnDef,
  type DataTableProps,
} from "@/components/common/DataTable"
import {
  permissionLabel,
  sortPermissions,
} from "@/pages/Admin/shared/permissionKeys"
import { isPrivilegedRole } from "@/lib/roles"
import type { AdminRole } from "@/pages/Admin/Roles/types/role"

export interface RolesTableProps {
  data: AdminRole[]
  loading: boolean
  onEdit: (role: AdminRole) => void
  onDelete: (role: AdminRole) => void
  emptyAction?: React.ReactNode
  expandedRowIds: ReadonlySet<string | number>
  onExpandedChange: NonNullable<DataTableProps<AdminRole>["onExpandedChange"]>
}

/**
 * Roles table.
 *
 * The `System` (automation) role never reaches the client — the API filters it
 * out — so every visible row is editable. `Admin` is protected by name only:
 * rename/delete are refused server-side, but its permission set stays editable,
 * which is why the delete action is hidden for privileged names rather than the
 * whole row being read-only.
 */
export function RolesTable({
  data,
  loading,
  onEdit,
  onDelete,
  emptyAction,
  expandedRowIds,
  onExpandedChange,
}: RolesTableProps) {
  const { t } = useTranslation()

  const columns: ColumnDef<AdminRole>[] = [
    {
      id: "name",
      header: t("roles.table.name"),
      cell: (role) => (
        <span className="flex items-center gap-2 font-medium text-foreground">
          {role.name}
          {isPrivilegedRole(role.name) ? (
            <LockIcon
              aria-label={t("roles.messages.roleNameImmutable")}
              className="size-3.5 text-muted-foreground"
            />
          ) : null}
        </span>
      ),
    },
    {
      id: "permissions",
      header: t("roles.table.permissions"),
      align: "end",
      width: "w-[1%]",
      numeric: true,
      cell: (role) =>
        role.permissions.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {t("roles.noPermissions")}
          </span>
        ) : (
          <Badge variant="secondary">{role.permissions.length}</Badge>
        ),
    },
    {
      id: "users",
      header: t("roles.table.users"),
      align: "end",
      width: "w-[1%]",
      numeric: true,
      cell: (role) => role.userCount,
    },
    {
      id: "actions",
      header: t("common.actions"),
      align: "end",
      width: "w-[1%]",
      cell: (role) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.actions")}
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(role)}>
              {t("common.edit")}
            </DropdownMenuItem>
            {!isPrivilegedRole(role.name) ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onDelete(role)}
                >
                  {t("common.delete")}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <DataTable
      data={data}
      columns={columns}
      loading={loading}
      getRowId={(role) => role.roleId}
      ariaLabel={t("roles.title")}
      emptyTitle={t("common.noData")}
      emptyDescription={t("roles.messages.emptyTable")}
      emptyAction={emptyAction}
      expandedRowIds={expandedRowIds}
      onExpandedChange={onExpandedChange}
      isRowExpandable={(role) => role.permissions.length > 0}
      renderExpanded={(role) => (
        <div className="flex flex-wrap gap-1.5 bg-surface-muted/50 px-4 py-3">
          {sortPermissions(role.permissions).map((permission) => (
            <Badge key={permission.permissionId} variant="outline">
              {permissionLabel(permission.featureName, t)}
            </Badge>
          ))}
        </div>
      )}
    />
  )
}

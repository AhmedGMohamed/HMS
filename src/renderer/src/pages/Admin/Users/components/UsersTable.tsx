import { useTranslation } from "react-i18next"
import { MoreHorizontalIcon } from "lucide-react"

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
import { UserStatusBadge } from "@/pages/Admin/Users/components/UserStatusBadge"
import type { AdminUser } from "@/pages/Admin/Users/types/user"
import { formatDate, formatDateTime } from "@/lib/utils"

export interface UsersTableProps {
  data: AdminUser[]
  loading: boolean
  /** Signed-in user id — their own row is not deletable (server enforces too). */
  currentUserId: number | undefined
  search: DataTableProps<AdminUser>["search"]
  pagination: DataTableProps<AdminUser>["pagination"]
  sort: NonNullable<DataTableProps<AdminUser>["sort"]> | null
  onSortToggle: NonNullable<DataTableProps<AdminUser>["onSortToggle"]>
  toolbar: React.ReactNode
  onEdit: (user: AdminUser) => void
  onDelete: (user: AdminUser) => void
  onToggleActive: (user: AdminUser) => void
  emptyAction?: React.ReactNode
}

/**
 * Users table presentation.
 *
 * Sortable columns map to the server's whitelist (`roleName`, `status`,
 * `lastLogin`, `createdAt`, `username`). `actions` is intentionally not
 * sortable — it is not a data column.
 */
export function UsersTable({
  data,
  loading,
  currentUserId,
  search,
  pagination,
  sort,
  onSortToggle,
  toolbar,
  onEdit,
  onDelete,
  onToggleActive,
  emptyAction,
}: UsersTableProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language

  const columns: ColumnDef<AdminUser>[] = [
    {
      id: "username",
      header: t("users.table.username"),
      sortable: true,
      cell: (user) => (
        <span className="font-medium text-foreground">{user.username}</span>
      ),
    },
    {
      id: "roleName",
      header: t("users.table.role"),
      sortable: true,
      cell: (user) => <Badge variant="outline">{user.roleName}</Badge>,
    },
    {
      id: "status",
      header: t("users.table.status"),
      sortable: true,
      cell: (user) => <UserStatusBadge active={user.isActive} />,
    },
    {
      id: "lastLogin",
      header: t("users.table.lastLogin"),
      sortable: true,
      cell: (user) =>
        user.lastLogin ? (
          formatDateTime(new Date(user.lastLogin), locale)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "createdAt",
      header: t("users.table.createdDate"),
      sortable: true,
      cell: (user) => formatDate(new Date(user.createdAt), locale),
    },
    {
      id: "actions",
      header: t("common.actions"),
      align: "end",
      width: "w-[1%]",
      cell: (user) => {
        const isSelf = currentUserId != null && user.userId === currentUserId
        return (
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
              <DropdownMenuItem onSelect={() => onEdit(user)}>
                {t("common.edit")}
              </DropdownMenuItem>
              {/* Self rows may still change username/password, but flipping
                  their own status would lock them out. */}
              {!isSelf ? (
                <DropdownMenuItem onSelect={() => onToggleActive(user)}>
                  {user.isActive
                    ? t("users.actions.deactivate")
                    : t("users.actions.activate")}
                </DropdownMenuItem>
              ) : null}
              {!isSelf ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onDelete(user)}
                  >
                    {t("common.delete")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <DataTable
      data={data}
      columns={columns}
      loading={loading}
      getRowId={(user) => user.userId}
      search={search}
      pagination={pagination}
      toolbar={toolbar}
      sort={sort}
      onSortToggle={onSortToggle}
      ariaLabel={t("users.title")}
      emptyTitle={t("common.noData")}
      emptyDescription={t("users.messages.emptyTable")}
      emptyAction={emptyAction}
    />
  )
}

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/PageHeader"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"
import { useAuthStore } from "@/store/authStore"

import { UsersTable } from "@/pages/Admin/Users/components/UsersTable"
import { UserRoleFilter } from "@/pages/Admin/Users/components/UserRoleFilter"
import { UserModal } from "@/pages/Admin/Users/modals/UserModal"
import { useUsers } from "@/pages/Admin/Users/hooks/useUsers"
import { useRoles } from "@/pages/Admin/Roles/hooks/useRoles"
import {
  createUser,
  deleteUser,
  updateUser,
} from "@/pages/Admin/Users/api"
import { userErrorKey } from "@/pages/Admin/shared/adminErrors"
import type {
  AdminUser,
  CreateUserPayload,
  UpdateUserPayload,
} from "@/pages/Admin/Users/types/user"

/**
 * Admin — Users.
 *
 * Server-driven list: search, role filter, sorting and pagination are all query
 * parameters, because the endpoint returns a 25-row page. System (automation)
 * accounts are excluded by the API, so rows and `total` always agree.
 */
export default function UsersPage() {
  useEnsureNamespace("users")
  useEnsureNamespace("roles")
  const { t } = useTranslation()

  const currentUserId = useAuthStore((s) => s.user?.userId)

  const users = useUsers()
  const { roles } = useRoles()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null)
  const [pendingToggle, setPendingToggle] = useState<AdminUser | null>(null)

  const roleId =
    typeof users.filters.roleId === "number" ? users.filters.roleId : undefined

  const toolbar = useMemo(
    () => (
      <UserRoleFilter
        roles={roles}
        value={roleId}
        onChange={(next) => users.setFilters({ roleId: next })}
      />
    ),
    // `users.setFilters` is stable (useCallback); `roles`/`roleId` drive render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles, roleId]
  )

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (user: AdminUser) => {
    setEditing(user)
    setModalOpen(true)
  }

  const handleSubmit = async (
    payload: CreateUserPayload | UpdateUserPayload
  ) => {
    try {
      if (editing) {
        await updateUser(editing.userId, payload as UpdateUserPayload)
        toast.success(t("users.messages.updateSuccess"))
      } else {
        await createUser(payload as CreateUserPayload)
        toast.success(t("users.messages.createSuccess"))
      }
      users.refresh()
    } catch (error) {
      // `USERNAME_EXISTS` is handled inline by the modal; everything else toasts.
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: string }).code
          : undefined
      if (code === "USERNAME_EXISTS") throw error
      toast.error(t(userErrorKey(error, "users.messages.saveError")))
      throw error
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteUser(pendingDelete.userId)
      toast.success(t("users.messages.deleteSuccess"))
      setPendingDelete(null)
      users.refresh()
    } catch (error) {
      toast.error(t(userErrorKey(error, "users.messages.deleteError")))
      setPendingDelete(null)
    }
  }

  const confirmToggle = async () => {
    if (!pendingToggle) return
    const nextActive = !pendingToggle.isActive
    try {
      await updateUser(pendingToggle.userId, { isActive: nextActive })
      toast.success(
        t(
          nextActive
            ? "users.messages.activateSuccess"
            : "users.messages.deactivateSuccess"
        )
      )
      setPendingToggle(null)
      users.refresh()
    } catch (error) {
      toast.error(t(userErrorKey(error, "users.messages.saveError")))
      setPendingToggle(null)
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <PlusIcon />
      {t("users.createNewUser")}
    </Button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("users.title")}
        subtitle={t("users.subtitle")}
        actions={createButton}
      />

      <UsersTable
        data={users.data}
        loading={users.loading}
        currentUserId={currentUserId}
        search={{
          value: users.search,
          onChange: users.setSearch,
          placeholder: t("users.searchPlaceholder"),
          debounceMs: 400,
        }}
        pagination={{
          page: users.page,
          pageSize: users.pageSize,
          total: users.total,
          onPageChange: users.setPage,
          onPageSizeChange: users.setPageSize,
        }}
        sort={users.sort}
        onSortToggle={(_id, next) => users.setSort(next)}
        toolbar={toolbar}
        onEdit={openEdit}
        onDelete={setPendingDelete}
        onToggleActive={setPendingToggle}
        emptyAction={users.isEmpty && !users.search ? createButton : undefined}
      />

      <UserModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        user={editing}
        roles={roles}
        isSelf={editing != null && editing.userId === currentUserId}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        variant="danger"
        title={t("users.messages.deleteConfirmTitle")}
        description={t("users.messages.deleteConfirmText", {
          username: pendingDelete?.username ?? "",
        })}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={pendingToggle != null}
        onOpenChange={(open) => !open && setPendingToggle(null)}
        variant="warning"
        title={
          pendingToggle?.isActive
            ? t("users.messages.deactivateConfirmTitle")
            : t("users.messages.activateConfirmTitle")
        }
        description={
          pendingToggle?.isActive
            ? t("users.messages.deactivateConfirmText", {
                username: pendingToggle.username,
              })
            : t("users.messages.activateConfirmText", {
                username: pendingToggle?.username ?? "",
              })
        }
        onConfirm={confirmToggle}
      />
    </div>
  )
}

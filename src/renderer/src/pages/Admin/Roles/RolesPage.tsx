import { useState } from "react"
import { useTranslation } from "react-i18next"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/PageHeader"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { useEnsureNamespace } from "@/hooks/useEnsureNamespace"

import { RolesTable } from "@/pages/Admin/Roles/components/RolesTable"
import { RoleModal } from "@/pages/Admin/Roles/modals/RoleModal"
import { usePermissions, useRoles } from "@/pages/Admin/Roles/hooks/useRoles"
import {
  createRole,
  deleteRole,
  updateRole,
} from "@/pages/Admin/Roles/api"
import { roleErrorKey } from "@/pages/Admin/shared/adminErrors"
import type {
  AdminRole,
  CreateRolePayload,
  UpdateRolePayload,
} from "@/pages/Admin/Roles/types/role"

/**
 * Admin — Roles.
 *
 * Fetch-all (no pagination): the API returns every non-system role, and the
 * automation `System` role is filtered out server-side. User counts exclude
 * automation accounts too, so "2 users" always means two people.
 */
export default function RolesPage() {
  useEnsureNamespace("roles")
  const { t } = useTranslation()

  const { roles, loading, refresh } = useRoles()
  const { permissions, loading: permissionsLoading } = usePermissions()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AdminRole | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminRole | null>(null)
  const [expanded, setExpanded] = useState<Set<string | number>>(new Set())

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (role: AdminRole) => {
    setEditing(role)
    setModalOpen(true)
  }

  const handleSubmit = async (
    payload: CreateRolePayload | UpdateRolePayload
  ) => {
    try {
      if (editing) {
        await updateRole(editing.roleId, payload as UpdateRolePayload)
        toast.success(t("roles.messages.updateSuccess"))
      } else {
        await createRole(payload as CreateRolePayload)
        toast.success(t("roles.messages.createSuccess"))
      }
      refresh()
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: string }).code
          : undefined
      if (code === "ROLE_NAME_EXISTS") throw error
      toast.error(t(roleErrorKey(error, "roles.messages.saveError")))
      throw error
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteRole(pendingDelete.roleId)
      toast.success(t("roles.messages.deleteSuccess"))
      setPendingDelete(null)
      refresh()
    } catch (error) {
      toast.error(t(roleErrorKey(error, "roles.messages.deleteError")))
      setPendingDelete(null)
    }
  }

  const createButton = (
    <Button onClick={openCreate}>
      <PlusIcon />
      {t("roles.createNewRole")}
    </Button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("roles.title")}
        subtitle={t("roles.subtitle")}
        actions={createButton}
      />

      <RolesTable
        data={roles}
        loading={loading}
        onEdit={openEdit}
        onDelete={setPendingDelete}
        emptyAction={roles.length === 0 && !loading ? createButton : undefined}
        expandedRowIds={expanded}
        onExpandedChange={(id, isExpanded) => {
          setExpanded((prev) => {
            const next = new Set(prev)
            if (isExpanded) next.add(id)
            else next.delete(id)
            return next
          })
        }}
      />

      <RoleModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        role={editing}
        permissions={permissions}
        permissionsLoading={permissionsLoading}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        variant="danger"
        title={t("roles.messages.deleteConfirmTitle")}
        description={t("roles.messages.deleteConfirmText", {
          roleName: pendingDelete?.name ?? "",
        })}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

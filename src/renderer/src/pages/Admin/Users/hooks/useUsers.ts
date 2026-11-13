import { useListData } from "@/hooks/useListData"
import { listUsers } from "@/pages/Admin/Users/api"
import type { AdminUser } from "@/pages/Admin/Users/types/user"

/**
 * Users list controller.
 *
 * `useListData` owns the single fetch effect (it reads the closure through a
 * ref), so search debouncing, page clamping and refresh all work without a
 * second mount-time request. The 400 ms debounce matters here: the server
 * writes an audit-log row on every `GET /api/users`, so a per-keystroke fetch
 * would spam the audit table.
 *
 * Edit forms prefill from the list row — every field the modal needs is already
 * in the payload, so there is no per-row detail fetch.
 */
export function useUsers(enabled = true) {
  return useListData<AdminUser>({
    enabled,
    initialPageSize: 25,
    searchDebounceMs: 400,
    fetcher: {
      params: { page: 1, pageSize: 25, search: "" },
      fetch: ({ page, pageSize, search, sort, filters }) =>
        listUsers({
          page,
          pageSize,
          q: search || undefined,
          roleId:
            typeof filters?.roleId === "number" ? filters.roleId : undefined,
          sort: sort?.columnId,
          order: sort?.direction,
        }),
    },
  })
}

"use client"

import { useListData } from "@/hooks/useListData"
import { listCompanies } from "@/pages/Insurance/api"
import type { InsuranceCompanySummary } from "@/pages/Insurance/types/insurance"

/**
 * Company list hook — Phase 6.10 plan §4 Step 3.
 *
 * Server-driven pagination + name search via the shared `useListData`
 * controller (`GET /api/insurance-companies?page=&pageSize=&q=`). The
 * legacy page fetched the default 25-row page and had no pagination or
 * search UI at all, silently hiding every company past the first page
 * (plan §5 #9).
 *
 * The fetcher closure is re-created each render; `useListData` reads it
 * through a ref, so this is loop-safe.
 */
export function useInsuranceCompanies() {
  return useListData<InsuranceCompanySummary>({
    fetcher: {
      /* `PaginatedFetcher.params` is part of the shared contract but the
         controller reads page/pageSize/search from its own state, so this
         mirrors the initial values purely to satisfy the type. */
      params: { page: 1, pageSize: 25, search: "" },
      fetch: ({ page, pageSize, search }) =>
        listCompanies({
          page,
          pageSize,
          q: search.trim() || undefined,
        }),
    },
  })
}

"use client"

/**
 * Re-export of the shared warehouse hook. The hook body lives in
 * `pages/_shared/pharmacy/hooks/useSharedWarehouses.ts` so the
 * `Supplies` module can import the same implementation.
 *
 * This file is preserved as a thin re-export so the existing
 * `import { useWarehouses } from "@/pages/Drugs/hooks/useWarehouses"`
 * call sites in `DrugsPage` keep working without a code change.
 */
export { useSharedWarehouses as useWarehouses } from "@/pages/_shared/pharmacy/hooks/useSharedWarehouses"
export type { UseWarehousesResult } from "@/pages/_shared/pharmacy/hooks/useSharedWarehouses"

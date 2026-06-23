"use client"

import { useTranslation } from "react-i18next"

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"

export interface DataTablePaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  pageSizes?: number[]
}

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100]

/**
 * Sliding-window pagination with a page-size select, rendered at the
 * bottom-right of a DataTable. Caller-controlled: page + pageSize + total
 * come from the parent; the component fires `onPageChange` and
 * `onPageSizeChange` events.
 *
 * Layout:
 *   [ rows-per-page select ]   [ <  prev · 1 … 4 5 6 … 9 · next > ]
 *
 * i18n keys consumed: common.page / common.of / common.previous /
 * common.next. These are pre-translated in both `en.json` and `ar.json`.
 */
export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = DEFAULT_PAGE_SIZES,
}: DataTablePaginationProps) {
  const { t } = useTranslation()
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), pageCount)

  const items = buildPageWindow(safePage, pageCount)

  return (
    <div className="flex flex-col-reverse items-stretch gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <label
          htmlFor="datatable-page-size"
          className="text-xs font-medium uppercase tracking-wide"
        >
          {t("common.page")}
        </label>
        <NativeSelect
          id="datatable-page-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.currentTarget.value))}
          aria-label={t("common.page")}
        >
          {pageSizes.map((size) => (
            <NativeSelectOption key={size} value={size}>
              {size}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span>
          {`${safePage} ${t("common.of")} ${pageCount}`}
        </span>
      </div>
      <Pagination className="mx-0 justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault()
                if (safePage > 1) onPageChange(safePage - 1)
              }}
              aria-disabled={safePage <= 1}
            />
          </PaginationItem>
          {items.map((item, index) => {
            if (item === "ellipsis") {
              return (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              )
            }
            const pageNumber = item
            return (
              <PaginationItem key={pageNumber}>
                <PaginationLink
                  href="#"
                  isActive={pageNumber === safePage}
                  onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                    e.preventDefault()
                    onPageChange(pageNumber)
                  }}
                >
                  {pageNumber}
                </PaginationLink>
              </PaginationItem>
            )
          })}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault()
                if (safePage < pageCount) onPageChange(safePage + 1)
              }}
              aria-disabled={safePage >= pageCount}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

/**
 * Sliding window: 1 … [current-1, current, current+1] … last
 * Returns a list of numbers with `ellipsis` slots where gaps appear.
 */
function buildPageWindow(
  current: number,
  total: number
): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const out: (number | "ellipsis")[] = []
  const window = [current - 1, current, current + 1].filter(
    (n) => n > 1 && n < total
  )

  out.push(1)
  if (window[0]! > 2) out.push("ellipsis")
  out.push(...window)
  if (window[window.length - 1]! < total - 1) out.push("ellipsis")
  out.push(total)
  return out
}

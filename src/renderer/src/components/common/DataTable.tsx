"use client"

import { Fragment, useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { SearchIcon, XIcon, ChevronDownIcon } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { EmptyState } from "./EmptyState"
import { DataTableColumnHeader } from "./DataTableColumnHeader"
import {
  DataTablePagination,
  type DataTablePaginationProps,
} from "./DataTablePagination"

export interface ColumnDef<T> {
  id: string
  header: React.ReactNode
  /** Optional value extractor; only used by the parent for sorting. */
  accessor?: (row: T) => unknown
  /** Render the cell; takes precedence over `accessor`. */
  cell?: (row: T) => React.ReactNode
  /** When true and `onSortToggle` is wired, renders a sortable header. */
  sortable?: boolean
  /** Optional pre-formatted sort comparator key. */
  sortKey?: (row: T) => string | number
  align?: "start" | "center" | "end"
  /** Tabular numerals; the column will be end-aligned if `align` is unset. */
  numeric?: boolean
  width?: string
  className?: string
}

export interface DataTableSearch {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** Debounce delay before re-rendering (default 200ms). */
  debounceMs?: number
}

export type DataTablePaginationSlot = DataTablePaginationProps

export interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  loading?: boolean
  search?: DataTableSearch
  pagination?: DataTablePaginationSlot
  getRowId?: (row: T, index: number) => string | number
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  /** Empty state copy (translated strings passed in by the caller). */
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  /** Extra filters/controls rendered to the LEFT of the search input. */
  toolbar?: React.ReactNode
  density?: "default" | "compact"
  stickyHeader?: boolean
  /** Visible a11y caption above the table. */
  caption?: string
  /** Required when no `caption`; becomes the table's aria-label. */
  ariaLabel?: string
  /** Controlled sort state. Drives header icons; caller sorts `data` itself. */
  sort?: { columnId: string; direction: "asc" | "desc" } | null
  /** Headers can expose sort toggles via this callback. */
  onSortToggle?: (
    id: string,
    next: { columnId: string; direction: "asc" | "desc" }
  ) => void
  /**
   * Optional row-expansion. When `renderExpanded` is provided, the
   * table renders a full-`colSpan` sub-row beneath each expanded data
   * row containing the returned node. Caller owns expand state.
   *
   * - `expandedRowIds` is a set of stable row ids (whatever
   *   `getRowId` returns, falling back to the row index).
   * - `onExpandedChange(id, next)` fires when the row's expand
   *   toggle is clicked.
   * - The expand toggle renders as a leading cell on each data row,
   *   using the same chevron UX as the legacy Drugs table.
   */
  expandedRowIds?: ReadonlySet<string | number>
  onExpandedChange?: (id: string | number, expanded: boolean) => void
  renderExpanded?: (row: T) => React.ReactNode
  /** Whether the expand toggle is disabled for a given row. */
  isRowExpandable?: (row: T) => boolean
}

const ALIGN_CLASS: Record<
  NonNullable<ColumnDef<unknown>["align"]>,
  string
> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
}

/**
 * Generic typed table — Phase 4 of the front-end refactor.
 *
 * Contract (Decision §Q1: caller-driven):
 * - The component never filters, sorts, or paginates internally. It
 *   surfaces `search`/`pagination` props + `onSortToggle`. The caller
 *   owns data flow.
 * - Per-row actions: callers attach their own opaque `actions` column
 *   (Decision §Q2). DataTable stays a presentation primitive.
 *
 * Built on shadcn `<Table>` + `<Skeleton>` + `<EmptyState>` (Phase 4
 * update via shadcn `<Empty>` primitives) + `<Pagination>`.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const {
    data,
    columns,
    loading = false,
    search,
    pagination,
    getRowId,
    onRowClick,
    rowClassName,
    emptyTitle,
    emptyDescription,
    emptyAction,
    toolbar,
    density = "default",
    stickyHeader = true,
    caption,
    ariaLabel,
    sort,
    onSortToggle,
    expandedRowIds,
    onExpandedChange,
    renderExpanded,
    isRowExpandable,
  } = props

  const { t } = useTranslation()

  const debouncedSearch = useDebouncedValue(search?.value ?? "", {
    delay: search?.debounceMs ?? 200,
  })

  // The sort state is fully controlled by the caller via `sort` +
  // `onSortToggle`. When no `onSortToggle` is wired, a local fallback
  // keeps sortable headers usable in isolation (e.g. demo pages).
  const [localSortColumnId, setLocalSortColumnId] = useState<string>(
    sort?.columnId ?? ""
  )
  const [localSortDirection, setLocalSortDirection] = useState<
    "asc" | "desc" | null
  >(sort?.direction ?? null)

  const sortColumnId = sort ? sort.columnId : localSortColumnId
  const sortDirection = sort ? sort.direction : localSortDirection

  const handleSortToggle = useCallback(
    (columnId: string) => {
      let nextDirection: "asc" | "desc"
      if (sortColumnId !== columnId) {
        nextDirection = "asc"
      } else if (sortDirection === "asc") {
        nextDirection = "desc"
      } else if (sortDirection === "desc") {
        nextDirection = "asc"
      } else {
        nextDirection = "asc"
      }
      if (sort) {
        onSortToggle?.(columnId, {
          columnId,
          direction: nextDirection,
        })
      } else {
        setLocalSortColumnId(columnId)
        setLocalSortDirection(nextDirection)
        onSortToggle?.(columnId, {
          columnId,
          direction: nextDirection,
        })
      }
    },
    [onSortToggle, sort, sortColumnId, sortDirection]
  )

  const showToolbar = Boolean(toolbar || search)
  const showSearch = Boolean(search)
  const showPagination = Boolean(pagination)
  const showExpand = Boolean(renderExpanded)

  const isEmpty = !loading && data.length === 0

  return (
    <Card className="overflow-hidden border border-border shadow-xs">
      {showToolbar ? (
        <CardHeader className="gap-2 border-b border-border px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {showSearch ? (
              <div className="relative w-full sm:max-w-xs">
                <SearchIcon
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 inset-s-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  value={search!.value}
                  onChange={(e) =>
                    search!.onChange(e.currentTarget.value)
                  }
                  placeholder={
                    search!.placeholder ?? t("common.search")
                  }
                  aria-label={t("common.search")}
                  className="ps-9 pe-9"
                />
                {search!.value ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Clear search"
                    className="absolute inset-e-1.5 top-1/2 -translate-y-1/2"
                    onClick={() => search!.onChange("")}
                  >
                    <XIcon />
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="sm:flex-1" />
            )}
            {toolbar ? (
              <div className="flex flex-wrap items-center gap-2">
                {toolbar}
              </div>
            ) : null}
          </div>
          {debouncedSearch !== (search?.value ?? "") ? (
            <p className="sr-only" aria-live="polite">
              {t("common.loading")}
            </p>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className="px-4 py-0">
        <div role="region" className="relative overflow-x-auto">
          <Table
            aria-busy={loading || undefined}
            aria-label={!caption ? ariaLabel : undefined}
          >
            {caption ? (
              <caption className="sr-only">{caption}</caption>
            ) : null}
            <TableHeader
              className={stickyHeader ? "sticky top-0 bg-surface-muted" : undefined}
            >
              <TableRow className="hover:bg-transparent">
                {showExpand ? (
                  <th
                    scope="col"
                    className="h-12 w-10 p-2 text-start font-medium text-muted-foreground"
                  >
                    <span className="sr-only">Expand</span>
                  </th>
                ) : null}
                {columns.map((column) => {
                      const isSorted = sortColumnId === column.id
                      const direction = isSorted ? sortDirection : null
                      const handleToggle = column.sortable
                        ? () => handleSortToggle(column.id)
                        : undefined
                      return (
                        <DataTableColumnHeader
                          key={column.id}
                          column={column}
                          sort={{ direction }}
                          onSortToggle={handleToggle}
                        />
                      )
                    })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <DataTableSkeleton
                  columns={columns}
                  density={density}
                />
              ) : isEmpty ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 p-0 align-middle"
                  >
                    <EmptyState
                      title={
                        emptyTitle ??
                        (search?.value
                          ? t("common.noData")
                          : t("common.noData"))
                      }
                      description={
                        emptyDescription ?? t("patients.emptyTableSearchDesc")
                      }
                      action={emptyAction}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, rowIndex) => {
                  const id = getRowId?.(row, rowIndex) ?? rowIndex
                  const clickable = Boolean(onRowClick)
                  const expandable = showExpand
                  const isExpanded = expandable
                    ? Boolean(expandedRowIds?.has(id))
                    : false
                  const rowExpandable = expandable
                    ? (isRowExpandable?.(row) ?? true)
                    : false
                  return (
                    <Fragment key={id}>
                      <TableRow
                        data-clickable={clickable || undefined}
                        className={cn(
                          "transition-colors hover:bg-primary-light/60",
                          clickable && "cursor-pointer",
                          rowClassName?.(row)
                        )}
                        onClick={clickable ? () => onRowClick!(row) : undefined}
                      >
                        {expandable ? (
                          <TableCell
                            className={cn(
                              "p-2 align-middle",
                              density === "compact" ? "h-10" : "h-12"
                            )}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={
                                isExpanded
                                  ? t("common.collapse")
                                  : t("common.expand")
                              }
                              aria-expanded={isExpanded}
                              disabled={!rowExpandable}
                              onClick={(e) => {
                                e.stopPropagation()
                                onExpandedChange?.(id, !isExpanded)
                              }}
                            >
                              <ChevronDownIcon
                                aria-hidden
                                className={cn(
                                  "size-4 transition-transform",
                                  isExpanded && "rotate-180"
                                )}
                              />
                            </Button>
                          </TableCell>
                        ) : null}
                        {columns.map((column) => {
                          const align =
                            column.align ??
                            (column.numeric ? "end" : "start")
                          return (
                            <TableCell
                              key={column.id}
                              className={cn(
                                "p-2 align-middle",
                                density === "compact"
                                  ? "h-10"
                                  : "h-12",
                                ALIGN_CLASS[align],
                                column.numeric && "tabular-nums",
                                column.width,
                                column.className
                              )}
                            >
                              {renderCell(column, row)}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                      {expandable && isExpanded && renderExpanded ? (
                        <TableRow
                          className="hover:bg-transparent"
                          aria-hidden
                        >
                          <TableCell
                            colSpan={columns.length + 1}
                            className="p-0"
                          >
                            {renderExpanded(row)}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {showPagination && pagination ? (
        <DataTablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
        />
      ) : null}
    </Card>
  )
}

function renderCell<T>(column: ColumnDef<T>, row: T): React.ReactNode {
  if (column.cell) return column.cell(row)
  if (column.accessor) {
    const value = column.accessor(row)
    if (value == null) return ""
    if (typeof value === "string" || typeof value === "number") {
      return value
    }
    return String(value)
  }
  // Final fallback: read key-by-id from the row. This lets callers
  // declare a column with only `id` + `header` like:
  //   { id: 'name', header: 'Name' }
  // and have the table render `row.name` automatically. Falls back to
  // empty for non-existent properties (covers `id` against row.id).
  if (row != null && typeof row === "object") {
    const key = column.id as keyof T
    const value = (row as Record<string, unknown>)[key as string]
    if (value == null) return ""
    if (typeof value === "string" || typeof value === "number") {
      return value
    }
    return String(value)
  }
  return ""
}

interface DataTableSkeletonProps<T> {
  columns: ColumnDef<T>[]
  density: "default" | "compact"
}

function DataTableSkeleton<T>({ columns, density }: DataTableSkeletonProps<T>) {
  const rowCount = 6
  const rowHeight = density === "compact" ? "h-10" : "h-12"
  return (
    <>
      {Array.from({ length: rowCount }, (_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          {columns.map((column) => {
            const align =
              column.align ?? (column.numeric ? "end" : "start")
            return (
              <TableCell
                key={column.id}
                className={cn(
                  "p-2 align-middle",
                  rowHeight,
                  ALIGN_CLASS[align],
                  column.numeric && "tabular-nums",
                  column.width,
                  column.className
                )}
              >
                <Skeleton className="h-4 w-full" />
              </TableCell>
            )
          })}
        </TableRow>
      ))}
    </>
  )
}

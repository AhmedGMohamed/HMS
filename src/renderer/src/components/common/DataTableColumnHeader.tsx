"use client"

import { Button } from "@/components/ui/button"
import type { ColumnDef } from "./DataTable"
import { cn } from "@/lib/utils"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
} from "lucide-react"

export interface SortDirection {
  direction: "asc" | "desc" | null
}

export interface DataTableColumnHeaderProps<T> {
  column: ColumnDef<T>
  sort: SortDirection
  onSortToggle?: (id: string) => void
}

const ALIGN_CLASS: Record<NonNullable<ColumnDef<unknown>["align"]>, string> = {
  start: "justify-start text-start",
  center: "justify-center text-center",
  end: "justify-end text-end",
}

/**
 * Renders a sortable `<th>` for `<DataTable>`. The header is visually a
 * ghost button with an icon that flips between ChevronsUpDown / ArrowUp
 * / ArrowDown. Pressing the button cycles unsorted → asc → desc → unsorted.
 *
 * Caller bridges the state — DataTable only ever owns the visual state;
 * it surfaces the pressed cycle back via `onSortToggle` so the parent can
 * sort its `data` and re-render with the new order. Pure controlled.
 */
export function DataTableColumnHeader<T>({
  column,
  sort,
  onSortToggle,
}: DataTableColumnHeaderProps<T>) {
  const Icon =
    sort.direction === "asc"
      ? ArrowUpIcon
      : sort.direction === "desc"
        ? ArrowDownIcon
        : ChevronsUpDownIcon

  const align = column.align ?? (column.numeric ? "end" : "start")
  const isInteractive = column.sortable && Boolean(onSortToggle)

  return (
    <th
      data-slot="table-head"
      scope="col"
      aria-sort={
        isInteractive
          ? sort.direction === "asc"
            ? "ascending"
            : sort.direction === "desc"
              ? "descending"
              : "none"
          : "none"
      }
      className={cn(
        "h-10 px-2 align-middle font-medium text-foreground whitespace-nowrap",
        ALIGN_CLASS[align],
        column.numeric && "tabular-nums",
        column.className
      )}
    >
      {isInteractive ? (
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 px-2 -ms-2 hover:bg-muted",
            align === "end" && "ms-auto",
            align === "center" && "mx-auto"
          )}
          onClick={() => onSortToggle?.(column.id)}
        >
          <span>{column.header}</span>
          <Icon aria-hidden className="ms-1 size-3.5" />
        </Button>
      ) : (
        <span>{column.header}</span>
      )}
    </th>
  )
}

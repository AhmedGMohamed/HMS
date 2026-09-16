"use client"

import { useTranslation } from "react-i18next"
import { MinusIcon, PlusIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/common/EmptyState"
import type { DrugCard } from "@/pages/_shared/pharmacy/types"

export interface DrugPickerProps {
  /** Cards not yet selected (already client-side filtered by the
   *  modal's selection state). */
  available: DrugCard[]
  /** Currently associated drug cards. */
  selected: DrugCard[]
  /** Debounce handled by the consumer (`useDebouncedValue`); the
   *  picker just renders the value. */
  search: string
  onSearchChange: (value: string) => void
  onSelect: (drug: DrugCard) => void
  onRemove: (drug: DrugCard) => void
}

/**
 * Dual-list drug picker for the Service modal (§3 of
 * `phase_6.6_plan.md`): Available ⇄ Selected with a search box over
 * the available column. Replaces the legacy flat picker.
 */
export function DrugPicker({
  available,
  selected,
  search,
  onSearchChange,
  onSelect,
  onRemove,
}: DrugPickerProps) {
  const { t } = useTranslation()

  const query = search.trim().toLowerCase()
  const filteredAvailable = query
    ? available.filter((drug) => drug.name.toLowerCase().includes(query))
    : available

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Available */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {t("services.sections.availableDrugs")}
          </span>
          <Badge variant="secondary" className="tabular-nums">
            {filteredAvailable.length}
          </Badge>
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          placeholder={t("services.placeholders.searchDrugs")}
          aria-label={t("services.placeholders.searchDrugs")}
        />
        <div className="max-h-56 min-h-16 overflow-y-auto rounded-md border border-border">
          {filteredAvailable.length === 0 ? (
            <EmptyState title={t("services.messages.noDrugsAvailable")} />
          ) : (
            <ul className="divide-y divide-border">
              {filteredAvailable.map((drug) => (
                <li
                  key={drug.drugId}
                  className="flex items-center justify-between gap-2 px-3 py-1.5"
                >
                  <span className="min-w-0 truncate text-sm">
                    {drug.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("services.actions.addDrug")}
                    onClick={() => onSelect(drug)}
                  >
                    <PlusIcon aria-hidden className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Selected */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {t("services.sections.selectedDrugs")}
          </span>
          <Badge variant="secondary" className="tabular-nums">
            {selected.length}
          </Badge>
        </div>
        <div
          aria-hidden
          className="h-9"
        />
        <div className="max-h-56 min-h-16 overflow-y-auto rounded-md border border-border">
          {selected.length === 0 ? (
            <EmptyState title={t("services.messages.noDrugsSelected")} />
          ) : (
            <ul className="divide-y divide-border">
              {selected.map((drug) => (
                <li
                  key={drug.drugId}
                  className="flex items-center justify-between gap-2 px-3 py-1.5"
                >
                  <span className="min-w-0 truncate text-sm">
                    {drug.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("services.actions.removeDrug")}
                    onClick={() => onRemove(drug)}
                  >
                    <MinusIcon aria-hidden className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

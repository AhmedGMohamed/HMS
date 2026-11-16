"use client"

import { useTranslation } from "react-i18next"

import { Input } from "@/components/ui/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import type { PriceListWithStats } from "@/pages/PriceLists/types/priceList"
import type { ServiceType } from "@/pages/_shared/services/types"

export interface ServiceFiltersProps {
  typeFilter: ServiceType | ""
  onTypeFilterChange: (value: ServiceType | "") => void
  priceListFilter: number | ""
  onPriceListFilterChange: (value: number | "") => void
  drugFilter: string
  onDrugFilterChange: (value: string) => void
  priceLists: PriceListWithStats[]
}

/**
 * Toolbar filters for the Services table (§3 of `phase_6.6_plan.md`):
 * type + price-list selects and the drug-text filter, all client-side.
 * The service-name search lives in the DataTable's built-in search
 * slot.
 */
export function ServiceFilters({
  typeFilter,
  onTypeFilterChange,
  priceListFilter,
  onPriceListFilterChange,
  drugFilter,
  onDrugFilterChange,
  priceLists,
}: ServiceFiltersProps) {
  const { t } = useTranslation()

  return (
    <>
      <NativeSelect
        aria-label={t("services.table.type")}
        value={typeFilter}
        onChange={(e) =>
          onTypeFilterChange(e.currentTarget.value as ServiceType | "")
        }
        className="w-36"
      >
        <NativeSelectOption value="">
          {t("services.filters.allTypes")}
        </NativeSelectOption>
        <NativeSelectOption value="once">
          {t("services.serviceTypes.once")}
        </NativeSelectOption>
        <NativeSelectOption value="hourly">
          {t("services.serviceTypes.hourly")}
        </NativeSelectOption>
        <NativeSelectOption value="daily">
          {t("services.serviceTypes.daily")}
        </NativeSelectOption>
      </NativeSelect>

      <NativeSelect
        aria-label={t("services.table.priceLists")}
        value={priceListFilter === "" ? "" : String(priceListFilter)}
        onChange={(e) =>
          onPriceListFilterChange(
            e.currentTarget.value === "" ? "" : Number(e.currentTarget.value)
          )
        }
        className="w-48"
      >
        <NativeSelectOption value="">
          {t("services.filters.allPriceLists")}
        </NativeSelectOption>
        {priceLists.map((pl) => (
          <NativeSelectOption
            key={pl.pricelistId}
            value={String(pl.pricelistId)}
          >
            {pl.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>

      <Input
        type="search"
        value={drugFilter}
        onChange={(e) => onDrugFilterChange(e.currentTarget.value)}
        placeholder={t("services.filters.filterDrugs")}
        aria-label={t("services.filters.filterDrugs")}
        className="w-44"
      />
    </>
  )
}

"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ClockingTab } from "@/pages/Clocking/types/clocking"

interface ClockingTabsProps {
  tab: ClockingTab
  onTabChange: (tab: ClockingTab) => void
  /** Open-record count for the Active trigger badge (suppressed at 0). */
  activeCount: number
  /** Tab panels (`TabsContent`) rendered inside the `Tabs` wrapper. */
  children: ReactNode
}

/**
 * Active | History tab switch (§B1 of `phase_6.8_ux_research.md`).
 *
 * The Active trigger carries a soft-destructive count badge
 * (`variant="destructive"` = `bg-destructive/10 text-destructive` —
 * attention without alarm; the solid variant is reserved for primary
 * actions per design.md §6.5). The badge is suppressed at 0 so an
 * empty ward doesn't nag.
 *
 * `flex flex-col gap-4` on the Tabs root is copied from
 * `EmployeesPage` — the shared `Tabs` primitive's horizontal variant
 * classes are dead (documented there), so the override is required.
 */
export function ClockingTabs({
  tab,
  onTabChange,
  activeCount,
  children,
}: ClockingTabsProps) {
  const { t } = useTranslation()

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as ClockingTab)}
      className="flex flex-col gap-4"
    >
      <TabsList>
        <TabsTrigger value="active">
          {t("clocking.tabs.active")}
          {activeCount > 0 ? (
            <Badge variant="destructive" className="ms-1.5 tabular-nums">
              {activeCount}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="history">
          {t("clocking.tabs.history")}
        </TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  )
}

"use client"

/**
 * Report tab strip — Phase 6.11 plan §5.
 *
 * Six tabs, matching the legacy page, but driven by the URL (`?tab=…`) so a
 * report view is deep-linkable and refresh-safe. The payroll tab is only
 * rendered when the user holds `manage_employees`; a direct link to it
 * renders the permission state instead of firing a 403 request.
 */

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  BarChart3Icon,
  ClockIcon,
  HeartPulseIcon,
  StethoscopeIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ReportTab } from "@/pages/Reports/types/reports"

export interface ReportsTabsProps {
  tab: ReportTab
  onTabChange: (tab: ReportTab) => void
  /** Render the payroll tab (requires `manage_employees`). */
  showPayroll: boolean
  /** `TabsContent` panels. */
  children: ReactNode
}

interface TabDescriptor {
  value: ReportTab
  labelKey: string
  Icon: typeof UsersIcon
  requiresPayroll?: boolean
}

const TABS: TabDescriptor[] = [
  { value: "patients", labelKey: "reports.tabs.patientReports", Icon: UsersIcon },
  { value: "doctors", labelKey: "reports.tabs.doctorReports", Icon: StethoscopeIcon },
  { value: "nurses", labelKey: "reports.tabs.nurseReports", Icon: HeartPulseIcon },
  { value: "statistics", labelKey: "reports.tabs.statistics", Icon: BarChart3Icon },
  {
    value: "payments",
    labelKey: "reports.tabs.employeePayments",
    Icon: WalletIcon,
    requiresPayroll: true,
  },
  { value: "clock-ins", labelKey: "reports.tabs.clockInReports", Icon: ClockIcon },
]

export function ReportsTabs({
  tab,
  onTabChange,
  showPayroll,
  children,
}: ReportsTabsProps) {
  const { t } = useTranslation()

  const visible = TABS.filter((descriptor) => !descriptor.requiresPayroll || showPayroll)

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as ReportTab)}
      className="flex flex-col gap-4"
    >
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-surface-muted p-1">
        {visible.map(({ value, labelKey, Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            className="gap-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Icon aria-hidden className="size-4" />
            <span>{t(labelKey)}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  )
}

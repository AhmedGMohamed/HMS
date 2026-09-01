"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  UsersIcon,
  DollarSignIcon,
  PillIcon,
  AlertTriangleIcon,
  TrendingDownIcon,
  PlusIcon,
  DownloadIcon,
} from "lucide-react"

import { PageHeader } from "@/components/common/PageHeader"
import { EmptyState } from "@/components/common/EmptyState"
import { DataTable, type ColumnDef } from "@/components/common/DataTable"
import { StatCard } from "@/components/common/StatCard"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import {
  RevenueLineChart,
  PatientServicesDonut,
  type RevenueLineChartPoint,
  type PatientServicesDonutSlice,
} from "@/components/charts"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontalIcon } from "lucide-react"

interface DemoPatientRow {
  id: number
  name: string
  nationalId: string
  status: "active" | "discharged" | "pending"
  roomNumber: number | null
  totalBilled: number
}

const DEMO_PATIENTS: DemoPatientRow[] = [
  {
    id: 1001,
    name: "Layla Ibrahim",
    nationalId: "29007121200345",
    status: "active",
    roomNumber: 214,
    totalBilled: 12_450,
  },
  {
    id: 1002,
    name: "Omar Saleh",
    nationalId: "28903251200456",
    status: "discharged",
    roomNumber: null,
    totalBilled: 4_200,
  },
  {
    id: 1003,
    name: "Yusuf Khalid",
    nationalId: "28811042200013",
    status: "pending",
    roomNumber: 311,
    totalBilled: 7_800,
  },
  {
    id: 1004,
    name: "Maya Gamil",
    nationalId: "28905283100221",
    status: "active",
    roomNumber: 109,
    totalBilled: 22_900,
  },
  {
    id: 1005,
    name: "Hassan Tawfik",
    nationalId: "28709021100103",
    status: "discharged",
    roomNumber: null,
    totalBilled: 3_120,
  },
]

const STATUS_LABEL: Record<DemoPatientRow["status"], string> = {
  active: "Active",
  discharged: "Discharged",
  pending: "Pending",
}

/**
 * Phase 4 component demo — serves as the proving ground for every shared
 * component before Phase 6 pages adopt them.
 *
 * Sections:
 *   - PageHeader / EmptyState
 *   - StatCard variants (with/without delta, with/without href)
 *   - DataTable with mock rows, pagination, sort, search, actions column
 *   - ConfirmDialog triggered by a button (danger vs warning variants)
 *   - RevenueLineChart with mock 30-day series
 *   - PatientServicesDonut with mock category mix
 *
 * Mounted ONLY when `import.meta.env.DEV === true` via `<DevOnly>` in
 * App.tsx; production bundles never ship this route. Removed wholesale
 * when Phase 6 lands.
 */
export default function ComponentsDemoPage() {
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const [chartLoading, setChartLoading] = useState(false)
  const [sort, setSort] = useState<{
    columnId: string
    direction: "asc" | "desc"
  }>({ columnId: "name", direction: "asc" })

  const sortedPatients = useMemo<DemoPatientRow[]>(() => {
    const columnId = sort.columnId
    if (!columnId) return DEMO_PATIENTS
    const compareKey = (
      row: DemoPatientRow
    ): string | number => {
      const value = (row as unknown as Record<string, unknown>)[columnId]
      if (typeof value === "string" || typeof value === "number") return value
      // Booleans / null / undefined → sort at the bottom on asc, top on desc.
      return value == null ? "" : String(value)
    }
    const copy = [...DEMO_PATIENTS]
    copy.sort((a, b) => {
      const left = compareKey(a)
      const right = compareKey(b)
      if (left === right) return 0
      if (typeof left === "number" && typeof right === "number") {
        return sort.direction === "asc" ? left - right : right - left
      }
      const leftStr = String(left)
      const rightStr = String(right)
      return sort.direction === "asc"
        ? leftStr.localeCompare(rightStr)
        : rightStr.localeCompare(leftStr)
    })
    return copy
  }, [sort])

  const chartData = useMemo<RevenueLineChartPoint[]>(
    () => generateRevenueSeries(),
    []
  )

  const donutData = useMemo<PatientServicesDonutSlice[]>(
    () => [
      { name: "Patient Services", value: 84_000 },
      { name: "Pharmacy", value: 38_500 },
      { name: "Insurance", value: 22_400 },
      { name: "Supplies", value: 11_200 },
    ],
    []
  )

  const columns = useMemo<ColumnDef<DemoPatientRow>[]>(
    () => [
      { id: "id", header: t("patients.table.id"), numeric: true, width: "w-20" },
      { id: "name", header: t("patients.table.name"), sortable: true },
      {
        id: "nationalId",
        header: t("patients.table.nationalId"),
        accessor: (r) => r.nationalId,
      },
      {
        id: "status",
        header: t("patients.table.status"),
        cell: (r) => (
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-primary-light px-2 text-xs font-medium text-primary">
            {STATUS_LABEL[r.status]}
          </span>
        ),
      },
      {
        id: "roomNumber",
        header: t("patients.table.room"),
        numeric: true,
        cell: (r) => (r.roomNumber == null ? "—" : r.roomNumber),
      },
      {
        id: "totalBilled",
        header: t("patients.table.totalBilled"),
        numeric: true,
        cell: (r) => formatNumber(r.totalBilled),
      },
      {
        id: "actions",
        header: "",
        align: "end",
        width: "w-12",
        cell: () => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("common.actions")}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>{t("common.view")}</DropdownMenuItem>
              <DropdownMenuItem>{t("common.edit")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">
                {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [t]
  )

  const handleDangerConfirm = async () => {
    await new Promise((r) => setTimeout(r, 600))
    setConfirmOpen(false)
  }
  const handleWarningConfirm = async () => {
    await new Promise((r) => setTimeout(r, 400))
    setWarningOpen(false)
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <PageHeader
        eyebrow="Phase 4 — Dev-only"
        title="Components demo"
        subtitle="Visual smoke-test for shared components. Removed when Phase 6 lands."
        actions={
          <>
            <Button
              variant="outline"
              size="default"
              onClick={() => setChartLoading((s) => !s)}
            >
              {chartLoading ? "Stop loading" : "Simulate chart loading"}
            </Button>
            <Button variant="default" size="default">
              <PlusIcon aria-hidden className="me-1" />
              New patient
            </Button>
          </>
        }
      />

      <Section
        eyebrow="01 — StatCard"
        title="StatCard variants"
        subtitle="Inert, with delta pill, clickable."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active patients" value={184} icon={<UsersIcon aria-hidden className="size-4" />} />
          <StatCard
            label="Today's revenue"
            value="EGP 12,450"
            icon={<DollarSignIcon aria-hidden className="size-4" />}
            delta={{ value: 12, formatted: "+12.5%", direction: "up" }}
          />
          <StatCard
            label="Today's profit"
            value="EGP 3,820"
            delta={{ value: 4, formatted: "-4.1%", direction: "down" }}
            icon={<TrendingDownIcon aria-hidden className="size-4" />}
          />
          <StatCard
            label="Low stock drugs"
            value={9}
            href="/drugs"
            icon={<PillIcon aria-hidden className="size-4" />}
            emphasis="warning"
            delta={{ value: 2, formatted: "+2 today", direction: "up" }}
          />
        </div>
      </Section>

      <Section
        eyebrow="02 — DataTable"
        title="Patients (mock data)"
        subtitle="Caller-driven: filter, sort, and pagination owed by parent."
      >
        <DataTable<DemoPatientRow>
          ariaLabel="Demo patients"
          data={sortedPatients}
          columns={columns}
          getRowId={(r) => r.id}
          search={{
            value: "",
            onChange: () => {},
            placeholder: t("patients.searchPlaceholder") ?? "Search patients…",
          }}
          pagination={{
            page: 1,
            pageSize: 10,
            total: sortedPatients.length,
            onPageChange: () => {},
            onPageSizeChange: () => {},
          }}
          sort={sort}
          onSortToggle={(columnId, next) => setSort(next)}
          toolbar={
            <Button variant="outline" size="sm">
              <DownloadIcon aria-hidden className="me-1" /> Export CSV
            </Button>
          }
        />
      </Section>

      <Section
        eyebrow="03 — Charts (lazy)"
        title="Revenue line + service mix donut"
        subtitle="Recharts lazy-loaded here. ConfirmDialog masked by default; trigger via buttons below."
      >
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <h2 className="mb-2 text-base font-medium font-heading">
              Revenue & profit — 14-day series
            </h2>
            <RevenueLineChart
              data={chartLoading ? [] : chartData}
              loading={chartLoading}
              srSummary="Revenue and profit across the last 14 days, summarised."
            />
          </div>
          <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <h2 className="mb-2 text-base font-medium font-heading">
              Revenue distribution by service
            </h2>
            <PatientServicesDonut
              data={donutData}
              metric="revenue"
              loading={chartLoading}
              srSummary="Revenue distribution across patient services, pharmacy, insurance and supplies."
            />
          </div>
        </div>
      </Section>

      <Section
        eyebrow="04 — EmptyState"
        title="EmptyState inside & outside tables"
        subtitle="Renders via shadcn `<Empty>` primitives while preserving the title / description / icon / action contract."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <EmptyState
              icon={<UsersIcon aria-hidden className="size-5" />}
              title="No patients found"
              description="Try a different search or register a new patient."
              action={
                <Button size="sm">
                  <PlusIcon aria-hidden className="me-1" />
                  Register patient
                </Button>
              }
            />
          </div>
          <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <EmptyState
              icon={<AlertTriangleIcon aria-hidden className="size-5" />}
              title="No data available"
              description="Charts and tables will appear once data resolves."
            />
          </div>
        </div>
      </Section>

      <Section
        eyebrow="05 — ConfirmDialog"
        title="ConfirmDialog"
        subtitle="`<AlertDialog>` wrapper with auto-tracked loading on the confirm action."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Delete patient
          </Button>
          <Button variant="outline" onClick={() => setWarningOpen(true)}>
            Re-send onboarding email
          </Button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete patient?"
          description="This action permanently removes the patient record and all linked billing data."
          variant="danger"
          onConfirm={handleDangerConfirm}
        />
        <ConfirmDialog
          open={warningOpen}
          onOpenChange={setWarningOpen}
          title="Re-send onboarding email?"
          description="The patient will receive another email with their admission details."
          variant="warning"
          destructiveIcon={false}
          confirmLabel="Send email"
          onConfirm={handleWarningConfirm}
        />
      </Section>
    </div>
  )
}

function Section({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  )
}

function formatNumber(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function generateRevenueSeries(): RevenueLineChartPoint[] {
  const out: RevenueLineChartPoint[] = []
  const today = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const label = `${d.getMonth() + 1}/${d.getDate()}`
    const wave = Math.sin(i / 3) * 4_000 + 11_000
    const noise = (i % 4) * 600
    const revenue = Math.round(wave + noise)
    const profit = Math.round(revenue * (0.18 + (i % 5) * 0.02))
    out.push({ date: label, revenue, profit })
  }
  return out
}

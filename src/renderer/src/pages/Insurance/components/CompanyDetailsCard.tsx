"use client"

import { useTranslation } from "react-i18next"
import {
  BanknoteIcon,
  BuildingIcon,
  FileTextIcon,
  PencilIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/utils"
import { useUIStore } from "@/store/uiStore"
import type { InsuranceCompany } from "@/pages/Insurance/types/insurance"

export interface CompanyDetailsCardProps {
  company: InsuranceCompany | null
  loading: boolean
  /** Report actions require `manage_reports` on top of `manage_insurance`. */
  canManageReports: boolean
  onEdit: () => void
  onPayment: () => void
  onReport: () => void
}

interface DetailRowProps {
  label: string
  value: string
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm break-words text-foreground">{value}</dd>
    </div>
  )
}

/**
 * "Company Details" panel of the detail view (Phase 6.10 plan §3).
 *
 * Shows the four legacy fields. Unlike the legacy render, `contactInfo`
 * and `lastClearedDate` are populated: the page now reads the full
 * `GET /:id` row instead of the list row that omitted both columns.
 */
export function CompanyDetailsCard({
  company,
  loading,
  canManageReports,
  onEdit,
  onPayment,
  onReport,
}: CompanyDetailsCardProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language) ?? "en"

  const lastCleared = company?.lastClearedDate
    ? formatDate(new Date(company.lastClearedDate), language)
    : "-"

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <BuildingIcon aria-hidden className="size-4 text-muted-foreground" />
          {t("insurance.companyDetails")}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1">
        {loading || !company ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <dl className="space-y-4">
            <DetailRow
              label={t("insurance.fields.companyName")}
              value={company.name}
            />
            {company.contactInfo ? (
              <DetailRow
                label={t("insurance.fields.contactInfo")}
                value={company.contactInfo}
              />
            ) : null}
            <DetailRow
              label={t("insurance.fields.priceList")}
              value={
                company.pricelistName ||
                t("insurance.messages.noPriceListsAvailable")
              }
            />
            <DetailRow
              label={t("insurance.fields.lastCleared")}
              value={lastCleared}
            />
          </dl>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onEdit}
          disabled={loading || !company}
        >
          <PencilIcon aria-hidden className="me-1.5 size-4" />
          {t("common.edit")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPayment}
          disabled={loading || !company}
        >
          <BanknoteIcon aria-hidden className="me-1.5 size-4" />
          {t("insurance.buttons.payment")}
        </Button>
        {canManageReports ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReport}
            disabled={loading || !company}
          >
            <FileTextIcon aria-hidden className="me-1.5 size-4" />
            {t("insurance.buttons.report")}
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  )
}

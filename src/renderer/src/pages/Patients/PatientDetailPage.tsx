import { PageHeader } from "@/components/common/PageHeader"
import { EmptyState } from "@/components/common/EmptyState"
import { Link, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon } from "lucide-react"

/**
 * /patients/:id — Phase 6.2 stub.
 *
 * Real implementation lands in T4 (profile), T5 (assigned), T6
 * (billing), T7 (admissions + settle + print). T1 only stubs the
 * route so navigations drill through without hitting 404.
 */
export default function PatientDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const patientId = Number(id)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/patients">
            <ArrowLeftIcon aria-hidden className="me-2 size-4" />
            {t("common.back")}
          </Link>
        </Button>
      </div>
      <PageHeader
        eyebrow={`HMS / ${t("sidebar.patients")}`}
        title={t("patients.patientDetails")}
        subtitle={
          Number.isFinite(patientId)
            ? `${t("patients.title")} #${patientId}`
            : t("patients.title")
        }
      />
      <EmptyState
        title={t("patients.title")}
        description={t("patients.noPatients")}
      />
    </div>
  )
}

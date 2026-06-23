import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/common/PageHeader"
import { EmptyState } from "@/components/common/EmptyState"
import { Home } from "lucide-react"

export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 p-6">
      <PageHeader
        title={t("errors.notFoundTitle")}
        subtitle={t("errors.notFoundDescription")}
      />
      <EmptyState
        icon={<Home className="size-6" aria-hidden />}
        title="404"
        description="Check the URL or use the back-to-dashboard shortcut below."
        action={
          <Button asChild>
            <Link to="/dashboard">{t("errors.backToDashboard")}</Link>
          </Button>
        }
      />
    </div>
  )
}

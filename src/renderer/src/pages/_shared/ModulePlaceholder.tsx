import { useTranslation } from "react-i18next"
import { PageHeader } from "@/components/common/PageHeader"
import { EmptyState } from "@/components/common/EmptyState"

/**
 * Standard scaffold used by every Phase 2 placeholder module.
 *
 * Renders the page header using the i18n key passed in and an EmptyState
 * pinpointing the migration phase that will replace the placeholder. Once
 * `pages/<Module>/` gets its real implementation in Phase 6, the
 * placeholder is deleted outright (no need to migrate the scaffold).
 */
export interface ModulePlaceholderProps {
  titleKey: string
  phase: string
  description?: string
}

export function ModulePlaceholder({
  titleKey,
  phase,
  description,
}: ModulePlaceholderProps) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title={t(titleKey)} />
      <EmptyState
        title={`Coming soon — ${phase}`}
        description={
          description ??
          "This module's React implementation will land as part of the front-end refactor."
        }
      />
    </div>
  )
}

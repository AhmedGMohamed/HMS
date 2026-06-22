import { useTranslation } from "react-i18next"
import { Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUIStore, type Language } from "@/store/uiStore"

/**
 * Two-state language toggle.
 *
 * Renders the *target* language label ("AR" when current is English, "EN"
 * when current is Arabic) — matches the Apple/Microsoft idiom where the
 * button shows the language you would switch into.
 *
 * State lives in `uiStore.language`; `RTLSync` re-acts to changes and
 * drives `<html dir>` + `i18n.changeLanguage()` — no manual cascade here.
 */
export function LanguageToggle() {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)
  const setLanguage = useUIStore((s) => s.setLanguage)

  const target: Language = language === "en" ? "ar" : "en"
  const label =
    language === "en"
      ? t("navigation.switchToArabic")
      : t("navigation.switchToEnglish")

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 px-2"
      onClick={() => setLanguage(target)}
      aria-label={t("topbar.toggleLanguage")}
    >
      <Globe className="size-4" aria-hidden />
      <span className="text-sm font-medium">{label}</span>
    </Button>
  )
}

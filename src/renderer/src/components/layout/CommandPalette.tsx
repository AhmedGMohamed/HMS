import { useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { getIcon } from "@/lib/iconRegistry"
import { buildCommandPaletteItems } from "@/lib/commandPalette"
import { useAuthStore } from "@/store/authStore"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Navigation-only command palette (Phase 8).
 *
 * Entries are derived from the same permission-filtered NAV_CONFIG used by
 * the sidebar, so the palette can never expose a page the user cannot open.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const items = useMemo(() => buildCommandPaletteItems(user), [user])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") return
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      onOpenChange(!open)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onOpenChange, open])

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("topbar.commandTitle")}
      description={t("topbar.commandDescription")}
    >
      <CommandInput
        autoFocus
        placeholder={t("topbar.commandPlaceholder")}
        aria-label={t("topbar.commandPlaceholder")}
      />
      <CommandList>
        <CommandEmpty>{t("topbar.commandEmpty")}</CommandEmpty>
        <CommandGroup heading={t("topbar.commandNavigation")}>
          {items.map((item) => {
            const Icon = getIcon(item.icon)
            const label = t(item.label)
            return (
              <CommandItem
                key={item.id}
                value={`${label} ${item.url}`}
                onSelect={() => {
                  navigate(item.url)
                  onOpenChange(false)
                }}
              >
                <Icon aria-hidden />
                <span>{label}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

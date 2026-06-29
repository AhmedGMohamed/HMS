import * as React from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

export interface HmsLogoProps extends React.SVGAttributes<SVGSVGElement> {
  /** Edge length in pixels (default 40). */
  size?: number
}

/**
 * Hospital Management System brand mark — schematic, monochrome.
 *
 * Two glyphs compressed into a single svg so we ship one image and
 * keep the brand consistent across locales. The cross marks clinical
 * / patient care; the pulse line marks activity + monitoring.
 *
 * Icon is rendered in `currentColor` so callers can theme it via
 * Tailwind text-* utilities or the standard shadcn slot convention.
 *
 * Consumers:
 *   - `pages/Login/LoginPage.tsx` (40px, `text-primary`) — unchanged.
 *   - `components/layout/SidebarHeader.tsx` (28px, `text-primary`).
 */
export function HmsLogo({ size = 40, className, ...rest }: HmsLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      {...rest}
    >
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="14"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d="M32 14v36M14 32h36"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />

    </svg>
  )
}

export interface HmsWordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Translation key for the wrapper's accessible label (default `sidebar.brand`). */
  labelKey?: string
}

/**
 * "HealthCore+" wordmark (design.md §5.1).
 *
 *   - "Health" → `text-primary` (`#0077B6`).
 *   - "Core"   → `text-secondary` (`#00A896`).
 *   - "+"      → rendered as a true <sup> on top of "Core" in
 *                `text-secondary` so screen readers and copy-paste
 *                receive plain text "HealthCore+".
 *
 * The wrapper exposes a translated `aria-label`; inner glyphs are
 * `aria-hidden` so AT users hear the brand name once, not three times.
 *
 * Sizing is driven by the parent's font-size — pass `text-base` /
 * `text-sm` from the caller to scale.
 */
export function HmsWordmark({
  labelKey = "sidebar.brand",
  className,
  ...rest
}: HmsWordmarkProps) {
  const { t } = useTranslation()
  return (
    <span
      aria-label={t(labelKey)}
      className={cn(
        "inline-flex items-baseline font-semibold tracking-tight",
        className
      )}
      {...rest}
    >
      <span aria-hidden className="text-primary">
        {t("common.logo.health")}
      </span>
      <span aria-hidden className="text-secondary font-light">
        {t("common.logo.core")}
      </span>
      <sup
        aria-hidden
        className="align-super font-bold leading-none text-secondary font-"
      >
        {t("common.logo.plus")}
      </sup>
    </span>
  )
}

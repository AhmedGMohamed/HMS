import * as React from "react"

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

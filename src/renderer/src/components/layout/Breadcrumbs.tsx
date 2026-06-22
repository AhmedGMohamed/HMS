import { Fragment } from "react"
import { Link, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { buildCrumbs, type Crumb } from "@/lib/breadcrumbs"

/**
 * Breadcrumb derived purely from `useLocation().pathname` and the route
 * table in `lib/breadcrumbs.ts`. Compacted to a max of 4 crumbs with an
 * ellipsis for the middle segment(s) per design.md §5.1.
 */
export function Breadcrumbs() {
  const { t } = useTranslation()
  const location = useLocation()
  const crumbs = buildCrumbs(location.pathname)

  if (crumbs.length === 0) return null
  const last = crumbs[crumbs.length - 1]!
  const earlier = crumbs.slice(0, -1)

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {earlier.map((crumb: Crumb, idx: number) => {
          const isEllipsis = crumb.labelKey === "breadcrumbs.ellipsis"
          if (isEllipsis) {
            return (
              <Fragment key={`${crumb.path}-${idx}`}>
                <BreadcrumbItem>
                  <BreadcrumbEllipsis />
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </Fragment>
            )
          }
          return (
            <Fragment key={`${crumb.path}-${idx}`}>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={crumb.path}>{t(crumb.labelKey)}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </Fragment>
          )
        })}
        <BreadcrumbItem>
          <BreadcrumbPage>{t(last.labelKey)}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

"use client"

/**
 * Reports URL + form state — Phase 6.11 plan §4.2 / §4.3 (D2, D3).
 *
 * Responsibilities:
 *   - own the editable **draft** (form state),
 *   - parse the **generated** parameters from the URL (`run=1`),
 *   - expose `generate()` which freezes the draft into the URL,
 *   - expose `isStale` so a tab can warn that the form changed since Generate,
 *   - resync the draft when the URL changes from the outside (back/forward,
 *     deep link, tab switch).
 *
 * The URL is written with `replace` so filter/tab churn does not fill the
 * history stack; the browser Back button therefore leaves the page rather
 * than walking through every parameter change.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"

import type { ReportDraft, ReportTab } from "@/pages/Reports/types/reports"
import {
  isDraftStale,
  parseDraft,
  parseGeneratedParams,
  parseTab,
  reportParamsKey,
  resetTabSpecificFilters,
  serializeReportParams,
} from "./reportParams"

export interface ReportUrlStateResult {
  tab: ReportTab
  /** Editable form state (commit with `generate`). */
  draft: ReportDraft
  /** Parameters that produced the visible results, or `null`. */
  generated: ReportDraft | null
  /** Stable token for the generated parameters (session-cache key). */
  generatedKey: string | null
  /** `true` once Generate has produced a result for the current URL. */
  isGenerated: boolean
  /** `true` when the form differs from the generated parameters. */
  isStale: boolean
  /** Merge a partial change into the draft (does not touch the URL). */
  setDraft: (patch: Partial<ReportDraft>) => void
  /** Replace the draft wholesale (e.g. a preset range). */
  replaceDraft: (draft: ReportDraft) => void
  /** Switch tabs: keeps the range, clears tab filters and `run`. */
  setTab: (tab: ReportTab) => void
  /** Commit the draft to the URL with `run=1`. */
  generate: () => void
  /** Drop `run` so the tab returns to its not-generated state. */
  clearGenerated: () => void
  /**
   * Change a **view-only** parameter (`dist`) without invalidating the result.
   *
   * The URL keeps `run=1` and the generated filters, so the choice survives a
   * reload while the report stays exactly as generated. `reportParamsKey`
   * ignores view-only parameters, so this can never mark the tab stale.
   */
  setViewParam: (patch: Partial<ReportDraft>) => void
}

export function useReportUrlState(): ReportUrlStateResult {
  const [searchParams, setSearchParams] = useSearchParams()

  const tab = useMemo(() => parseTab(searchParams), [searchParams])
  const generated = useMemo(
    () => parseGeneratedParams(searchParams, tab),
    [searchParams, tab]
  )

  const [draft, setDraftState] = useState<ReportDraft>(() =>
    parseDraft(searchParams, tab)
  )

  // The last query string we know about. When the URL changes from the
  // outside (back/forward/deep link) the draft is rebuilt from it; when the
  // change came from our own `generate`/`setTab` the draft already matches
  // and this is a no-op.
  const lastQueryRef = useRef(searchParams.toString())

  useEffect(() => {
    const query = searchParams.toString()
    if (query === lastQueryRef.current) return
    lastQueryRef.current = query
    setDraftState(parseDraft(searchParams, tab))
  }, [searchParams, tab])

  const commit = useCallback(
    (params: URLSearchParams) => {
      lastQueryRef.current = params.toString()
      setSearchParams(params, { replace: true })
    },
    [setSearchParams]
  )

  const setDraft = useCallback((patch: Partial<ReportDraft>) => {
    setDraftState((current) => ({ ...current, ...patch }))
  }, [])

  const replaceDraft = useCallback((next: ReportDraft) => {
    setDraftState(next)
  }, [])

  const setTab = useCallback(
    (nextTab: ReportTab) => {
      const nextDraft = resetTabSpecificFilters(draft, nextTab)
      setDraftState(nextDraft)
      commit(serializeReportParams(nextDraft, nextTab))
    },
    [commit, draft]
  )

  const generate = useCallback(() => {
    commit(serializeReportParams(draft, tab, { run: true }))
  }, [commit, draft, tab])

  const clearGenerated = useCallback(() => {
    commit(serializeReportParams(draft, tab))
  }, [commit, draft, tab])

  const setViewParam = useCallback(
    (patch: Partial<ReportDraft>) => {
      setDraftState((current) => ({ ...current, ...patch }))

      // Base the rewrite on the *generated* snapshot when there is one: the
      // form may hold unsaved edits, and toggling a view option must not freeze
      // them into the URL.
      const base = generated ?? draft
      commit(
        serializeReportParams(
          { ...base, ...patch },
          tab,
          { run: generated !== null }
        )
      )
    },
    [commit, draft, generated, tab]
  )

  const generatedKey = generated ? reportParamsKey(generated, tab) : null

  return {
    tab,
    draft,
    generated,
    generatedKey,
    isGenerated: generated !== null,
    isStale: isDraftStale(draft, generated, tab),
    setDraft,
    replaceDraft,
    setTab,
    generate,
    clearGenerated,
    setViewParam,
  }
}

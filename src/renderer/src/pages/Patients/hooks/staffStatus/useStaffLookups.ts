"use client"

import { useEffect, useRef, useState } from "react"

import { listAvailableNurses, listDoctors } from "@/pages/Patients/api"
import type { Doctor, Nurse } from "@/pages/Patients/types/patient"

export interface StaffLookups {
  doctors: Doctor[]
  nurses: Nurse[]
  loading: boolean
  error: Error | null
  /** Manual retry — also exposed for callers that want a refresh button. */
  refresh: () => void
}

interface CacheEntry {
  doctors: Doctor[]
  nurses: Nurse[]
  inflight?: Promise<void>
}

/**
 * T10 — Shared module-level cache + subscription hook for the
 * `doctors` and `nurses` lookups used by both `<AdmitPatientDialog>`
 * (T9.1) and `<EditStaffAssignmentDialog>` (T10).
 *
 * Two goals:
 *   1. Multiple dialogs shouldn't kick off two parallel GETs every
 *      time they open — share one in-flight promise and one cached
 *      array between consumers.
 *   2. The cache lives at module scope so navigating between
 *      `/patients` and `/patients/:id` doesn't drop the data.
 *
 * Re-render semantics: every consumer gets its own
 * `{ doctors, nurses, loading, error }` snapshot; a fresh fetch
 * triggers `setState` on every subscriber so each one re-renders
 * with the new arrays. We use a simple ref-counted subscription to
 * avoid hammering the network when 5 dialogs are open at once.
 */

const subscribers = new Set<() => void>()
let cache: CacheEntry | null = null

async function loadOnce(): Promise<void> {
  if (!cache) {
    cache = { doctors: [], nurses: [] }
  }
  if (cache.inflight) return cache.inflight
  cache.inflight = (async () => {
    try {
      const [doctors, nurses] = await Promise.all([
        listDoctors(),
        listAvailableNurses(),
      ])
      if (cache) {
        cache.doctors = doctors
        cache.nurses = nurses
      }
      subscribers.forEach((emit) => emit())
    } finally {
      if (cache) cache.inflight = undefined
    }
  })()
  return cache.inflight
}

export function useStaffLookups(): StaffLookups {
  const [, force] = useState(0)
  const [loading, setLoading] = useState(() => !cache?.doctors.length)
  const [error, setError] = useState<Error | null>(null)
  const nonceRef = useRef(0)

  useEffect(() => {
    const emit = () => force((n) => n + 1)
    subscribers.add(emit)
    // Re-fetch only if cache is empty. Otherwise the snapshot is
    // already populated and we'll pick it up via the emit.
    if (!cache || (cache.doctors.length === 0 && cache.nurses.length === 0)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true)
      setError(null)
      loadOnce().catch((err: unknown) => {
        setError(err instanceof Error ? err : new Error(String(err)))
      }).finally(() => {
        setLoading(false)
      })
    }
    return () => {
      subscribers.delete(emit)
    }
  }, [])

  const refresh = () => {
    nonceRef.current += 1
    cache = null
    setLoading(true)
    setError(null)
    loadOnce().catch((err: unknown) => {
      setError(err instanceof Error ? err : new Error(String(err)))
    }).finally(() => {
      setLoading(false)
    })
  }

  return {
    doctors: cache?.doctors ?? [],
    nurses: cache?.nurses ?? [],
    loading,
    error,
    refresh,
  }
}

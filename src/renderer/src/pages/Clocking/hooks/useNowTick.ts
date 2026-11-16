"use client"

import { useSyncExternalStore } from "react"

/**
 * Shared 1-second clock for live duration cells (A3.4 of
 * `phase_6.8_plan.md`).
 *
 * One module-level interval feeds every subscribed `LiveDuration` —
 * the interval does not live on the page, so the page shell, KPIs,
 * tabs, and tables no longer re-render every second. The interval
 * starts with the first subscriber and stops with the last; passing
 * `false` yields a static snapshot and no subscription (completed
 * rows never tick).
 */

const TICK_MS = 1000

const listeners = new Set<() => void>()
let current = new Date()
let intervalId: number | null = null

function tick() {
  current = new Date()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (intervalId == null) {
    intervalId = window.setInterval(tick, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && intervalId != null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
  }
}

const noopSubscribe = () => () => {}
const getSnapshot = () => current

export function useNowTick(enabled = true): Date {
  return useSyncExternalStore(
    enabled ? subscribe : noopSubscribe,
    getSnapshot,
    getSnapshot
  )
}

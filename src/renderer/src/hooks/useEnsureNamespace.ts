import { useEffect } from "react";
import {
  loadPageNamespace,
  type PageNamespace,
} from "@/lib/localeLoader";

/**
 * React hook wrapper over `loadPageNamespace`.
 *
 * Pages call `useEnsureNamespace("patients")` immediately after their
 * `useTranslation()`. The hook is idempotent:
 *  - re-renders short-circuit (in-flight cache in `loadPageNamespace`)
 *  - StrictMode double-invokes are equivalent (added-path set)
 *  - mount/unmount isn't a concern because translations stay in
 *    i18next once added (see `unloadPageNamespace` for evict).
 */
export function useEnsureNamespace(ns: PageNamespace): void {
  useEffect(() => {
    void loadPageNamespace(ns);
  }, [ns]);
}

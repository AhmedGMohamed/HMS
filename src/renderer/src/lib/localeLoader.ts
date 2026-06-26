import i18n from "i18next";

export type PageNamespace =
  | "login"
  | "dashboard"
  | "patients"
  | "pharmacy"
  | "services"
  | "vault"
  | "reports"
  | "insurance"
  | "users"
  | "roles"
  | "employees"
  | "clocking"
  | "medicalSupplies"
  | "priceLists";

export type LoadResult = Promise<void>;

/**
 * All translations share a single i18next namespace called
 * "translation". Each per-page JSON file declares one top-level key
 * named after its own ns (e.g. `login.en.json = { login: {...} }`),
 * and we merge that record into the shared namespace so call sites
 * like `t("login.title")` continue to resolve identically to the
 * pre-split monolithic layout.
 */
const NS = "translation";

export async function preloadPageNamespaces(
  list: PageNamespace[]
): Promise<void> {
  await Promise.all(list.map(loadPageNamespace));
}

export function lazyLoadWithNamespace<T>(
  loader: () => Promise<{ default: T }>,
  ns: PageNamespace | PageNamespace[]
): () => Promise<{ default: T }> {
  const namespaces = Array.isArray(ns) ? ns : [ns];
  return () =>
    preloadPageNamespaces(namespaces).then(() => loader());
}

const inflight = new Map<PageNamespace, LoadResult>();
const loaded = new Set<PageNamespace>();

function enImport(ns: PageNamespace): Promise<{ default: Record<string, unknown> }> {
  switch (ns) {
    case "login": return import("@/locales/login.en.json");
    case "dashboard": return import("@/locales/dashboard.en.json");
    case "patients": return import("@/locales/patients.en.json");
    case "pharmacy": return import("@/locales/pharmacy.en.json");
    case "services": return import("@/locales/services.en.json");
    case "vault": return import("@/locales/vault.en.json");
    case "reports": return import("@/locales/reports.en.json");
    case "insurance": return import("@/locales/insurance.en.json");
    case "users": return import("@/locales/users.en.json");
    case "roles": return import("@/locales/roles.en.json");
    case "employees": return import("@/locales/employees.en.json");
    case "clocking": return import("@/locales/clocking.en.json");
    case "medicalSupplies": return import("@/locales/medicalSupplies.en.json");
    case "priceLists": return import("@/locales/priceLists.en.json");
  }
}

function arImport(ns: PageNamespace): Promise<{ default: Record<string, unknown> }> {
  switch (ns) {
    case "login": return import("@/locales/login.ar.json");
    case "dashboard": return import("@/locales/dashboard.ar.json");
    case "patients": return import("@/locales/patients.ar.json");
    case "pharmacy": return import("@/locales/pharmacy.ar.json");
    case "services": return import("@/locales/services.ar.json");
    case "vault": return import("@/locales/vault.ar.json");
    case "reports": return import("@/locales/reports.ar.json");
    case "insurance": return import("@/locales/insurance.ar.json");
    case "users": return import("@/locales/users.ar.json");
    case "roles": return import("@/locales/roles.ar.json");
    case "employees": return import("@/locales/employees.ar.json");
    case "clocking": return import("@/locales/clocking.ar.json");
    case "medicalSupplies": return import("@/locales/medicalSupplies.ar.json");
    case "priceLists": return import("@/locales/priceLists.ar.json");
  }
}

export function loadPageNamespace(ns: PageNamespace): LoadResult {
  if (loaded.has(ns)) return Promise.resolve();
  const existing = inflight.get(ns);
  if (existing) return existing;

  const promise = (async () => {
    const [enBundle, arBundle] = await Promise.all([enImport(ns), arImport(ns)]);
    i18n.addResourceBundle("en", NS, { [ns]: enBundle.default[ns] }, true, true);
    i18n.addResourceBundle("ar", NS, { [ns]: arBundle.default[ns] }, true, true);
    loaded.add(ns);
  })();

  inflight.set(ns, promise);
  return promise;
}

export function unloadPageNamespace(ns: PageNamespace) {
  i18n.removeResourceBundle("en", NS);
  i18n.removeResourceBundle("ar", NS);
  loaded.delete(ns);
}

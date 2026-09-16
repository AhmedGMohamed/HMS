"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Trash2Icon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/common/EmptyState"
import { cn, formatCurrency, formatNumber, resolveLocale } from "@/lib/utils"

import {
  listAllDrugShipments,
  listAllSupplyShipments,
  listServices,
  setPricesForList,
} from "@/pages/PriceLists/api"
import type {
  AddPricesPayload,
  AddServicePriceEntry,
  AddShipmentPriceEntry,
  BulkPricesResult,
  DrugShipmentPricingRow,
  PriceList,
  SupplyShipmentPricingRow,
} from "@/pages/PriceLists/types/priceList"
import {
  servicePriceEntrySchema,
  shipmentPriceEntrySchema,
  supplyPriceEntrySchema,
} from "@/pages/PriceLists/schemas/addPrices.schema"
import {
  normalizeService,
  type NormalizedService,
} from "@/pages/_shared/services/types"
import { ApiError } from "@/lib/errors"

type TabKey = "services" | "drugs" | "supplies"

/** Per-entity card state for the Add Prices grid (decision #10). */
interface PriceCardState {
  price: string
  requiresPrepayment: boolean
  prepaymentType: "fixed" | "percentage" | null
  prepaymentAmount: string
  /** The saved (entity, list) price at open time — `null` = unpriced. */
  initial: {
    price: number
    requiresPrepayment: boolean
    prepaymentType: "fixed" | "percentage" | null
    prepaymentAmount: number | null
  } | null
  /** Explicit remove-mark; committed as `price: null` on save. */
  markedForRemoval: boolean
}

type CardKey = string
const serviceKey = (id: number): CardKey => `s-${id}`
const drugKey = (id: number): CardKey => `d-${id}`
const supplyKey = (id: number): CardKey => `u-${id}`

function toCardState(
  p?:
    | {
        price: number | string
        requiresPrepayment?: boolean
        prepaymentType?: "fixed" | "percentage" | null
        prepaymentAmount?: number | null
      }
    | null
): PriceCardState {
  if (!p) {
    return {
      price: "",
      requiresPrepayment: false,
      prepaymentType: null,
      prepaymentAmount: "",
      initial: null,
      markedForRemoval: false,
    }
  }
  return {
    price: String(Number(p.price)),
    requiresPrepayment: p.requiresPrepayment === true,
    prepaymentType: p.prepaymentType ?? null,
    prepaymentAmount: p.prepaymentAmount != null ? String(p.prepaymentAmount) : "",
    initial: {
      price: Number(p.price),
      requiresPrepayment: p.requiresPrepayment === true,
      prepaymentType: p.prepaymentType ?? null,
      prepaymentAmount:
        p.prepaymentAmount != null ? Number(p.prepaymentAmount) : null,
    },
    markedForRemoval: false,
  }
}

function buildCards(
  listId: number,
  services: NormalizedService[],
  drugs: DrugShipmentPricingRow[],
  supplies: SupplyShipmentPricingRow[]
): Record<CardKey, PriceCardState> {
  const cards: Record<CardKey, PriceCardState> = {}
  for (const s of services) {
    cards[serviceKey(s.serviceId)] = toCardState(
      s.prices.find((x) => x.pricelistId === listId)
    )
  }
  for (const d of drugs) {
    cards[drugKey(d.shipmentId)] = toCardState(
      (d.prices ?? []).find((x) => x.pricelistId === listId)
    )
  }
  for (const sup of supplies) {
    cards[supplyKey(sup.shipmentId)] = toCardState(
      (sup.prices ?? []).find((x) => x.pricelistId === listId)
    )
  }
  return cards
}

/** Diff one card against its saved price. Only changed/new or
 *  explicitly-removed entries produce payload data (untouched cards
 *  send nothing — no accidental upserts/removals). */
function diffCard(
  card: PriceCardState | undefined
): { ok: true; entry: Omit<AddServicePriceEntry, "serviceId"> | null } | { ok: false; error: string } {
  if (!card) return { ok: true, entry: null }
  if (card.markedForRemoval) {
    // Removal only applies to cards that actually hold a saved price;
    // a session-typed-but-unsaved card has nothing to remove.
    if (card.initial) return { ok: true, entry: { price: null } }
    return { ok: true, entry: null }
  }
  const raw = card.price.trim()
  if (raw === "") return { ok: true, entry: null } // blank = skipped
  const price = Number(raw)
  if (!Number.isFinite(price)) {
    return { ok: false, error: "priceLists.validation.invalidPrice" }
  }
  const requiresPrepayment = card.requiresPrepayment === true
  const amountRaw = card.prepaymentAmount.trim()
  const entry = {
    price,
    requiresPrepayment,
    prepaymentType: requiresPrepayment ? card.prepaymentType : null,
    prepaymentAmount:
      requiresPrepayment && amountRaw !== "" ? Number(amountRaw) : null,
  }
  if (card.initial) {
    const i = card.initial
    if (
      i.price === entry.price &&
      i.requiresPrepayment === entry.requiresPrepayment &&
      i.prepaymentType === entry.prepaymentType &&
      i.prepaymentAmount === entry.prepaymentAmount
    ) {
      return { ok: true, entry: null }
    }
  }
  return { ok: true, entry }
}

interface AddPricesModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  priceList: PriceList | null
  /** Show the "Skip for Now" footer action (post-create flow). */
  showSkip?: boolean
  onSaved?: (result: BulkPricesResult) => void
}

/**
 * Add Prices modal (§2): 3 tabs (services / drug shipments / medical
 * supplies), per-tab search + count badge, per-card price (+ prepayment
 * for services & drugs), pre-filled from existing prices. Save posts a
 * single transactional bulk request (sets + explicit removals); blank
 * inputs are skipped, never sent.
 */
export function AddPricesModal({
  open,
  onOpenChange,
  priceList,
  showSkip = false,
  onSaved,
}: AddPricesModalProps) {
  const { t } = useTranslation()

  const [services, setServices] = useState<NormalizedService[]>([])
  const [drugRows, setDrugRows] = useState<DrugShipmentPricingRow[]>([])
  const [supplyRows, setSupplyRows] = useState<SupplyShipmentPricingRow[]>([])
  const [cards, setCards] = useState<Record<CardKey, PriceCardState>>({})
  const [tab, setTab] = useState<TabKey>("services")
  const [searchServices, setSearchServices] = useState("")
  const [searchDrugs, setSearchDrugs] = useState("")
  const [searchSupplies, setSearchSupplies] = useState("")
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !priceList) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingData(true)
    setLoadError(false)
    setTab("services")
    setSearchServices("")
    setSearchDrugs("")
    setSearchSupplies("")
    Promise.all([
      listServices(),
      listAllDrugShipments(),
      listAllSupplyShipments(),
    ])
      .then(([svcWire, drugWire, supplyWire]) => {
        if (cancelled) return
        const normalized = svcWire.map(normalizeService)
        // List-all endpoints include out-of-stock rows — filter them.
        const drugs = drugWire.filter((r) => Number(r.quantity) > 0)
        const supplies = supplyWire.filter((r) => Number(r.quantity) > 0)
        setServices(normalized)
        setDrugRows(drugs)
        setSupplyRows(supplies)
        setCards(
          buildCards(priceList.pricelistId, normalized, drugs, supplies)
        )
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, priceList])

  function updateCard(key: CardKey, patch: Partial<PriceCardState>) {
    setCards((prev) => {
      const current = prev[key]
      if (!current) return prev
      return { ...prev, [key]: { ...current, ...patch } }
    })
  }

  function markForRemoval(key: CardKey) {
    updateCard(key, { markedForRemoval: true, price: "", prepaymentAmount: "" })
  }

  function undoRemoval(key: CardKey) {
    setCards((prev) => {
      const current = prev[key]
      if (!current?.initial) return prev
      return {
        ...prev,
        [key]: {
          ...current,
          markedForRemoval: false,
          price: String(current.initial.price),
          prepaymentAmount:
            current.initial.prepaymentAmount != null
              ? String(current.initial.prepaymentAmount)
              : "",
        },
      }
    })
  }

  const filteredServices = useMemo(() => {
    const q = searchServices.trim().toLowerCase()
    if (!q) return services
    return services.filter((s) => s.name.toLowerCase().includes(q))
  }, [services, searchServices])

  const filteredDrugs = useMemo(() => {
    const q = searchDrugs.trim().toLowerCase()
    if (!q) return drugRows
    return drugRows.filter(
      (d) =>
        d.drugName.toLowerCase().includes(q) ||
        d.warehouseName.toLowerCase().includes(q)
    )
  }, [drugRows, searchDrugs])

  const filteredSupplies = useMemo(() => {
    const q = searchSupplies.trim().toLowerCase()
    if (!q) return supplyRows
    return supplyRows.filter(
      (s) =>
        s.supplyName.toLowerCase().includes(q) ||
        s.warehouseName.toLowerCase().includes(q)
    )
  }, [supplyRows, searchSupplies])

  async function handleSave() {
    if (!priceList) return

    const serviceEntries: AddServicePriceEntry[] = []
    const drugEntries: AddShipmentPriceEntry[] = []
    const supplyEntries: AddShipmentPriceEntry[] = []

    for (const s of services) {
      const res = diffCard(cards[serviceKey(s.serviceId)])
      if (!res.ok) {
        toast.error(t(res.error))
        return
      }
      if (res.entry == null) continue
      if (res.entry.price === null) {
        serviceEntries.push({ serviceId: s.serviceId, price: null })
        continue
      }
      const parsed = servicePriceEntrySchema.safeParse({
        serviceId: s.serviceId,
        ...res.entry,
      })
      if (!parsed.success) {
        toast.error(t(parsed.error.issues[0]?.message ?? ""))
        return
      }
      serviceEntries.push(parsed.data)
    }

    for (const d of drugRows) {
      const res = diffCard(cards[drugKey(d.shipmentId)])
      if (!res.ok) {
        toast.error(t(res.error))
        return
      }
      if (res.entry == null) continue
      if (res.entry.price === null) {
        drugEntries.push({ shipmentId: d.shipmentId, price: null })
        continue
      }
      const parsed = shipmentPriceEntrySchema.safeParse({
        shipmentId: d.shipmentId,
        ...res.entry,
      })
      if (!parsed.success) {
        toast.error(t(parsed.error.issues[0]?.message ?? ""))
        return
      }
      drugEntries.push(parsed.data)
    }

    for (const sup of supplyRows) {
      const res = diffCard(cards[supplyKey(sup.shipmentId)])
      if (!res.ok) {
        toast.error(t(res.error))
        return
      }
      if (res.entry == null) continue
      if (res.entry.price === null) {
        supplyEntries.push({ shipmentId: sup.shipmentId, price: null })
        continue
      }
      const parsed = supplyPriceEntrySchema.safeParse({
        shipmentId: sup.shipmentId,
        price: res.entry.price,
      })
      if (!parsed.success) {
        toast.error(t(parsed.error.issues[0]?.message ?? ""))
        return
      }
      supplyEntries.push(parsed.data)
    }

    const payload: AddPricesPayload = {}
    if (serviceEntries.length > 0) payload.services = serviceEntries
    if (drugEntries.length > 0) payload.drugShipments = drugEntries
    if (supplyEntries.length > 0) payload.supplyShipments = supplyEntries

    if (payload.services == null && payload.drugShipments == null && payload.supplyShipments == null) {
      toast.info(t("priceLists.messages.noPriceChanges"))
      return
    }

    setSaving(true)
    try {
      const raw = await setPricesForList(priceList.pricelistId, payload)
      const result: BulkPricesResult = {
        totalServices: Number(raw.totalServices ?? 0),
        totalDrugs: Number(raw.totalDrugs ?? 0),
        totalSupplies: Number(raw.totalSupplies ?? 0),
        removedPrices: Number(raw.removedPrices ?? 0),
      }
      toast.success(
        t("priceLists.messages.bulkPricesSavedSuccess", {
          services: serviceEntries.length,
          drugs: drugEntries.length,
          supplies: supplyEntries.length,
          removed: result.removedPrices,
        })
      )
      onOpenChange(false)
      onSaved?.(result)
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : t("priceLists.messages.pricesSaveError")
      )
    } finally {
      setSaving(false)
    }
  }

  const disabled = saving || loadingData

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("priceLists.modals.addPrices")}
            {priceList ? ` — ${priceList.name}` : ""}
          </DialogTitle>
          <DialogDescription>
            {t("priceLists.help.addPricesInfo")}
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex justify-center py-12" role="status">
            <Spinner className="size-8" />
          </div>
        ) : loadError ? (
          <EmptyState
            title={t("priceLists.messages.loadError")}
            description={t("priceLists.messages.pricesSaveError")}
          />
        ) : (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabKey)}
            className="flex flex-col gap-4"
          >
            <TabsList className="w-full">
              <TabsTrigger value="services" className="w-full justify-center gap-2">
                {t("priceLists.tabs.services")}
                <Badge variant="secondary">{formatNumber(filteredServices.length)}</Badge>
              </TabsTrigger>
              <TabsTrigger value="drugs" className="w-full justify-center gap-2">
                {t("priceLists.tabs.drugs")}
                <Badge variant="secondary">{formatNumber(filteredDrugs.length)}</Badge>
              </TabsTrigger>
              <TabsTrigger value="supplies" className="w-full justify-center gap-2">
                {t("priceLists.tabs.supplies")}
                <Badge variant="secondary">{formatNumber(filteredSupplies.length)}</Badge>
              </TabsTrigger>
            </TabsList>

            {/* Services */}
            <TabsContent value="services" className="flex flex-col gap-3">
              <Input
                type="search"
                value={searchServices}
                onChange={(e) => setSearchServices(e.target.value)}
                placeholder={t("priceLists.placeholders.searchServices")}
                aria-label={t("priceLists.placeholders.searchServices")}
              />
              {filteredServices.length === 0 ? (
                <EmptyState title={t("priceLists.messages.noServices")} />
              ) : (
                <div className="grid max-h-[45vh] grid-cols-1 gap-3 overflow-y-auto pe-1 md:grid-cols-2">
                  {filteredServices.map((s) => {
                    const key = serviceKey(s.serviceId)
                    const card = cards[key]
                    const marked = card?.markedForRemoval === true
                    const priced =
                      card?.initial != null ||
                      (card?.price.trim() ?? "") !== ""
                    return (
                      <PriceCardShell
                        key={key}
                        marked={marked}
                        priced={priced}
                        title={s.name}
                        badge={
                          <Badge variant="secondary">
                            {t(`priceLists.serviceTypes.${s.serviceType}`)}
                          </Badge>
                        }
                        onRemove={priced && card?.initial != null && !marked ? () => markForRemoval(key) : undefined}
                        onUndo={marked ? () => undoRemoval(key) : undefined}
                      >
                        <PriceInputs
                          idPrefix={key}
                          card={card}
                          withPrepayment
                          onChange={(patch) => updateCard(key, patch)}
                        />
                      </PriceCardShell>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            {/* Drug shipments */}
            <TabsContent value="drugs" className="flex flex-col gap-3">
              <Input
                type="search"
                value={searchDrugs}
                onChange={(e) => setSearchDrugs(e.target.value)}
                placeholder={t("priceLists.placeholders.searchDrugs")}
                aria-label={t("priceLists.placeholders.searchDrugs")}
              />
              {filteredDrugs.length === 0 ? (
                <EmptyState title={t("priceLists.messages.noDrugs")} />
              ) : (
                <div className="grid max-h-[45vh] grid-cols-1 gap-3 overflow-y-auto pe-1 md:grid-cols-2">
                  {filteredDrugs.map((d) => {
                    const key = drugKey(d.shipmentId)
                    const card = cards[key]
                    const marked = card?.markedForRemoval === true
                    const priced =
                      card?.initial != null ||
                      (card?.price.trim() ?? "") !== ""
                    return (
                      <PriceCardShell
                        key={key}
                        marked={marked}
                        priced={priced}
                        title={d.drugName}
                        badge={
                          <span className="text-xs text-muted-foreground">
                             {d.warehouseName} · {t("priceLists.fields.quantity")} {formatNumber(d.quantity)}
                           </span>
                         }
                         buyPrice={d.buyPrice}
                         onRemove={priced && card?.initial != null && !marked ? () => markForRemoval(key) : undefined}
                        onUndo={marked ? () => undoRemoval(key) : undefined}
                      >
                        <PriceInputs
                          idPrefix={key}
                          card={card}
                          withPrepayment
                          onChange={(patch) => updateCard(key, patch)}
                        />
                      </PriceCardShell>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            {/* Medical supplies */}
            <TabsContent value="supplies" className="flex flex-col gap-3">
              <Input
                type="search"
                value={searchSupplies}
                onChange={(e) => setSearchSupplies(e.target.value)}
                placeholder={t("priceLists.placeholders.searchSupplies")}
                aria-label={t("priceLists.placeholders.searchSupplies")}
              />
              {filteredSupplies.length === 0 ? (
                <EmptyState title={t("priceLists.messages.noSupplies")} />
              ) : (
                <div className="grid max-h-[45vh] grid-cols-1 gap-3 overflow-y-auto pe-1 md:grid-cols-2">
                  {filteredSupplies.map((sup) => {
                    const key = supplyKey(sup.shipmentId)
                    const card = cards[key]
                    const marked = card?.markedForRemoval === true
                    const priced =
                      card?.initial != null ||
                      (card?.price.trim() ?? "") !== ""
                    return (
                      <PriceCardShell
                        key={key}
                        marked={marked}
                        priced={priced}
                        title={sup.supplyName}
                        badge={
                          <span className="text-xs text-muted-foreground">
                             {sup.warehouseName} · {t("priceLists.fields.quantity")} {formatNumber(sup.quantity)}
                           </span>
                         }
                         buyPrice={sup.buyPrice}
                         onRemove={priced && card?.initial != null && !marked ? () => markForRemoval(key) : undefined}
                        onUndo={marked ? () => undoRemoval(key) : undefined}
                      >
                        <PriceInputs
                          idPrefix={key}
                          card={card}
                          withPrepayment={false}
                          onChange={(patch) => updateCard(key, patch)}
                        />
                      </PriceCardShell>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("common.cancel")}
          </Button>
          {showSkip ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("priceLists.buttons.skipForNow")}
            </Button>
          ) : null}
          <Button onClick={handleSave} disabled={disabled}>
            {saving ? (
              <>
                <Spinner aria-hidden className="me-1.5" />
                {t("priceLists.buttons.saving")}
              </>
            ) : (
              t("priceLists.buttons.savePrices")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------------------------------------------
   Card shell & inputs
   ---------------------------------------------------------------- */

function PriceCardShell({
  marked,
  priced,
  title,
  badge,
  buyPrice,
  onRemove,
  onUndo,
  children,
}: {
  marked: boolean
  priced: boolean
  title: string
  badge?: React.ReactNode
  buyPrice?: number | string
  onRemove?: () => void
  onUndo?: () => void
  children: React.ReactNode
}) {
  const { t, i18n } = useTranslation()
  const locale = resolveLocale(i18n.language)
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4",
        marked
          ? "border-destructive border-s-4"
          : priced
            ? "border-s-4 border-s-primary"
            : undefined
      )}
    >
      <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-medium" title={title}>
          {title}
        </span>
        {badge}
        {buyPrice != null ? (
          <span className="text-xs text-muted-foreground">
            {t("priceLists.fields.buyPrice")}:{" "}
            {formatCurrency(Number(buyPrice), locale)}
          </span>
        ) : null}
      </div>
        <div className="flex items-center gap-2">
          {marked ? (
            <>
              <Badge variant="destructive">
                {t("priceLists.status.priceWillBeRemoved")}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                onClick={onUndo}
                aria-label={t("priceLists.actions.undoRemove")}
              >
                <Undo2Icon aria-hidden className="size-4" />
              </Button>
            </>
          ) : onRemove ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={onRemove}
              aria-label={t("priceLists.actions.removePrice")}
            >
              <Trash2Icon aria-hidden className="size-4" />
            </Button>
          ) : priced ? (
            <Badge variant="secondary">{t("priceLists.status.hasPrice")}</Badge>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  )
}

function PriceInputs({
  idPrefix,
  card,
  withPrepayment,
  onChange,
}: {
  idPrefix: string
  card?: PriceCardState
  withPrepayment: boolean
  onChange: (patch: Partial<PriceCardState>) => void
}) {
  const { t } = useTranslation()
  if (!card) return null
  const marked = card.markedForRemoval

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={`${idPrefix}-price`} className="text-xs">
          {t("priceLists.fields.price")}
        </FieldLabel>
        <Input
          id={`${idPrefix}-price`}
          type="number"
          min={0}
          step="0.01"
          placeholder="0.00"
          className="tabular-nums"
          value={card.price}
          disabled={marked}
          onChange={(e) => onChange({ price: e.target.value })}
        />
      </div>

      {withPrepayment ? (
        <>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-prepay`}
              checked={card.requiresPrepayment}
              disabled={marked}
              onCheckedChange={(v) =>
                onChange({
                  requiresPrepayment: v === true,
                  prepaymentType: v === true ? card.prepaymentType : null,
                  prepaymentAmount: v === true ? card.prepaymentAmount : "",
                })
              }
            />
            <FieldLabel htmlFor={`${idPrefix}-prepay`} className="text-xs">
              {t("priceLists.fields.requirePrepayment")}
            </FieldLabel>
          </div>
          {card.requiresPrepayment ? (
            <div className="grid grid-cols-2 gap-2">
              <NativeSelect
                aria-label={t("priceLists.fields.prepaymentType")}
                value={card.prepaymentType ?? ""}
                disabled={marked}
                onChange={(e) =>
                  onChange({
                    prepaymentType: (e.target.value || null) as
                      | "fixed"
                      | "percentage"
                      | null,
                  })
                }
              >
                <NativeSelectOption value="fixed">
                  {t("priceLists.prepaymentTypes.fixed")}
                </NativeSelectOption>
                <NativeSelectOption value="percentage">
                  {t("priceLists.prepaymentTypes.percentage")}
                </NativeSelectOption>
              </NativeSelect>
              <Input
                aria-label={t("priceLists.fields.prepaymentAmount")}
                type="number"
                min={0}
                max={card.prepaymentType === "percentage" ? 100 : undefined}
                step="0.01"
                placeholder="0.00"
                className="tabular-nums"
                value={card.prepaymentAmount}
                disabled={marked}
                onChange={(e) =>
                  onChange({ prepaymentAmount: e.target.value })
                }
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

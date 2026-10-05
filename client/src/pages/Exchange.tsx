import { useMemo, useState, type FormEvent } from "react";
import { api, km, lane, money, when, type ExchangeOffer, type ExchangeSearch } from "../api";

const TRUCK_BODIES = [
  "standard_tent",
  "curtainsider",
  "box",
  "open_box",
  "cooler",
  "isotherm",
  "mega",
  "jumbo",
  "platform",
];

const VEHICLE_SIZES = ["bus", "solo", "lorry", "truck_tractor"];

function todayIso(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const empty: ExchangeSearch = {
  loading_country: "",
  loading_locality: "",
  loading_postal: "",
  loading_range_km: 150,
  unloading_country: "",
  unloading_locality: "",
  date_from: todayIso(0),
  date_to: todayIso(1),
  truck_bodies: ["standard_tent", "curtainsider"],
  vehicle_sizes: ["bus", "solo"],
  max_weight_t: null,
  max_length_m: null,
  exclude_suspended: true,
  sort_field: "index",
  sort_order: "desc",
};

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function MultiPick({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <div className="text-sm">
        {label} <span className="text-mute">{value.length ? value.join(", ") : "any"}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {options.map((option) => {
          const on = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(toggle(value, option))}
              className={`px-2 py-1 rounded text-xs border ${
                on ? "bg-signal text-ink border-signal" : "border-line text-paper/80 hover:bg-raised"
              }`}
            >
              {option.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function asNum(value: string, fallback: number | null = null) {
  if (value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function OfferCard({ offer }: { offer: ExchangeOffer }) {
  return (
    <article className="bg-panel border border-line rounded-2xl p-5">
      <div className="flex justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl">{lane(offer)}</h2>
          <div className="text-mute text-sm mt-1">
            {offer.shipper_name || "Shipper hidden"} · {offer.vehicle_sizes.join(", ") || "any size"}
          </div>
        </div>
        <div className="text-right">
          <div className="mono text-signal">{money(offer.published_price, offer.published_currency || "EUR")}</div>
          <div className="text-xs text-mute">{offer.status || "live"}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-sm">
        <div>{when(offer.loading_at)}</div>
        <div>{offer.weight_t != null ? `${offer.weight_t} t` : "—"} · {offer.length_m != null ? `${offer.length_m} m` : "—"}</div>
        <div>{km(offer.distance_m)}</div>
      </div>
      <p className="text-mute text-sm mt-3">
        {offer.truck_bodies.length ? offer.truck_bodies.join(", ") : "Any body"}
      </p>
      {offer.url && (
        <a
          href={offer.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center text-sm border border-line px-3 py-2 rounded min-h-11 mt-4"
        >
          Open on Trans.eu
        </a>
      )}
    </article>
  );
}

export default function Exchange() {
  const [draft, setDraft] = useState<ExchangeSearch>(empty);
  const [items, setItems] = useState<ExchangeOffer[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  function field<K extends keyof ExchangeSearch>(key: K, value: ExchangeSearch[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const summary = useMemo(() => {
    const from = [draft.loading_locality, (draft.loading_country || "").toUpperCase()].filter(Boolean).join(" ") || "ANY";
    const to = [draft.unloading_locality, (draft.unloading_country || "").toUpperCase()].filter(Boolean).join(" ") || "ANY";
    return `${from} → ${to}`;
  }, [draft]);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.searchExchange({
        ...draft,
        loading_country: draft.loading_country?.trim() || undefined,
        loading_locality: draft.loading_locality?.trim() || undefined,
        loading_postal: draft.loading_postal?.trim() || undefined,
        unloading_country: draft.unloading_country?.trim() || undefined,
        unloading_locality: draft.unloading_locality?.trim() || undefined,
        date_from: draft.date_from || undefined,
        date_to: draft.date_to || undefined,
        truck_bodies: draft.truck_bodies?.length ? draft.truck_bodies : undefined,
        vehicle_sizes: draft.vehicle_sizes?.length ? draft.vehicle_sizes : undefined,
        max_weight_t: draft.max_weight_t ?? null,
        max_length_m: draft.max_length_m ?? null,
        loading_range_km: draft.loading_range_km ?? 150,
      });
      setItems(result.items);
      setTotal(result.total);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <div className="text-signal text-xs tracking-[0.18em] uppercase">Live public exchange</div>
        <h1 className="font-display text-3xl md:text-4xl">Search loads</h1>
        <p className="text-mute mt-2 max-w-2xl">
          Pulls the same public freight offers as Trans.eu Search loads. Connect Trans.eu in Settings first, then filter
          a lane and search.
        </p>
      </header>
      {error && <p className="text-rust mb-4">{error}</p>}
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="space-y-4">
          {searched && (
            <div className="text-sm text-mute">
              {total ?? items.length} offers · {summary}
            </div>
          )}
          {items.map((offer) => (
            <OfferCard key={offer.id || `${offer.loading_locality}-${offer.unloading_locality}-${offer.loading_at}`} offer={offer} />
          ))}
          {!searched && (
            <article className="bg-panel border border-line rounded-2xl p-5 text-mute">
              Set a loading country or city on the right, then search the live exchange.
            </article>
          )}
          {searched && !items.length && !busy && (
            <article className="bg-panel border border-line rounded-2xl p-5 text-mute">
              No live offers matched these filters.
            </article>
          )}
        </div>
        <form className="bg-panel border border-line rounded-2xl p-5 space-y-3" onSubmit={search}>
          <h2 className="font-display text-2xl">Search filters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-sm">From country
              <input className="w-full mt-1" value={draft.loading_country || ""} onChange={(e) => field("loading_country", e.target.value)} placeholder="es, de, pl" />
            </label>
            <label className="text-sm">To country
              <input className="w-full mt-1" value={draft.unloading_country || ""} onChange={(e) => field("unloading_country", e.target.value)} placeholder="de, nl" />
            </label>
            <label className="text-sm">From city
              <input className="w-full mt-1" value={draft.loading_locality || ""} onChange={(e) => field("loading_locality", e.target.value)} placeholder="Málaga" />
            </label>
            <label className="text-sm">To city
              <input className="w-full mt-1" value={draft.unloading_locality || ""} onChange={(e) => field("unloading_locality", e.target.value)} />
            </label>
            <label className="text-sm">Postal
              <input className="w-full mt-1" value={draft.loading_postal || ""} onChange={(e) => field("loading_postal", e.target.value)} placeholder="29001" />
            </label>
            <label className="text-sm">Range km
              <input className="w-full mt-1" type="number" value={draft.loading_range_km ?? ""} onChange={(e) => field("loading_range_km", asNum(e.target.value, 150))} />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-sm">Date from
              <input className="w-full mt-1" type="date" value={draft.date_from || ""} onChange={(e) => field("date_from", e.target.value)} />
            </label>
            <label className="text-sm">Date to
              <input className="w-full mt-1" type="date" value={draft.date_to || ""} onChange={(e) => field("date_to", e.target.value)} />
            </label>
            <label className="text-sm">Max weight t
              <input className="w-full mt-1" type="number" step="0.1" value={draft.max_weight_t ?? ""} onChange={(e) => field("max_weight_t", asNum(e.target.value))} />
            </label>
            <label className="text-sm">Max length m
              <input className="w-full mt-1" type="number" step="0.1" value={draft.max_length_m ?? ""} onChange={(e) => field("max_length_m", asNum(e.target.value))} />
            </label>
          </div>
          <div className="space-y-3 pt-1">
            <MultiPick label="Truck bodies" options={TRUCK_BODIES} value={draft.truck_bodies || []} onChange={(v) => field("truck_bodies", v)} />
            <MultiPick label="Vehicle sizes" options={VEHICLE_SIZES} value={draft.vehicle_sizes || []} onChange={(v) => field("vehicle_sizes", v)} />
          </div>
          <label className="text-sm">Sort
            <select
              className="w-full mt-1"
              value={`${draft.sort_field}:${draft.sort_order}`}
              onChange={(e) => {
                const [fieldName, order] = e.target.value.split(":");
                field("sort_field", fieldName);
                field("sort_order", order as ExchangeSearch["sort_order"]);
              }}
            >
              <option value="index:desc">Newest</option>
              <option value="loading_place:asc">Loading place</option>
              <option value="loading_date:asc">Loading date</option>
            </select>
          </label>
          <button className="bg-signal text-ink px-4 py-2.5 rounded-lg w-full sm:w-auto" disabled={busy}>
            {busy ? "Searching…" : "Search exchange"}
          </button>
        </form>
      </div>
    </div>
  );
}

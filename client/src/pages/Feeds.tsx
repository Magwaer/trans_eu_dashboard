import { useEffect, useState } from "react";
import { api, type Feed } from "../api";

const empty: Feed = {
  name: "",
  enabled: true,
  loading_countries: [],
  loading_localities: [],
  unloading_countries: [],
  unloading_localities: [],
  truck_bodies: ["curtainsider"],
  vehicle_sizes: ["solo"],
  transport_types: ["ftl"],
  min_weight_t: null,
  max_weight_t: null,
  min_distance_km: null,
  max_distance_km: null,
  date_window_days: 14,
  currency: "EUR",
  target_rate_per_km: 1.1,
  min_price: null,
  max_price: null,
  auto_accept_threshold: null,
  first_offer_discount_pct: 8,
  max_rounds: 3,
  strategy: "moderate",
  auto_mode: "suggest",
  notes: "",
};

function csv(v: string) {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export default function Feeds() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [draft, setDraft] = useState<Feed>(empty);
  const [error, setError] = useState("");

  async function load() {
    setFeeds(await api.feeds());
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  function field<K extends keyof Feed>(key: K, value: Feed[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <div>
      <header className="mb-6">
        <div className="text-signal text-xs tracking-[0.18em] uppercase">Watch + price rules</div>
        <h1 className="font-display text-4xl">Freight feeds</h1>
        <p className="text-mute mt-2 max-w-2xl">
          Each feed is a lane filter plus negotiation policy. Matching proposals are scored, priced, and either queued for
          approval or sent automatically.
        </p>
      </header>
      {error && <p className="text-rust mb-4">{error}</p>}
      <div className="grid grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="space-y-4">
          {feeds.map((feed) => (
            <article key={feed.id} className="bg-panel border border-line rounded-2xl p-5">
              <div className="flex justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl">{feed.name}</h2>
                  <div className="text-mute text-sm mt-1">
                    {feed.loading_countries.join("/").toUpperCase() || "ANY"} →{" "}
                    {feed.unloading_countries.join("/").toUpperCase() || "ANY"} · {feed.auto_mode} · {feed.strategy}
                  </div>
                </div>
                <div className="text-right">
                  <div className="mono text-signal">{feed.watched || 0} watched</div>
                  <div className="text-xs text-mute">{feed.enabled ? "on" : "paused"}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
                <div>Target {feed.target_rate_per_km} {feed.currency}/km</div>
                <div>Floor {feed.min_price ?? "—"}</div>
                <div>Auto-accept {feed.auto_accept_threshold ?? "—"}</div>
              </div>
              <p className="text-mute text-sm mt-3">{feed.notes}</p>
              <div className="flex gap-2 mt-4">
                <button className="text-sm border border-line px-3 py-1 rounded" onClick={() => setDraft(feed)}>
                  Edit
                </button>
                <button
                  className="text-sm border border-line px-3 py-1 rounded"
                  onClick={async () => {
                    await api.saveFeed({ enabled: !feed.enabled }, feed.id);
                    await load();
                  }}
                >
                  {feed.enabled ? "Pause" : "Enable"}
                </button>
              </div>
            </article>
          ))}
        </div>
        <form
          className="bg-panel border border-line rounded-2xl p-5 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await api.saveFeed(draft, draft.id);
              setDraft(empty);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          <h2 className="font-display text-2xl">{draft.id ? "Edit feed" : "New feed"}</h2>
          <label className="block text-sm">Name
            <input className="w-full mt-1" value={draft.name} onChange={(e) => field("name", e.target.value)} required />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">From countries
              <input className="w-full mt-1" value={draft.loading_countries.join(",")} onChange={(e) => field("loading_countries", csv(e.target.value))} placeholder="pl,cz" />
            </label>
            <label className="text-sm">To countries
              <input className="w-full mt-1" value={draft.unloading_countries.join(",")} onChange={(e) => field("unloading_countries", csv(e.target.value))} placeholder="de,nl" />
            </label>
            <label className="text-sm">From cities
              <input className="w-full mt-1" value={draft.loading_localities.join(",")} onChange={(e) => field("loading_localities", csv(e.target.value))} />
            </label>
            <label className="text-sm">To cities
              <input className="w-full mt-1" value={draft.unloading_localities.join(",")} onChange={(e) => field("unloading_localities", csv(e.target.value))} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-sm">EUR/km
              <input className="w-full mt-1" type="number" step="0.01" value={draft.target_rate_per_km ?? ""} onChange={(e) => field("target_rate_per_km", e.target.value === "" ? null : Number(e.target.value))} />
            </label>
            <label className="text-sm">Min price
              <input className="w-full mt-1" type="number" value={draft.min_price ?? ""} onChange={(e) => field("min_price", e.target.value === "" ? null : Number(e.target.value))} />
            </label>
            <label className="text-sm">Auto-accept
              <input className="w-full mt-1" type="number" value={draft.auto_accept_threshold ?? ""} onChange={(e) => field("auto_accept_threshold", e.target.value === "" ? null : Number(e.target.value))} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-sm">Strategy
              <select className="w-full mt-1" value={draft.strategy} onChange={(e) => field("strategy", e.target.value as Feed["strategy"])}>
                <option>aggressive</option>
                <option>moderate</option>
                <option>conservative</option>
              </select>
            </label>
            <label className="text-sm">Automation
              <select className="w-full mt-1" value={draft.auto_mode} onChange={(e) => field("auto_mode", e.target.value as Feed["auto_mode"])}>
                <option value="off">off</option>
                <option value="suggest">suggest</option>
                <option value="execute">execute</option>
              </select>
            </label>
            <label className="text-sm">First-offer %
              <input className="w-full mt-1" type="number" value={draft.first_offer_discount_pct} onChange={(e) => field("first_offer_discount_pct", Number(e.target.value))} />
            </label>
          </div>
          <label className="text-sm block">Bodies / sizes / types
            <input className="w-full mt-1" value={[...draft.truck_bodies, ...draft.vehicle_sizes, ...draft.transport_types].join(", ")} readOnly />
          </label>
          <label className="text-sm block">Notes
            <textarea className="w-full mt-1" rows={3} value={draft.notes || ""} onChange={(e) => field("notes", e.target.value)} />
          </label>
          <button className="bg-signal text-ink px-4 py-2 rounded-lg">{draft.id ? "Save feed" : "Create feed"}</button>
        </form>
      </div>
    </div>
  );
}

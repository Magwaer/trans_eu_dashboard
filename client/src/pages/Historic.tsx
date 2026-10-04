import { useEffect, useState } from "react";
import { api, money, type Historic } from "../api";

export default function HistoricPage() {
  const [data, setData] = useState<Historic | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setData(await api.historic());
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <header className="flex justify-between items-end mb-6">
        <div>
          <div className="text-signal text-xs tracking-[0.18em] uppercase">Closed book</div>
          <h1 className="font-display text-4xl">Historic / training</h1>
          <p className="text-mute mt-2 max-w-2xl">
            Archived freights, accepted proposals, and closed orders become JSONL samples for Anthropic pricing.
            Trans.eu exposes archived + accepted lists; there is no public full-exchange dump.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="bg-signal text-ink px-4 py-2 rounded-lg disabled:opacity-60"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api.pullHistoric();
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Pulling…" : "Pull from Trans.eu"}
          </button>
          <a className="border border-line px-4 py-2 rounded-lg" href="/api/historic/export">
            Download JSONL
          </a>
        </div>
      </header>
      {error && <p className="text-rust mb-3">{error}</p>}
      {data && (
        <div className="bg-panel border border-line rounded-2xl overflow-hidden">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Route</th>
                <th>Features</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {data.samples.map((s) => (
                <tr key={s.id}>
                  <td className="mono text-sm">{s.source}</td>
                  <td className="uppercase">{s.route_key}</td>
                  <td className="text-sm text-mute">
                    {String(s.features.distance_km || "—")} km · {String(s.features.weight_t || "—")}t · pub{" "}
                    {money(s.features.published_price as number)}
                  </td>
                  <td>
                    {String(s.outcome.status)} {s.outcome.accepted_price ? `· ${money(s.outcome.accepted_price as number)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

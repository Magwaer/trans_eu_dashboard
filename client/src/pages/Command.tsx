import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ActionRow, type Dashboard, money } from "../api";

export default function Command() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const [d, a] = await Promise.all([api.dashboard(), api.actions()]);
    setData(d);
    setActions(a);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6 md:mb-8">
        <div>
          <div className="text-signal text-xs tracking-[0.18em] uppercase">Live desk</div>
          <h1 className="font-display text-3xl md:text-4xl">Command</h1>
        </div>
        <button
          className="bg-signal text-ink px-4 py-2.5 rounded-lg font-medium disabled:opacity-60 w-full sm:w-auto"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api.sync();
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Syncing…" : "Sync Trans.eu now"}
        </button>
      </header>
      {error && <p className="text-rust mb-4">{error}</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            {[
              ["Watched feeds", data.feeds],
              ["Matched loads", data.freights.matched],
              ["Open negotiations", data.negotiations.open],
              ["Training samples", data.training],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-panel border border-line rounded-2xl p-5">
                <div className="text-mute text-xs uppercase tracking-wider">{label}</div>
                <div className="font-display text-4xl mt-1">{value}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <section className="bg-panel border border-line rounded-2xl p-5">
              <h2 className="font-display text-2xl mb-3">Lanes in play</h2>
              <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Loads</th>
                    <th>Avg published</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lanes.map((lane) => (
                    <tr key={`${lane.loading_country}-${lane.unloading_country}`}>
                      <td className="mono uppercase">
                        {lane.loading_country} → {lane.unloading_country}
                      </td>
                      <td>{lane.n}</td>
                      <td>{money(lane.avg_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </section>
            <section className="bg-panel border border-line rounded-2xl p-5">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-display text-2xl">Automation queue</h2>
                <Link to="/inbox" className="text-signal text-sm">
                  Open inbox
                </Link>
              </div>
              <div className="space-y-3">
                {actions.slice(0, 6).map((a) => (
                  <div key={a.id} className="border border-line rounded-xl p-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-signal">{a.action}</span>
                      <span className="mono text-mute">{a.status}</span>
                    </div>
                    <div className="text-sm mt-1">
                      {a.loading_locality} → {a.unloading_locality}
                      {a.payload?.price ? ` · ${money(a.payload.price, a.payload.currency)}` : ""}
                    </div>
                    <p className="text-mute text-xs mt-1">{a.reason}</p>
                    {a.status === "pending" && (
                      <div className="flex gap-2 mt-2">
                        <button
                          className="text-xs bg-moss text-ink px-2 py-1 rounded"
                          onClick={async () => {
                            await api.approveAction(a.id);
                            await load();
                          }}
                        >
                          Approve
                        </button>
                        <button
                          className="text-xs border border-line px-2 py-1 rounded"
                          onClick={async () => {
                            await api.cancelAction(a.id);
                            await load();
                          }}
                        >
                          Skip
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

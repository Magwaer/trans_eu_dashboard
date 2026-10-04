import { useEffect, useState } from "react";
import { api, money, when, type EventRow, type Negotiation } from "../api";

export default function Negotiations() {
  const [rows, setRows] = useState<Negotiation[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setRows(await api.negotiations());
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <header className="mb-6">
        <div className="text-signal text-xs tracking-[0.18em] uppercase">Offers in motion</div>
        <h1 className="font-display text-4xl">Negotiations</h1>
        <p className="text-mute mt-2 max-w-3xl">
          API negotiation works for direct, partner, and fixed-route offers. Public exchange counters still have to be
          finished on the Trans.eu platform — the desk still prices and drafts the reply.
        </p>
      </header>
      {error && <p className="text-rust mb-3">{error}</p>}
      <div className="bg-panel border border-line rounded-2xl overflow-hidden">
        <table>
          <thead>
            <tr>
              <th>Lane</th>
              <th>Role</th>
              <th>Price</th>
              <th>Rounds</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.loading_locality} → {row.unloading_locality}
                  <div className="text-mute text-xs">{row.counterpart_name} · {row.feed_name || "unmatched"}</div>
                </td>
                <td>{row.our_role}</td>
                <td className="mono">{money(row.current_price, row.currency)}</td>
                <td>{row.rounds}</td>
                <td>{row.status}{row.auto_managed ? " · auto" : ""}</td>
                <td className="space-x-2">
                  <button
                    className="text-signal text-sm"
                    onClick={async () => {
                      setOpen(row.id);
                      const d = await api.negotiation(row.id);
                      setEvents(d.events);
                    }}
                  >
                    History
                  </button>
                  <input
                    className="w-20"
                    placeholder="€"
                    value={open === row.id ? price : ""}
                    onChange={(e) => {
                      setOpen(row.id);
                      setPrice(e.target.value);
                    }}
                  />
                  <button
                    className="text-sm bg-signal text-ink px-2 py-1 rounded"
                    onClick={async () => {
                      await api.negotiate(row.id, "counter", { price: Number(price), note: "Desk counter" });
                      setPrice("");
                      await load();
                    }}
                  >
                    Counter
                  </button>
                  <button className="text-sm border border-line px-2 py-1 rounded" onClick={() => api.negotiate(row.id, "accept").then(load)}>
                    Accept
                  </button>
                  <button className="text-sm border border-line px-2 py-1 rounded" onClick={() => api.negotiate(row.id, "reject").then(load)}>
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <section className="mt-6 bg-panel border border-line rounded-2xl p-5">
          <h2 className="font-display text-2xl mb-3">Thread</h2>
          {events.map((ev) => (
            <div key={ev.id} className="flex justify-between border-b border-line py-2 text-sm">
              <div>
                <span className="text-signal">{ev.action}</span> · {ev.actor} · {ev.source}
                <div className="text-mute">{ev.note}</div>
              </div>
              <div className="mono">{money(ev.price, ev.currency)} · {when(ev.created_at)}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

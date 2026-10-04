import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, km, lane, money, when, type Freight, type FreightDetail } from "../api";

export default function Inbox() {
  const { id } = useParams();
  const [rows, setRows] = useState<Freight[]>([]);
  const [detail, setDetail] = useState<FreightDetail | null>(null);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("note");
  const [value, setValue] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  async function loadList() {
    setRows(await api.inbox());
  }
  async function loadDetail(fid: string) {
    setDetail(await api.freight(fid));
  }

  useEffect(() => {
    loadList().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (id) loadDetail(id).catch((e) => setError(e.message));
  }, [id]);

  return (
    <div>
      <header className="mb-6">
        <div className="text-signal text-xs tracking-[0.18em] uppercase">Matched + unmatched loads</div>
        <h1 className="font-display text-4xl">Inbox</h1>
      </header>
      {error && <p className="text-rust mb-3">{error}</p>}
      <div className={id ? "grid grid-cols-[1fr_0.9fr] gap-6" : ""}>
        <div className="bg-panel border border-line rounded-2xl overflow-hidden">
          <table>
            <thead>
              <tr>
                <th>Lane</th>
                <th>When</th>
                <th>Published</th>
                <th>Suggested</th>
                <th>Feed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={id === row.id ? "bg-raised" : ""}>
                  <td>
                    <Link to={`/inbox/${row.id}`} className="text-paper">
                      <div>{lane(row)}</div>
                      <div className="text-mute text-xs">
                        {row.shipper_name} · {row.weight_t}t · {km(row.distance_m)} · {row.source}
                      </div>
                    </Link>
                  </td>
                  <td className="text-sm">{when(row.loading_at)}</td>
                  <td className="mono">{money(row.published_price, row.published_currency)}</td>
                  <td className="mono text-signal">{money(row.suggested_price, row.suggested_currency)}</td>
                  <td className="text-sm">{row.feed_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {detail && (
          <aside className="space-y-4">
            <section className="bg-panel border border-line rounded-2xl p-5">
              <div className="text-mute text-xs uppercase">{detail.freight.reference_number}</div>
              <h2 className="font-display text-3xl">{lane(detail.freight)}</h2>
              <p className="text-mute mt-2">{detail.freight.ai_summary}</p>
              <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                <div>Published {money(detail.freight.published_price, detail.freight.published_currency)}</div>
                <div>Suggested {money(detail.freight.suggested_price, detail.freight.suggested_currency)}</div>
                <div>Pay {detail.freight.payment_days || "—"} days</div>
                <div>{detail.freight.is_quick_pay ? "QuickPay" : "Standard"}</div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  className="bg-signal text-ink px-3 py-1.5 rounded"
                  onClick={async () => {
                    await api.price(detail.freight.id);
                    await loadDetail(detail.freight.id);
                    await loadList();
                  }}
                >
                  Recalculate with Anthropic
                </button>
                <button
                  className="border border-line px-3 py-1.5 rounded"
                  onClick={async () => {
                    const r = await api.reply({
                      freightId: detail.freight.id,
                      intent: "counter-offer",
                      extra: note,
                    });
                    setReply(r.text);
                  }}
                >
                  Draft reply
                </button>
              </div>
              {reply && <pre className="whitespace-pre-wrap text-sm mt-3 text-moss">{reply}</pre>}
            </section>
            <section className="bg-panel border border-line rounded-2xl p-5">
              <h3 className="font-display text-xl mb-2">Manual inputs</h3>
              <div className="space-y-2 mb-3">
                {detail.notes.map((n) => (
                  <div key={n.id} className="text-sm border-b border-line pb-2">
                    <span className="text-signal">{n.kind}</span> · {n.content}
                    {n.value != null && ` · ${money(n.value, n.currency)}`}
                    <div className="text-mute text-xs">{n.author} · {when(n.created_at)}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option>note</option>
                  <option>cost</option>
                  <option>decision</option>
                  <option>price_override</option>
                </select>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Operator note" />
                <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" />
                <button
                  className="border border-line rounded"
                  onClick={async () => {
                    await api.addNote(detail.freight.id, {
                      kind,
                      content: note,
                      value: value === "" ? null : Number(value),
                    });
                    setNote("");
                    setValue("");
                    await loadDetail(detail.freight.id);
                  }}
                >
                  Add
                </button>
              </div>
            </section>
            <section className="bg-panel border border-line rounded-2xl p-5">
              <h3 className="font-display text-xl mb-2">Automation</h3>
              {detail.actions.map((a) => (
                <div key={a.id} className="text-sm mb-2">
                  <span className="mono">{a.status}</span> · {a.action} · {a.reason}
                </div>
              ))}
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}

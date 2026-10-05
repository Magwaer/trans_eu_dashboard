import { useEffect, useState } from "react";
import { api, money, when, type Order } from "../api";

export default function Orders() {
  const [rows, setRows] = useState<Order[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api.orders().then(setRows).catch((e) => setError(e.message));
  }, []);
  return (
    <div>
      <header className="mb-6">
        <div className="text-signal text-xs tracking-[0.18em] uppercase">Won work</div>
        <h1 className="font-display text-3xl md:text-4xl">Orders</h1>
      </header>
      {error && <p className="text-rust">{error}</p>}
      <div className="md:hidden space-y-3">
        {rows.map((row) => (
          <article key={row.id} className="bg-panel border border-line rounded-2xl p-4">
            <div className="flex justify-between gap-3">
              <div className="mono text-signal">{row.number}</div>
              <div className="text-sm text-mute">{row.status}</div>
            </div>
            <div className="mt-2">{row.loading_locality} → {row.unloading_locality}</div>
            <div className="text-sm text-mute mt-1">{row.shipper_name} / {row.carrier_name}</div>
            <div className="flex justify-between gap-3 mt-3 text-sm">
              <span className="mono">{money(row.price, row.currency)}</span>
              <span>{when(row.loading_at)}</span>
            </div>
          </article>
        ))}
      </div>
      <div className="hidden md:block bg-panel border border-line rounded-2xl overflow-hidden">
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Lane</th>
              <th>Parties</th>
              <th>Price</th>
              <th>Status</th>
              <th>Load</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="mono">{row.number}</td>
                <td>{row.loading_locality} → {row.unloading_locality}</td>
                <td className="text-sm">{row.shipper_name} / {row.carrier_name}</td>
                <td className="mono">{money(row.price, row.currency)}</td>
                <td>{row.status}</td>
                <td>{when(row.loading_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

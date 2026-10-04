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
        <h1 className="font-display text-4xl">Orders</h1>
      </header>
      {error && <p className="text-rust">{error}</p>}
      <div className="bg-panel border border-line rounded-2xl overflow-hidden">
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
  );
}

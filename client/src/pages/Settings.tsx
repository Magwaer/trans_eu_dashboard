import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type AuthStatus } from "../api";

export default function Settings() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState("");
  const [params] = useSearchParams();

  useEffect(() => {
    api.status().then(setStatus).catch((e) => setError(e.message));
    if (params.get("error")) setError(params.get("error") || "");
  }, [params]);

  return (
    <div>
      <header className="mb-6">
        <div className="text-signal text-xs tracking-[0.18em] uppercase">Connections</div>
        <h1 className="font-display text-4xl">Settings</h1>
      </header>
      {params.get("connected") && <p className="text-moss mb-3">Trans.eu connected.</p>}
      {error && <p className="text-rust mb-3">{error}</p>}
      {status && (
        <div className="grid grid-cols-2 gap-5">
          <section className="bg-panel border border-line rounded-2xl p-5">
            <h2 className="font-display text-2xl">Trans.eu OAuth</h2>
            <p className="text-mute text-sm mt-2">
              Authorization Code grant. Each user logs in themselves. Codes live 60 seconds. Store the latest refresh
              token. Token endpoint 5 rps, everything else 15 rps.
            </p>
            <dl className="mt-4 space-y-1 text-sm">
              <div>App credentials: {status.trans.configured ? "present" : "missing in .env"}</div>
              <div>User connected: {status.trans.connected ? "yes" : "no"}</div>
              <div>Scope: {status.trans.scope || "—"}</div>
              <div>Expires: {status.trans.expiresAt ? new Date(status.trans.expiresAt).toLocaleString() : "—"}</div>
            </dl>
            <button
              className="mt-4 bg-signal text-ink px-4 py-2 rounded-lg"
              onClick={async () => {
                const { url } = await api.transStart();
                window.location.href = url;
              }}
            >
              Connect Trans.eu user
            </button>
            <ul className="mt-4 text-mute text-sm list-disc pl-5 space-y-1">
              {status.trans.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
          <section className="bg-panel border border-line rounded-2xl p-5">
            <h2 className="font-display text-2xl">Anthropic</h2>
            <p className="text-mute text-sm mt-2">
              Used for price recommendations, negotiation copy, and desk analysis. Set ANTHROPIC_API_KEY.
            </p>
            <div className="mt-4">{status.anthropic ? "Key detected" : "Running on local heuristics only"}</div>
            <div className="mt-6 text-sm text-mute">
              Register the app on Trans.eu, set redirect to
              <span className="mono text-paper"> /api/auth/trans/callback</span>, and point freight
              callback_url at <span className="mono text-paper">/api/webhooks/trans</span>. Allow Trans.eu IP
              52.208.90.151.
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

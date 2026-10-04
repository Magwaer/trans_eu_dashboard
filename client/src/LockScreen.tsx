import { FormEvent, useState } from "react";
import { api } from "./api";

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(password);
      onUnlock();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-panel border border-line rounded-2xl p-8 shadow-lg"
      >
        <div className="text-[11px] tracking-[0.22em] uppercase text-signal">TNL · Trans.eu</div>
        <h1 className="font-display text-4xl mt-2">Lane Desk</h1>
        <p className="text-mute text-sm mt-2">Enter the dashboard password to unlock.</p>
        <label className="block mt-6 text-sm text-mute" htmlFor="desk-password">
          Password
        </label>
        <input
          id="desk-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mt-2"
        />
        {error && <p className="text-rust text-sm mt-3">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-6 w-full bg-signal text-ink px-4 py-2.5 rounded-lg font-medium disabled:opacity-60"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

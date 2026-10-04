import { useState } from "react";
import { api } from "../api";

export default function Assistant() {
  const [question, setQuestion] = useState("Which lanes are underpriced versus historic closes, and what should we auto-accept today?");
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div>
      <header className="mb-6">
        <div className="text-signal text-xs tracking-[0.18em] uppercase">Calculations + copy</div>
        <h1 className="font-display text-4xl">Anthropic desk</h1>
        <p className="text-mute mt-2 max-w-2xl">
          Uses live inbox, feed rules, and historic samples. If no API key is set, the server falls back to the local
          pricing heuristic.
        </p>
      </header>
      <form
        className="bg-panel border border-line rounded-2xl p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await api.analyze(question);
            setAnswer(r.text);
            setModel(r.model);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <textarea className="w-full" rows={5} value={question} onChange={(e) => setQuestion(e.target.value)} />
        <button className="mt-3 bg-signal text-ink px-4 py-2 rounded-lg" disabled={busy}>
          {busy ? "Thinking…" : "Ask the desk"}
        </button>
      </form>
      {error && <p className="text-rust mt-3">{error}</p>}
      {answer && (
        <article className="mt-6 bg-panel border border-line rounded-2xl p-5">
          <div className="text-mute text-xs mb-2">{model}</div>
          <pre className="whitespace-pre-wrap font-sans text-[15px] leading-7">{answer}</pre>
        </article>
      )}
    </div>
  );
}

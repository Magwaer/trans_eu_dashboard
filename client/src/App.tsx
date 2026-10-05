import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import LockScreen from "./LockScreen";
import Command from "./pages/Command";
import Feeds from "./pages/Feeds";
import Exchange from "./pages/Exchange";
import Inbox from "./pages/Inbox";
import Negotiations from "./pages/Negotiations";
import Orders from "./pages/Orders";
import Historic from "./pages/Historic";
import Assistant from "./pages/Assistant";
import Settings from "./pages/Settings";

const links = [
  ["/", "Command"],
  ["/feeds", "Feeds"],
  ["/exchange", "Exchange"],
  ["/inbox", "Inbox"],
  ["/negotiations", "Negotiations"],
  ["/orders", "Orders"],
  ["/historic", "Historic"],
  ["/assistant", "Anthropic"],
  ["/settings", "Settings"],
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api
      .status()
      .then((s) => setUnlocked(Boolean(s.unlocked ?? s.dashboard)))
      .catch(() => setUnlocked(false))
      .finally(() => setReady(true));

    const lock = () => setUnlocked(false);
    window.addEventListener("desk-locked", lock);
    return () => window.removeEventListener("desk-locked", lock);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  if (!ready) return null;
  if (!unlocked) return <LockScreen onUnlock={() => setUnlocked(true)} />;

  async function lockDesk() {
    await api.logout().catch(() => undefined);
    setUnlocked(false);
  }

  const nav = (
    <>
      <div className="mb-6 md:mb-8">
        <div className="text-[11px] tracking-[0.22em] uppercase text-signal">TNL · Trans.eu</div>
        <div className="font-display text-3xl leading-none mt-1">Lane Desk</div>
        <p className="text-mute text-sm mt-2 hidden md:block">Watch lanes, price, negotiate, archive for training.</p>
      </div>
      <nav className="flex flex-col gap-1">
        {links.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `min-h-11 px-3 py-2.5 rounded-lg text-sm flex items-center ${
                isActive ? "bg-raised text-signal" : "text-paper/80 hover:bg-raised"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto text-xs text-mute pt-8">
        Token 5 rps · API 15 rps
        <br />
        Callbacks from 52.208.90.151
        <button className="mt-4 block text-paper/70 hover:text-signal min-h-11" onClick={lockDesk}>
          Lock desk
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-signal">TNL · Trans.eu</div>
          <div className="font-display text-xl leading-none">Lane Desk</div>
        </div>
        <button
          type="button"
          className="border border-line rounded-lg px-3 min-h-11 text-sm"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
      </header>

      {menuOpen && (
        <button
          type="button"
          className="md:hidden fixed inset-0 z-40 bg-ink/70"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-[min(84vw,280px)] h-dvh md:h-auto overflow-y-auto border-r border-line bg-panel px-5 py-6 flex flex-col transition-transform duration-200 md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          className="md:hidden self-end text-sm text-mute mb-4"
          onClick={() => setMenuOpen(false)}
        >
          Close
        </button>
        {nav}
      </aside>

      <main className="px-4 py-5 md:px-8 md:py-7 max-w-[1400px] w-full min-w-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Routes>
          <Route path="/" element={<Command />} />
          <Route path="/feeds" element={<Feeds />} />
          <Route path="/exchange" element={<Exchange />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/inbox/:id" element={<Inbox />} />
          <Route path="/negotiations" element={<Negotiations />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/historic" element={<Historic />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

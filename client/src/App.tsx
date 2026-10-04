import { NavLink, Route, Routes } from "react-router-dom";
import Command from "./pages/Command";
import Feeds from "./pages/Feeds";
import Inbox from "./pages/Inbox";
import Negotiations from "./pages/Negotiations";
import Orders from "./pages/Orders";
import Historic from "./pages/Historic";
import Assistant from "./pages/Assistant";
import Settings from "./pages/Settings";

const links = [
  ["/", "Command"],
  ["/feeds", "Feeds"],
  ["/inbox", "Inbox"],
  ["/negotiations", "Negotiations"],
  ["/orders", "Orders"],
  ["/historic", "Historic"],
  ["/assistant", "Anthropic"],
  ["/settings", "Settings"],
];

export default function App() {
  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r border-line bg-panel/80 px-5 py-6 flex flex-col">
        <div className="mb-8">
          <div className="text-[11px] tracking-[0.22em] uppercase text-signal">TNL · Trans.eu</div>
          <div className="font-display text-3xl leading-none mt-1">Lane Desk</div>
          <p className="text-mute text-sm mt-2">Watch lanes, price, negotiate, archive for training.</p>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm ${isActive ? "bg-raised text-signal" : "text-paper/80 hover:bg-raised"}`
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
        </div>
      </aside>
      <main className="px-8 py-7 max-w-[1400px] w-full">
        <Routes>
          <Route path="/" element={<Command />} />
          <Route path="/feeds" element={<Feeds />} />
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

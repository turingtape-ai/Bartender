import { NavLink, Route, Routes } from "react-router-dom";
import { PreferencesProvider, usePreferences } from "./preferences";
import HomePage from "./pages/HomePage";
import CocktailPage from "./pages/CocktailPage";
import GlassesPage from "./pages/GlassesPage";
import DevelopersPage from "./pages/DevelopersPage";
import type { DisplayUnit } from "@bartender/core";

function UnitToggle() {
  const { unit, setUnit } = usePreferences();
  const units: DisplayUnit[] = ["ml", "cl", "oz"];
  return (
    <div className="segmented" role="group" aria-label="Measurement units">
      {units.map((u) => (
        <button key={u} type="button" className={u === unit ? "active" : ""} onClick={() => setUnit(u)} aria-pressed={u === unit}>
          {u}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <header className="site-header">
        <div className="container header-inner">
          <NavLink to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 64 64" width="26" height="26">
                <path d="M8 10h48L36 34v16h12v4H16v-4h12V34z" fill="currentColor" />
              </svg>
            </span>
            Bartender
          </NavLink>
          <nav className="site-nav">
            <NavLink to="/" end>
              Cocktails
            </NavLink>
            <NavLink to="/glasses">Glassware</NavLink>
            <NavLink to="/developers">API &amp; MCP</NavLink>
          </nav>
          <UnitToggle />
        </div>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/cocktails/:id" element={<CocktailPage />} />
          <Route path="/glasses" element={<GlassesPage />} />
          <Route path="/developers" element={<DevelopersPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <footer className="site-footer container">
        Recipes follow the <a href="https://iba-world.com/cocktails/all-cocktails/">IBA official cocktail list</a>. Diagrams show each ingredient as a layer
        proportional to its volume in the real glass shape.
      </footer>
    </PreferencesProvider>
  );
}

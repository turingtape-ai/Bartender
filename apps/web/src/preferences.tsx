import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { DisplayUnit } from "@bartender/core";

interface Preferences {
  unit: DisplayUnit;
  setUnit: (u: DisplayUnit) => void;
}

const PreferencesContext = createContext<Preferences>({ unit: "ml", setUnit: () => {} });

function readUnit(): DisplayUnit {
  try {
    const v = localStorage.getItem("bartender.unit");
    if (v === "ml" || v === "cl" || v === "oz") return v;
  } catch {
    /* storage unavailable */
  }
  return "ml";
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<DisplayUnit>(readUnit);
  const setUnit = useCallback((u: DisplayUnit) => {
    setUnitState(u);
    try {
      localStorage.setItem("bartender.unit", u);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo(() => ({ unit, setUnit }), [unit, setUnit]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  return useContext(PreferencesContext);
}

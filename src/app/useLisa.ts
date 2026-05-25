import { useContext } from "react";
import { LisaContext } from "./LisaContextDef";
import type { LisaContextValue } from "./LisaContextDef";

export function useLisa(): LisaContextValue {
  const ctx = useContext(LisaContext);
  if (!ctx) throw new Error("useLisa must be used inside LisaProvider");
  return ctx;
}

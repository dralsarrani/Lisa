import { createContext } from "react";
import type React from "react";
import type { LisaState, LisaAction } from "./lisa-reducer";
import type { createAuditEvent } from "../core/audit-store";

export interface LisaContextValue {
  state: LisaState;
  dispatch: React.Dispatch<LisaAction>;
  addAudit: (params: Parameters<typeof createAuditEvent>[0]) => void;
}

export const LisaContext = createContext<LisaContextValue | null>(null);

import React, { useReducer, useEffect, useCallback, useRef } from "react";
import { LisaContext } from "./LisaContextDef";
import { lisaReducer, initialState } from "./lisa-reducer";
import { loadState, saveState } from "../core/persistence";
import { createAuditEvent } from "../core/audit-store";

export function LisaProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(lisaReducer, initialState);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addAudit = useCallback(
    (params: Parameters<typeof createAuditEvent>[0]) => {
      dispatch({ type: "ADD_AUDIT_EVENT", payload: createAuditEvent(params) });
    },
    []
  );

  // Load persisted state on mount.
  useEffect(() => {
    loadState().then((persisted) => {
      dispatch({
        type: "LOAD_STATE",
        payload: {
          settings: persisted.settings,
          missions: persisted.missions,
          approvals: persisted.approvals,
          auditEvents: persisted.auditEvents,
          conversationHistory: persisted.conversationHistory,
          memoryNotes: persisted.memoryNotes,
        },
      });

      dispatch({
        type: "ADD_AUDIT_EVENT",
        payload: createAuditEvent({
          eventType: "app_started",
          source: "system",
          summary: "Lisa started. Persistent state loaded.",
          details: `Mode: ${persisted.settings.activeMode} | Version: Phase 0`,
          severity: "info",
        }),
      });
    });
  }, []);

  // Debounced auto-save on state change.
  useEffect(() => {
    if (!state.isLoaded) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveState({
        settings: state.settings,
        missions: state.missions,
        approvals: state.approvals,
        auditEvents: state.auditEvents,
        conversationHistory: state.conversationHistory,
        memoryNotes: state.memoryNotes,
      }).catch(() => {
        // Persistence error — non-fatal.
      });
    }, 1000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state.settings, state.missions, state.approvals, state.auditEvents, state.conversationHistory, state.memoryNotes, state.isLoaded]);

  return (
    <LisaContext.Provider value={{ state, dispatch, addAudit }}>
      {children}
    </LisaContext.Provider>
  );
}

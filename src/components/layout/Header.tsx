import React, { useState, useEffect } from "react";
import type { OrbState, LisaModeId } from "../../core/types";
import { getModeDisplayName } from "../../core/mode-store";
import { useLisa } from "../../app/useLisa";
import "./Header.css";

interface HeaderProps {
  orbState: OrbState;
  activeMode: LisaModeId;
  onEmergencyStop: () => void;
}

const STATE_DESCRIPTIONS: Record<OrbState, string> = {
  idle: "Ready",
  listening: "Listening…",
  thinking: "Processing…",
  speaking: "Speaking…",
  acting: "Acting…",
  waiting_approval: "Awaiting approval",
  paused: "Paused",
  error: "Error detected",
  emergency_stopped: "EMERGENCY STOPPED",
};

export const Header: React.FC<HeaderProps> = ({ orbState, activeMode, onEmergencyStop }) => {
  const { state } = useLisa();
  const pendingApprovalCount = state.approvals.filter((a) => a.status === "pending").length;
  const isEmergencyStopped = orbState === "emergency_stopped";

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <header className={`header ${isEmergencyStopped ? "header-emergency" : ""}`}>
      {/* Left: Identity */}
      <div className="header-identity">
        <div className="header-logo">
          <div className="header-logo-orb" />
          <span className="header-name">LISA</span>
        </div>
        <span className="header-subtitle">AI Operating Companion · Phase 0</span>
      </div>

      {/* Center: Status */}
      <div className="header-status">
        <div className={`header-state-indicator header-state-${orbState}`}>
          <span className="header-state-dot" />
          <span className="header-state-label">{STATE_DESCRIPTIONS[orbState]}</span>
        </div>
        <div className="header-mode-badge">
          {getModeDisplayName(activeMode)}
        </div>
        {pendingApprovalCount > 0 && (
          <div className="header-approval-badge">
            {pendingApprovalCount} pending
          </div>
        )}
      </div>

      {/* Right: Clock + Emergency Stop */}
      <div className="header-right">
        <div className="header-clock">
          <span className="header-time">{timeStr}</span>
          <span className="header-date">{dateStr}</span>
        </div>
        <button
          className="btn btn-emergency header-emergency-btn"
          onClick={onEmergencyStop}
          title="Emergency Stop — immediately halt all active operations (Ctrl+Shift+.)"
          aria-label="Emergency Stop"
        >
          ⬛ STOP
        </button>
      </div>
    </header>
  );
};

export default Header;

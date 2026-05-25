import React from "react";
import type { OrbState } from "../../core/types";
import "./LisaOrb.css";

interface LisaOrbProps {
  state: OrbState;
  size?: "small" | "medium" | "large";
  onClick?: () => void;
}

const STATE_LABELS: Record<OrbState, string> = {
  idle: "IDLE",
  listening: "LISTENING",
  thinking: "PROCESSING",
  speaking: "SPEAKING",
  acting: "ACTING",
  waiting_approval: "AWAITING APPROVAL",
  paused: "PAUSED",
  error: "ERROR",
  emergency_stopped: "EMERGENCY STOP",
};

const STATE_COLORS: Record<OrbState, string> = {
  idle: "var(--orb-idle)",
  listening: "var(--orb-listening)",
  thinking: "var(--orb-thinking)",
  speaking: "var(--orb-speaking)",
  acting: "var(--orb-acting)",
  waiting_approval: "var(--orb-waiting-approval)",
  paused: "var(--orb-paused)",
  error: "var(--orb-error)",
  emergency_stopped: "var(--orb-emergency)",
};

export const LisaOrb: React.FC<LisaOrbProps> = ({
  state,
  size = "medium",
  onClick,
}) => {
  const isEmergency = state === "emergency_stopped";
  const isListening = state === "listening";
  const isThinking = state === "thinking";
  const isSpeaking = state === "speaking";
  const isActing = state === "acting";
  const isWaitingApproval = state === "waiting_approval";

  return (
    <div
      className={`orb-container orb-size-${size} orb-state-${state}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-label={`Lisa Orb — ${STATE_LABELS[state]}`}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => e.key === "Enter" && onClick()
          : undefined
      }
    >
      {/* Outer ambient glow ring */}
      <div className="orb-ambient" />

      {/* HUD ring 1 — outer */}
      <div className={`orb-ring orb-ring-outer ${isThinking || isActing ? "orb-ring-spin" : ""}`}>
        <svg viewBox="0 0 200 200" className="orb-ring-svg">
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke={STATE_COLORS[state]}
            strokeWidth="1"
            strokeDasharray="12 6"
            opacity="0.5"
          />
          {/* Tick marks */}
          {Array.from({ length: 24 }, (_, i) => {
            const angle = (i * 360) / 24;
            const rad = (angle * Math.PI) / 180;
            const r1 = 85;
            const r2 = 90;
            return (
              <line
                key={i}
                x1={100 + r1 * Math.cos(rad)}
                y1={100 + r1 * Math.sin(rad)}
                x2={100 + r2 * Math.cos(rad)}
                y2={100 + r2 * Math.sin(rad)}
                stroke={STATE_COLORS[state]}
                strokeWidth="1.5"
                opacity="0.6"
              />
            );
          })}
        </svg>
      </div>

      {/* HUD ring 2 — mid */}
      <div
        className={`orb-ring orb-ring-mid ${
          isThinking ? "orb-ring-spin-reverse" : isActing ? "orb-ring-spin" : ""
        }`}
      >
        <svg viewBox="0 0 200 200" className="orb-ring-svg">
          <circle
            cx="100"
            cy="100"
            r="72"
            fill="none"
            stroke={STATE_COLORS[state]}
            strokeWidth="1.5"
            strokeDasharray={isActing ? "30 10" : "60 10 5 10"}
            opacity="0.4"
          />
        </svg>
      </div>

      {/* Core sphere */}
      <div className="orb-core">
        {/* Inner energy core */}
        <div className={`orb-energy ${isListening ? "orb-energy-pulse" : ""}`} />

        {/* Neural pattern */}
        <div className="orb-neural">
          <svg viewBox="0 0 100 100" className="orb-neural-svg">
            <defs>
              <radialGradient id="neuralGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={STATE_COLORS[state]} stopOpacity="0.6" />
                <stop offset="100%" stopColor={STATE_COLORS[state]} stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="48" fill="url(#neuralGrad)" />

            {/* Neural lines */}
            {!isEmergency && (
              <>
                <line x1="50" y1="10" x2="50" y2="90" stroke={STATE_COLORS[state]} strokeWidth="0.3" opacity="0.3" />
                <line x1="10" y1="50" x2="90" y2="50" stroke={STATE_COLORS[state]} strokeWidth="0.3" opacity="0.3" />
                <line x1="20" y1="20" x2="80" y2="80" stroke={STATE_COLORS[state]} strokeWidth="0.3" opacity="0.2" />
                <line x1="80" y1="20" x2="20" y2="80" stroke={STATE_COLORS[state]} strokeWidth="0.3" opacity="0.2" />
                <circle cx="50" cy="50" r="15" fill="none" stroke={STATE_COLORS[state]} strokeWidth="0.5" opacity="0.4" />
                <circle cx="50" cy="50" r="8" fill={STATE_COLORS[state]} opacity="0.5" />
              </>
            )}

            {isEmergency && (
              <>
                <line x1="30" y1="30" x2="70" y2="70" stroke="#ff3333" strokeWidth="3" opacity="0.9" />
                <line x1="70" y1="30" x2="30" y2="70" stroke="#ff3333" strokeWidth="3" opacity="0.9" />
                <circle cx="50" cy="50" r="20" fill="none" stroke="#ff3333" strokeWidth="2" opacity="0.7" />
              </>
            )}
          </svg>
        </div>

        {/* Waveform — listening and speaking */}
        {(isListening || isSpeaking) && (
          <div className="orb-waveform">
            {Array.from({ length: 7 }, (_, i) => (
              <span
                key={i}
                className="orb-wave-bar"
                style={{ animationDelay: `${i * 0.07}s` }}
              />
            ))}
          </div>
        )}

        {/* Approval pulse indicator */}
        {isWaitingApproval && <div className="orb-approval-pulse" />}

        {/* Emergency stop X */}
        {isEmergency && <div className="orb-emergency-indicator" />}
      </div>

      {/* State label */}
      <div className="orb-label" style={{ color: STATE_COLORS[state] }}>
        <span className="orb-label-dot" />
        {STATE_LABELS[state]}
      </div>
    </div>
  );
};

export default LisaOrb;

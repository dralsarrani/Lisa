import React from "react";
import type { OrbState, LisaModeId } from "../../core/types";
import { resolvePalette } from "./orbPalettes";
import OrbSvg from "./OrbSvg";
import "./LisaOrb.css";

interface LisaOrbProps {
  state: OrbState;
  size?: "small" | "medium" | "large";
  mode?: LisaModeId;
  onClick?: () => void;
}

const STATE_LABELS: Record<OrbState, string> = {
  idle:              "IDLE",
  listening:         "LISTENING",
  thinking:          "THINKING",
  speaking:          "SPEAKING",
  acting:            "ACTING",
  waiting_approval:  "AWAITING APPROVAL",
  paused:            "PAUSED",
  error:             "ERROR",
  emergency_stopped: "EMERGENCY STOPPED",
};

export const LisaOrb: React.FC<LisaOrbProps> = ({
  state,
  size = "medium",
  mode = "normal",
  onClick,
}) => {
  const palette = resolvePalette(state, mode);

  const cssVars = {
    "--a":     palette.a,
    "--b":     palette.b,
    "--c":     palette.c,
    "--speed": palette.speed,
    "--pulse": palette.pulse,
  } as React.CSSProperties;

  return (
    <div
      className={`orb-container orb-size-${size} orb-state-${state}`}
      style={cssVars}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-label={`Lisa — ${STATE_LABELS[state]}`}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      {/* Floating orb frame: aura (::before), hud-ring, shadow, SVG */}
      <div className="orb-frame">
        <div className="hud-ring" />
        <div className="orb-shadow" />
        <OrbSvg />
      </div>

      {/* State label below frame */}
      <div className="orb-label">
        <span className="orb-label-dot" />
        {STATE_LABELS[state]}
      </div>
    </div>
  );
};

export default LisaOrb;

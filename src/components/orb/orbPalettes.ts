import type { OrbState, LisaModeId } from "../../core/types";

export interface OrbPalette {
  a: string;      // primary glow color
  b: string;      // highlight / label color
  c: string;      // deep accent color
  speed: number;  // animation speed (calc divides: higher = faster)
  pulse: number;  // pulse speed multiplier
}

// Exact values from the approved prototype's STATES JS object
const STATE_PALETTES: Record<OrbState, OrbPalette> = {
  idle:              { a: "#52fff4", b: "#d9fffb", c: "#0b7d82",  speed: 1,    pulse: 1    },
  listening:         { a: "#37fff8", b: "#ffffff", c: "#0bb7bc",  speed: 1.55, pulse: 1.7  },
  thinking:          { a: "#78d8ff", b: "#f0fdff", c: "#684cff",  speed: 1.85, pulse: 1.25 },
  speaking:          { a: "#34ffd0", b: "#effff8", c: "#008cff",  speed: 1.7,  pulse: 2.1  },
  acting:            { a: "#55bfff", b: "#ffffff", c: "#0055ff",  speed: 2.05, pulse: 1.55 },
  waiting_approval:  { a: "#ffbd46", b: "#fff2b0", c: "#ff6b12",  speed: 1.15, pulse: 1.4  },
  paused:            { a: "#7aa9bf", b: "#c7f0ff", c: "#27495a",  speed: 0.35, pulse: 0.45 },
  error:             { a: "#ff5c37", b: "#ffd3c4", c: "#ff1808",  speed: 1.1,  pulse: 1.65 },
  emergency_stopped: { a: "#ff2632", b: "#ffd2d5", c: "#6d0006",  speed: 0.2,  pulse: 0.25 },
};

// Mode palettes only apply when OrbState === "idle"
// focus/cyber/design/gaming are exact prototype values; others are reasonable extensions
const MODE_IDLE_PALETTES: Record<LisaModeId, OrbPalette> = {
  normal:       { a: "#52fff4", b: "#d9fffb", c: "#0b7d82",  speed: 1,    pulse: 1    },
  focus:        { a: "#4ebcff", b: "#c7efff", c: "#123d91",  speed: 0.75, pulse: 0.7  },
  study:        { a: "#22d3ee", b: "#e0f9ff", c: "#0891b2",  speed: 0.85, pulse: 0.85 },
  work:         { a: "#60a5fa", b: "#dbeafe", c: "#2563eb",  speed: 1.0,  pulse: 1.0  },
  meeting:      { a: "#c084fc", b: "#f3e8ff", c: "#9333ea",  speed: 1.05, pulse: 1.0  },
  privacy:      { a: "#64748b", b: "#cbd5e1", c: "#1e3a5f",  speed: 0.6,  pulse: 0.6  },
  lockdown:     { a: "#ef4444", b: "#fecaca", c: "#7f1d1d",  speed: 0.5,  pulse: 0.7  },
  sleep:        { a: "#1e3a5f", b: "#93c5fd", c: "#0c1a2e",  speed: 0.25, pulse: 0.3  },
  presentation: { a: "#fbbf24", b: "#fef9c3", c: "#d97706",  speed: 1.1,  pulse: 1.2  },
  cyber:        { a: "#35ff91", b: "#d8ffe8", c: "#006d38",  speed: 1.65, pulse: 1.2  },
  design:       { a: "#d66bff", b: "#ffe6ff", c: "#5d20c9",  speed: 1.35, pulse: 1.2  },
  gaming:       { a: "#427dff", b: "#d7e7ff", c: "#071e83",  speed: 1.1,  pulse: 0.9  },
  coding:       { a: "#34d399", b: "#d1fae5", c: "#059669",  speed: 1.1,  pulse: 1.0  },
  tutor:        { a: "#fb923c", b: "#ffedd5", c: "#c2410c",  speed: 1.0,  pulse: 1.0  },
  companion:    { a: "#fb7185", b: "#ffe4e6", c: "#e11d48",  speed: 0.95, pulse: 1.1  },
};

export function resolvePalette(state: OrbState, mode: LisaModeId): OrbPalette {
  if (state === "idle") return MODE_IDLE_PALETTES[mode];
  return STATE_PALETTES[state];
}

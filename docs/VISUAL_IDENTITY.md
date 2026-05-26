# Lisa — Visual Identity

**Phase 0 Polish · 2026-05-25**

---

## Identity Direction

Lisa is a living AI presence, not a dashboard. Every visual decision reinforces that something intelligent and alive is running on the machine.

Core adjectives: **cinematic · deep · precise · alive**

Not: flat, generic, admin-panel, chatbot, glowing-circle-on-black.

---

## Design Tokens

### Background layers
| Token | Value | Role |
|---|---|---|
| `--bg-base` | `#030610` | Deepest background |
| `--bg-surface` | `#070c18` | Header / tab bar |
| `--bg-panel` | `#09111e` | Panel body |
| `--bg-elevated` | `#0c1524` | Cards, fields |
| `--glass-bg` | `rgba(7,12,24,0.82)` | Glass panel background |
| `--glass-border` | `rgba(40,120,220,0.14)` | Glass panel border |

### Text
| Token | Value | Role |
|---|---|---|
| `--text-primary` | `#ecf3ff` | Body text, values |
| `--text-secondary` | `#8ab8d8` | Labels, descriptions |
| `--text-muted` | `#4a6a8a` | Metadata, timestamps |
| `--text-dim` | `#243a52` | Decorative / disabled |

### Orb state colors
| State | Color | Feel |
|---|---|---|
| idle | `#1a9fff` | Calm blue |
| listening | `#00e5ff` | Bright cyan, active |
| thinking | `#a78bfa` | Purple, deliberate |
| speaking | `#34d399` | Green, output |
| acting | `#60a5fa` | Blue, executing |
| waiting_approval | `#f59e0b` | Amber, paused for human |
| paused | `#3d5a7a` | Cool dim blue |
| error | `#f87171` | Orange-red, contained |
| emergency_stopped | `#ef4444` | Red, safe shutdown |

---

## Orb Architecture

Six independent CSS layers, each with a distinct visual role:

```
orb-bloom         Far ambient light field — filter:blur(32px), 2.4× diameter
orb-aura          Close glow — filter:blur(10px), 1.16× diameter
orb-ring-outer    SVG HUD ring with tick marks; spins when acting/thinking
orb-ring-mid      SVG dashed arc; counter-spins when thinking
orb-core          The sphere:
  ::before          Star-dust texture (6 radial-gradient dots)
  orb-plasma        Rotating conic-gradient, mix-blend-mode:overlay
  orb-plasma-2      Counter-rotating, mix-blend-mode:screen (depth layer)
  orb-core-shine    Specular highlight top-left
  orb-energy        Inner radial pulse
  orb-neural        SVG network lines + radial gradient fill
  orb-waveform      Listening/speaking bars (conditional)
  orb-approval-pulse  Expanding ring (conditional)
  orb-lock-icon     Stop square for emergency (no X — clean shutdown symbol)
orb-label         State text with glowing dot indicator
```

### Plasma technique

Two `conic-gradient` divs rotate continuously via CSS `animation: rotate`. A `filter:blur` on each softens hard edges into diffused energy. `mix-blend-mode:overlay` and `mix-blend-mode:screen` on the two layers create color interaction against the core. Each state defines its own palette via per-state class selectors on `.orb-plasma`.

Zero JavaScript involved — entirely CSS keyframes and transforms.

---

## Panel Glass Effect

All `.panel` elements use:
```css
background: var(--glass-bg);
border: 1px solid var(--glass-border);
backdrop-filter: blur(8px);
```

Header and command input also use `backdrop-filter`, giving the UI physical depth against the gradient background.

---

## Background Depth

The app root has two soft radial glows in its `background` property (no DOM elements):
- Left-center: deep blue, 55% × 45% ellipse
- Right-center: darker blue, 40% × 35% ellipse

The orb panel has a micro-glow behind the sphere simulating the orb illuminating its container.

---

## Emergency State

Emergency stopped is **calm and contained**, not chaotic:

- Plasma: frozen (animation: none)
- Rings: dim (14% opacity), not spinning
- Lock icon: small red stop square — no X, no flashing
- Bloom: subdued, static
- Overlay text: flows below orb in normal document flow (no absolute overlap)
- Message: "EMERGENCY STOP · All operations halted · System safe"

---

## Phase 0.5 — Canvas 2D Procedural Orb

**Why Canvas over CSS-only:**
The CSS plasma approach (conic-gradient + blur + mix-blend-mode) produced visible gradient artifacts and looked flat in screenshots — no genuine depth, no real particle presence. A Canvas 2D procedural sphere gives actual 3D geometry: particles distributed on a sphere surface via Fibonacci sampling, rotated each frame with Y/X rotation, sorted by Z depth (painter's algorithm), then projected onto the 2D plane with depth-scaled alpha and size. The result reads as a living volumetric sphere rather than a glowing CSS circle.

**Architecture:**
- `CanvasOrb.tsx` — owns the `<canvas>` element, runs `requestAnimationFrame` loop, draws all visual layers (aura → back particles → core gradient → front particles → state effects → rim glow)
- `LisaOrb.tsx` — public component; wraps `CanvasOrb` plus the SVG HUD rings and state label
- `LisaOrb.css` — layout only (container, canvas-wrap, rings, label, keyframes); no visual sphere CSS

**Particle counts:** small 180 · medium 340 · large 560 (Fibonacci sphere distribution)

**Canvas draw order per frame:**
1. Clear
2. Outer aura (radial gradient, pulsing)
3. Back particles (z < 0, sorted)
4. Core gradient (deep base + inner bright layer + specular highlight)
5. Front particles (z ≥ 0, sorted)
6. State effects (waveform dots / approval ring / thinking orbiters / acting arc)
7. Rim glow
8. Emergency stop-square (if emergency_stopped)

**Reduced motion:** If `prefers-reduced-motion` is active, one static frame is drawn and the RAF loop is skipped entirely.

**Future WebGL/shader option:** The Canvas 2D approach is a proof of concept. Phase 1+ can replace `CanvasOrb.tsx` with a Three.js or raw WebGL implementation using the same props interface — `LisaOrb.tsx` and all callers remain unchanged.

---

## What Remains Temporary (Phase 0)

- Plasma is CSS `conic-gradient` + blur rotation — effective but not physical
- No `prefers-reduced-motion` support yet
- Single `darker` theme only — no theme switching
- Orb sizes change only the `--orb-diameter` CSS variable

---

## Future Visual Goals (Phase 1+)

- `prefers-reduced-motion` for all orb animations
- Per-mode ambient background color shifts
- Orb ripple on command submit (micro-interaction)
- Voice waveform from real audio amplitude data
- Optional canvas particle field for orb core (GPU-gated)
- Light theme variant

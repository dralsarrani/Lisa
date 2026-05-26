\---

name: lisa-living-orb

description: Use this skill when designing, implementing, reviewing, or fixing Lisa's Orb visual system. Applies to Canvas 2D, CSS animation, plasma/particle sphere effects, floating AI-core visuals, HUD rings, OrbState behavior, and premium JARVIS-like living AI presence. Use especially when the user says the Orb looks static, flat, dashboard-like, photo-like, not alive, not floating, or not premium.

\---



\# Lisa Living Orb Skill



\## Purpose



This skill helps implement Lisa's Orb as a living AI core, not a flat CSS dashboard widget.



Lisa's Orb is her visible body. It must feel alive, floating, breathing, intelligent, premium, and responsive to state.



The Orb should not look like:

\- a static particle screenshot;

\- a flat CSS circle;

\- a simple gradient ball;

\- a dashboard widget;

\- a generic sci-fi ring;

\- a cropped/cut-off image;

\- a developer demo.



The Orb should feel like:

\- a living local AI core;

\- a plasma/energy sphere;

\- a floating presence in space;

\- a softly breathing companion;

\- a premium HUD-integrated object;

\- cinematic, subtle, and technically polished.



\## Priority



When this skill conflicts with generic frontend rules, Lisa's Orb identity wins.



Do not redesign the whole app unless explicitly asked. Focus on Orb files first.



\## Technical Target



Prefer this architecture:



src/components/orb/

&#x20; LisaOrb.tsx

&#x20; CanvasOrb.tsx

&#x20; LisaOrb.css



LisaOrb.tsx:

\- Public wrapper component.

\- Preserves existing props: state, size, onClick.

\- Renders CanvasOrb plus labels/HUD.

\- Does not own heavy animation logic.



CanvasOrb.tsx:

\- Owns the canvas.

\- Uses requestAnimationFrame.

\- Handles devicePixelRatio.

\- Generates particles once.

\- Animates particles every frame.

\- Cleans up on unmount.

\- Supports reduced motion.

\- Maps OrbState to palette and animation behavior.



LisaOrb.css:

\- Handles shell layout, floating/breathing animation, HUD rings, labels, state-specific CSS variables.

\- No visible square or rectangular artifacts.



\## Visual Model



The Orb should be drawn as a layered visual system:



1\. Outer aura / bloom

2\. Deep sphere body

3\. Back particles

4\. Internal plasma/energy motion

5\. Bright core glow

6\. Front particles

7\. Energy arcs or ripples

8\. Rim light

9\. HUD rings

10\. State label

11\. Emergency lock/stop indicator when needed



\## Canvas Particle Sphere Method



Use a 3D-like point cloud projected into 2D.



Particle generation:

\- Generate particles once with stable random distribution.

\- Use spherical coordinates or normalized random vectors.

\- Store x, y, z, radius, speed, phase, colorWeight.

\- Do not regenerate particles every frame.



Frame update:

\- Rotate around Y and X using time.

\- Add subtle wave/noise offset.

\- Project using perspective:

&#x20; scale = focalLength / (focalLength - z)

&#x20; screenX = centerX + x \* scale

&#x20; screenY = centerY + y \* scale

\- Use depth for alpha and size.

\- Draw back particles first, then core, then front particles.



The Orb must visibly animate in idle:

\- slow rotation;

\- breathing scale/pulse;

\- subtle internal swirl;

\- core flicker;

\- aura pulse.



\## Animation Requirements



Idle must not look static.



Required motion:

\- container floating/breathing motion;

\- internal particle rotation;

\- core pulse;

\- aura pulse;

\- HUD ring slow rotation;

\- state-specific animation speed/intensity.



Use time-based animation:

\- Math.sin(time \* frequency)

\- Math.cos(time \* frequency)

\- requestAnimationFrame timestamp



Avoid:

\- random jitter every frame;

\- heavy particle counts;

\- React state updates every frame;

\- CSS-only fake motion;

\- animations that only move the outer ring while the Orb body stays static.



\## State Palettes



Map OrbState to both color and behavior:



idle:

\- cyan/blue;

\- slow breathing;

\- slow rotation;

\- calm core.



listening:

\- bright cyan;

\- stronger pulse;

\- ripple/wave behavior.



thinking:

\- violet/blue;

\- faster swirl;

\- more internal motion.



speaking:

\- cyan/green;

\- rhythmic waveform-like pulse.



acting:

\- blue/white;

\- active outer ring;

\- stronger forward movement.



waiting\_approval:

\- premium amber/gold;

\- calm approval pulse;

\- not flat orange;

\- not a square overlay.



paused:

\- muted blue;

\- very slow motion.



error:

\- orange/red;

\- controlled warning pulse.



emergency\_stopped:

\- deep red;

\- minimal motion;

\- locked/safe state;

\- no panic flashing.



\## Hard Visual Rules



Never allow:

\- visible square/rectangle behind or inside Orb;

\- cropped HUD ring;

\- label overlap;

\- flat black ball with a dot;

\- static particle photo look;

\- cheap red X emergency icon;

\- unreadable state text;

\- generic dashboard styling.



The Orb must look good in a still screenshot and also visibly animate while running.



\## Performance Rules



\- Use Canvas 2D first.

\- Do not add Three.js/WebGL unless explicitly approved.

\- Use devicePixelRatio for sharpness.

\- Cap particles by size:

&#x20; - small: 160–220

&#x20; - medium: 260–420

&#x20; - large: 420–700

\- Avoid memory leaks.

\- Cancel requestAnimationFrame on unmount.

\- Avoid expensive shadows on every particle if performance is poor.

\- Use reduced motion mode.



\## Reduced Motion



Respect:



@media (prefers-reduced-motion: reduce)



If reduced motion is enabled:

\- keep high-quality static Orb;

\- disable or heavily slow requestAnimationFrame;

\- no aggressive pulsing/flashing.



\## Emergency State



Emergency state must communicate:



"All operations halted · System safe"



It should be:

\- clear;

\- calm;

\- safe;

\- locked;

\- premium;

\- non-overlapping.



Do not use an ugly giant X.



Use a stop-square, lock mark, or contained emergency glyph.



\## Waiting Approval State



Waiting approval should feel like Lisa is calmly waiting for the operator.



It should be:

\- amber/gold;

\- warm;

\- premium;

\- subtle pulsing;

\- not warning-red;

\- not a flat orange overlay.



\## Validation



After Orb changes, always run:



npm run typecheck

npm run lint

npm test

npm run build



Then:



cd src-tauri

cargo check



Then launch:



npm run tauri dev



Manual visual checklist:

\- Orb visibly floats in idle.

\- Orb has internal motion.

\- Orb feels alive, not static.

\- HUD ring is centered and not cropped.

\- No square artifact.

\- Waiting approval is premium amber/gold.

\- Emergency state is readable and safe.

\- Size selector still works.

\- Mode changes still affect Orb.

\- Tests still pass.



\## Reporting



Final report must include:

\- files changed;

\- animation architecture;

\- OrbState palette/behavior mapping;

\- validation results;

\- known visual limitations;

\- whether the Orb is ready for screenshot review.



Do not push or tag unless the user approves.


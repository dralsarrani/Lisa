import React from "react";

// Exact port of design-prototypes/approved-lisa-orb-prototype.html SVG.
// All class names, paths, animate values, gradients, and filters preserved verbatim.
// Colors come from --a / --b / --c CSS custom properties set on the parent container.
export const OrbSvg: React.FC = () => (
  <svg
    className="orb-svg"
    viewBox="0 0 600 600"
    role="img"
    aria-label="Lisa animated energy orb"
    style={{ overflow: "visible", width: "100%", height: "100%" }}
  >
    <defs>
      <radialGradient id="bodyGradient" cx="38%" cy="28%" r="74%">
        <stop offset="0%"   stopColor="#ffffff"  stopOpacity={0.16} />
        <stop offset="18%"  stopColor="var(--b)" stopOpacity={0.11} />
        <stop offset="38%"  stopColor="var(--a)" stopOpacity={0.075} />
        <stop offset="68%"  stopColor="var(--c)" stopOpacity={0.16} />
        <stop offset="100%" stopColor="#000706"  stopOpacity={0.68} />
      </radialGradient>

      <radialGradient id="coreGradient" cx="48%" cy="50%" r="55%">
        <stop offset="0%"   stopColor="#ffffff"  stopOpacity={0.72} />
        <stop offset="22%"  stopColor="var(--b)" stopOpacity={0.52} />
        <stop offset="68%"  stopColor="var(--a)" stopOpacity={0.12} />
        <stop offset="100%" stopColor="var(--a)" stopOpacity={0}    />
      </radialGradient>

      <radialGradient id="highlightGradient" cx="32%" cy="20%" r="48%">
        <stop offset="0%"   stopColor="#ffffff"  stopOpacity={0.18}  />
        <stop offset="32%"  stopColor="var(--b)" stopOpacity={0.055} />
        <stop offset="100%" stopColor="var(--b)" stopOpacity={0}     />
      </radialGradient>

      <linearGradient id="ribbonGradient" x1="120" y1="120" x2="480" y2="480" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stopColor="var(--c)" stopOpacity={0.15} />
        <stop offset="44%"  stopColor="var(--a)" stopOpacity={0.56} />
        <stop offset="72%"  stopColor="var(--b)" stopOpacity={0.22} />
        <stop offset="100%" stopColor="var(--c)" stopOpacity={0.10} />
      </linearGradient>

      <linearGradient id="edgeGradient" x1="120" y1="420" x2="500" y2="140" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stopColor="var(--a)" stopOpacity={0.12} />
        <stop offset="48%"  stopColor="var(--b)" stopOpacity={0.92} />
        <stop offset="100%" stopColor="var(--a)" stopOpacity={0.20} />
      </linearGradient>

      <linearGradient id="rimGradient" x1="120" y1="120" x2="480" y2="480" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stopColor="var(--b)" stopOpacity={0.72} />
        <stop offset="42%"  stopColor="var(--a)" stopOpacity={0.34} />
        <stop offset="70%"  stopColor="var(--c)" stopOpacity={0.20} />
        <stop offset="100%" stopColor="var(--b)" stopOpacity={0.48} />
      </linearGradient>

      <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id="strongGlow" x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feColorMatrix in="blur" type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1.8 0" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      <filter id="ribbonBlur" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="7" />
      </filter>

      <clipPath id="sphereClip">
        <circle cx="300" cy="300" r="176" />
      </clipPath>
    </defs>

    {/* Shell */}
    <circle className="shell" cx="300" cy="300" r="176" />
    <ellipse cx="247" cy="220" rx="66" ry="34" fill="#fff" opacity={0.045}
      transform="rotate(-22 247 220)" />

    <g clipPath="url(#sphereClip)">
      {/* Ribbon set A */}
      <g className="ribbon-set-a">
        <path className="ribbon-wide"
          d="M128 304 C182 118 324 154 390 250 C478 378 394 456 264 412 C152 374 144 290 238 230 C334 169 445 210 470 310" />
        <path className="ribbon-edge"
          d="M128 304 C182 118 324 154 390 250 C478 378 394 456 264 412 C152 374 144 290 238 230 C334 169 445 210 470 310" />
      </g>

      {/* Ribbon set B */}
      <g className="ribbon-set-b">
        <path className="ribbon-wide alt"
          d="M176 420 C112 278 204 170 330 194 C466 220 500 342 394 410 C312 464 204 420 202 302 C200 210 284 132 392 174" />
        <path className="ribbon-edge alt"
          d="M176 420 C112 278 204 170 330 194 C466 220 500 342 394 410 C312 464 204 420 202 302 C200 210 284 132 392 174" />
      </g>

      {/* Ribbon set C */}
      <g className="ribbon-set-c">
        <path className="ribbon-wide"
          d="M122 252 C226 316 210 430 324 444 C456 458 484 306 410 224 C326 130 198 148 164 262 C136 356 232 388 318 324" />
        <path className="ribbon-edge"
          d="M122 252 C226 316 210 430 324 444 C456 458 484 306 410 224 C326 130 198 148 164 262 C136 356 232 388 318 324" />
      </g>

      {/* Inner flow group A */}
      <g className="inner-flow-a">
        <path className="flow-line thick"
          d="M134 316 C190 202 292 228 344 280 C410 346 474 284 462 210">
          <animate attributeName="d" dur="2.9s" repeatCount="indefinite"
            calcMode="spline" keyTimes="0;0.5;1"
            keySplines=".45 0 .55 1;.45 0 .55 1"
            values="M134 316 C190 202 292 228 344 280 C410 346 474 284 462 210;M118 292 C210 176 308 252 368 310 C440 380 492 262 430 182;M134 316 C190 202 292 228 344 280 C410 346 474 284 462 210" />
        </path>
        <path className="flow-line"
          d="M142 326 C216 244 278 242 346 302 C406 356 452 330 492 262">
          <animate attributeName="d" dur="2.2s" repeatCount="indefinite"
            calcMode="spline" keyTimes="0;0.5;1"
            keySplines=".42 0 .58 1;.42 0 .58 1"
            values="M142 326 C216 244 278 242 346 302 C406 356 452 330 492 262;M126 342 C212 204 308 272 362 246 C432 212 458 356 506 300;M142 326 C216 244 278 242 346 302 C406 356 452 330 492 262" />
        </path>
        <path className="flow-line alt"
          d="M160 250 C224 332 308 346 384 286 C430 250 458 252 488 286">
          <animate attributeName="d" dur="2.5s" repeatCount="indefinite"
            calcMode="spline" keyTimes="0;0.5;1"
            keySplines=".42 0 .58 1;.42 0 .58 1"
            values="M160 250 C224 332 308 346 384 286 C430 250 458 252 488 286;M144 224 C244 300 290 384 366 330 C448 270 444 210 502 248;M160 250 C224 332 308 346 384 286 C430 250 458 252 488 286" />
        </path>
      </g>

      {/* Inner flow group B */}
      <g className="inner-flow-b">
        <path className="flow-line thick alt"
          d="M205 438 C188 336 236 278 326 242 C422 204 432 144 392 102">
          <animate attributeName="d" dur="3.1s" repeatCount="indefinite"
            calcMode="spline" keyTimes="0;0.5;1"
            keySplines=".45 0 .55 1;.45 0 .55 1"
            values="M205 438 C188 336 236 278 326 242 C422 204 432 144 392 102;M176 420 C238 338 196 246 304 216 C440 178 390 126 430 96;M205 438 C188 336 236 278 326 242 C422 204 432 144 392 102" />
        </path>
        <path className="flow-line"
          d="M196 420 C240 350 322 342 376 270 C420 212 382 166 326 142">
          <animate attributeName="d" dur="2.35s" repeatCount="indefinite"
            calcMode="spline" keyTimes="0;0.5;1"
            keySplines=".42 0 .58 1;.42 0 .58 1"
            values="M196 420 C240 350 322 342 376 270 C420 212 382 166 326 142;M218 440 C208 332 348 380 404 292 C454 212 334 184 300 122;M196 420 C240 350 322 342 376 270 C420 212 382 166 326 142" />
        </path>
        <path className="flow-line alt"
          d="M130 290 C220 284 258 206 340 194 C426 182 482 240 476 326">
          <animate attributeName="d" dur="2.7s" repeatCount="indefinite"
            calcMode="spline" keyTimes="0;0.5;1"
            keySplines=".42 0 .58 1;.42 0 .58 1"
            values="M130 290 C220 284 258 206 340 194 C426 182 482 240 476 326;M124 252 C198 334 278 172 360 218 C446 268 480 204 492 304;M130 290 C220 284 258 206 340 194 C426 182 482 240 476 326" />
        </path>
      </g>

      <circle className="core-star" cx="300" cy="300" r="78" />
      <circle className="node" cx="178" cy="318" r="6"   style={{ animationDelay: "-0.4s" }} />
      <circle className="node" cx="410" cy="238" r="4.5" style={{ animationDelay: "-1.1s" }} />
      <circle className="node" cx="376" cy="398" r="5.5" style={{ animationDelay: "-1.7s" }} />
    </g>

    {/* Rim circles — outside clip */}
    <circle className="rim-primary"   cx="300" cy="300" r="177" />
    <circle className="rim-secondary" cx="300" cy="300" r="185" />

    {/* Highlight overlay */}
    <circle className="highlight" cx="300" cy="300" r="176" />
  </svg>
);

export default OrbSvg;

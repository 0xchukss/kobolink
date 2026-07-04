# 3D Landing Page Status

## Scope

- Map scope: Nigeria country view with ADM1 state units.
- GeoJSON source: geoBoundaries Open `NGA/ADM1` and `NGA/ADM0`.
- Feature count: 37 state-level units.
- Runtime: Next.js App Router client island, Three.js WebGL canvas.
- Theme color: `#e8ff4f` lime over a dark settlement-map surface.

## Effects Implemented

- Real extruded state geometry from GeoJSON.
- Dark top surface and lime side/outline treatment.
- Hover lift with raycasting and state readout.
- Orbit camera controls with damping.
- Abuja source marker with ripple.
- Creator-market markers for Lagos, Kano, Port Harcourt, and Enugu.
- Dashed fly lines from Abuja to creator markets.
- Short animated outer-contour chase-light line segment.
- Lottie word transition for `LIST`, `FUND`, `DECIDE`, `SETTLE`.
- GSAP-scoped hero, metric, story, and strip animations with reduced-motion fallback.

## Verification

- `npm run ui:build`: passing.
- `npm test`: 28 passing.
- Browser URL used: `http://localhost:3000`.
- `http://127.0.0.1:3000` is not valid for this Next 16 dev verification because dev-origin protection blocks some resources.
- Browser checks on `localhost`:
  - no Next.js error overlay
  - Lottie SVG loaded
  - Nigeria ADM0 and ADM1 GeoJSON requested
  - Three.js canvas size: 600 x 488 drawing buffer
  - WebGL pixel sum: 380764, confirming nonblank rendering
  - map readout: `37 state unitsAbuja`

## three-scope-map Checker Note

`check_three_map_project.py --strict` is hard-coded for the bundled Vue/Vite template and scans `src/` for Vue map files. KoboLink is a Next.js App Router project, so the checker reports false blockers for missing `vue`, `vite`, and `src/components/map/*ThreeMap.vue` even though the actual Next.js WebGL map renders in-browser.

The same checker passed its relevant negative checks:

- Three dependency present.
- `.map-host` is not fixed to 1920 x 1080.
- No SVG fallback map detected.
- No full-map transparent texture plane detected.
- No chase-light ribbon mesh detected.

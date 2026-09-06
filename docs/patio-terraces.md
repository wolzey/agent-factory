# Patio terraces

The patio has an upper terrace level with the factory doorway, seven lit steps down to a garden deck, an open pergola, five potted trees, planted borders and a small fire-table lounge. The six existing outdoor station IDs and their X/Z coordinates are retained.

## Where to edit

- Open the patio directly with `?room=patio`. Weather and time controls remain opt-in development parameters.
- `client/prototypes/factory25dPatioTerraces.ts`: deck, stair and furniture geometry, lighting and lounge.
- `client/prototypes/factory25dPatioGarden.ts`: green Japanese maples, dwarf mountain pines, and trailing pothos. Folded maple leaves and pine needle sprays keep the trees distinct; the planter foliage uses the indoor hanging plant's beveled heart-shaped leaves and veins, with snow resting on individual foliage surfaces.
- `client/prototypes/factory25dPothosFoliage.ts`: the canonical indoor/outdoor pothos leaf geometry, green palette, vein placement, curved tube vines, leaf poses and subtle sway. The indoor hanging basket keeps its original arrangement; outdoor vine lengths and spacing fit the existing planters.
- [Plant modeling standard](plant-modeling-standard.md): shared shape, material, scale, animation and rendering guidance for procedural plants and Blender models. `factory25dHouseplantFoliage.ts` applies it to the indoor trailing plants, fern, palm, broad leaves and bonsai.
- `shared/factory25d-patio.ts`: elevations and physical footprints. Keep these aligned with geometry edits.
- `client/prototypes/factory25dSideRoom.ts`: doorway, navigation, wood texture, weather and the existing string lights.
- `client/prototypes/factory25dPatioStations.ts`: the six working outdoor desks.
- `client/prototypes/factory25dPatioWater.ts`: weather-driven wet wood, shallow puddles, planar reflections and rain ripples.
- `client/prototypes/factory25dPatioSplashes.ts`: pooled tiny impact crowns and airborne droplets, synchronized to the water ripples and placed on actual terrace/stair heights.

## Integration

Automatic routes and manual movement use the shared retaining-wall and stair footprints, with 0.30 metres of clearance around the walls. Followers respect the same obstacles instead of spreading through the stair sides. Sprite feet, child agents, contact shadows, drag picking, memorials, weather particles and outdoor vortex effects use the terrace height. Server restoration rebuilds saved movement paths against the current layout and moves a blocked old pose to nearby open floor, retaining identity, station reservations and chat.

Deploy the client and server together: the server supplies the authoritative walking paths. Local previews normally read the live factory's public feed, which may have an older floor plan during development. Use `factoryServer=local` with the local backend to test both together. Browser validation uses synthetic sessions intercepted only inside a temporary local test browser, never production data writes.

## Rain on the deck

The wood darkens and gains a clear wet sheen with the shared weather wetness, including the post-rain state. Irregular shallow puddles reflect the actual patio at each terrace height, with short broken highlights following the boards. Tiny impact crowns and airborne droplets appear at the centers of compact expanding rings. Splashes avoid furniture, planters and the lounge rug, and use the actual stepped floor height. Reduced motion hides the impact particles and keeps the water still. Snow fades out the liquid reflections. Opaque rugs, furniture and steps remain above the water surface.

A ChatGPT image generation paintover of the running patio guided the shorter wet highlights, sharper puddle edges, visible stems and distinct tree species. The generated concept is a local design reference, not a replacement for the interactive scene. The trailing plants subsequently adopted the existing indoor pothos recipe for visual consistency, including its gentle sway and reduced-motion behavior.

The reflection textures are 400 × 282 with no multisampling, updated at most ten times per second while the camera is still. Camera moves refresh immediately to keep reflections aligned. Both water surfaces are hidden during reflection capture to prevent recursive rendering. Dry or snow-covered surfaces skip reflection rendering, and hot reload disposes their render targets.

## Validation

- 434 tests across 64 files passed, including all workstation route pairs, every stair elevation, elevated drag picking, keyboard wall constraints, restoration of old flat-deck routes, and rendered worker/follower clearance in both directions.
- Client/server TypeScript and production build passed. The existing Vite large-bundle advisory remains.
- Headless browser checks cover daylight, night, rain, snow, six occupied outdoor desks and a 390 px viewport. This is browser emulation, not physical-phone GPU validation.
- Rain follow-up: the production build and browser shader checks passed for dry, light rain, night rain, post-rain, heavy snow, reduced motion and a 390 px viewport. The close-up camera was checked with reflective surfaces enabled.
- Planting/splash refinement: client/server build and the seven browser weather/motion/viewport checks passed. Close-ups cover ivy, maple, pine and rain impacts. Runtime checks confirmed finite instance transforms within capacity, correct stair impact heights, snow foliage visibility, no splashes when dry/snowing/reduced-motion, retained post-rain reflections, and disposal of both reflection targets.
- Shared pothos follow-up: production build and browser close-ups passed. A before/after comparison confirmed all 120 indoor meshes retain their geometry, normals, transforms, material colors and shadow settings at rest, while swaying, and with reduced motion.
- Houseplant standard pass: rebuilt the remaining shelf/floor trailers, ferns, palm, rubber plants, calathea, broad-leaf plant and bonsai. Build and the two existing plant-care tests passed. Runtime inspection confirmed valid geometry and instance counts, floor clearance and restoration of resting poses for all seven updated families; the five unchanged plant families retained their prior geometry, material colors and poses.
- Final houseplant browser checks passed in daylight, rainy night, reduced motion and a 390 px viewport, with no browser errors or horizontal overflow. Inspection close-ups cover the shelf, window plants, palm and bonsai.
- Stair release check: the running scene places a worker and three followers on all seven treads in both directions, with matching shadow heights and no browser errors. The front-counter tablet also passes desktop/mobile zoom, Escape, interrupted return, focus restoration and reduced-motion checks.

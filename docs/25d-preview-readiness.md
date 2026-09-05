# 2.5D factory preview readiness

This branch adds an optional `/prototype-25d-slice.html` entry. It is ready for
preview review, not a replacement for the live factory at `/`.

## Upstream and deployment

Prepared on 2026-09-05 from upstream `main` at
`c05e2af3c80d45c96faea954e2be76fc2ea22847`. This includes the two commits missing
from the original prototype checkout: atomic CLI executable replacement and
validated manual CLI publishing.

The live service's health endpoint is healthy but does not expose a deployed
commit. Its exact deployed revision is therefore unverified. `render.yaml`
deploys `wolzey/agent-factory` main; pushing this preview branch to the fork does
not deploy or replace that service.

The original dirty checkout and its unrelated production scene/server changes
were preserved. Those unfinished changes are not included here.

## What works in the preview

- Shared camera easing for the window, whiteboard, and lounge chat; pixel controls
  with Geist Pixel; a smaller clear backboard and handwritten scores.
- Interior and patio scenery, outdoor station props, weather transitions, snow
  accumulation, landscape/cloud rendering, and local interactive activities.
- The whiteboard and lounge conversation read the existing factory snapshot and
  revisioned WebSocket stream. Chat reuses the production message renderer and
  preserves conversation history across reconnects. Localhost is read-only;
  same-origin chat sending uses the existing authenticated browser session.
- Opt-in natural recordings: garden rain, drops on glass, wind in trees,
  occasional fair-weather birds, and crickets on clear nights. The camera and
  weather drive the mix; reading quietly lowers it. Muting covers game effects.
- A net swish on made baskets and softer ball impacts. Ambience clips overlap
  with 1.5-second fades; transient clips have softened edges. Nine MP3 assets
  total 2,172,099 bytes and are requested only after enabling sound.

Audio sources, licenses, transformations, and checksums are recorded in
[`sources.json`](../client/assets/audio/factory/sources.json). The visible sound
credits link serves [`credits.html`](../client/assets/audio/factory/credits.html),
including attribution for the CC BY 4.0 wind recording.

## Remaining work before replacing the live factory

| Area | Current preview limitation |
| --- | --- |
| Live agents | The scene renders two demo characters, not the full live agent list, customized avatars, subagents, or session lifecycle. The avatar helper is not wired into the scene. |
| Workstations | Interior and patio furniture is present. The assignment helper is not connected to the live agents or authoritative station/movement state. |
| Agent controls | Browser takeover, grab/drop leases, emotes, movement/shooting controls, and the command bar remain in the production entry. |
| Authentication | The preview links to the main factory sign-in. Same-origin authenticated sending is implemented but needs end-to-end review with a real browser session before a replacement rollout. |
| Shared activities | Basketball and duck scores are local to the browser; demo activities do not reproduce the server's synchronized world events. |
| Weather | Preview/query controls work; production weather-provider and automatic daylight synchronization are not connected. |
| Merge activity | Public agent activity is displayed. Merge totals are unavailable when the upstream snapshot does not provide them; no server schema change is included. |

The only production UI change is extracting its existing chat message renderer
for reuse and preserving bottom scroll position when a new message arrives.
The shared skyline change narrows a type to the palette it actually consumes.

## Validation

- Frozen-lockfile installation and full client/server production build pass in
  the isolated branch checkout. Vite still reports its large-chunk advisory.
- All **348 tests across 52 files** pass, including production world/auth/control
  tests and preview camera, chat recovery, arcade, terrain, and sound-mix tests.
- The exact production build serves both entry pages and the audio credits.
  Browser checks confirm the scene renders and the lounge board displays the
  existing live conversation, with localhost sending disabled.
- Browser playback reaches a running AudioContext; all nine local recordings
  return HTTP 200 after opt-in, with zero audio requests before opt-in. No browser
  warnings or errors occurred during this preview check.
- An 88-second offline render of the actual recordings exercises interior,
  window, patio, clear day, clear night, bird/swish effects, overlapping clip
  boundaries, and mute. At the default 40% level, the measured indoor/patio RMS
  levels were approximately -57/-46 dBFS, the peak stayed below 0.055, mute reached
  zero, and at most six sources were active together.
- Speaker/headphone listening and real hidden-tab suspension remain manual QA;
  the rendered-signal check does not establish subjective audio quality.

No live chat messages were sent, and no production deployment was performed.

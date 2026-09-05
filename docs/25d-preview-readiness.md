# 2.5D main factory integration

The 2.5D room is now the main client entry at `/`. The existing
`/prototype-25d-slice.html` bookmark opens the same factory. The previous Phaser
entry is no longer part of the production build.

## Upstream and deployment

Prepared on 2026-09-05 from upstream `main` at
`c05e2af3c80d45c96faea954e2be76fc2ea22847`. A fresh fetch found no additional
upstream commits. This includes atomic CLI executable replacement and validated
manual CLI publishing, the two fixes missing from the original prototype checkout.

`render.yaml` and the server default select `factory25d`. Existing persisted
worlds migrate their agent positions to this layout while retaining session IDs,
ownership, customized avatars and chat history. The running service must use
`ENVIRONMENT=factory25d` when this branch is deployed; an existing dashboard
environment override should be updated with the release.

The deployment manifest still points at `wolzey/agent-factory` main. A push to
`britonbakerfluid/agent-factory` on `codex/factory-25d-preview` does not deploy or
replace that service. No production deployment or live chat message was sent.
The health endpoint does not report the deployed commit. A production WebSocket
snapshot verified the live build as `c05e2af3c80d45c96faea954e2be76fc2ea22847`.
The live service reports the `arcade` environment and healthy durable persistence.
GitHub's recorded upstream deployment points at `agent-factory-coqw.onrender.com`,
not the target `fluid-factory.onrender.com`; confirm the existing service's actual
publishing configuration with its owner before changing either deployment.

The compatible arcade recovery build is commit `fb0a2ba` on
`codex/factory-25d-compatible-rollback` in the fork. Deploy it successfully with
`ENVIRONMENT=arcade` before switching to this release, and retain its deploy ID.
The original c05e2af build cannot parse a factory25d save. The compatible build
preserves valid reservations, moves workers beyond twelve arcade desks into
bounded waiting positions, and retains conversations and ownership. Follow the
[release handoff](25d-release-handoff.md) for the exact rollout order.

The original dirty checkout and its unrelated production scene/server changes
are preserved. They are not included in this branch.

## Connected features

- The scene renders the complete live agent roster using the existing avatar
  painter, customized appearance, subagents, activity, tool counts and lifecycle
  updates. The wall board and lounge share the same revisioned world connection.
- Eighteen authoritative workstations: twelve indoors and six on the patio.
  Stable slots alternate two indoor stations and one outdoor station. Shared
  routes pass through the doorways and around station and couch footprints.
  When all stations are occupied, additional workers wait and take a vacancy
  when it opens. Occupied stations light up in the matching room.
- The pixel agent panel reuses browser login handoffs, ownership checks, control
  leases, movement, shooting and emote commands. It includes touch movement
  buttons, agent selection, find-agent navigation, and station placement.
  Avatar dragging reuses the existing grab manager and server lease protocol.
  Blur, board focus, disconnect and takeover stop input or clear control.
- Existing browser authentication and lounge chat sending use the same origin,
  existing conversation format and server echo. History survives reconnects.
  Localhost previews read public live data without remote cookies or write
  access. `?factoryServer=local` selects a local same-origin backend for development.
- The production weather provider and solar calculation now drive automatic
  Salt Lake City weather and daylight. Manual weather/time overrides remain
  available; the rain-light preview URL retains its chosen weather. Provider
  failures keep the previous conditions and retry.
- Existing preview refinements remain: matching window/whiteboard/lounge camera
  easing, Geist Pixel controls, clear smaller backboard, handwritten score marks,
  snowy trees, outdoor scenery and opt-in natural ambience.
- Basketball uses available live idle agents, keeps scores by session ID on this
  device, and routes local game movement around the real room geometry. The
  floor keyboard responds to actual agents walking over it using shared controls.
- Lounge chat supports `/help`, `/chat`, `/emote`, `/vortex` and `/logout`, with
  command completion, history and unsent draft recovery. Help and command errors
  stay local; shared messages still appear only through the server echo. C opens
  chat from indoors or the patio; I opens the separate close-up view.
- All twelve emotes, server-targeted shots and hits, synchronized rock-paper-scissors,
  commit confetti, merge celebrations and timed vortex events render in 2.5D.
  Effects reconcile with the latest roster before playing, retain their original
  timing, and release their resources when they finish. Reduced motion removes
  large avatar movement and projectiles.
- Personalized gravestones use the server's station reservations and expiration;
  returning sessions replace their marker with a return animation. Thinking,
  permission, planning, compaction, notifications and actual tool failures appear
  beside the agent. Indoor and patio stations warm with tool use and show errors
  only for the affected station.
- The wall sign and browser title follow server configuration. A changed build
  ID refreshes same-origin clients once, preserving the chat draft. Changes to a
  remote public feed do not reload a local development preview.

## Audio

Garden rain, drops on glass, wind in trees, occasional fair-weather birds and
clear-night crickets follow weather and indoor/window/patio proximity. Reading
quietly lowers the mix. Muting also covers the quieter ball taps, bounces and
basketball net swish. Nine MP3 assets total 2,172,099 bytes and load after opt-in.

Sources, licenses, transformations and checksums are in
[`sources.json`](../client/assets/audio/factory/sources.json). The visible sound
credits link serves [`credits.html`](../client/assets/audio/factory/credits.html),
including attribution for the CC BY 4.0 wind recording.

## Scope limits

Basketball and duck scores remain local game state, not shared competitions.
Avatar appearance comes from existing installation configuration; the prototype
does not add an avatar editor. Merge totals remain unavailable when the server
snapshot does not provide them. These are visual/product differences from the
old scene, not reasons to discard the shared authentication or world protocol.

## Validation

- Full client/server production build passes. Vite still reports its existing
  large-landscape-chunk advisory.
- All **403 tests across 60 files** pass, including world migration, all 18
  assignments, overflow waiting, patio vacancies, collision and doorway routes,
  owner-only controls, authenticated grab placement, takeover, chat reconnects,
  customized-avatar/subagent deltas, and live weather recovery.
- Additional regression coverage includes command authorization/completion/history,
  immediate logout revocation and stale authentication races, deployment refresh,
  title recovery, all effect poses and cleanup, same-batch arrival/effect races,
  RPS timing, vortex reconnects, grave expiry and station feedback isolation.
- Both release and compatible recovery images build for Linux amd64 using the
  production Dockerfile and frozen lockfile. As the non-root application user,
  the release image migrated a private copy of the live world into 2.5D and saved
  it. The recovery image then opened that actual flushed database, restored the
  arcade room, and retained all agents, owners, avatars and chat. Health and
  persistence passed on both; browser QA confirmed the restored arcade room.
- The exact production client runs with an isolated local backend and database.
  Browser checks cover login handoff, selecting an owned agent, patio placement,
  quick movement taps reflected in server state, release, takeover in a second
  tab, existing lounge history and a server-echoed local QA message. No real
  installation credentials or production messages are used.
- The final feature pass checks C/I keyboard navigation, command completion and
  history, private help/errors, signed-out send rejection, and patio-to-chat
  navigation in the browser. Restarting the isolated backend with a new build ID
  refreshed the client while retaining chat history and its draft. Screenshots
  confirm guitar/dance props, permission/thinking/error/notification indicators,
  a personalized grave, patio activity feedback and a vortex surviving a reload.
  The configured `Rain & Research` title appears in the tab and wall sign.
- The 390-by-844 CSS viewport keeps the expanded controls within its width and
  height without horizontal overflow. Desktop screenshots show actual indoor
  and patio agents and their subagents. Real touch drag/hold and keyboard input
  remain manual-device checks; quick tap and lease behavior have been exercised.
- Earlier audio QA confirmed no requests before opt-in, all nine local clips
  returning HTTP 200 after opt-in, and a running AudioContext with no warnings.
  An 88-second offline render measured indoor/patio RMS around -57/-46 dBFS at
  40% volume, peak below 0.055, silence after mute and at most six active sources.
  Speaker/headphone listening and real hidden-tab suspension remain manual QA.

# Garage free driving

Click an actual garage car to claim its controls. Keep the existing wide room camera and the authored Porsche, green Mini, DeLorean and F1 at their established scale. Click another available car to switch in one server-confirmed handoff; the previous car parks itself. A rejected claim preserves the current car. The cars collection also offers an accessible **drive car** button.

- **W / up:** accelerate; **S / down:** brake, then reverse. Reverse out of the angled bays.
- **A / left, D / right:** steer relative to the car; **space or shift:** handbrake drift. Double-tap **space** within 320 ms for a five-second rocket celebration: the car stays in place while left/right controls its twist.
- **Escape:** automatically drive back using a fresh collision-aware route to the original bay. The route uses turns and short reversing maneuvers where needed, without replaying prior driving. It accelerates up to 4.2 m/s, slows into the bay, waits/replans for traffic and can pull away from a collision boundary. **Recover car:** explicit repair/reposition only if the bay is clear; never automatic teleportation. You may switch to another car while parking, or click your own returning car to take it back.
- **DeLorean:** folds its four wheel pods horizontally and rises to 1.45 m before moving. Hover height is authoritative and interpolated for every viewer; cars and pedestrians can pass beneath it with vertical clearance. The folded width of 1.47 m is included in static collision checks. It makes no airborne tire marks, keeps its shadow on the floor, and waits for a clear landing before lowering/unfolding in its bay. Reduced motion preserves the flying state without decorative bobbing.
- On touch screens, drag on the scene to steer and accelerate; hold a second touch to drift. There is no separate driving panel. Losing focus or hiding the page sends neutral input immediately.
- Different acceleration, braking, grip, wheelbase, steering and damage response for each car. Collision scuffs are visual paint changes with a bounded performance penalty, not deformable bodywork.

## Shared world

`GarageDrivingManager` owns public WebSocket leases and advances the pure `GarageDrivingSimulation`. A socket can drive one car, a car has one driver, and anonymous browsers can drive. Inputs never supply poses, damage or tire marks. Old input becomes neutral and unused/disconnected leases return to parking. Current cars and recent marks are sent to late joiners; ordinary messages append only new marks.

The server keeps at most 240 tire segments for 90 seconds. The renderer uses one fixed geometry, soft rubber grain and time-based fading. Car snapshots are interpolated without extrapolating through walls. The authored wheel pivots steer and roll; the body leans subtly above grounded tires.

An occasional real idle agent can approach, board, reverse into the open floor, make a short donut excursion and park again. Jonathan and agents already downstairs are preferred. Work and manual control interrupt leisure. Cars and pedestrians yield to each other, and the Mini stays reserved while its laptop workstation is in use.

## Local checks and boundaries

The explicit `controlsPreview` playground uses the same pure simulation privately and never sends driving input live. To check multiple browsers against a local backend, run the existing server on port 4242 and open the prototype locally; local previews use the local backend by default. Production uses the site's existing WebSocket connection.

Ordinary driving stays inside the **garage**. The hovering DeLorean can approach the ramp exit: the final stretch gently draws it toward the opening, triggers a shared time jump, and returns it after the jump delay. Other cars cannot use the ramp. There is no separate racing screen, course, timer or leaderboard. Extending the connected outdoor world needs the landing/clearance work recorded in `garage-car-clearance.md`.

Tests cover physics and solid boundaries, drift tracks, distinct profiles, recovery, ownership/conflicting input, anonymous control, late joining, idle-agent work interruptions, pedestrian yielding, real GLB wheel rigs/material isolation, and display interpolation.

Parking uses a bounded tangent-arc/hybrid search, sampled collision checks, extra planning clearance and a no-allocation broad phase before polygon collision checks. Replans are throttled rather than attempted every frame. The wide room camera remains steady during automatic parking.

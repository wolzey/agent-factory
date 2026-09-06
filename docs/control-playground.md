# Local agent controls playground

Open the Vite development server with `?controlsPreview=watching&skyTime=night&skyWeather=rain-light`.
The **local playground** panel can jump to watching, connecting, empty, ready, claiming,
controlling, reconnecting, expired-link, and denied-claim scenarios. Reset repeats the
selected starting scenario; “now” shows the actual state after interacting.

Use **connect this browser → finish connecting → take control** to rehearse the flow.
W/A/S/D walks the sample agent; B opens the original room's 12-emote loadout, now a
compact bar. Arrow keys choose, Enter reacts, and Escape closes the bar before it
releases control. Avatar edits, chat, and workstation placement stay in memory.

**Edit avatar** focuses the room camera on the selected owned agent. The side panel
changes a local draft rendered with the room's lighting and a soft temporary fill.
Cancel restores the live sprite; save uses the same owner-checked avatar API (or
the in-memory preview adapter). Narrow screens place the controls below the agent.

Both basketballs support pointer pickup and a release toward the hoop without login.
Keyboard users can focus a ball, press Enter, then choose Shoot or Cancel. Other
viewers receive translucent, ephemeral copies through the public `visitor_ball`
WebSocket channel; it never changes agents, visit history, or shared scores. Inputs
are bounded and rate-limited, and disconnects and timeouts remove abandoned ghosts.
The playground keeps these shots local. For two-browser development testing, run
the updated backend and use `factoryServer=local`; the ordinary local preview does
not send visitor actions to the production feed.

`FactoryControlState` waits for matching server grants, stops movement before release,
and invalidates control when ownership or the selected session disappears.
`factoryControlPhase` derives the visible step from connection, identity, owned agents,
pending grants, active control, and failures. The same controls render in both modes.

The playground replaces only the transport and identity data with clearly labeled sample
agents. Its dynamic import is gated by Vite development mode **and** a loopback hostname.
It opens no factory WebSocket, sends no hooks, and never exchanges real authentication
handoffs. Avatar saving uses an in-memory adapter. Its fixtures and state switcher are
excluded from production builds; normal local preview URLs still watch the public factory.

The original Phaser `EmoteWheel` and the 2.5D bar share `client/ui/emotes.ts` and
`VALID_EMOTES`, preserving the existing names, glyphs, order, and animation commands.

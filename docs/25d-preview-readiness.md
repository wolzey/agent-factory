# Compatible classic-room baseline and recovery build

This branch serves the previous Phaser client at `/` while retaining the server
that understands both classic and `factory25d` saved worlds. The client entry
and Vite configuration come from upstream main `c05e2af`.

Merge this baseline into `wolzey/agent-factory` main before the 2.5D client switch.
Verify a successful deployment at **https://fluid-factory.onrender.com/** using
its WebSocket build ID and healthy persistence. The subsequent release branch
must include this baseline in its ancestry and restore the intended 2.5D entry;
use merge commits so reverting the client-switch release recovers this baseline.

Existing database credentials, authentication secret, title and other service
settings stay in place. The server preserves valid classic environment choices
but maps a retained `ENVIRONMENT=factory25d` setting back to its bundled classic
default, `arcade`. No dashboard setting change is needed for recovery.

Do not roll back directly to c05e2af after the switch: it rejects factory25d saves.
This server preserves agents, ownership, avatars, chat, revisions and active
event deadlines. Existing valid desk reservations are assigned first. Workers
beyond twelve desks wait at available positions and advance when a desk opens.
Removed patio grave reservations become visible memorials without reserving a
nonexistent desk. If all bounded waiting positions are full, extras stay at the
entrance.

Migration coverage includes eighteen workers, stale control, stationary drops,
graves/deadlines, restart recovery, vacancies and oversized snapshots. The full
suite passes 407 tests across 61 files. Production client/server and Linux amd64
Docker builds pass. Local containers exercise saved-world migration in both
directions, including stale environment overrides. Browser QA confirms the
restored classic room with existing avatars and chat.

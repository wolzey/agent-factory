# Front-counter team screen

Click the small tablet on the front counter to zoom into the team list. Its tilted
screen sits on a short stand on the countertop. The camera moves close enough for
the live, scrollable interface to fill the display, with the room button and Escape
returning to the previous view. Reduced motion skips the camera animation, and the
small screen keeps a centered touch target of at least 44 pixels.

The room's pixel avatars light up when an owned agent or an authenticated browser
is connected.
Multiple sessions and tabs for an installation share one entry. Anonymous viewers
do not create people; matching names on different installations remain distinct.

The list grows from real visits. Existing saved sessions seed it at rollout, and
future visitors remain after their sessions disappear. No historical visits or
team members are fabricated. Last seen uses actual hook timestamps and browser
presence; agent roaming and scenery animations do not count as visits. Browsers
that stop responding expire after at most sixty seconds. The screen refreshes every
ten seconds while open and thirty seconds in the room, and labels outages instead
of showing stale green indicators.

`GET /api/team` returns names, avatar appearances, agent counts, presence and last
seen. It has the same public scope as the room, omits task/path data, and disables
HTTP caching. `team_members` is an additive table in the existing libSQL database;
the world snapshot schema, avatar profiles, authentication and terminal hooks keep
their existing contracts. Writes are batched, retried after failures and flushed
on shutdown. No new account, secret, dependency or setup step is required.

Production hides lighting and renderer comparison panels and uses volumetric
clouds. The window toolbar contains navigation only. Development URLs retain
opt-in lighting/display studies. The lounge TV uses original procedural pixel
landscapes with slow, silent transitions, and the two decorative climbers follow
the actual mountain surface. Neither creates a fake agent or team member.

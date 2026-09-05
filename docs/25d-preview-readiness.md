# Compatible arcade recovery build

This branch serves the previous Phaser arcade client at `/` while retaining the
server that understands both `arcade` and `factory25d` saved worlds. It is a
recovery build for the 2.5D release, not a branch to merge back into that release.
The client entry and Vite configuration come from upstream main `c05e2af`.

Deploy this build to the existing service with `ENVIRONMENT=arcade`. Preserve the
existing database, authentication secret, title, and other service settings.
The service dashboard's linked repository and selected commit are authoritative;
the inherited Render manifest does not automatically connect this fork branch.

Establish this as a healthy successful deployment before switching the service to
the 2.5D release. Record its Render deploy ID as the rollback target. Do not roll
back directly to c05e2af after the switch: that version rejects factory25d saves.

When reading a newer world, this server preserves agents, ownership, avatars,
chat, revisions, and active event deadlines. Existing valid desk reservations
are assigned first. Workers beyond the arcade's twelve desks wait at available
positions and advance when a desk opens. Removed patio grave reservations become
visible memorials without reserving a nonexistent desk. If all bounded waiting
positions are full, extra agents stay at the entrance.

Migration regression tests cover eighteen workers, stale control, stationary
drops, graves/deadlines, restart recovery, vacancies, and oversized snapshots.
The full shared server suite passes 403 tests across 60 files. The production
client/server build also passes. Deployment access and the retained Render deploy
ID must be verified in the actual service dashboard before rollout.

# Fluid Factory 2.5D release handoff

Target the existing **https://fluid-factory.onrender.com/** service. Its live
WebSocket build ID was `c05e2af3c80d45c96faea954e2be76fc2ea22847`, with environment
`arcade`, title `Fluid`, and healthy durable persistence on 2026-09-05.

Both builds are in **britonbakerfluid/agent-factory**:

| Purpose | Branch | Environment |
| --- | --- | --- |
| Compatible old-room baseline | `codex/factory-25d-compatible-rollback` at `fb0a2ba` | `arcade` |
| 2.5D release | `codex/factory-25d-preview` | `factory25d` |

1. Confirm the service's linked source and current successful deployment in Render.
   GitHub's upstream deployment record refers to `agent-factory-coqw.onrender.com`,
   a different URL; pushing upstream main has not been verified as the publishing
   route for the Fluid service. Preserve the existing database credentials,
   `AF_TOKEN_SECRET`, title and other settings. Do not create a new service/database.
2. Deploy the compatible baseline with `ENVIRONMENT=arcade`. Verify healthy
   persistence and existing agents/chat, then record its successful Render deploy ID.
3. Deploy the exact current commit from the 2.5D release branch with
   `ENVIRONMENT=factory25d`. Deploy these as separate exact commits; merging both
   sibling branches in sequence does not implement the intended client switch.
4. Confirm `/api/health` is healthy, `/api/state` reports `factory25d`, the WebSocket
   build ID matches the selected commit, and the root page shows the 2.5D room.
   Check the patio, existing lounge conversation and an existing browser login.
   Avoid test messages or global effects in the shared room.

If recovery is needed, roll back to the compatible baseline recorded in step 2.
Do not roll back directly to c05e2af: its parser rejects `factory25d` saved worlds.
The compatible server maps saved workers into the arcade's twelve real desks and
available waiting positions, while retaining chat, identity, avatars and deadlines.
Render reuses the selected deployment's build and service environment variables;
see [Render rollback behavior](https://render.com/docs/rollbacks).

Validation: 403 tests across 60 files; client/server builds; both Linux amd64
Docker images; a production database round trip from arcade to 2.5D and back;
browser checks of the new room, chat/controls/effects and restored arcade room.

No live configuration or deployment was changed during preparation.

# Fluid Factory 2.5D release procedure

Target the existing **https://fluid-factory.onrender.com/** service. Before this
rollout its WebSocket build ID was `c05e2af3c80d45c96faea954e2be76fc2ea22847`,
with environment `arcade`, title `Fluid`, and healthy persistence.

Publish using the existing GitHub contributor access to `wolzey/agent-factory`.
Do not create another hosting service or database. Preserve service settings,
including database credentials, `AF_TOKEN_SECRET` and the title.

1. Merge `codex/factory-25d-compatible-rollback` into main using a merge commit.
   This deploys the classic room with a server that accepts both saved layouts.
   Verify the actual Fluid service's build ID and healthy persistence, then record
   the successful baseline commit/deployment before continuing.
2. Merge `codex/factory-25d-preview` into main using a merge commit. The release
   branch must include the compatible baseline in its ancestry while retaining
   its 2.5D client tree. Check the PR diff to confirm the root changes to 2.5D.
3. Confirm the Fluid WebSocket build ID matches the release commit, `/api/health`
   reports healthy persistence, `/api/state` reports `factory25d`, and the root
   page renders the 2.5D room. Check the patio and existing lounge history without
   sending test messages or shared effects.

The bundled renderer determines its compatible environment after existing file
and environment overrides. A stale `ENVIRONMENT=arcade` is normalized to
`factory25d` in the release; the compatible classic build maps a newer
`factory25d` override back to `arcade`. No dashboard setting change is needed.

GitHub's deployment records currently identify `agent-factory-coqw.onrender.com`,
a second service. Its success alone does not prove that Fluid updated. Verify
`fluid-factory.onrender.com` directly at each stage.

If recovery is needed, revert the second release merge (first-parent revert),
which restores the compatible baseline through the same publishing route, or
redeploy the recorded successful baseline artifact. Do not restore c05e2af:
its parser rejects `factory25d` saved worlds. The compatible server maps workers
into the classic room's twelve desks and bounded waiting positions while
retaining chat, identities, avatars and deadlines.

Validation: 407 tests across 61 files; client/server builds; production Linux
amd64 Docker images; a saved database round trip from arcade to 2.5D and back;
stale environment overrides in both directions; browser checks of the new room,
chat, controls, effects and restored classic room.

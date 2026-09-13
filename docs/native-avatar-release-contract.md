# Native avatar release contract

Native device grants remain separate from browser and CLI credentials. New clients request `avatarWrite: true`; the connected browser must show that permission and explicitly approve it. Existing grants and old link requests remain read-only. Re-link to upgrade; no implicit permission escalation. Capability version stays 1 with additive `avatarEditing: 1`.

All public avatar writes now require the revision returned by a profile read. Missing revisions return 428; competing writes return 409 with the current profile. Deploy the browser and server together, and release the updated CLI before announcing native editing. Older CLI avatar saves require an update; hooks, reads and device linking are unaffected.

Native PATCH accepts only recognized editable fields and merges them into the authenticated owner's canonical profile, retaining legacy fields. The factory derives the owner from the bearer credential, never the payload. This does not authorize world commands.

Revisions hash canonical content plus owner and saved state. They survive restart, are not timestamps or globally ordered event IDs, and assume the existing one-authoritative-process-per-factory topology. Writes serialize by owner; the successful response is captured inside that queue. If persistence may have committed before failing, reconcile durable state before allowing further reads/writes against that owner. Failed reconciliation blocks stale reads; a later read retries recovery.

Clients retain their draft after uncertainty. Read back to confirm an exact successful save; otherwise load the latest appearance or deliberately reapply edits against its revision. Never automatically overwrite a competing edit. The CLI retains its local avatar and reports that the factory save was not confirmed.

Validation: full server suite (1,299 tests at this checkpoint), production browser/server build, CLI command tests. Added tests cover scope consent and persistence, read-only/revoked grants, invalid patches, owner isolation, concurrent CAS, legacy preservation, restart stability, and a write committed before an acknowledgement failure. Native player/editor and actual browser recovery interaction checks are separate release gates.

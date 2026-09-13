# Native device linking — first authenticated increment

## Intent and rollout boundary

Connect the Mac/iPad app to an existing browser owner without copying installation secrets or browser cookies, and without spawning a second personal avatar. Each HTTPS factory has an independent connection. Device linking identifies the account; it does not manufacture an agent session.

Read-only production checks on September 13, 2026 found `/api/protocol` absent (404), a schema-1 public world feed, and browser-only authentication. The current native branch is 30 main commits behind the deployed browser. Publish an isolated additive linking change against current main; do not deploy the native branch over the newer browser.

This increment advertises identity/profile **read** access only. Authenticated native world commands, WebSocket recovery for newer props/HORSE/radio domains, avatar saving/editor UI, and public distribution remain subsequent gates. Existing browser authentication and installation-hook permissions are unchanged.

## Contract

- `GET /api/auth/devices/capabilities`: independent version 1, five-minute linking lifetime, identity/avatar read scopes, `nativeCommands: false`. An old server remains usable as a public viewer and shows an update-required explanation in native settings.
- The native app generates a random 256-bit `afn1_` credential, saves it in origin-scoped Keychain, and sends only its SHA-256 commitment with a device name to `POST /api/auth/devices/link`. The server returns a random request ID and ten-character code. Repeating begin with the same commitment resumes the pending request.
- Browser `POST /api/auth/devices/inspect` and `/approve` require a verified browser cookie, same-host Origin, HTTPS remotely, and `X-Factory-Owner` matching that cookie. The approval view displays the actual factory origin, approving account, requesting device name and code. Names are descriptive, not hardware attestation. The user must compare them to their app.
- Native `POST /api/auth/devices/link/exchange` proves possession of the original credential in its Authorization header. Another device cannot exchange the visible code. Before approval it returns pending; after approval it durably creates a distinct device grant. The grant ID is reserved before the write, and the database enforces a unique credential hash. A repeat exchange returns the same grant, never a second grant, including when a write commits but its reply is lost. A lost response or process restart after the save can recover through `/api/auth/native/session` using the credential already held by the requester.
- Only the hash, owner, device ID/name and timestamps are persisted. Responses never contain a browser cookie or installation credential. Native credentials are rejected by the existing installation authentication path and are not accepted as browser cookies or socket identities.
- A grant lasts 90 days. Relaunch restores it; expiry/revocation requires linking again. This first version uses explicit relinking rather than silent indefinite renewal.
- `GET /api/auth/devices` and `DELETE /api/auth/devices/:id` list/revoke only the authenticated browser owner's devices. `POST /api/auth/native/logout` revokes only that native credential. `/api/auth/devices/link/cancel` is credential-bound and also revokes a grant if exchange won the race with cancellation. Cancellation resolves the durable credential hash even after the display code expires or the process restarts; a missing/expired challenge alone is never proof of revocation.
- `GET /api/auth/native/session` authenticates the separate native bearer and returns its identity and the existing shared avatar profile. It accepts no browser-cookie fallback. Native revalidates on startup and periodically; revocation takes effect on the next API request. There are no native authenticated sockets/leases in this increment to release.
- Login/profile responses are no-store. Native refuses redirects and does not log/store credentials in PlayerPrefs. The browser's approval code uses a URL fragment, which is removed after opening the panel; the credential never enters a URL.

## State and failure behavior

| Event | Outcome |
|---|---|
| Begin | Pending challenge, no authenticated grant |
| Browser approval | Owner attached to the pending request; no grant before device proof |
| Same code approved by another owner | Conflict; original owner cannot be replaced |
| Wrong device proof | Generic unavailable response; no grant |
| Five-minute expiry or server restart before durable exchange | New linking request required |
| Concurrent/retried exchange | One serialized durable grant; same result |
| Failed database save | No authenticated in-memory grant; same reserved grant can retry; cancellation also checks for an unacknowledged durable write |
| Failed durable revocation | Error, not a false success; device remains listed/authenticated until retry |
| Revoke followed by an exchange retry | Revoked; the retry cannot resurrect the device |
| Native cancel racing with exchange | Serialized cancellation deletes the grant if exchange finished first, including a save that spans code expiry |
| Cancellation delete commits but its reply is lost | Retry confirms durable absence and clears the corresponding in-memory grant |
| Factory switch, including A → B → A | Abort old requests, advance operation generation, clear visible identity, read only the new origin's Keychain record |
| Network outage | Keep secure credentials, clear verified connection display, allow retry |

The server assumes one authoritative process per factory, as the existing world contract does. Grant writes serialize in that process and await libSQL success. Pending links are memory-only, bounded at 1,000 and expire after five minutes. Requests are rate-limited per remote address and operation; the limiter is bounded at 10,000 entries. Each owner has at most 30 active devices and each process at most 10,000 active grants. Expired stored records are removed on startup. A multi-writer deployment would require database-level exchange/uniqueness coordination and is not supported by this contract.

This is the first deployment of `linked_devices`; no released intermediate schema exists. The `linked_devices` table is additive and does not alter existing browser cookies or agent/world records. Rolling the server back removes linking capability and rejects native access; keep the table intact for a later roll-forward. A rollout must retain this contract once distributed clients depend on it.

## Apple storage

One C++ source bridge is compiled into both IL2CPP targets. The exact key is generic-password service `com.wolzey.agentfactory.native-session.v1` plus canonical HTTPS origin, including a nondefault port. Query/update/delete always use that exact scope; synchronization is disabled.

- macOS deliberately uses the standard login Keychain and its creating-app ACL. This supports the personal Developer ID build without adding provisioning requirements. It does not claim iOS-style screen-lock or device-only backup semantics.
- iOS uses WhenUnlockedThisDeviceOnly and disables synchronization.
- Locked, unavailable, denied, or malformed reads never fall back to plaintext or another store. Temporary byte buffers are cleared, native CF objects released, and errors contain no token data. The Editor does not persist credentials.

Removing a factory configuration is distinct from revoking its device grant. Disconnect first, or revoke it from the browser's device list. Changing an origin never transfers a credential to the new server.

References: [Unity macOS source plug-ins](https://docs.unity3d.com/6000.3/Documentation/Manual/macOSIL2CPPScriptingBackend.html), [Unity iOS plug-ins](https://docs.unity3d.com/6000.3/Documentation/Manual/ios-native-plugin-create.html), [Apple Keychain backends](https://developer.apple.com/documentation/Technotes/tn3137-on-mac-keychains), [iOS Keychain accessibility](https://developer.apple.com/documentation/security/ksecattraccessible).

## Evidence and review

Risk: **high**, at account ownership, credential storage and revocation boundaries.

- Nine new server tests use the real libSQL repository, production auth/routes and actual HTTP injection. They cover device binding, cross-owner rejection, durable restore/revocation, failed writes, committed-but-unacknowledged writes/deletes, concurrent exchange/cancel across expiry, and denial of installation privileges.
- Isolated latest-main server/browser suite: **1,296 tests passed across 162 files**; production build passed. Unity EditMode suite: **111 passed**, including owner pinning, failed Keychain-save recovery, and real delayed HTTP responses during A → B → A switching.
- The browser smoke test uses a temporary local database and a separate native HTTP client. It exercises real code entry, inspection, explicit approval, durable exchange, responsive device list and browser revocation, then verifies native access returns 401. It caught and fixed an empty-JSON DELETE formatting error.
- A separately signed native bridge probe passed actual Mac Keychain read/write/update/delete, missing-item behavior, bounded output and origin isolation. It used temporary `.invalid` origins and removed its own test records.
- Mac Unity Xcode export with the source plug-in succeeded. A personal Developer ID archive compiled the bridge successfully; the final archive with retry hardening is being rebuilt. In-app live linking/restore and physical iPad Keychain validation remain open until completed. Production is unchanged.

Review starts at `server/device-links.ts` (serialized durable transitions), then `server/routes/device-links.ts` (separate browser/native trust boundaries), repository persistence, browser approval, and `FactorySession`/`FactoryCredentials` (origin and lifecycle isolation). The UI never claims a full authenticated world connection. The avatar editor and native world synchronization remain the next phased increments.

## Findings ledger and release gates

| Finding | Classification | Resolution and evidence |
|---|---|---|
| DL-1 / P1: a committed save with a lost reply could create duplicate credentials on retry and revive one after revocation | Confirmed, fixed | Stable grant reservation, idempotent insert and unique hash; real-repository retry/revoke/restart test |
| DL-2 / P2: a code expiring during exchange could make cancellation report unavailable while leaving a durable grant | Confirmed, fixed | Credential-bound durable lookup independent of challenge expiry; held-write expiry/cancel test and uncertain-delete retry test |
| DL-3: native secure-save failure could mutate the pending identity before persistence succeeded | Author review, fixed | Write the new linked record before accepting identity; Unity test requires a successful second write |

**Server/browser readiness: Ready with disclosed risks.** The isolated branch `wolzey/native-device-linking` starts at main `555993f` and contains only the additive server contract, browser connection panel and verification harness. Full tests, production build and actual browser approval/revocation pass on that checkout. One authoritative writer remains an explicit deployment assumption. No production mutation or deployment has occurred.

**Native distribution readiness: Not ready.** The client compiles and its lifecycle/storage checks pass, but the live server does not yet expose this contract. After the server update, verify actual Mac code approval, restored connection after relaunch, browser revocation and two configured factories. Then validate the iPad Keychain path on hardware before distributing this feature. The client must continue to show a public viewer/update-required message against older servers.

Deployment changes only the current-main server/browser path. The Render blueprint auto-deploys main; merging is therefore a production action. Keep the additive table on rollback. Do not deploy the divergent native-development branch. Avatar editing will require an explicit additional write scope and corresponding approval wording; this read-only grant must not silently gain write permission.

# Factory-wide branding

The factory server owns the title, accent color and optional PNG logo. Browser and native clients read the same public `/api/config` response. This first version is configured by the server operator; there is no per-user branding setting or browser write endpoint.

## Configure

Create an operator-owned JSON file, for example `/etc/agent-factory/branding.json`:

```json
{
  "title": "North Star Lab",
  "accentColor": "#66E2CF",
  "logoFile": "logo.png"
}
```

Set `FACTORY_BRANDING_FILE` to that file's absolute path, put the PNG beside it, then restart the server. Relative `logoFile` paths resolve beside the JSON file. Remove `logoFile` to use neutral artwork. PNGs can be transparent, at most 1024×1024 pixels and 2 MiB (including the normalized output). Use a smaller image if normalization exceeds the limit. Titles allow 1–100 printable Unicode characters; colors use `#RRGGBB`.

Environment overrides:

| Variable | Effect |
| --- | --- |
| `FACTORY_BRANDING_FILE` | Operator JSON file, maximum 16 KiB |
| `FACTORY_TITLE` | Overrides the file title |
| `FACTORY_ACCENT_COLOR` | Overrides the file accent |
| `FACTORY_BRANDING_LOGO` | Overrides the local logo file path |

Without a branding title, the existing `TITLE` / server-config title remains the fallback. Without any configured title, the default is Agent Factory. Missing colors use `#DBBEF6`; missing logos use neutral artwork. Invalid explicit configuration prevents startup with an actionable error rather than silently applying a different brand.

On Render/Docker, mount the JSON and PNG on a persistent disk or include operator-owned files in the image and set the variables above. `server-config.json` is not automatically copied into the current image. No remote URL is downloaded by the server. Local config paths, signing secrets and unknown settings never appear in the public response.

## Consistency and rendering

The additive `branding` object contains version 1, a content revision, accent color and a same-factory content-addressed logo path. The old top-level title remains for older clients. PNGs are decoded/validated, stripped of metadata and served with immutable caching and `nosniff`. Changes require a server restart/redeploy; running clients refresh within 60 seconds or on focus/reconnect. The config response is not cached. An old image URL cannot silently acquire new artwork.

Browser surfaces: top title and document title, garage sign, vending header, shelf prints, both animated patio flags and the shelf's preview/download dialog. The interactive flag uses tiles of the configured artwork, retaining stirring/scattering and cloth motion. The original company sculpture becomes neutral blocks. Fixed company cloud marks are disabled until configurable cloud masks exist. This does not rewrite historical/newsletter content or third-party product names.

Native surfaces: top title, garage title, vending header and shelf prints. Artwork fits each surface without stretching. Existing scenery remains neutral in the app package. Configuration/artwork requests carry no credentials, reject redirects and enforce byte/image bounds. Switching factories clears old branding immediately and rejects late responses from the previous origin. Temporary failure preserves the last valid configuration only within the same factory; a missing/broken logo shows neutral decoration. The avatar application icon, publisher/signing identity, and user-created connection labels are independent of factory branding.

The native patio currently has no flag geometry; adding these flags to the native environment remains a parity task. The new configuration does not pretend they already exist.

## Rollout and rollback

Server/browser work lives on `wolzey/factory-branding`, based on current main; do not merge the divergent native branch into the web server. Deploy the server/browser changes and release a native build containing `FactoryBranding`. Older native packages continue displaying their baked neutral art; older browser consumers still read the top-level title. Deploying this feature does not automatically install a new native app.

To remove branding, remove the logo setting and use the neutral title/accent, then restart. Roll back the server/browser commit if needed; updated native clients still accept the legacy title-only response. Content-addressed image downloads may remain cached, but no longer appear after clients receive logo removal.

There is no new administrator authorization model in this version. A future settings screen must add explicit operator authorization, durable storage and conditional updates before exposing configuration writes.

## Validation

- Server/browser unit suite: 1,305 tests pass in a full run with two workers. Production browser/server build passes.
- Two independent Chromium clients consume the same production-serialized identity, recover from an intentionally failed first PNG request, render the PNG and shared title, open the shelf preview/download, and refresh a same-title revision to change the accent and remove the logo. The interactive flag's stir/scatter/reset check passes.
- Native: 132 Unity tests pass, including all three scene bindings, title-only compatibility, rejected origins, byte/image bounds, aspect fitting, factory switching and explicit removal. A Unity render uses the same serialized fixture, and the Mac Xcode export builds successfully. A native release containing this feature is still required; the earlier notarized neutral candidate predates it.

To reproduce the local browser check (Python environment with Playwright/Chromium required):

```sh
node --import tsx tests/support/branding-fixture.ts /tmp/factory-branding-fixture
pnpm exec vite --host 127.0.0.1 --port 4293 --strictPort
python tests/branding-browser-smoke.py --fixture-dir /tmp/factory-branding-fixture --output /tmp/factory-branding-proof
```

Run the Python command separately while Vite is running. The fixture blocks non-local requests and intercepts all API traffic; it never contacts a live factory.

Visual evidence and review notes: [branding verification](evidence/factory-branding/README.md).

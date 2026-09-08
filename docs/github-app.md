# GitHub App contributions

Each deployment reads authored, merged pull request totals for one or more repositories, on a shared base branch, using a GitHub App installation. The application no longer displays the checked-in Fluid count snapshot. Unknown counts stay hidden; successful totals remain visible during GitHub outages, with their original checked timestamp. The server refreshes at startup and hourly; browsers read its cached snapshot every five minutes.

## Deployment model

Register a private GitHub App for each organization/deployment. Each app has its own key and setup URL. This keeps another deployment from authenticating as your organization and avoids a shared callback or webhook router. To add an organization, repeat the same setup with its deployment URL and repository configuration.

GitHub's [setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url) runs after installation; [OAuth callback URLs](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-user-authorization-callback-url) run after user authorization. This integration acts as the installation, so **leave OAuth callbacks empty, OAuth during installation off, and webhooks inactive**. The setup URL only navigates back to the configured deployment. Its `installation_id`, `code`, and other query parameters are ignored. Installation discovery uses GitHub's authenticated organization installation endpoint and checks the app ID, organization, account type, and suspension state.

A single public GitHub App can technically be installed across organizations, but its private key can authenticate as every installation. Do not distribute that shared key among independently trusted deployments. Supporting a shared app with isolated deployment credentials would require a central installation/token broker and callback routing, which this foundation does not introduce.

## Configure and register

1. Create a nonsecret JSON configuration based on `config/github.fluid.example.json`. Set `organization`, `repositories` (a list of `owner/name`, all in that organization -- the older single `repository` string is still accepted), `baseBranch`, and `identities`. Each identity has a `githubLogin` and explicit `factoryUsernames` aliases. Ambiguous aliases are rejected. Up to 10 repositories and 25 identities are supported per deployment. Repositories cost query length, not requests: one search counts an author across all of them, so an hourly batch stays at one request per identity and below GitHub's 30 search requests/minute limit. Counts are not automatically assigned using task names or similar-looking display names.
2. Set `AF_GITHUB_CONFIG_PATH` to that file and `AF_PUBLIC_URL` to the deployment's exact HTTPS origin, with no path. Local development allows HTTP localhost. Set these in the process/hosting environment; the server does not automatically load `.env` files.
3. Generate a prefilled GitHub registration link:

   ```sh
   AF_GITHUB_CONFIG_PATH=config/github.fluid.example.json \
   AF_PUBLIC_URL=https://fluid-factory.onrender.com \
   pnpm github:setup 'Fluid Agent Factory'
   ```

4. Open the link as an organization owner and create the GitHub App. Verify **Pull requests: Read-only**, mandatory **Metadata: Read-only**, private visibility, no OAuth, and inactive webhooks. For Fluid, the setup URL is `https://fluid-factory.onrender.com/api/github/setup`.
5. Generate a private key in the app's settings and store the PEM in your hosting provider's secret file facility. Set `AF_GITHUB_APP_ID`, `AF_GITHUB_APP_SLUG`, and `AF_GITHUB_PRIVATE_KEY_PATH`. Alternatively set `AF_GITHUB_PRIVATE_KEY` as a secret environment variable (actual newlines or escaped `\n` accepted). Configure only one private-key source. Never commit a PEM or use a `VITE_` variable for a credential. This integration does not need a client secret or a personal access token.
6. Install the app on the configured organization, choose **Only select repositories**, and select every repository in the configuration. The worker requests a token narrowed to exactly those repositories and read-only pull requests even if installation access is broader. A configured repository the installation cannot read makes its whole search fail, so counts stay at their last verified totals -- add the repository to the installation and the configuration together.
7. Deploy this branch's code with the above environment settings, then restart the service to trigger the first refresh. Installations made after startup will be detected at the next hourly refresh, or immediately after a restart. If the app is installed before the new code is deployed, GitHub's setup redirect will temporarily return 404; the installation itself is still valid.

For the Fluid Render service, use:

| Variable | Value |
| --- | --- |
| `AF_PUBLIC_URL` | `https://fluid-factory.onrender.com` |
| `AF_GITHUB_CONFIG_PATH` | `config/github.fluid.example.json` |
| `AF_GITHUB_APP_ID` | `4866829` |
| `AF_GITHUB_APP_SLUG` | `fluid-agent-factory` |
| `AF_GITHUB_PRIVATE_KEY_PATH` | Render secret file path, e.g. `/etc/secrets/github-app.pem` |

> [!NOTE]
> The Fluid deployment counts `fluid-mono`, `fluid`, `fluid-integrations`, and `fluid-middleware`.
> The installation was originally granted `fluid-mono` only; the other three must be added to the
> app installation, or every count falls back to its last verified total.

The [Fluid Agent Factory app](https://github.com/organizations/fluid-commerce/settings/apps/fluid-agent-factory) is registered and installed with read-only access to `fluid-commerce/fluid-mono` (installation ID `159909739`). Live installation-token authentication and fresh counts for all six configured contributors were verified on September 8, 2026 (UTC). The token was confirmed to access only `fluid-commerce/fluid-mono`. Render service `srv-da700ggae00c7386nue0` is configured with the five variables above and the verified signing key at `/etc/secrets/github-app.pem`. These settings were saved without deploying; the integration code must still reach the service's `main` branch and be deployed before live counts appear in production.

Other deployments must supply their own config and credentials. The generic Render blueprint intentionally contains no Fluid defaults or empty secret placeholders.

## Verify and operate

- `GET /api/github` exposes only whether credentials are configured, the organization, and the installation link. `configured` is configuration presence, **not proof of successful installation**.
- `GET /api/contributions` returns repository, branch, explicit identities, count records and refresh status. `unconfigured` means no credentials; `configured` means credentials are present (or the latest completed refresh succeeded); `unavailable` means the last batch had a failure. Confirm that expected contributors have a recent `checkedAt` timestamp to establish live data.
- An expired installation token is renewed before use. A 401 invalidates the cached token; the next scheduled refresh rediscovers the installation and retries. A suspended/uninstalled app or removed repository access produces `unavailable`, preserving prior verified counts rather than inventing zero.
- Missing permission, rate limiting, incomplete search results, invalid payloads, timeouts, and cache failures never publish raw GitHub responses or credentials. Reads are sequential and abortable; concurrent refresh requests share one batch. Tokens are kept in process memory only.
- Repository names, explicit aliases, and aggregate totals are public to anyone who can view this factory, like the existing contribution display. PR titles, bodies, source code, and credentials are never returned by these routes. Use a deployment access boundary if the organization's aggregate counts should be private.

The existing libSQL/Turso database stores live totals in `github_contribution_totals`, keyed by a hash of deployment URL, organization, repositories, branch, and app ID. Changing these settings starts an empty scope. Old unscoped `contribution_totals` data is retained for rollback but is never imported into this integration. If `AF_CONTRIBUTIONS_CACHE_PATH` is set, each scope instead uses `<path>.<scope-hash>.json`; the old unscoped file is likewise ignored. Aliases are operator configuration, not learned from GitHub; removed identities are filtered out and browsers clear old aliases when configuration changes.

Use one worker per deployment for this initial hourly polling implementation. Multiple processes deduplicate within each process only and would multiply API traffic. Automatic org roster discovery, OAuth identity linking, and webhook-driven refresh are follow-ups.

## Migration and rollback

The legacy `AF_CONTRIBUTIONS_GITHUB_TOKEN` and generated seed are no longer used at runtime. Set up the app/configuration before rolling out if you want to avoid an interval with hidden levels. `sync:contributions` remains an offline historical snapshot tool for existing fixtures; it does not configure production.

To disable the integration, remove all `AF_GITHUB_*` settings and restart. The API and UI become empty/unconfigured. To roll back code, redeploy the prior release; its legacy count table was not changed. Rotate keys through GitHub and your provider's secret store, then restart; never put keys in repository configuration or logs.

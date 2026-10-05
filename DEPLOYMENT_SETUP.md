# Deployment Guide

This guide explains how petroviz is deployed to Cloudflare Pages, and how it guards against a source that has moved or broken. The reasoning is in [ADR 0001](docs/adr/0001-host-petroviz-on-cloudflare-pages.md).

## Where the Data Comes From

The site reads the Volve **Dataset**'s parquet tables from the **Data host** (Hugging Face) and its schema from the **Schema host** (the petrodb site). The defaults are in `src/lib/config/sources.js`, which is the one place they are defined; the app and the data-source check both resolve them from there. The README's [Configuration](README.md#configuration) section lists the URLs; [petrodb ADR-0005](https://github.com/oskrgab/petrodb/blob/main/docs/adr/0005-host-parquet-on-huggingface.md) explains why the tables moved off the petrodb site.

## Required Secrets and Variable

Set these in the GitHub repository (**Settings → Secrets and variables → Actions**):

| Name | Kind | Value |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | A token scoped to **Account → Cloudflare Pages → Edit** only, used by petroviz alone |
| `CLOUDFLARE_ACCOUNT_ID` | secret | The Cloudflare account ID |
| `CLOUDFLARE_PAGES_PROJECT` | variable | `petroviz` |

The Cloudflare Pages project (`petroviz`, production branch `main`) must already exist: Wrangler cannot create it from CI.

No other variables are needed; the build uses the data-source defaults above. Every `PUBLIC_*` variable is still an optional override, inlined at build time. If you ever need a deployed build to use another host, set the override in a **job-level** `env:` block in `.github/workflows/deploy.yml`. Setting it only on the Build step would leave the data-source check testing the defaults while the site ships something else:

```yaml
jobs:
  build:
    env:
      PUBLIC_DATA_BASE_URL: https://example.com/data
```

The full list of overrides is in `.env.example` and the README.

## How It Works

### Branch Mapping

| Trigger | Deploys to |
|---|---|
| Push to `main` | Production: `petroviz.pages.dev` (and `petroviz.ocortez.com` once attached) |
| Push to `dev` | Preview: `dev.petroviz.pages.dev` |
| Manual run (**Actions → Deploy to Cloudflare Pages → Run workflow**) | The branch you pick |

Previews read the same production data sources as `main`. Deploys are grouped per branch, so two deploys of one branch never overlap.

### During Deployment

When you push to `main` or `dev` (or run the workflow by hand):

1. GitHub Actions runs `.github/workflows/deploy.yml`
2. The data-source check (`pnpm check:sources`) fetches every source. If any fails, the deploy stops here.
3. `pnpm install` and `pnpm run build` produce the static site. Vite inlines the resolved URLs into it.
4. `cloudflare/wrangler-action@v3` uploads `build/` to the Pages project, with the branch set to the pushed ref.
5. The post-deploy check fetches the deployment URL the action reports and fails the run unless it returns `200` and the app's HTML.

### The Post-Deploy Check

Cloudflare can accept a deployment that then serves the wrong thing. The last step fetches the reported URL (retrying for a few seconds while it becomes reachable) and requires HTTP `200` and the SvelteKit bootstrap in the body. The app is client-rendered, so its HTML has no `<title>`; the bootstrap is what tells the app apart from an error page.

### The Data-Source Check

`scripts/check-sources.js` fetches every resolved source and checks that it returns the right kind of content:

- a parquet table must start with the `PAR1` marker;
- the schema must parse as JSON and have a `tables` object.

It prints one PASS/FAIL line per source with the reason (HTTP status, content type, first bytes) and exits non-zero if any fails. This catches a host that answers a `.parquet` path with an HTML page and a `200`.

Run it locally with:

```bash
pnpm check:sources
```

### The Weekly Check

`.github/workflows/check-sources.yml` runs the same check every Monday at 06:00 UTC, so a petrodb-side move is noticed within a week even when petroviz hasn't changed. You can also start it by hand from the **Actions** tab (**Check data sources → Run workflow**).

- A failed run emails whoever last edited the workflow's `cron` line, through GitHub's default notification. No issue is opened.
- GitHub turns off scheduled workflows after 60 days with no repository activity. If that happens, re-enable it from the Actions tab.

### Code Flow

```
src/lib/config/sources.js (defaults + optional PUBLIC_* overrides)
    ├── scripts/check-sources.js   → fetches and checks every source
    └── src/lib/config/data-sources.ts
            ↓
        Vite/SvelteKit build (URLs inlined)
            ↓
        Application runtime
```

## Troubleshooting

### Checking Configuration in the Browser

The app includes debugging tools in the browser console (F12 or Cmd+Option+I):

```javascript
// Log the Data host, the Schema host and every resolved source URL
window.volveConfig();

// Get the same configuration as an object
window.volveConfigSummary();
```

### Data-Source Check Fails

**Symptom**: The "Check data sources" step fails in the deploy workflow, or the weekly "Check data sources" workflow fails

**Check**: The log has one `FAIL` line per broken source with the reason (HTTP status, content type, first bytes). Reproduce locally with `pnpm check:sources`. If petrodb has moved a table or the schema, update the defaults in `src/lib/config/sources.js`.

### Build Fails

**Symptom**: GitHub Actions workflow fails during install or build

**Check**: The workflow run logs for the failing step. The deploy uses pnpm 10; `pnpm-workspace.yaml` holds pnpm 10 settings that pnpm 9 can't read.

### Deploy Step Fails

**Symptom**: The "Deploy to Cloudflare Pages" step fails

**Check**:
- *Authentication error*: the `CLOUDFLARE_API_TOKEN` secret is missing, expired, or not scoped to Account → Cloudflare Pages → Edit.
- *Account not found*: the `CLOUDFLARE_ACCOUNT_ID` secret is missing or wrong.
- *Project not found*: the `CLOUDFLARE_PAGES_PROJECT` variable is unset or does not match an existing Pages project. Create the project in the Cloudflare dashboard first.

### Post-Deploy Check Fails

**Symptom**: The "Verify deployment" step reports a non-`200` status or "not the app's HTML"

**Check**: Open the deployment URL printed in the step. A Cloudflare error page means the deployment did not finish; re-run the workflow. A `200` without the bootstrap means `build/` did not contain the app, so check the Build step's output.

## Testing Locally

Local development needs no configuration: `pnpm install && pnpm run dev` reads from the default hosts.

To test data changes before petrodb publishes them, point both hosts at the homelab `dev-petrodb.ocortez.com` in a `.env` file (see `.env.example`), then restart the dev server. The `.env` file is git-ignored and doesn't affect the deployment.

## After Deploying

1. Monitor the GitHub Actions workflow run
2. Visit the deployed site (`petroviz.pages.dev` for `main`, `dev.petroviz.pages.dev` for `dev`)
3. Verify data loads correctly

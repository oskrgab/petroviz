# Deployment Guide

This guide explains how Volve Explorer is deployed to GitHub Pages, and how it guards against a source that has moved or broken.

## Where the Data Comes From

The site reads the Volve **Dataset**'s parquet tables from the **Data host** (Hugging Face) and its schema from the **Schema host** (the petrodb site). The defaults are in `src/lib/config/sources.js`, which is the one place they are defined; the app and the data-source check both resolve them from there. The README's [Configuration](README.md#configuration) section lists the URLs; [petrodb ADR-0005](https://github.com/oskrgab/petrodb/blob/main/docs/adr/0005-host-parquet-on-huggingface.md) explains why the tables moved off the petrodb site.

## No Repository Variables

There are **no GitHub repository variables to set**. The deploy builds with the defaults above.

Every `PUBLIC_*` variable is still an optional override, inlined at build time. If you ever need a deployed build to use another host, set the override in a **job-level** `env:` block in `.github/workflows/deploy.yml`. Setting it only on the Build step would leave the data-source check testing the defaults while the site ships something else:

```yaml
jobs:
  build:
    env:
      PUBLIC_DATA_BASE_URL: https://example.com/data
```

The full list of overrides is in `.env.example` and the README.

## How It Works

### During Deployment

When you push to the `main` branch (or run the workflow by hand):

1. GitHub Actions runs `.github/workflows/deploy.yml`
2. The data-source check (`pnpm check:sources`) fetches every source. If any fails, the deploy stops here.
3. `pnpm install` and `pnpm run build` produce the static site. Vite inlines the resolved URLs into it.
4. The site is uploaded and deployed to GitHub Pages.

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

## Testing Locally

Local development needs no configuration: `pnpm install && pnpm run dev` reads from the default hosts.

To test data changes before petrodb publishes them, point both hosts at the homelab `dev-petrodb.ocortez.com` in a `.env` file (see `.env.example`), then restart the dev server. The `.env` file is git-ignored and doesn't affect the deployment.

## After Deploying

1. Monitor the GitHub Actions workflow run
2. Visit the deployed site
3. Verify data loads correctly

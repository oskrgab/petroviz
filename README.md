# Volve Explorer

A high-performance static dashboard for exploring the Volve dataset production information. Built with SvelteKit and DuckDB-WASM for client-side data analysis.

## Features

- **Interactive Data Exploration**: Visualize oil, water, and gas production data
- **Client-Side Processing**: DuckDB-WASM enables powerful SQL queries in the browser
- **Static Deployment**: Fully static site deployed to Cloudflare Pages
- **Configurable Data Sources**: Environment-based configuration for flexibility

## Quick Start

### Local Development

1. **Clone and install dependencies**

   ```bash
   git clone https://github.com/oskrgab/petroviz.git
   cd petroviz
   pnpm install
   ```

2. **Configure environment variables**

   Optional. With no `.env` the app reads from where petrodb publishes the data.
   Copy `.env.example` to `.env` only to override a host or path.

3. **Run development server**

   ```bash
   pnpm run dev
   ```

4. **Open browser**
   Navigate to `http://localhost:5173`

### Build for Production

```bash
pnpm run build
pnpm run preview  # Test production build locally
```

## Configuration

### Where the data comes from

petroviz reads the Volve **Dataset** straight from where **petrodb** publishes it, using two hosts:

- **Data host** (Hugging Face): the parquet tables, at `https://huggingface.co/datasets/sumpalabs/petrodb/resolve/main/volve/*.parquet`. It supports byte-range reads, so DuckDB can fetch only the parts of a table a query needs.
- **Schema host** (the petrodb site): the schema, at `https://petrodb.ocortez.com/volve/schema.json`.

The petrodb site doesn't serve parquet, because Cloudflare Pages only answers byte-range requests reliably from its edge cache. [petrodb ADR-0005](https://github.com/oskrgab/petrodb/blob/main/docs/adr/0005-host-parquet-on-huggingface.md) explains why the tables moved to Hugging Face.

These URLs are defined once, in `src/lib/config/sources.js`. The app and the data-source check both read them from there.

### Environment Variables

Every variable is an optional override. It's inlined at build time, and a missing or empty value falls back to the default.

| Variable                            | Description                          | Default                                                          |
| ----------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `PUBLIC_DATA_BASE_URL`              | Data host                            | `https://huggingface.co/datasets/sumpalabs/petrodb/resolve/main` |
| `PUBLIC_SCHEMA_BASE_URL`            | Schema host                          | `https://petrodb.ocortez.com`                                    |
| `PUBLIC_WELLS_PARQUET`              | Wells table, on the Data host        | `volve/wells.parquet`                                            |
| `PUBLIC_DAILY_PRODUCTION_PARQUET`   | Daily production, on the Data host   | `volve/daily_production.parquet`                                 |
| `PUBLIC_MONTHLY_PRODUCTION_PARQUET` | Monthly production, on the Data host | `volve/monthly_production.parquet`                               |
| `PUBLIC_SCHEMA_JSON`                | Schema, on the Schema host           | `volve/schema.json`                                              |

A path can also be an absolute URL, which replaces its host. `.env.example` shows how to point local dev at the homelab `dev-petrodb.ocortez.com`.

### Deployment

Pushing to `main` deploys production to Cloudflare Pages and pushing to `dev` deploys a preview, both with the defaults above. The deploy needs two repository secrets and one variable (listed in the deployment guide). Before building, the deploy runs the data-source check (`pnpm check:sources`), which fetches every source and fails the deploy if one is broken. `.github/workflows/check-sources.yml` runs the same check every Monday and can be started by hand from the Actions tab. See [DEPLOYMENT_SETUP.md](DEPLOYMENT_SETUP.md).

## Project Structure

```
petroviz/
├── src/
│   ├── lib/
│   │   ├── config/          # Centralized configuration
│   │   ├── data/            # DuckDB queries, schema handling
│   │   ├── components/      # Reusable Svelte components
│   │   └── charts/          # Visualization components
│   ├── routes/              # SvelteKit pages
│   └── app.html             # HTML template
├── static/                  # Static assets
├── .env.example             # Environment template
└── .github/workflows/       # CI/CD workflows
```

## Tech Stack

- **Frontend**: SvelteKit 5 (static adapter)
- **Data Processing**: DuckDB-WASM
- **Visualizations**: Unovis
- **Deployment**: Cloudflare Pages
- **Package Manager**: pnpm

## Dataset

The data is the Volve Dataset published by petrodb (<https://petrodb.ocortez.com>), which provides:

- Well metadata
- Daily and monthly production data
- Schema definitions

## Debugging & Troubleshooting

### Check Configuration in Browser Console

The app exposes debugging functions to the browser console (F12 or Cmd+Option+I):

```javascript
// Log the Data host, the Schema host and every resolved source URL
window.volveConfig();

// Get the same configuration as a JavaScript object
window.volveConfigSummary();
```

### Check the Sources

```bash
pnpm check:sources
```

It fetches every source and prints one PASS/FAIL line each, with the reason for any failure, such as an HTML page served where a parquet file should be.

### Common Issues

**An override has no effect?**

1. Overrides are inlined at build time: restart `pnpm run dev` or rebuild after changing `.env`
2. Check the resolved URLs with `window.volveConfig()`

**Data not loading?**

1. Run `pnpm check:sources` to see which source fails and why
2. Check the browser console with `window.volveConfig()`
3. Confirm the hosts allow CORS and byte-range requests

# Volve Explorer

A high-performance static dashboard for exploring the Volve dataset production information. Built with SvelteKit and DuckDB-WASM for client-side data analysis.

## Features

- **Interactive Data Exploration**: Visualize oil, water, and gas production data
- **Client-Side Processing**: DuckDB-WASM enables powerful SQL queries in the browser
- **Static Deployment**: Fully static site deployed to GitHub Pages
- **Configurable Data Sources**: Environment-based configuration for flexibility

## Quick Start

### Local Development

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/oscarcortez/volve-explorer.git
   cd volve-explorer
   pnpm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env if needed - defaults should work
   ```

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

### Environment Variables

The app uses environment variables to configure data sources. These can be set in:
- `.env` file for local development
- GitHub Actions repository variables for production deployment

**Required Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `PUBLIC_DATA_BASE_URL` | Base URL for data files | `https://volve-db.ocortez.com` |
| `PUBLIC_WELLS_PARQUET` | Wells parquet file path | `wells.parquet` |
| `PUBLIC_DAILY_PRODUCTION_PARQUET` | Daily production file | `daily_production.parquet` |
| `PUBLIC_MONTHLY_PRODUCTION_PARQUET` | Monthly production file | `monthly_production.parquet` |
| `PUBLIC_SCHEMA_JSON` | Schema definition file | `schema.json` |

**Note:** Parquet variables can be:
- Simple filenames: `wells.parquet`
- Relative paths: `data/wells.parquet`
- Absolute URLs: `https://other-domain.com/wells.parquet`

### GitHub Actions Setup

For production deployment, set repository variables in GitHub:

1. Navigate to: **Repository Settings → Secrets and variables → Actions → Variables tab**
2. Click **"New repository variable"**
3. Add each variable from the table above

The deployment workflow (`.github/workflows/deploy.yml`) will automatically use these during build.

## Project Structure

```
volve-explorer/
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
- **Deployment**: GitHub Pages
- **Package Manager**: pnpm

## Data Source

This application consumes data from the Volve database, which provides:
- Well metadata
- Daily and monthly production data
- Schema definitions

Default data URL: `https://volve-db.ocortez.com`

## Debugging & Troubleshooting

### Check Configuration in Browser Console

The app exposes debugging functions to the browser console (F12 or Cmd+Option+I):

```javascript
// View complete configuration with status
window.volveConfig()

// Get configuration as JavaScript object
window.volveConfigSummary()
```

### Configuration Warnings

The app automatically warns in the console when using default values:

- **Orange warnings** indicate missing environment variables
- **Info messages** show where to configure them (.env or GitHub Actions)
- **Grouped output** summarizes all missing variables on startup

This helps catch configuration issues during development and deployment.

### Common Issues

**Environment variables not loading?**
1. Ensure `.env` file exists in project root (copy from `.env.example`)
2. Restart dev server after changing `.env`
3. Check console for warnings about missing variables

**Data not loading in production?**
1. Verify GitHub Actions repository variables are set
2. Check browser console with `window.volveConfig()`
3. Confirm URLs are accessible (check CORS settings)

## License

MIT

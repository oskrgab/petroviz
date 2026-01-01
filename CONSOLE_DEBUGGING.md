# Console Debugging Guide

This document shows the console warnings and debugging tools available in Volve Explorer.

## Automatic Warnings on Startup

When environment variables are missing, you'll see warnings automatically when the app loads:

### Example: All Variables Using Defaults

```
⚙️ Config: Using default value for PUBLIC_DATA_BASE_URL (Base URL for data files)
   Default: https://volve-db.ocortez.com
   Set this variable in .env (local) or GitHub Actions (production)

⚙️ Config: Using default value for PUBLIC_WELLS_PARQUET (Wells parquet file path)
   Default: wells.parquet
   Set this variable in .env (local) or GitHub Actions (production)

⚙️ Config: Using default value for PUBLIC_DAILY_PRODUCTION_PARQUET (Daily production parquet file path)
   Default: daily_production.parquet
   Set this variable in .env (local) or GitHub Actions (production)

⚙️ Config: Using default value for PUBLIC_MONTHLY_PRODUCTION_PARQUET (Monthly production parquet file path)
   Default: monthly_production.parquet
   Set this variable in .env (local) or GitHub Actions (production)

⚙️ Config: Using default value for PUBLIC_SCHEMA_JSON (Schema JSON file path)
   Default: schema.json
   Set this variable in .env (local) or GitHub Actions (production)

⚙️ Volve Explorer Configuration
  Using default values for 5 environment variable(s):
    - PUBLIC_DATA_BASE_URL
    - PUBLIC_WELLS_PARQUET
    - PUBLIC_DAILY_PRODUCTION_PARQUET
    - PUBLIC_MONTHLY_PRODUCTION_PARQUET
    - PUBLIC_SCHEMA_JSON

  To configure:
    Local dev: Create .env file (see .env.example)
    Production: Set GitHub Actions repository variables
```

### Example: Partially Configured

If you have `.env` with only `PUBLIC_DATA_BASE_URL` set:

```
⚙️ Config: Using default value for PUBLIC_WELLS_PARQUET (Wells parquet file path)
   Default: wells.parquet
   Set this variable in .env (local) or GitHub Actions (production)

⚙️ Config: Using default value for PUBLIC_DAILY_PRODUCTION_PARQUET (Daily production parquet file path)
   Default: daily_production.parquet
   Set this variable in .env (local) or GitHub Actions (production)

⚙️ Config: Using default value for PUBLIC_MONTHLY_PRODUCTION_PARQUET (Monthly production parquet file path)
   Default: monthly_production.parquet
   Set this variable in .env (local) or GitHub Actions (production)

⚙️ Config: Using default value for PUBLIC_SCHEMA_JSON (Schema JSON file path)
   Default: schema.json
   Set this variable in .env (local) or GitHub Actions (production)

⚙️ Volve Explorer Configuration
  Using default values for 4 environment variable(s):
    - PUBLIC_WELLS_PARQUET
    - PUBLIC_DAILY_PRODUCTION_PARQUET
    - PUBLIC_MONTHLY_PRODUCTION_PARQUET
    - PUBLIC_SCHEMA_JSON

  To configure:
    Local dev: Create .env file (see .env.example)
    Production: Set GitHub Actions repository variables
```

### Example: Fully Configured

When all variables are set, **no warnings appear**. The app silently uses your configuration.

---

## Interactive Debugging Functions

The app exposes two global functions for inspecting configuration at runtime.

### `window.volveConfig()`

Display complete configuration status in a formatted console output.

**Usage:**
```javascript
window.volveConfig()
```

**Output Example (All Variables Configured):**
```
🔧 Volve Explorer Configuration
  📊 Environment Variables Status
    ✅ Configured: [
      'PUBLIC_DATA_BASE_URL',
      'PUBLIC_WELLS_PARQUET',
      'PUBLIC_DAILY_PRODUCTION_PARQUET',
      'PUBLIC_MONTHLY_PRODUCTION_PARQUET',
      'PUBLIC_SCHEMA_JSON'
    ]
  🌐 Data Sources
    Base URL: https://volve-db.ocortez.com
    Wells: https://volve-db.ocortez.com/wells.parquet
    Daily Production: https://volve-db.ocortez.com/daily_production.parquet
    Monthly Production: https://volve-db.ocortez.com/monthly_production.parquet
    Schema: https://volve-db.ocortez.com/schema.json
```

**Output Example (Some Variables Using Defaults):**
```
🔧 Volve Explorer Configuration
  📊 Environment Variables Status
    ✅ Configured: ['PUBLIC_DATA_BASE_URL']
    ⚠️  Using Defaults: [
      'PUBLIC_WELLS_PARQUET',
      'PUBLIC_DAILY_PRODUCTION_PARQUET',
      'PUBLIC_MONTHLY_PRODUCTION_PARQUET',
      'PUBLIC_SCHEMA_JSON'
    ]
  🌐 Data Sources
    Base URL: https://custom-domain.com
    Wells: https://custom-domain.com/wells.parquet
    Daily Production: https://custom-domain.com/daily_production.parquet
    Monthly Production: https://custom-domain.com/monthly_production.parquet
    Schema: https://custom-domain.com/schema.json
```

---

### `window.volveConfigSummary()`

Get configuration as a JavaScript object for programmatic inspection.

**Usage:**
```javascript
const config = window.volveConfigSummary()
console.log(config)
```

**Output:**
```javascript
{
  baseUrl: "https://volve-db.ocortez.com",
  parquetFiles: {
    wells: "wells.parquet",
    dailyProduction: "daily_production.parquet",
    monthlyProduction: "monthly_production.parquet"
  },
  schemaFile: "schema.json",
  urls: {
    wells: "https://volve-db.ocortez.com/wells.parquet",
    dailyProduction: "https://volve-db.ocortez.com/daily_production.parquet",
    monthlyProduction: "https://volve-db.ocortez.com/monthly_production.parquet",
    schema: "https://volve-db.ocortez.com/schema.json"
  },
  envStatus: {
    configured: [
      "PUBLIC_DATA_BASE_URL",
      "PUBLIC_WELLS_PARQUET",
      "PUBLIC_DAILY_PRODUCTION_PARQUET",
      "PUBLIC_MONTHLY_PRODUCTION_PARQUET",
      "PUBLIC_SCHEMA_JSON"
    ],
    usingDefaults: []
  }
}
```

---

## Use Cases

### 1. Verify Configuration After Deploy

After deploying to production:

1. Open the deployed site
2. Press F12 (or Cmd+Option+I on Mac) to open console
3. Run `window.volveConfig()`
4. Verify all URLs point to correct locations

### 2. Debug Data Loading Issues

If data isn't loading:

1. Open console and check for automatic warnings
2. Run `window.volveConfigSummary()`
3. Copy URLs from `urls` object
4. Test URLs directly in browser to verify they're accessible

### 3. Test URL Construction

To verify how different path formats are handled:

```javascript
const config = window.volveConfigSummary()

// Check if using relative or absolute paths
console.log(config.urls.wells)

// Might show:
// https://volve-db.ocortez.com/wells.parquet  (relative)
// https://other-cdn.com/data/wells.parquet    (absolute)
// https://volve-db.ocortez.com/v2/wells.parquet (relative with path)
```

### 4. Verify GitHub Actions Variables

After setting repository variables:

1. Trigger a new deployment
2. Visit the deployed site
3. Open console
4. Run `window.volveConfig()`
5. Check ✅ Configured list includes all variables

---

## Tips

- **Warnings only show in browser** - Server-side rendering won't show these warnings
- **Warnings appear once per page load** - Refresh to see them again
- **Debug functions are always available** - Even in production builds
- **No performance impact** - Warnings and debug functions have negligible overhead

---

## Silencing Warnings

If you're intentionally using defaults and want to silence warnings:

**Option 1:** Set all environment variables explicitly (even if using default values)

```env
# .env
PUBLIC_DATA_BASE_URL=https://volve-db.ocortez.com
PUBLIC_WELLS_PARQUET=wells.parquet
PUBLIC_DAILY_PRODUCTION_PARQUET=daily_production.parquet
PUBLIC_MONTHLY_PRODUCTION_PARQUET=monthly_production.parquet
PUBLIC_SCHEMA_JSON=schema.json
```

**Option 2:** Filter console warnings in browser DevTools

Most browsers allow filtering console output - you can hide messages containing "Config:" or "⚙️".

---

## Implementation Details

The warning system is implemented in `src/lib/config/data-sources.ts`:

- Warnings only appear in browser (not during SSR)
- Each missing variable gets an individual warning
- A summary groups all missing variables
- Debug functions are attached to `window` object in browser
- TypeScript errors are suppressed for `window` augmentation

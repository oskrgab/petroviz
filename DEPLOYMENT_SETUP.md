# GitHub Actions Variables Setup Guide

This guide explains how to configure GitHub Actions repository variables for deploying Volve Explorer.

## Why Use GitHub Actions Variables?

Instead of hardcoding configuration in the workflow file, repository variables provide:
- **Flexibility**: Change data URLs without modifying code
- **Security**: Separate configuration from codebase
- **Convenience**: Update via GitHub UI without git commits

## Required Variables

You need to create **5 repository variables** in your GitHub repository:

### 1. PUBLIC_DATA_BASE_URL
- **Value**: `https://volve-db.ocortez.com`
- **Purpose**: Base URL where parquet files and schema are hosted

### 2. PUBLIC_WELLS_PARQUET
- **Value**: `wells.parquet`
- **Purpose**: Path to wells parquet file (relative to base URL)

### 3. PUBLIC_DAILY_PRODUCTION_PARQUET
- **Value**: `daily_production.parquet`
- **Purpose**: Path to daily production parquet file

### 4. PUBLIC_MONTHLY_PRODUCTION_PARQUET
- **Value**: `monthly_production.parquet`
- **Purpose**: Path to monthly production parquet file

### 5. PUBLIC_SCHEMA_JSON
- **Value**: `schema.json`
- **Purpose**: Path to schema JSON file

## Step-by-Step Setup

### 1. Navigate to Repository Settings

1. Go to your GitHub repository: `https://github.com/oscarcortez/volve-explorer`
2. Click on **Settings** tab (top navigation)

### 2. Access Actions Secrets and Variables

1. In the left sidebar, scroll down to **Secrets and variables**
2. Click **Actions**

### 3. Switch to Variables Tab

1. You'll see two tabs: "Secrets" and "Variables"
2. Click the **Variables** tab

### 4. Add Each Variable

For each of the 5 variables listed above:

1. Click **"New repository variable"** button (green button)
2. Enter the variable **Name** (e.g., `PUBLIC_DATA_BASE_URL`)
3. Enter the **Value** (e.g., `https://volve-db.ocortez.com`)
4. Click **"Add variable"**

### 5. Verify Variables

After adding all 5 variables, you should see them listed:

```
PUBLIC_DATA_BASE_URL              = https://volve-db.ocortez.com
PUBLIC_WELLS_PARQUET              = wells.parquet
PUBLIC_DAILY_PRODUCTION_PARQUET   = daily_production.parquet
PUBLIC_MONTHLY_PRODUCTION_PARQUET = monthly_production.parquet
PUBLIC_SCHEMA_JSON                = schema.json
```

## How It Works

### During Deployment

When you push to the `main` branch:

1. GitHub Actions workflow triggers (`.github/workflows/deploy.yml`)
2. The build step uses repository variables:
   ```yaml
   - name: Build
     env:
       PUBLIC_DATA_BASE_URL: ${{ vars.PUBLIC_DATA_BASE_URL }}
       PUBLIC_WELLS_PARQUET: ${{ vars.PUBLIC_WELLS_PARQUET }}
       # ... etc
     run: pnpm run build
   ```
3. These environment variables are available during the build
4. SvelteKit's Vite reads them and includes them in the static build
5. The app uses them at runtime via `src/lib/config/data-sources.ts`

### Code Flow

```
GitHub Repo Variables
    ↓
GitHub Actions Workflow
    ↓
Build Environment Variables
    ↓
Vite/SvelteKit Build Process
    ↓
src/lib/config/data-sources.ts
    ↓
Application Runtime
```

## Changing Data Sources

To point to a different data source:

1. Go to **Settings → Actions → Variables**
2. Find `PUBLIC_DATA_BASE_URL`
3. Click **Edit** (pencil icon)
4. Change value to new URL
5. Click **Update variable**
6. Re-run the deployment workflow or push a new commit

No code changes needed!

## Advanced Configuration

### Using Different Paths

If your parquet files are in a subdirectory:
```
PUBLIC_WELLS_PARQUET = data/v2/wells.parquet
```

### Using Absolute URLs

To mix data sources from different domains:
```
PUBLIC_DATA_BASE_URL = https://volve-db.ocortez.com
PUBLIC_WELLS_PARQUET = https://other-cdn.com/wells.parquet
PUBLIC_DAILY_PRODUCTION_PARQUET = daily_production.parquet
```

The config module handles both relative and absolute URLs automatically.

## Troubleshooting

### Checking Configuration in Browser

The app includes built-in debugging tools accessible from the browser console:

**Open browser console** (F12 or Cmd+Option+I) and run:

```javascript
// View full configuration
window.volveConfig()

// Get configuration object
window.volveConfigSummary()
```

**Console Output Example:**
```
🔧 Volve Explorer Configuration
  📊 Environment Variables Status
    ✅ Configured: ['PUBLIC_DATA_BASE_URL']
    ⚠️  Using Defaults: ['PUBLIC_WELLS_PARQUET', 'PUBLIC_DAILY_PRODUCTION_PARQUET', ...]
  🌐 Data Sources
    Base URL: https://volve-db.ocortez.com
    Wells: https://volve-db.ocortez.com/wells.parquet
    ...
```

### Configuration Warnings

When environment variables are missing, you'll see warnings in the browser console:

```
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

### Variables Not Working

**Symptom**: Build succeeds but app fails to load data

**Check**:
1. Open browser console and run `window.volveConfig()` to see current configuration
2. Verify variables are spelled exactly as shown (case-sensitive)
3. Ensure variables are in the **Variables** tab, not Secrets tab
4. Check for typos in URLs (console will show actual URLs being used)

### Build Fails

**Symptom**: GitHub Actions workflow fails during build

**Check**:
1. All 5 variables are created in GitHub
2. Workflow file references `${{ vars.VARIABLE_NAME }}` correctly
3. Check workflow run logs for specific error messages
4. Verify variable names match exactly (including `PUBLIC_` prefix)

## Testing Locally

Local development doesn't use GitHub variables. Instead:

1. Copy `.env.example` to `.env`
2. Edit `.env` with your local configuration
3. Run `pnpm run dev`

The `.env` file is git-ignored and won't affect production deployment.

## Next Steps

After setting up variables:

1. ✅ Push a commit to trigger deployment
2. ✅ Monitor GitHub Actions workflow run
3. ✅ Visit your deployed site at `https://volve-explorer.ocortez.com`
4. ✅ Verify data loads correctly

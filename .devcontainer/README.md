# Development Container Configuration

This directory contains the configuration for a reproducible development environment using VS Code Dev Containers or GitHub Codespaces.

## What's Included

### Base Environment

- **Node.js LTS** (v22) - Latest long-term support version
- **pnpm** - Fast, disk space efficient package manager
- **Git** - Version control
- **GitHub CLI** - GitHub command-line tool
- **Build tools** - For native dependencies (Python3, build-essential)

### VS Code Extensions

- **Svelte for VS Code** - Svelte language support, syntax highlighting, and IntelliSense
- **ESLint** - JavaScript/TypeScript linting
- **Prettier** - Code formatting
- **Tailwind CSS IntelliSense** - Tailwind CSS support (if used)
- **Playwright** - E2E testing support
- **GitHub Copilot** - AI pair programming (requires subscription)

### Configured Ports

- **5173** - SvelteKit development server (default Vite port)
- **4173** - SvelteKit preview server

### Editor Settings

- Auto-format on save using Prettier
- ESLint auto-fix on save
- Svelte-specific formatting configuration
- TypeScript plugin enabled for Svelte files

## Usage

### Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) installed and running
- [VS Code](https://code.visualstudio.com/) with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Getting Started

1. **Open in Dev Container**
   - Open this folder in VS Code
   - When prompted, click "Reopen in Container"
   - Or use Command Palette (F1) → "Dev Containers: Reopen in Container"

2. **First Build**
   - The container will build automatically (may take a few minutes)
   - Dependencies will be installed via `npm install` post-create command

3. **Start Development**
   ```bash
   npm run dev
   ```
   The dev server will be available at `http://localhost:5173`

### With GitHub Codespaces

Click the "Code" button on the GitHub repository and select "Create codespace on main" to launch a cloud-based development environment with this configuration.

## Package Manager

This setup includes **pnpm** as an alternative to npm for faster installs and better disk space efficiency. You can use either:

```bash
npm install          # or: pnpm install
npm run dev          # or: pnpm dev
npm run build        # or: pnpm build
```

## Customization

### Adding VS Code Extensions

Edit `devcontainer.json` and add extension IDs to the `extensions` array.

### Changing Node.js Version

Modify the `version` in the `features` section of `devcontainer.json`.

### Additional Tools

Add installation commands to the `Dockerfile` or use the `features` section in `devcontainer.json`.

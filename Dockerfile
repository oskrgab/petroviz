# Vite development server for volve-explorer SvelteKit app
FROM node:22-slim

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create user with host UID/GID to avoid permission issues
ARG USER_ID=1001
ARG GROUP_ID=1001
RUN groupadd -g ${GROUP_ID} appuser && \
    useradd -m -u ${USER_ID} -g appuser appuser

WORKDIR /app

# Switch to non-root user
USER appuser

# Install dependencies at startup, then run dev server
CMD ["sh", "-c", "pnpm install && pnpm run dev --host 0.0.0.0"]

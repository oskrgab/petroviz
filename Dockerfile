# Vite development server for volve-explorer SvelteKit app
FROM node:22-slim

# Pin pnpm to the version this project was developed against (see node_modules/.modules.yaml).
# COREPACK_HOME must be a shared, readable path: the default is the *building* user's home,
# which the runtime user cannot read, sending corepack back to the registry at startup.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && \
    mkdir -p ${COREPACK_HOME} && \
    corepack prepare pnpm@11.5.1 --activate && \
    chmod -R a+rX ${COREPACK_HOME}

# Run as the host user so the bind-mounted /app stays writable.
# node:22-slim already ships a `node` user at 1000:1000, so creating one at those
# ids fails; reuse whatever the image already has and only create what is missing.
ARG USER_ID=1000
ARG GROUP_ID=1000
RUN if ! getent group ${GROUP_ID} >/dev/null; then groupadd -g ${GROUP_ID} appuser; fi && \
    if ! getent passwd ${USER_ID} >/dev/null; then useradd -m -u ${USER_ID} -g ${GROUP_ID} appuser; fi

WORKDIR /app

USER ${USER_ID}:${GROUP_ID}

# Install dependencies at startup, then run dev server
CMD ["sh", "-c", "pnpm install && pnpm run dev --host 0.0.0.0"]

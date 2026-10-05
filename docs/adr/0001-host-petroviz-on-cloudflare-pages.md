# Host petroviz on Cloudflare Pages

petroviz is deployed to Cloudflare Pages from GitHub Actions, not to GitHub Pages. A push to `main` deploys production (`petroviz.pages.dev`, with `petroviz.ocortez.com` attached as its custom domain), and a push to `dev` deploys a preview at `dev.petroviz.pages.dev`.

## Why

- **One DNS cutover instead of two.** The app moves from `volve-explorer.ocortez.com` to `petroviz.ocortez.com`. Staying on GitHub Pages would mean pointing the new name at GitHub now and moving it to Cloudflare later; going straight to Cloudflare Pages does it once.
- **Cloudflare handles the certificate for a proxied domain.** The domain is on Cloudflare; GitHub Pages' certificate provisioning does not sit well behind Cloudflare's proxy.
- **Branch previews.** Every branch gets its own URL, which GitHub Pages does not offer.
- **Consistency with petrodb.** petrodb's site is already on Cloudflare Pages, so both projects deploy the same way.

## Alternatives considered

- **Stay on GitHub Pages.** Works today, but leaves the cutover split in two and has no previews.
- **Change the domain now and move hosting later.** Same two cutovers, in the other order.

## What does not apply

petrodb's reason for using Cloudflare Pages was GitHub Pages' size and bandwidth caps. That reason does **not** apply to petroviz: it ships a small static build, and the large parquet tables are served from the Data host, not from the site. This decision rests on the reasons above.

## Consequences

- Deploys need the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets and the `CLOUDFLARE_PAGES_PROJECT` variable. The token is scoped to Account → Cloudflare Pages → Edit and is used by petroviz alone.
- The Pages project must exist before the first deploy; Wrangler cannot create it from CI.
- Previews read the same production data sources as `main`.

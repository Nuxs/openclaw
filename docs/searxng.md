---
summary: "Deploy and connect a self-hosted SearxNG instance for web_search"
read_when:
  - You want to use SearxNG with web_search
  - You need a self-hosted, open-source search backend
  - You want a one-command deployment on Ubuntu

title: "SearxNG"
---

# SearxNG

SearxNG is an open-source metasearch engine you can self-host and use as the
`web_search` provider.

## Quick deployment on Ubuntu 22.04

Copy the repo `scripts/searxng/` directory to your server, then run:

```bash
cd scripts/searxng
chmod +x deploy-searxng.sh
SEARXNG_BASE_URL="http://<public-host-or-ip>:8080" \
SEARXNG_API_KEY="<your-token>" \
./deploy-searxng.sh
```

This script will:

- Install Docker + Compose (if missing)
- Generate a `settings.yml` with a unique `secret_key`
- Start SearxNG behind a minimal token-guarded reverse proxy
- Print the OpenClaw config snippet to paste

If you omit `SEARXNG_API_KEY`, the script generates one and prints it.

## OpenClaw configuration

Set the provider and base URL in `tools.web.search`:

```json5
{
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "searxng",
        searxng: {
          baseUrl: "http://<public-host-or-ip>:8080",
          apiKey: "<your-token>", // optional if proxy is not enforcing it
        },
      },
    },
  },
}
```

## Troubleshooting

- `403` on `/search?format=json`: ensure `search.formats` in `settings.yml`
  includes `json` (SearxNG rejects JSON output otherwise).
- `public_instance: true` forces the limiter and link token features. If you
  are using the nginx proxy + `apikey` gate, keep `public_instance: false` and
  set `server.limiter: false` unless you also configure Valkey.

## Notes

- SearxNG itself does not require an API key; the included proxy enforces a
  simple token using the `apikey` query parameter.
- Keep the deployment private where possible. If you need public access, enable
  HTTPS with a reverse proxy and firewall rules.

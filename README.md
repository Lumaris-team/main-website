# Main website

The main website serves the public site and the client dashboard pages.

## Account dashboard routing

Dashboard pages are available below:

```text
/account/{username}/
/account/{username}/pages/{page}
```

The main Worker proxies dashboard API requests to:

```text
https://client-worker.{username}-cloudflare-account.workers.dev/api/...
```

The dashboard frontend is served by this repository; `client-worker` is used
only as the backend. The username is restricted to letters, numbers, `_`, and
`-` before it is used in the backend hostname.

Turnstile is global to this Worker and is used only on `/sign-in`. The public
site key is configured as `TURNSTILE_SITE_KEY` in `wrangler.jsonc`; configure
the private `TURNSTILE_SECRET_KEY` as a `main-website` Worker secret.

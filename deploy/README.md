# Docker production deployment

Runly ships three images: the Next.js web app, the runtime worker, and a TLS
nginx proxy. Supabase, Stripe, GitHub, and OpenAI remain external services.
The worker orchestrates OpenAI-hosted project sandboxes; it does not run user
projects on the Docker host.

## Configure the server

1. Install Docker Engine and Docker Compose v2.20+ on a Linux server.
2. Copy `deploy/docker.env.example` to the ignored `.env.prod` and supply the
   real configuration. Keep this file private (`chmod 600 .env.prod`).
3. Configure DNS for the application, runtime, and `*.RUNLY_PREVIEW_DOMAIN`.
   The preview domain must use a separate registrable site from the app, such
   as `app.example.com` and `*.preview.example.net`.
4. Provision TLS certificates and create the ignored `deploy/tls/` directory:
   - `app.crt`: full certificate chain covering the app and runtime hostnames.
   - `app.key`: its private key.
   - `preview.crt`: full chain covering `*.RUNLY_PREVIEW_DOMAIN`.
   - `preview.key`: its private key.
     Wildcard certificates require DNS validation. Renew certificates with your
     certificate manager and reload the proxy afterward. The proxy runs as UID/GID
     101; on Linux give that group read access to the keys, e.g. `chown root:101
deploy/tls/*.key` and `chmod 640 deploy/tls/*.key`. Protect the directory too.
5. Apply and review every Supabase migration using the existing linked-project
   migration workflow in the root README. Configure Supabase Auth's HTTPS site
   URL and callback allowlist, production email, and GitHub OAuth as needed.
6. Configure Stripe webhooks and plans if selling subscriptions. An operator
   must enable `runtime_policy`, review provider cost limits, and provision a
   valid subscription entitlement before real AI tasks are admitted.

Do not copy development mock settings into `.env.prod`. The worker refuses mock
mode in production. Normal deployment does not reset or migrate the database.

## Build and start

From the repository root:

```sh
docker compose --env-file .env.prod config --quiet
docker compose --env-file .env.prod up -d --build --force-recreate --wait
docker compose --env-file .env.prod ps
```

Only ports 80 and 443 are published. Keep any old host services off these ports.
The web app owns a private network namespace shared by the worker and proxy;
their listeners stay on loopback. This preserves the existing HMAC-protected
internal file/Git transport without exposing it on a Docker network. Recreate
all three services together when replacing the web container. Do not scale a
worker ID to multiple replicas; add separately configured gateway shards instead.

Both application containers run as a non-root user with a read-only filesystem,
dropped Linux capabilities, process/resource limits, and bounded logs. A named
volume stores Next.js image/cache data. Project files, messages, and jobs remain
in Supabase. No Docker socket, host workspace, or environment file is mounted
into the web/worker containers.

Final images use Alpine with security package updates; web/worker images remove
global package-manager tooling. When rebuilding a release to pick up new base
and system-package fixes, run `docker compose --env-file .env.prod build --pull
--no-cache` before the start command. The Docker CI job scans all three final
images for high/critical vulnerabilities.

The build context is an allowlist. Environment files, certificates, Git history,
mock code, local dependencies, and generated output stay outside the images.
Only the browser-safe Supabase values and public runtime/preview origins are
build arguments. Changing those values requires rebuilding the web image;
server secrets are injected when containers start. Worker environment variables
exclude Stripe and GitHub private credentials. Docker administrators can inspect
container environment values, so restrict access to the Docker daemon.

Do not print `docker compose config` without `--quiet` on a real environment:
the expanded configuration contains server credentials.

## Operations

```sh
docker compose --env-file .env.prod logs --tail=100 web worker proxy
docker compose --env-file .env.prod exec -T proxy nginx -c /tmp/nginx.conf -s reload
docker compose --env-file .env.prod down
```

`down` preserves the cache volume and all Supabase data. The worker's healthcheck
requires a valid database gateway lease; if unhealthy, inspect configuration,
migrations, and logs before admitting customers. Docker healthchecks report
failure; they do not themselves restart an unhealthy process. Monitor health
and arrange restart/alerts through your deployment supervisor.

When Stripe billing is enabled, schedule the existing reconciliation endpoint
at least once per minute. One Linux cron command can execute inside the web
container without placing a secret in the command line:

```sh
docker compose --env-file .env.prod exec -T web node -e 'fetch("http://127.0.0.1:3000/api/internal/stripe-reconcile", {headers:{Authorization:"Bearer "+process.env.RUNLY_BILLING_RECONCILIATION_SECRET}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'
```

Use absolute paths for the Compose file and environment file in cron, and alert
on failed calls. Provider turn recovery is available inside the worker:

```sh
docker compose --env-file .env.prod exec -T worker node runtime/reconcile.mjs JOB_UUID
```

The live provider, preview, GitHub, billing, and recovery acceptance checks in
`runtime/README.md` still apply. Container packaging does not establish that
those external integrations are production verified.

## Build images independently

```sh
docker build --target worker -t runly-worker:local .
docker build --target proxy -t runly-proxy:local .
```

Build the web image through Compose so its public configuration and CSP origins
match the production domains. Pin released image tags/digests in your deployment
system and retain the previous release for rollback.

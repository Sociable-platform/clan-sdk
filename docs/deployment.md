# Deployment

The Docker asset server that hosts the SDK, and how it is deployed. Back to the [README](../README.md).

## Docker asset server

The multi-stage Dockerfile builds from source with Node 22 (`npm ci` followed by
the canonical `npm run build`), then copies only the two generated bundles and
nginx configuration into `nginxinc/nginx-unprivileged:1.28-alpine`. The server runs
as the image's unprivileged user on port **8080**, matching Studio's service port.
The Node build runs on the builder's native CPU; the same JavaScript can be
packaged in either runtime architecture without QEMU. `.dockerignore` allows only
build inputs, excluding local `node_modules`, `dist`, `.git` and private env files.
No local bundle directory is required.

With `GITLAB_NPM_TOKEN` already set in your shell as described above:

```sh
docker build --progress=plain --secret id=gitlab_npm_token,env=GITLAB_NPM_TOKEN -t clan-sdk:ticket2 .
docker run --rm -d --name clan-sdk-ticket2-check -p 127.0.0.1:18080:8080 clan-sdk:ticket2
```

Or use Compose, which builds the `clan-sdk` image and serves it on
`127.0.0.1:18080`. Compose reads `GITLAB_NPM_TOKEN` from your shell or ignored
root `.env` and passes it only as a build secret:

```sh
docker compose build --no-cache sdk
docker compose up -d --no-deps --force-recreate sdk
node scripts/check-image.mjs http://127.0.0.1:18080
```

The credential is a [BuildKit secret](https://docs.docker.com/build/building/secrets/),
never a build argument or Dockerfile `ENV`. It is available only during `npm ci`.
The committed `.npmrc` keeps its literal `${GITLAB_NPM_TOKEN}` placeholder. The
runtime has no Node/npm, credentials or SDK source checkout.

Repeat the actual HTTP header checks (use `curl.exe` in Windows PowerShell):

```sh
VERSION=$(node -p "require('./package.json').version")
curl -I http://127.0.0.1:18080/v1/clan-sdk.js
curl -I "http://127.0.0.1:18080/$VERSION/clan-sdk.js"
curl -I http://127.0.0.1:18080/v1/clan-sdk.esm.js
curl -I "http://127.0.0.1:18080/$VERSION/clan-sdk.esm.js"
node scripts/check-image.mjs http://127.0.0.1:18080
docker stop clan-sdk-ticket2-check
```

In PowerShell, set the version with `$sdkVersion = node -p "require('./package.json').version"`
and use `$sdkVersion` in the exact-version URLs. `check-image.mjs` checks both HEAD
and GET headers, compares downloaded alias/version bytes for both files, checks
the package-version banners, and verifies missing/private paths return 404.
These checks use the actual nginx image; they do not contact Clan backends.

| Paths (current release) | Successful response headers |
| --- | --- |
| `/0.1.2/clan-sdk.js`, `/0.1.2/clan-sdk.esm.js` | `Content-Type: application/javascript`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=31536000, immutable` |
| `/v1/clan-sdk.js`, `/v1/clan-sdk.esm.js` | `Content-Type: application/javascript`, `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache` |

The exact version is read from `package.json` at build time. `/v1/` is the agreed
moving alias even for version `0.1.0`; each alias/version pair has identical bytes
inside one image. **Changed bundle bytes require a new exact release version.**
Do not rebuild different bytes under a previously released immutable path.

**Known gap:** the version in `package.json` is not raised on each release yet, so the
`/0.1.0/` path currently changes with every deploy while browsers may keep it for a
year. Until releases are versioned, games use `/v1/` only and the pinned path is not
documented to developers.

The `images` CI job follows the team's Docker 27/DinD + buildx TLS-context setup:
automatic on `develop`/`main`, manual on merge request pipelines. It publishes one
multi-platform image for `linux/amd64,linux/arm64` with the full commit SHA tag:
`$CI_REGISTRY_IMAGE/sdk:$CI_COMMIT_SHA`, resolving in this project to
`<registry>/clan-platform/clan-sdk/sdk:<sha>`. Login uses `CI_REGISTRY_USER`,
`CI_REGISTRY_PASSWORD` and `CI_REGISTRY`. It requires a Docker runner configured
for privileged DinD with the team's shared `/certs/client` TLS setup. The job
prints `docker buildx imagetools inspect` after pushing; publication and the
registry's two platform manifests must be checked in GitLab CI.

The `test` job runs `npm test` and then `npm run build`, which prints the gzip size of
each bundle (`dist/clan-sdk.js: ... bytes gzip (... KB; target <60 KB)`) and fails the
job when a bundle reaches 60 KB.

### Deploy

The bundle is served at `https://sdk.130-61-158-79.sslip.io` from the k3s server, as
its own Helm release (`clan-sdk`, chart in `deploy/helm/sdk`) in the `clan` namespace.
It is separate from the `clan` release of clan-backend: deploying the SDK needs no
change there. It reuses that release's registry pull secret (`gitlab-registry`) and
certificate issuer (`clan-letsencrypt`), so clan-backend must be installed first.

- **Every merge to `main` is deployed.** The pipeline on `main` runs `test`, `images`,
  then `deploy`, which runs `deploy/deploy.sh "$CI_COMMIT_SHA"`. `develop` only tests
  and builds the image. A release is an MR `develop` -> `main`.
- `deploy/deploy.sh <tag>` copies the chart to the server over SSH and runs
  `helm upgrade --install clan-sdk ... --set image.tag=<tag> --wait`. If the new pod is
  not ready within 5 minutes the deploy fails and the old pod keeps serving.
- The job needs the CI/CD variables `DEPLOY_SSH_KEY_B64` and `DEPLOY_SSH_KNOWN_HOSTS`
  (protected, the same two clan-backend uses), and `main` must be a protected branch.
- Check a deploy: `curl -I https://sdk.130-61-158-79.sslip.io/v1/clan-sdk.js` returns
  200 with `Access-Control-Allow-Origin: *` and `Cache-Control: no-cache`.
- Which build runs, and rolling back: GitLab -> Operate -> Environments ->
  `sdk-production`, where an older deploy can be run again.
- A new `@clan/ui` reaches games only after `npm update @clan/ui` here (it moves
  `package-lock.json`; the image installs exactly what the lock file says), a merge to
  `main`, and the deploy.

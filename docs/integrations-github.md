# GitHub App integration

The **TraceIQ GitHub App** is separate from "Sign in with GitHub". Sign-in only
identifies a person; the App is installed on a GitHub account or organization, on the
repositories the user picks, so TraceIQ can open setup pull requests later (phase 5).

Rules the code enforces:

- One installation per TraceIQ organization, and an installation belongs to one
  organization.
- TraceIQ **never writes to the default branch**. The client refuses it. Changes go on
  a branch such as `traceiq/setup` and a pull request the user reviews and merges.
- Permissions are minimal, and only on the repositories the user selects.

## 1. Create the GitHub App

GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App** (under your
organization, if TraceIQ Cloud or a company runs it):

| Field | Value |
| --- | --- |
| GitHub App name | `TraceIQ` (its slug becomes `GITHUB_APP_SLUG`) |
| Homepage URL | Your TraceIQ dashboard URL |
| Callback URL | `https://<your-api>/v1/integrations/github/callback` |
| Request user authorization (OAuth) during installation | **On** (required, see below) |
| Expire user authorization tokens | On |
| Setup URL | Leave empty (the callback URL is used when the option above is on) |
| Redirect on update | On |
| Webhook | Active, URL `https://<your-api>/v1/integrations/github/webhook`, with a random secret |
| Where can this app be installed | Any account (or only this account for a private install) |

**Repository permissions:** Contents **Read and write**, Pull requests **Read and write**,
Metadata **Read-only** (mandatory). Nothing else, no organization or account permissions.

**Subscribe to events:** none are required. `installation` and
`installation_repositories` are always delivered to GitHub Apps. TraceIQ uses them to
handle uninstall, suspend and repository access changes.

Then **Generate a private key** (a `.pem` file) and **Generate a new client secret**.

## 2. Configure the API

```bash
GITHUB_APP_ID=123456                 # "App ID" on the app page
GITHUB_APP_SLUG=traceiq              # from the app's public URL github.com/apps/<slug>
GITHUB_APP_CLIENT_ID=Iv23li...       # "Client ID"
GITHUB_APP_CLIENT_SECRET=...         # a client secret; also signs the install state
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
GITHUB_APP_WEBHOOK_SECRET=...        # the webhook secret you chose
```

`GITHUB_APP_PRIVATE_KEY` can be the PEM with `\n` escapes, or the whole `.pem` base64-encoded.
Never commit it.

Run the migration `0067_github_app.sql` with `npm run migrate -w @traceiq/api`. Owners
and admins then install the app from **Settings → Integrations** and pick each project's
repository (and app folder, for monorepos).

## Why "Request user authorization during installation" is required

After installing, GitHub redirects the browser with `installation_id`, and anyone can
edit that number. If TraceIQ trusted it, a person could attach another company's
installation (and its repositories) to their own TraceIQ organization. With the option
on, GitHub also sends a one-time `code`. TraceIQ trades it for a short-lived user token,
checks that this GitHub user can access the installation (`GET /user/installations`),
then revokes the token. The token is never stored.

As with Linear, the callback does not store anything. It forwards to the dashboard,
which finishes with the signed-in session, and the server requires that the person
finishing is the person who started (from the signed `state`). The dashboard also keeps
a copy of the state in `sessionStorage`, in case GitHub does not hand it back.

## API

All routes are under `/v1/integrations/github`. The organization is picked with
`?organizationId=` or `?projectId=`.

| Route | Who | What |
| --- | --- | --- |
| `GET /install` | owner/admin | `{ url, state, expiresAt }`: the app's installation URL with a signed state that lasts 10 minutes |
| `GET /callback` | GitHub redirect | Forwards `installation_id`, `code`, `state` to `/dashboard/settings/integrations?github=complete…` or `?github=error&reason=…` |
| `POST /complete` | the person who started | `{ installationId, code, state }`. Runs the checks above and stores the installation |
| `GET /status` | any member (`projects:read`) | Installation (account, all/selected repos, active/suspended) and this project's repository |
| `GET /repos` | any member (`projects:read`) | Repositories the installation can see |
| `PUT /projects/:projectId` | owner/admin | `{ repoFullName, subdirectory? }`. The repo must be visible to the installation; the folder must exist on the default branch |
| `DELETE /` | owner/admin | Uninstalls the app on GitHub (best effort) and removes the installation and repository links |
| `POST /webhook` | GitHub | Verifies `X-Hub-Signature-256`, then handles `installation` (deleted, suspend, unsuspend) and `installation_repositories` (removed repos unlink their projects) |

Error codes include `GITHUB_STATE_INVALID`, `GITHUB_STATE_EXPIRED`,
`GITHUB_STATE_USER_MISMATCH`, `GITHUB_CODE_INVALID`, `GITHUB_INSTALLATION_NOT_YOURS`,
`GITHUB_INSTALLATION_IN_USE`, `GITHUB_NOT_CONNECTED`, `GITHUB_SUSPENDED`, `GITHUB_NOT_FOUND`,
`GITHUB_ERROR`. Callback reasons: `pending_approval` (an org owner must approve the app),
`missing_installation`, `missing_code`, `not_configured`.

## Tokens

- The App authenticates with an RS256 JWT (`iss` = App ID, valid for 9 minutes,
  backdated 60 seconds for clock drift).
- Repository calls use installation tokens. They last an hour, are cached in memory and
  are re-minted five minutes before they expire. Nothing is stored in the database.
- `GitHubAppClient` can list repositories, read files and trees, create a branch, commit
  files (one fast-forward commit, never forced) and open a pull request against the
  default branch. Phase 5 builds the setup PR on these.

## Setup pull requests ("Connect GitHub → we set it up")

In **Setup Wizard → Install**, the GitHub panel installs the app (returning to the
wizard), lets the person pick the repository and app folder, shows what TraceIQ
detected and which files it will change, and opens a pull request. The manual, CLI and
"Install with AI" options stay below it.

| Route | Who | What |
| --- | --- | --- |
| `GET /projects/:projectId/setup-preview` | owner/admin | Detected stack and the planned files and env vars. Writes nothing. Statuses: `ready`, `pick_folder`, `unsupported`, `already_installed`, `file_exists`, `invalid_output`, `pull_request_open` |
| `POST /projects/:projectId/setup-pr` | owner/admin | Opens the PR, or returns the open one (`created: false`). Errors: `GITHUB_REPO_NOT_LINKED`, `SETUP_PICK_FOLDER` (with `candidates`), `SETUP_UNSUPPORTED`, `SETUP_ALREADY_INSTALLED`, `SETUP_FILE_EXISTS`, `SETUP_INVALID_OUTPUT` |

**Detection** (`setup/stack-detection.ts`) reads the default branch's tree and a few
manifests. Supported now: **Next.js** (App Router and Pages Router, `src/` or not, TS or JS),
**React** (Vite, Create React App) and **Node.js** servers (Express, NestJS, Fastify, Koa,
Hono, plain Node). Flutter, React Native, Swift, Android/Kotlin, Rust, Python, PHP, Go and
Ruby are recognised and sent to the manual wizard. In a monorepo (workspaces, pnpm,
Turborepo, Nx, Lerna, Rush), a single app folder is picked automatically. With several, the
person chooses one, and it is saved as the project's app folder. The package manager comes
from the nearest lockfile, then `packageManager`, then npm.

**Generation** (`setup/setup-generator.ts`) uses deterministic templates, the same as the
useTrace CLI and the install prompt:

- Next.js: a `"use client"` `TraceIQProvider` that initializes once in `useEffect`, wrapped
  around the JSX `{children}` of the root layout (never the function parameter), or around
  `<Component {...pageProps} />` in `pages/_app`.
- React: `src/traceiq.(ts|js)` imported first in the entry file.
- Node: a shared `traceiq` client (`null` when the env vars are missing) and
  `if (traceiq) app.use(traceiq.middleware())` after the single `const app = express()` /
  `NestFactory.create(...)`.
- `traceiq-sdk-js@^0.4.0` or `traceiq-node@^0.3.0` added to `package.json`, keeping its
  indentation and key order.
- `.env.example` gets the variable names, the project id and the API URL. The write key
  value is always empty.

Code reads the write key from an environment variable; the key is never committed. The PR
body explains how to add it to the host and CI secrets, and that the lockfile must be
updated on the branch (the API cannot run the package manager). Any edit that cannot be made
safely (an unusual layout, no `const app = express()` line) becomes a "finish by hand" step
in the PR instead of a guess. Every generated or edited file is parsed (TypeScript parser,
`JSON.parse`), and nothing is opened if one does not parse.

**Idempotency.** An open PR from `traceiq/setup` is returned as is. An existing
`traceiq/setup` branch is reused. Identical content is not committed again. Two clicks at
once end with one branch and one PR. The PR is recorded per project
(`github_setup_pull_requests`, migration `0068`) and shown when the wizard is reopened. The
wizard then waits on the existing first-event verification.

## Paste a repository URL → setup PR

For organizations that already installed the app, the Setup Wizard shows **Already on
GitHub?** above its steps. Pasting a repository URL links it to the project and opens
the setup pull request in one step, then the wizard goes straight to verification.

`POST /projects/:projectId/setup-pr-from-url` with `{ repoUrl, subdirectory? }` (owner/admin):

- Accepts `https://github.com/o/r`, `github.com/o/r.git`, `git@github.com:o/r.git`, `o/r`,
  and folder links such as `https://github.com/o/r/tree/main/apps/web`. The folder is used
  when the link is on the default branch; `subdirectory` overrides it. Only github.com.
- Errors: `GITHUB_REPO_URL_INVALID` (400), `GITHUB_REPO_NOT_VISIBLE` (404, with `manageUrl`
  to add the repo to the app), `GITHUB_NOT_CONNECTED`, plus the setup-PR errors above.
  `SETUP_PICK_FOLDER` returns `candidates`; the wizard shows them and sends the choice back
  as `subdirectory`.

## Source links on error pages

The error page's **Stack trace** tab shows **Source on GitHub** when the project has a
linked repository: the commit, the pull requests that contain it, and a link per in-app
stack frame to `blob/<commit>/<path>#L<line>`.

`GET /projects/:projectId/source-context?release=…` (any member; PATs need `errors:read`)
resolves the error's release:

1. A release that looks like a SHA (7–40 hex characters) is checked as a commit.
2. Otherwise a tag with that name is tried, then with a `v` prefix (annotated tags are followed).
3. Otherwise links point at the default branch and say that lines may have moved.

Results are cached for ten minutes per project and release. Setting the SDK's `release`
to the deployed commit SHA (for example `VERCEL_GIT_COMMIT_SHA` or `GITHUB_SHA`) gives exact
links.

Frames are mapped in the dashboard (`apps/dashboard/src/lib/source-links.ts`).
Source-mapped paths (`src/App.tsx`, `webpack://…/./src/App.tsx`) are placed under the app
folder. Absolute server paths are placed only from the repository name or the app folder.
Bundle URLs, `node_modules`, `node:` internals and webpack runtime frames get no link
rather than a wrong one. Browser errors need uploaded source maps to show file links.

## Follow-ups (not built)

- **Open fix PR**: propose a code fix for an error as a pull request on a `traceiq/fix-…`
  branch, built on the same client (branch, commit, PR, never the default branch). Out of
  scope for now.
- GitHub Enterprise Server hosts for the URL shortcut and links.
- Linking frames for apps whose stack paths have no recognisable anchor (for example a Docker
  image at `/app/dist/...`), using the source map's `sourceRoot` or a configurable path prefix.

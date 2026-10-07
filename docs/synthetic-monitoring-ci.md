# Running TraceIQ Synthetic Monitors in CI

Run existing deterministic Synthetic Monitors against Pull Request preview deployments before code is merged into production.

---

## Architecture Overview

```text
GitHub Pull Request
       ↓
Preview Deployment (Vercel / Netlify / Cloudflare / Custom Staging)
       ↓
TraceIQ GitHub Action (`action.yml`)
       ↓
TraceIQ API (`POST /v1/synthetic/ci-runs`)
       ↓
Playwright Worker (with temporary Base URL Override)
       ↓
Pass / Fail Result
       ↓
GitHub Step Summary & Workflow Check
```

---

## 1. Create a Synthetic Monitor

In your TraceIQ Dashboard:
1. Navigate to **Synthetic Monitors**.
2. Click **New Monitor** or convert an existing Funnel.
3. Configure your journey steps (e.g., *Navigate*, *Click*, *Fill*, *Assert URL*, *Assert Text*).
4. Save the monitor. Note its **Monitor ID** (e.g. `sym_01H...` or UUID).

The monitor's production `baseUrl` (e.g. `https://app.example.com`) is stored permanently. In CI, TraceIQ temporarily substitutes this base URL with your dynamic pull-request preview URL without altering production monitoring schedules or alerts.

---

## 2. Obtain Authentication Credentials

Generate an API credential with write permissions to your project:
- **Project API Write Key**: Found in **Settings → API Keys** (`project_write_keys`), or
- **Personal Access Token (PAT)**: Found in **Settings → Access Tokens** (prefixed with `tiq_pat_...`).

Add this secret to your GitHub Repository:
- GitHub Repo → **Settings → Secrets and variables → Actions → New repository secret**
- Name: `TRACEIQ_API_KEY`

---

## 3. Configure the GitHub Action

Add a GitHub Actions workflow to `.github/workflows/synthetic.yml`:

```yaml
name: TraceIQ Synthetic Pre-Merge Check

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  synthetic-validation:
    name: Validate PR on Preview Deployment
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write # Optional: allows step summary and PR annotation

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      # Example: Await or retrieve your deployment preview URL
      # (e.g., from Vercel action, Netlify action, or Cloudflare Pages)
      - name: Get Preview URL
        id: preview
        run: |
          # Replace with your deployment tool's output variable
          echo "url=https://preview-pr-${{ github.event.pull_request.number }}.example.com" >> $GITHUB_OUTPUT

      # Run TraceIQ Synthetic Monitors
      - name: Run TraceIQ Synthetic Check
        uses: traceiq/synthetic-check@v1
        with:
          api-url: 'https://api.traceiq.run' # or your self-hosted TraceIQ API endpoint
          api-key: ${{ secrets.TRACEIQ_API_KEY }}
          project-id: ${{ vars.TRACEIQ_PROJECT_ID }}
          preview-url: ${{ steps.preview.outputs.url }}
          monitors: 'sym_signup_flow,sym_checkout_flow'
          timeout: '600' # 10 minutes max
          polling-interval: '5' # poll every 5s
```

---

## 4. GitHub Action Inputs & Outputs

### Inputs

| Input | Description | Required | Default |
|---|---|---|---|
| `api-key` | TraceIQ Project Write Key or PAT | **Yes** | — |
| `project-id` | TraceIQ Project UUID / ID | **Yes** | — |
| `preview-url` | Target preview deployment URL | **Yes** | — |
| `monitors` | Comma-separated list of Synthetic Monitor IDs | **Yes** | — |
| `api-url` | TraceIQ API base URL | No | `https://api.traceiq.run` |
| `timeout` | Max duration to wait in seconds | No | `600` |
| `polling-interval` | Interval between polling requests (seconds) | No | `5` |
| `environment` | Target environment label | No | `preview` |

### Outputs

| Output | Description |
|---|---|
| `run-group-id` | TraceIQ CI Run Group ID |
| `status` | `passed`, `failed`, or `timed_out` |
| `passed-monitors` | Number of passing monitors |
| `total-monitors` | Total number of monitors executed |
| `summary` | Formatted Markdown summary of run results |

---

## 5. Security & SSRF Protection

- **Tenant Scoping**: API keys are strictly verified against `projectId`. CI runs cannot trigger monitors from other projects.
- **SSRF Hardening**: Dynamic preview URLs undergo strict hostname & IP resolution checks. Localhost, IPv4 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local metadata (`169.254.169.254`), and IPv6 loopbacks are strictly blocked.
- **Secret Redaction**: Environment variables and decrypted secrets are scrubbed from console logs and step error messages.
- **Idempotent Retries**: CI runs derive an idempotency key from `repository`, `commit_sha`, and workflow run ID to prevent duplicate executions upon GitHub workflow retries.

---

## 6. Required GitHub Branch Checks

To prevent merging broken pull requests:
1. In GitHub, navigate to **Settings → Branches → Branch protection rules**.
2. Edit your rule for `main` / `master`.
3. Check **Require status checks to pass before merging**.
4. Search for and select **Validate PR on Preview Deployment** (or the name of your synthetic job).
5. Save changes.

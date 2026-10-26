# Running TraceIQ Synthetic Monitors in CI

Run your existing synthetic monitors against a pull request's preview deployment, and fail the check if a journey breaks, before the change reaches production.

---

## How it works

```text
Pull request opened or updated
       ↓
Preview deployment (Vercel / Netlify / Cloudflare / your own staging)
       ↓
CI job calls POST /v1/synthetic/ci-runs with the preview URL
       ↓
TraceIQ runs each monitor's steps against the preview URL instead of its base URL
       ↓
CI job polls GET /v1/synthetic/ci-runs/{runGroupId} until the group passes or fails
       ↓
The job exits 0 (passed) or 1 (failed / timed out), so the PR check goes green or red
```

The monitor's own base URL and schedule are not changed.

---

## 1. Create the monitors

In the TraceIQ dashboard:

1. Open **Synthetic monitors** and create a monitor, or open a funnel or session replay and click **Convert to Synthetic Monitor**.
2. Add the journey steps (Navigate, Click, Fill, Assert…) and save.
3. Click **Run Now** once to check it passes against production.
4. Copy the monitor's ID from its page URL. IDs start with `sym_`.

Use paths (for example `/signup`) in Navigate steps rather than full URLs, so the same steps work against the preview host.

---

## 2. Create a credential

The CI endpoint accepts either:

- your project's **write key** (Settings), or
- a **personal access token** (`tiq_pat_...`, Settings → Personal access tokens) from a member of the project's organization.

Add it to your repository as a secret: GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**, named `TRACEIQ_API_KEY`. Add your project ID as a repository variable named `TRACEIQ_PROJECT_ID`.

---

## 3. Add the workflow

Create `.github/workflows/traceiq-synthetic.yml`:

```yaml
name: TraceIQ synthetic checks

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  synthetic:
    name: Synthetic checks on preview
    runs-on: ubuntu-latest
    steps:
      # Replace with however your deploy tool exposes the preview URL.
      - name: Get preview URL
        id: preview
        run: echo "url=https://pr-${{ github.event.pull_request.number }}.preview.example.com" >> "$GITHUB_OUTPUT"

      - name: Run TraceIQ synthetic monitors
        env:
          TRACEIQ_API_URL: https://api.traceiq.run # or your self-hosted API URL
          TRACEIQ_API_KEY: ${{ secrets.TRACEIQ_API_KEY }}
          TRACEIQ_PROJECT_ID: ${{ vars.TRACEIQ_PROJECT_ID }}
          PREVIEW_URL: ${{ steps.preview.outputs.url }}
          MONITOR_IDS: '["sym_signup_monitor_id", "sym_checkout_monitor_id"]'
        run: |
          body=$(jq -n \
            --arg projectId "$TRACEIQ_PROJECT_ID" \
            --arg baseUrl "$PREVIEW_URL" \
            --argjson monitorIds "$MONITOR_IDS" \
            --arg key "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \
            '{projectId: $projectId, monitorIds: $monitorIds, baseUrl: $baseUrl, environment: "preview", idempotencyKey: $key}')

          group=$(curl -fsS -X POST "$TRACEIQ_API_URL/v1/synthetic/ci-runs" \
            -H "x-traceiq-api-key: $TRACEIQ_API_KEY" \
            -H "content-type: application/json" \
            -d "$body" | jq -r .runGroupId)

          for attempt in $(seq 1 120); do
            result=$(curl -fsS "$TRACEIQ_API_URL/v1/synthetic/ci-runs/$group?projectId=$TRACEIQ_PROJECT_ID" \
              -H "x-traceiq-api-key: $TRACEIQ_API_KEY")
            status=$(echo "$result" | jq -r .group.status)
            echo "TraceIQ run group $group: $status"
            case "$status" in
              passed) exit 0 ;;
              failed|timed_out)
                echo "$result" | jq -r '.runs[] | "\(.monitorId): \(.status)"'
                exit 1 ;;
            esac
            sleep 5
          done

          echo "Gave up waiting for TraceIQ after 10 minutes."
          exit 1
```

`jq` and `curl` are preinstalled on GitHub's Ubuntu runners.

---

## 4. API reference

### `POST /v1/synthetic/ci-runs`

Authenticate with `x-traceiq-api-key: <key>`, `x-traceiq-write-key: <key>` or `Authorization: Bearer <key>`.

| Field | Required | Description |
|---|---|---|
| `projectId` | Yes | The project the monitors belong to. |
| `monitorIds` | Yes | Array of monitor IDs (`sym_...`) to run. |
| `baseUrl` | Yes | The preview URL to run the steps against. Must be publicly reachable. |
| `environment` | No | A label for the runs, for example `preview`. |
| `git` | No | `{ provider, repository, commitSha, branch, pullRequest }`, stored with the run group. |
| `idempotencyKey` | No | Reusing a key returns the existing run group instead of starting a new one, so a retried job doesn't run the monitors twice. |

Response: `{ runGroupId, status, totalMonitors, runs: [{ monitorId, monitorName, runId }] }`.

### `GET /v1/synthetic/ci-runs/{runGroupId}?projectId=...`

Same authentication. Response: `{ group, runs }`, where `group.status` is `queued`, `running`, `passed`, `failed` or `timed_out`, and `group.passedMonitors` / `group.failedMonitors` count the results. Poll until the status is `passed`, `failed` or `timed_out`.

---

## 5. Security

- **Project scoping**: keys are checked against `projectId`; a CI run can't trigger another project's monitors.
- **Private addresses are blocked**: preview URLs that resolve to localhost, private IPv4 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local or cloud metadata addresses (`169.254.169.254`) and IPv6 loopback are rejected.
- **Secrets stay secret**: `{{SECRET}}` values used in steps are filled in at run time and redacted from console logs and error messages.

---

## 6. Require the check before merging

1. In GitHub, open **Settings → Branches → Branch protection rules** and edit the rule for your main branch.
2. Turn on **Require status checks to pass before merging**.
3. Select **Synthetic checks on preview** (the job name above) and save.

---

## About the TraceIQ GitHub Action

This repository also contains a GitHub Action (`action.yml`, source in `packages/github-action`) that wraps the same two API calls and writes a step summary. Its compiled `packages/github-action/dist/index.js` isn't committed or published yet, so `uses: enigma-137/trace-iq@...` won't run until it is released. Until then, use the workflow above.

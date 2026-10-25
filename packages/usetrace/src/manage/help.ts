import { colors } from '../terminal/ui.js';

const GLOBAL_FLAGS = `
Global flags
  --api-url <url>        API to talk to (env TRACEIQ_API_URL, default https://api.traceiq.run)
  --token <tiq_pat_...>  Personal access token for this run (env TRACEIQ_TOKEN)
  -p, --project <id>     Project for this run instead of the one picked with \`projects use\` (env TRACEIQ_PROJECT_ID)
  -h, --help             Show help for a command`;

export const MAIN_HELP = `
${colors.bold('traceiq')} — set up and manage TraceIQ from your terminal

${colors.bold('Usage')}
  npx traceiq-cli [command] [flags]

${colors.bold('Setup')}
  (no command)           Interactive setup wizard: install the SDK and verify the first event
  audit                  Inspect the instrumentation in this project (alias: doctor)
  verify                 Wait for a live event from this project

${colors.bold('Account')}
  login                  Save a personal access token for the CLI
  logout                 Forget the saved token
  whoami                 Show the API, token, organization and active project

${colors.bold('Projects')}
  projects list          List the projects you can access
  projects use [id]      Set the active project (interactive when no id is given)
  env pull               Write TRACEIQ_* variables for the active project to your .env file

${colors.bold('Data')}
  logs                   Show recent logs; add --follow to stream new ones
  events                 Show recent events; add --follow to stream new ones
  errors                 List error issues
  status                 Check API health and when data last arrived

${colors.bold('Builds')}
  sourcemaps upload      Upload a build's source maps so error stacks show original code
  sourcemaps list        List releases with uploaded source maps

${colors.bold('Other')}
  open [page]            Open the dashboard (overview, logs, events, errors, settings, ...)
  help [command]         Show help for a command
${GLOBAL_FLAGS}

Run ${colors.cyan('traceiq help <command>')} for command flags.
`;

export const COMMAND_HELP: Record<string, string> = {
  login: `
${colors.bold('traceiq login')} [--token <tiq_pat_...>] [--api-url <url>] [--dashboard-url <url>]

Saves a personal access token to ~/.traceiq/config.json (owner-only file).
Create one in the dashboard under Settings → Personal access tokens.

Scopes the CLI uses:
  projects:read    projects list / use, whoami
  analytics:read   logs, status
  errors:read      errors
  sourcemaps:write sourcemaps upload (a CI token can have only this scope)

Without --token you are prompted for it (input is hidden). In CI, set
TRACEIQ_TOKEN instead of logging in.
`,
  logout: `
${colors.bold('traceiq logout')}

Removes the saved token. The token itself stays valid until you revoke it in
Settings → Personal access tokens.
`,
  whoami: `
${colors.bold('traceiq whoami')} [--json]

Shows the API URL, the token in use (masked) and where it came from, your
organization and role, and the active project.
`,
  projects: `
${colors.bold('traceiq projects')} <list|use> [flags]

  projects list [--json]       List every project you can access. The active one is marked.
  projects use [id|slug|name]  Set the active project used by logs, events, errors, status and env pull.
                               Without an argument you pick from a list.

Creating, renaming and deleting projects need a signed-in dashboard session;
the API does not accept personal access tokens for them. Use
${colors.cyan('traceiq open settings')} for those.
`,
  env: `
${colors.bold('traceiq env pull')} [--file <path>] [--write-key <key>] [--framework <next|vite|node>] [--print] [--dry-run]

Writes the active project's settings to your env file:
  <PREFIX>TRACEIQ_PROJECT_ID, <PREFIX>TRACEIQ_API_URL, and <PREFIX>TRACEIQ_WRITE_KEY when known.

The prefix follows the detected framework (NEXT_PUBLIC_ for Next.js, VITE_ for Vite,
none for Node). The file defaults to the first of .env.local, .env, .env.development
that exists, else .env.local. Other lines in the file are kept.

Write keys are stored hashed, so the API cannot return them. The CLI keeps the key
already in your env file when it belongs to the same project, or uses --write-key.

  --print     Print the variables instead of writing a file
  --dry-run   Show what would change without writing
`,
  logs: `
${colors.bold('traceiq logs')} [flags]

Shows logs for the active project, oldest first.

  -l, --level <level>      debug, info, warn, error
  -s, --search <text>      Match message, route, service, trace/request id, user id
  --source <source>        Log source, e.g. api, sdk, ai
  --status <status>        success, warning, error
  --trace <traceId>        Only logs for one trace
  --since <window|date>    15m, 2h, 7d or an ISO date (default 1h)
  -n, --limit <n>          How many to show first (default 50, max 200)
  -f, --follow             Keep polling for new logs until Ctrl+C
  --interval <seconds>     Poll interval with --follow (default 2)
  --json                   One JSON object per line
`,
  events: `
${colors.bold('traceiq events')} [flags]

Shows the most recent events for the active project, oldest first.

  --name <eventName>     Only events with this name
  -n, --limit <n>        How many to show first (default 25, max 100)
  -f, --follow           Keep polling for new events until Ctrl+C
  --interval <seconds>   Poll interval with --follow (default 2)
  --json                 One JSON object per line
`,
  errors: `
${colors.bold('traceiq errors')} [--days <n>] [--json]

Lists error issues (grouped by type and message) for the active project,
most frequent first. --days defaults to 7.
`,
  sourcemaps: `
${colors.bold('traceiq sourcemaps upload')} --release <version> [--dir <build folder>] [--delete-after] [--dry-run]
${colors.bold('traceiq sourcemaps list')} [--release <version>] [--json]

upload sends every *.js.map under --dir (default ./dist) for one release. Use
the same release value you pass to the SDK's \`release\` option; errors from
that release then show original file names, lines and code. Each map is
stored under the path of the file next to it (dist/assets/index.js.map →
assets/index.js) and matches stack frames whose URL ends with that path.
Uploading the same release again replaces its maps.

  --release <version>  Required (env TRACEIQ_RELEASE)
  --dir <path>         Build output folder (default dist)
  --delete-after       Delete the local .map files after a successful upload,
                       so they are not deployed with your site
  --dry-run            List the maps without uploading

Needs a token with the sourcemaps:write scope and a project (--project or
TRACEIQ_PROJECT_ID in CI). Example GitHub Actions step:

  - run: npx traceiq-cli sourcemaps upload --release \${{ github.sha }} --dir dist --delete-after
    env:
      TRACEIQ_TOKEN: \${{ secrets.TRACEIQ_TOKEN }}
      TRACEIQ_PROJECT_ID: proj_...
`,
  status: `
${colors.bold('traceiq status')} [--json]

Checks that the API is up and, when logged in, shows when the active project
last received an event and a log, plus event counts for the last hour and day.
Exits with code 1 when the API is unreachable.
`,
  open: `
${colors.bold('traceiq open')} [page] [--print]

Opens the dashboard in your browser. Pages: overview (default), logs, events,
errors, users, web, api, flags, replays, alerts, settings, tokens.
--print shows the URL instead of opening it. Override the dashboard origin
with --dashboard-url or TRACEIQ_DASHBOARD_URL.
`
};

COMMAND_HELP.keys = `
${colors.bold('traceiq keys')}

Write keys cannot be shown or rotated from the CLI: the API stores them hashed
and only lets a signed-in dashboard session regenerate them. Run
${colors.cyan('traceiq open settings')} to rotate a key, then
${colors.cyan('traceiq env pull --write-key <new key>')} to update your env file.
`;

export function commandHelp(command: string): string | undefined {
  const text = COMMAND_HELP[command];
  return text ? `${text}${GLOBAL_FLAGS}\n` : undefined;
}

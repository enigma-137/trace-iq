# TraceIQ MCP server

The TraceIQ MCP server lets AI clients connect to your TraceIQ workspace and inspect projects, feature flags, and flag state through the Model Context Protocol.

## Package name

The published npm package is:

- `traceiq-mcp-server`

The CLI entrypoint is:

- `traceiq-mcp`

## Install

### Global install

```bash
npm install -g traceiq-mcp-server
```

### One-off usage

```bash
npx traceiq-mcp-server
```

## Required environment variables

Set a TraceIQ personal access token before starting the server:

```bash
export TRACEIQ_API_KEY=tiq_pat_your_token_here
```

Optional:

```bash
export TRACEIQ_API_URL=https://api.traceiq.run
```

If you are running the API locally, you can leave `TRACEIQ_API_URL` unset and use the default:

```bash
http://localhost:4000
```

## Start the server

```bash
TRACEIQ_API_KEY=tiq_pat_your_token_here traceiq-mcp
```

## Configure in Claude Desktop

Add the following to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "traceiq": {
      "command": "npx",
      "args": ["-y", "traceiq-mcp-server"],
      "env": {
        "TRACEIQ_API_KEY": "tiq_pat_your_token_here",
        "TRACEIQ_API_URL": "https://api.traceiq.run"
      }
    }
  }
}
```

## Configure in other MCP clients

Most MCP-compatible clients accept a command and arguments. A typical setup is:

```json
{
  "mcpServers": {
    "traceiq": {
      "command": "npx",
      "args": ["-y", "traceiq-mcp-server"]
    }
  }
}
```

Then provide the environment variables required by your client.

## Available tools

The server currently exposes these tools:

- `list_projects`
- `list_feature_flags`
- `toggle_feature_flag`

## Development

From the repository root:

```bash
npm install
npm run build --workspace traceiq-mcp-server
```

To publish a new version:

```bash
cd packages/mcp-server
npm version patch
npm publish --access public
```

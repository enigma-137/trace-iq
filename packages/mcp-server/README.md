# traceiq-mcp-server

TraceIQ MCP server for AI clients that support the Model Context Protocol.

## Install

```bash
npm install -g traceiq-mcp-server
```

Or run it directly without installing:

```bash
npx traceiq-mcp-server
```

## Configuration

Set a TraceIQ personal access token before starting the server:

```bash
TRACEIQ_API_KEY=tiq_pat_your_token_here traceiq-mcp
```

Optional environment variables:

```bash
TRACEIQ_API_URL=https://api.traceiq.dev
```

If you are running the API locally, you can also use the default:

```bash
TRACEIQ_API_URL=http://localhost:4000
```

## Claude Desktop

```json
{
  "mcpServers": {
    "traceiq": {
      "command": "npx",
      "args": ["-y", "traceiq-mcp-server"],
      "env": {
        "TRACEIQ_API_KEY": "tiq_pat_your_token_here",
        "TRACEIQ_API_URL": "https://api.traceiq.dev"
      }
    }
  }
}
```

## Tools

- `list_projects`: list accessible TraceIQ projects.
- `list_feature_flags`: list flags for a project.
- `toggle_feature_flag`: enable or disable a feature flag.

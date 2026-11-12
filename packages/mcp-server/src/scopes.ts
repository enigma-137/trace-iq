import { tools } from './tools.js';

/** Every scope some tool needs: what the remote server asks the authorization server for. */
export const MCP_SCOPES = [...new Set(tools.flatMap((tool) => tool.requiredScopes))].sort();

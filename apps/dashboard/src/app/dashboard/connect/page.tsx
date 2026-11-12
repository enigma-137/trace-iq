import { DashboardShell } from '../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { ConnectConsent } from './ConnectConsent';

export const dynamic = 'force-dynamic';

const OAUTH_PARAMS = ['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'scope', 'state', 'resource'] as const;

/**
 * OAuth consent for remote MCP clients. The API's /oauth/authorize sends the user here;
 * approving sends them back to the client with a one-time code.
 */
export default async function ConnectPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const params: Record<string, string> = {};
  for (const key of OAUTH_PARAMS) {
    const value = searchParams[key];
    if (typeof value === 'string') params[key] = value;
  }
  const { user } = await requireDashboardSession(`/dashboard/connect?${new URLSearchParams(params).toString()}`);

  return (
    <DashboardShell active="settings" title="Connect an app" userEmail={user.email}>
      <ConnectConsent key={new URLSearchParams(params).toString()} params={params} userEmail={user.email ?? null} />
    </DashboardShell>
  );
}

import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { SettingsSection } from '../SettingsUI';
import { SettingsTabs } from '../SettingsTabs';
import { GitHubIntegrationCard } from './GitHubIntegrationCard';
import { LinearIntegrationCard } from './LinearIntegrationCard';

export const dynamic = 'force-dynamic';

export default async function IntegrationsSettingsPage({
  searchParams
}: {
  searchParams: { projectId?: string; organizationId?: string };
}) {
  const { user } = await requireDashboardSession('/dashboard/settings/integrations');
  return (
    <DashboardShell
      active="settings"
      title="Integrations"
      userEmail={user.email}
      projectId={searchParams.projectId}
      organizationId={searchParams.organizationId}
    >
      <SettingsTabs />
      <SettingsSection id="integrations" title="Integrations" description="Connect the tools your team already uses.">
        <GitHubIntegrationCard projectId={searchParams.projectId} />
        <LinearIntegrationCard projectId={searchParams.projectId} />
      </SettingsSection>
    </DashboardShell>
  );
}

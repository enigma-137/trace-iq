import { DashboardShell } from '../DashboardShell';
import { SetupPanel } from '../SetupPanel';
import { ConnectedAccountsPanel } from './ConnectedAccountsPanel';
import { PasswordSettingsPanel } from './PasswordSettingsPanel';
import { PersonalAccessTokensPanel } from './PersonalAccessTokensPanel';
import { SettingsSection } from './SettingsUI';
import { SettingsTabs } from './SettingsTabs';
import { TwoFactorPanel } from './TwoFactorPanel';
import { AccountLifecyclePanel } from './AccountLifecyclePanel';
import { requireDashboardSession } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user } = await requireDashboardSession('/dashboard/settings');
  const projectId = firstParam(searchParams.projectId);
  const organizationId = firstParam(searchParams.organizationId);
  const newProject = firstParam(searchParams.newProject) === '1';

  return (
    <DashboardShell
      active="settings"
      title="Settings"
      userEmail={user.email}
      projectId={projectId}
      organizationId={organizationId}
    >
      <SettingsTabs />
      <SetupPanel
        organizationId={organizationId}
        projectId={projectId}
        newProject={newProject}
        dangerZoneContent={
          process.env.NEXT_PUBLIC_AUTH_MODE !== 'local'
            ? <AccountLifecyclePanel exportHref={`/dashboard/export${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`} />
            : null
        }
      >
        <SettingsSection id="security" title="Security" description="Protect how you sign in to TraceIQ.">
          <TwoFactorPanel />
          <PasswordSettingsPanel userEmail={user.email} />
          <ConnectedAccountsPanel />
        </SettingsSection>
        <PersonalAccessTokensPanel />
      </SetupPanel>
    </DashboardShell>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

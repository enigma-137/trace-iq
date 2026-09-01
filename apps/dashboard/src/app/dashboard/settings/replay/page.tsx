import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { SettingsTabs } from '../SettingsTabs';
import { ReplaySettingsPanel } from './ReplaySettingsPanel';

export default async function ReplaySettingsPage({ searchParams }: { searchParams: { projectId?: string; organizationId?: string } }) {
  const { user } = await requireDashboardSession('/dashboard/settings/replay');
  return (
    <DashboardShell active="settings" title="Session Replay settings" userEmail={user.email}
      projectId={searchParams.projectId} organizationId={searchParams.organizationId}>
      <SettingsTabs />
      <ReplaySettingsPanel projectId={searchParams.projectId} />
    </DashboardShell>
  );
}

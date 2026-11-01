import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { SettingsTabs } from '../SettingsTabs';
import { DailyBriefPanel } from './DailyBriefPanel';

export default async function DailyBriefSettingsPage({ searchParams }: { searchParams: { projectId?: string; organizationId?: string } }) {
  const { user } = await requireDashboardSession('/dashboard/settings/brief');
  return (
    <DashboardShell active="settings" title="Daily brief" userEmail={user.email}
      projectId={searchParams.projectId} organizationId={searchParams.organizationId}>
      <SettingsTabs />
      <DailyBriefPanel projectId={searchParams.projectId} />
    </DashboardShell>
  );
}

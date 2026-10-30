import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { SettingsTabs } from '../SettingsTabs';
import { RevenueSettingsPanel } from './RevenueSettingsPanel';

export default async function RevenueSettingsPage({ searchParams }: { searchParams: { projectId?: string; organizationId?: string } }) {
  const { user } = await requireDashboardSession('/dashboard/settings/revenue');
  return (
    <DashboardShell active="settings" title="Revenue settings" userEmail={user.email}
      projectId={searchParams.projectId} organizationId={searchParams.organizationId}>
      <SettingsTabs />
      <RevenueSettingsPanel projectId={searchParams.projectId} />
    </DashboardShell>
  );
}

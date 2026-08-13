import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { SettingsTabs } from '../SettingsTabs';
import { TeamPanel } from './TeamPanel';

export const dynamic = 'force-dynamic';

export default async function TeamSettingsPage() {
  const { user } = await requireDashboardSession('/dashboard/settings/team');

  return (
    <DashboardShell active="settings" title="Team" userEmail={user.email}>
      <SettingsTabs />
      <TeamPanel />
    </DashboardShell>
  );
}
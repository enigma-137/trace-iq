import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { redirect } from 'next/navigation';
import { SettingsTabs } from '../SettingsTabs';
import { TeamPanel } from './TeamPanel';

export const dynamic = 'force-dynamic';

export default async function TeamSettingsPage() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    redirect('/dashboard/settings');
  }

  const { user } = await requireDashboardSession('/dashboard/settings/team');

  return (
    <DashboardShell active="settings" title="Team" userEmail={user.email}>
      <SettingsTabs />
      <TeamPanel />
    </DashboardShell>
  );
}

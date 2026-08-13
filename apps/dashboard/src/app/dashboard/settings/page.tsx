import { DashboardShell } from '../DashboardShell';
import { SetupPanel } from '../SetupPanel';
import { PersonalAccessTokensPanel } from './PersonalAccessTokensPanel';
import { SettingsTabs } from './SettingsTabs';
import { TwoFactorPanel } from './TwoFactorPanel';
import { requireDashboardSession } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { user } = await requireDashboardSession('/dashboard/settings');

  return (
    <DashboardShell active="settings" title="Settings" userEmail={user.email}>
      <SettingsTabs />
      <SetupPanel />
      <TwoFactorPanel />
      <PersonalAccessTokensPanel />
    </DashboardShell>
  );
}


import { DashboardShell } from '../../DashboardShell';
import { TwoFactorSetupPanel } from './TwoFactorSetupPanel';
import { requireDashboardSession } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export default async function TwoFactorSettingsPage() {
  const { user } = await requireDashboardSession('/dashboard/settings/2fa');

  return (
    <DashboardShell active="settings" title="Two-factor authentication" userEmail={user.email}>
      <TwoFactorSetupPanel userEmail={user.email} />
    </DashboardShell>
  );
}
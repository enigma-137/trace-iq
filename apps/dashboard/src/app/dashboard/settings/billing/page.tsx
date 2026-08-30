import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { SettingsTabs } from '../SettingsTabs';
import { BillingPanel } from './BillingPanel';

export const dynamic = 'force-dynamic';

export default async function BillingSettingsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { user } = await requireDashboardSession('/dashboard/settings/billing');
  const projectId = firstParam(searchParams.projectId);
  const billingResult = firstParam(searchParams.billing);

  return (
    <DashboardShell active="settings" title="Billing" userEmail={user.email} projectId={projectId}>
      <SettingsTabs />
      <BillingPanel projectId={projectId} billingResult={billingResult} />
    </DashboardShell>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

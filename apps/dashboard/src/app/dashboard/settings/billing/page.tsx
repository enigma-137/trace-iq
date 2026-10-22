import { DashboardShell } from '../../DashboardShell';
import { requireDashboardSession } from '@/lib/dashboard';
import { SettingsTabs } from '../SettingsTabs';
import { BillingPanel } from './BillingPanel';
import { isBillingInterval } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export default async function BillingSettingsPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const checkoutParam = firstParam(searchParams.checkout);
  const checkout = isBillingInterval(checkoutParam) ? checkoutParam : undefined;
  const { user } = await requireDashboardSession(
    checkout ? `/dashboard/settings/billing?checkout=${checkout}` : '/dashboard/settings/billing'
  );
  const projectId = firstParam(searchParams.projectId);
  const billingResult = firstParam(searchParams.billing);

  return (
    <DashboardShell active="settings" title="Billing" userEmail={user.email} projectId={projectId}>
      <SettingsTabs />
      <BillingPanel projectId={projectId} billingResult={billingResult} requestedCheckout={checkout} />
    </DashboardShell>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

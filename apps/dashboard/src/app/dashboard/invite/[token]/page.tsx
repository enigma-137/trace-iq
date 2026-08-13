import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Compatibility for invite emails generated before DASHBOARD_URL was normalized.
 * The invite page lives at /invite/:token; this route quietly forwards anything
 * that landed under the protected /dashboard/* prefix.
 */
export default async function LegacyInvitePage({ params }: { params: { token: string } }) {
  redirect(`/invite/${encodeURIComponent(params.token)}`);
}
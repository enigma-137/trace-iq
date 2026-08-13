import { InviteClient } from './InviteClient';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: { token: string } }) {
  return <InviteClient token={params.token} />;
}
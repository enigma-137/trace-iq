/** What the Owner / Created by column shows for a dashboard or insight. */
export function ownerLabel(
  ownerId: string | undefined,
  ownerEmail: string | null | undefined,
  currentUserId: string | undefined
): string {
  if (ownerId && ownerId === currentUserId) return 'You';
  return ownerEmail || 'Unknown';
}

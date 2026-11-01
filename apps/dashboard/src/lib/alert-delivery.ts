/** What a delivery row reads as: "Webhook", "Slack · #alerts", "Telegram · Emmanuel", or the email address. */
export function deliveryLabel(delivery: { channel: string; recipient: string | null }): string {
  if (delivery.channel === 'webhook') return 'Webhook';
  if (delivery.channel === 'slack') return delivery.recipient ? `Slack · ${delivery.recipient}` : 'Slack';
  if (delivery.channel === 'telegram') return delivery.recipient ? `Telegram · ${delivery.recipient}` : 'Telegram';
  return delivery.recipient ?? 'Email';
}

/** The word shown after a delivery's label. Skipped means a paused channel, not a failure. */
export function deliveryOutcome(status: string): 'sent' | 'skipped' | 'failed' {
  return status === 'sent' ? 'sent' : status === 'skipped' ? 'skipped' : 'failed';
}

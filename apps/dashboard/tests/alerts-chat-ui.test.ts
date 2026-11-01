import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deliveryLabel, deliveryOutcome } from '../src/lib/alert-delivery';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('delivery labels', () => {
  it('name the service and the chat, so people can see what reached where', () => {
    expect(deliveryLabel({ channel: 'slack', recipient: '#alerts (Nuwell)' })).toBe('Slack · #alerts (Nuwell)');
    expect(deliveryLabel({ channel: 'telegram', recipient: 'Emmanuel' })).toBe('Telegram · Emmanuel');
    expect(deliveryLabel({ channel: 'slack', recipient: null })).toBe('Slack');
    expect(deliveryLabel({ channel: 'telegram', recipient: null })).toBe('Telegram');
  });

  it('keep the existing email and webhook wording', () => {
    expect(deliveryLabel({ channel: 'webhook', recipient: 'https://hooks.example.com/x' })).toBe('Webhook');
    expect(deliveryLabel({ channel: 'email', recipient: 'ops@b.co' })).toBe('ops@b.co');
    expect(deliveryLabel({ channel: 'email', recipient: null })).toBe('Email');
  });

  it('treat a paused channel as skipped, not as a failure', () => {
    expect(deliveryOutcome('sent')).toBe('sent');
    expect(deliveryOutcome('skipped')).toBe('skipped');
    expect(deliveryOutcome('failed')).toBe('failed');
    expect(deliveryOutcome('pending')).toBe('failed');
  });
});

describe('alert form', () => {
  const modal = read('../src/app/dashboard/alerts/CreateAlertModal.tsx');

  it('sends the chosen chats with the alert', () => {
    expect(modal).toContain('chatChannelIds: selectedChatIds');
    expect(modal).toContain('Telegram and Slack');
  });

  it('lets an alert use only a connected chat, as the API does', () => {
    expect(modal).toContain('selectedGroupIds.length === 0 && selectedChatIds.length === 0');
  });

  it('shows the service logos and points to Daily brief when nothing is connected', () => {
    expect(modal).toContain('SlackLogo');
    expect(modal).toContain('TelegramLogo');
    expect(modal).toContain('/dashboard/alerts?tab=brief');
  });

  it('drops chats that no longer exist when an alert is duplicated or edited', () => {
    expect(modal).toContain('chatChannels.some((channel) => channel.id === id)');
  });
});

describe('alerts page', () => {
  it('still loads against an API that does not send chat channels yet', () => {
    expect(read('../src/app/dashboard/alerts/page.tsx')).toContain('chatChannels={data?.chatChannels ?? []}');
  });

  it('keeps chats when an alert is duplicated', () => {
    expect(read('../src/app/dashboard/alerts/AlertManager.tsx')).toContain('chatChannelIds: alert.chatChannelIds');
  });
});

import { Module } from '@nestjs/common';
import { ChatNotifier } from './chat-notifier';
import { SlackClient } from './slack.client';
import { TelegramClient } from './telegram.client';

/**
 * Telegram and Slack delivery with no other dependencies, so both the daily brief and alerts
 * can use it. (The brief module depends on insights, billing and AI, and the AI module already
 * depends on alerts, so alerts cannot import the brief module without a cycle.)
 */
@Module({
  providers: [TelegramClient, SlackClient, ChatNotifier],
  exports: [TelegramClient, SlackClient, ChatNotifier]
})
export class ChatDeliveryModule {}

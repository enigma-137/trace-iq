import './config/env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DigestService, periodString } from './modules/insights/digest.service';

/**
 * Monthly digest job. Emails every organization that has activity this month
 * and hasn't received a digest yet. Run from cron:
 *
 *   node dist/digest.cli.js            # sends the current month's digests
 *   node dist/digest.cli.js 2026-07    # sends a specific month
 */
async function run(): Promise<void> {
  const period = process.argv[2] ?? periodString();
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const digest = app.get(DigestService);
    const result = await digest.sendDueDigests(period);
    console.log(`Digests sent for ${period}: ${result.sent} organization(s).`);
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
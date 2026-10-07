import * as fs from 'node:fs';
import { runSyntheticAction } from './runner.js';

export * from './runner.js';

async function main() {
  try {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    const result = await runSyntheticAction(process.env, {
      setSummary: (markdown) => {
        if (summaryFile) {
          try {
            fs.appendFileSync(summaryFile, markdown + '\n');
          } catch (e) {
            console.warn('Failed to write to GITHUB_STEP_SUMMARY:', e);
          }
        }
      }
    });

    if (process.env.GITHUB_OUTPUT) {
      try {
        fs.appendFileSync(
          process.env.GITHUB_OUTPUT,
          `status=${result.status}\npassed-count=${result.passedCount}\nfailed-count=${result.failedCount}\nrun-group-id=${result.runGroupId}\n`
        );
      } catch (e) {
        console.warn('Failed to write to GITHUB_OUTPUT:', e);
      }
    }

    process.exit(result.exitCode);
  } catch (err: any) {
    console.error(`\n❌ TraceIQ Synthetic Action Failed:\n${err.message || err}`);
    process.exit(1);
  }
}

// Only execute when run directly
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  main();
}

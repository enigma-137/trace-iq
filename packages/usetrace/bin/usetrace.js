#!/usr/bin/env node

import('../dist/cli.js').then((m) => {
  return m.runCli(process.argv.slice(2));
}).catch((err) => {
  console.error('\n✕ An unexpected error occurred in useTrace:');
  console.error(err);
  process.exit(1);
});

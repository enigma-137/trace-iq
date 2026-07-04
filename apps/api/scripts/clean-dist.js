const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const distPath = path.resolve(__dirname, '..', 'dist');
  await fs.rm(distPath, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

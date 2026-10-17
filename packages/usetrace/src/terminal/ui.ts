import readline from 'node:readline';
import { Writable } from 'node:stream';

// Color & formatting helpers
const hasColors = process.stdout.isTTY && !process.env.NO_COLOR;

export const colors = {
  reset: (s: string) => (hasColors ? `\x1b[0m${s}\x1b[0m` : s),
  bold: (s: string) => (hasColors ? `\x1b[1m${s}\x1b[22m` : s),
  dim: (s: string) => (hasColors ? `\x1b[2m${s}\x1b[22m` : s),
  italic: (s: string) => (hasColors ? `\x1b[3m${s}\x1b[23m` : s),
  underline: (s: string) => (hasColors ? `\x1b[4m${s}\x1b[24m` : s),
  cyan: (s: string) => (hasColors ? `\x1b[36m${s}\x1b[39m` : s),
  green: (s: string) => (hasColors ? `\x1b[32m${s}\x1b[39m` : s),
  yellow: (s: string) => (hasColors ? `\x1b[33m${s}\x1b[39m` : s),
  red: (s: string) => (hasColors ? `\x1b[31m${s}\x1b[39m` : s),
  blue: (s: string) => (hasColors ? `\x1b[34m${s}\x1b[39m` : s),
  magenta: (s: string) => (hasColors ? `\x1b[35m${s}\x1b[39m` : s),
  gray: (s: string) => (hasColors ? `\x1b[90m${s}\x1b[39m` : s),
  white: (s: string) => (hasColors ? `\x1b[37m${s}\x1b[39m` : s),
  bgCyan: (s: string) => (hasColors ? `\x1b[46m\x1b[30m${s}\x1b[49m\x1b[39m` : s)
};

export const symbols = {
  diamond: '◆',
  diamondOutline: '◇',
  check: '✓',
  warn: '!',
  cross: '✕',
  dot: '●',
  arrow: '>',
  line: '─',
  bullet: '•'
};

export function printBanner(subtitle = "Let's connect this project.") {
  console.log();
  console.log(`  ${colors.cyan(symbols.diamond)}  ${colors.bold('TraceIQ Setup')}`);
  if (subtitle) {
    console.log(`     ${colors.dim(subtitle)}`);
  }
  console.log();
}

export function logSuccess(message: string) {
  console.log(`  ${colors.green(symbols.check)} ${message}`);
}

export function logWarning(message: string) {
  console.log(`  ${colors.yellow(symbols.warn)} ${colors.yellow(message)}`);
}

export function logError(message: string) {
  console.log(`  ${colors.red(symbols.cross)} ${colors.red(message)}`);
}

export function logInfo(message: string) {
  console.log(`  ${colors.cyan(symbols.diamondOutline)} ${message}`);
}

export function logStep(message: string) {
  console.log(`\n${colors.bold(message)}`);
}

/**
 * Interactive Single-Select Menu (using raw keyboard inputs in TTY)
 */
export async function selectPrompt<T extends string>(
  title: string,
  options: Array<{ value: T; label: string; hint?: string }>,
  defaultIndex = 0
): Promise<T> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    // Non-interactive fallback
    console.log(`\n${title}`);
    options.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt.label}`);
    });
    return options[defaultIndex].value;
  }

  let selectedIndex = Math.min(Math.max(defaultIndex, 0), options.length - 1);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.emitKeypressEvents(process.stdin, rl);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  // Hide cursor
  process.stdout.write('\x1b[?25l');

  const render = (firstTime = false) => {
    if (!firstTime) {
      // Clear previous lines (title + options + 1 blank line)
      process.stdout.write(`\x1b[${options.length + 2}A\r\x1b[0J`);
    }

    console.log(`${colors.bold(title)}`);
    console.log();
    options.forEach((opt, idx) => {
      const isSelected = idx === selectedIndex;
      const prefix = isSelected ? colors.cyan(`${symbols.arrow} `) : '  ';
      const label = isSelected ? colors.cyan(colors.bold(opt.label)) : opt.label;
      const hint = opt.hint ? colors.dim(` (${opt.hint})`) : '';
      console.log(`${prefix}${label}${hint}`);
    });
  };

  render(true);

  return new Promise<T>((resolve) => {
    const onKeypress = (_str: string, key: readline.Key) => {
      if (key.ctrl && key.name === 'c') {
        process.stdout.write('\x1b[?25h'); // Show cursor
        process.exit(0);
      }

      if (key.name === 'up') {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1;
        render();
      } else if (key.name === 'down') {
        selectedIndex = selectedIndex < options.length - 1 ? selectedIndex + 1 : 0;
        render();
      } else if (key.name === 'return' || key.name === 'enter') {
        process.stdin.removeListener('keypress', onKeypress);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        rl.close();
        process.stdout.write('\x1b[?25h'); // Show cursor
        console.log();
        resolve(options[selectedIndex].value);
      }
    };

    process.stdin.on('keypress', onKeypress);
  });
}

/**
 * Interactive Multi-Select Checkbox Menu
 */
export async function multiSelectPrompt<T extends string>(
  title: string,
  options: Array<{ id: T; name: string; description?: string; selected: boolean }>
): Promise<T[]> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return options.filter((o) => o.selected).map((o) => o.id);
  }

  let cursorIndex = 0;
  const state = options.map((opt) => ({ ...opt }));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.emitKeypressEvents(process.stdin, rl);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdout.write('\x1b[?25l'); // Hide cursor

  const render = (firstTime = false) => {
    if (!firstTime) {
      process.stdout.write(`\x1b[${options.length + 3}A\r\x1b[0J`);
    }

    console.log(`${colors.bold(title)}`);
    console.log(colors.dim('  (Use arrow keys to navigate, space to toggle, enter to proceed)'));
    console.log();

    state.forEach((opt, idx) => {
      const isFocused = idx === cursorIndex;
      const checkbox = opt.selected ? colors.green('[x]') : colors.dim('[ ]');
      const focusArrow = isFocused ? colors.cyan(`${symbols.arrow} `) : '  ';
      const name = isFocused ? colors.cyan(colors.bold(opt.name)) : opt.name;
      const desc = opt.description ? colors.dim(` - ${opt.description}`) : '';
      console.log(`${focusArrow}${checkbox} ${name}${desc}`);
    });
  };

  render(true);

  return new Promise<T[]>((resolve) => {
    const onKeypress = (_str: string, key: readline.Key) => {
      if (key.ctrl && key.name === 'c') {
        process.stdout.write('\x1b[?25h');
        process.exit(0);
      }

      if (key.name === 'up') {
        cursorIndex = cursorIndex > 0 ? cursorIndex - 1 : state.length - 1;
        render();
      } else if (key.name === 'down') {
        cursorIndex = cursorIndex < state.length - 1 ? cursorIndex + 1 : 0;
        render();
      } else if (key.name === 'space') {
        state[cursorIndex].selected = !state[cursorIndex].selected;
        render();
      } else if (key.name === 'return' || key.name === 'enter') {
        process.stdin.removeListener('keypress', onKeypress);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        rl.close();
        process.stdout.write('\x1b[?25h');
        console.log();
        resolve(state.filter((s) => s.selected).map((s) => s.id));
      }
    };

    process.stdin.on('keypress', onKeypress);
  });
}

/**
 * Text Input Prompt
 */
export async function textPrompt(message: string, defaultValue = ''): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptMsg = defaultValue
    ? `  ${colors.bold(message)} ${colors.dim(`(${defaultValue})`)}: `
    : `  ${colors.bold(message)}: `;

  return new Promise<string>((resolve) => {
    rl.question(promptMsg, (answer) => {
      rl.close();
      const val = answer.trim() || defaultValue;
      resolve(val);
    });
  });
}

/**
 * Hidden Text Input Prompt (for tokens). Typed characters are not echoed.
 */
export async function secretPrompt(message: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    }
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output,
    terminal: Boolean(process.stdin.isTTY)
  });

  return new Promise<string>((resolve) => {
    rl.question(`  ${colors.bold(message)}: `, (answer) => {
      muted = false;
      rl.close();
      if (process.stdin.isTTY) process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = true;
  });
}

/**
 * Animated Terminal Spinner
 */
export function createSpinner(initialMessage: string) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let currentMessage = initialMessage;
  let isRunning = false;
  let timer: NodeJS.Timeout | null = null;

  const render = () => {
    if (!process.stdout.isTTY) return;
    const frame = colors.cyan(frames[frameIndex]);
    process.stdout.write(`\r  ${frame} ${currentMessage}\x1b[0K`);
    frameIndex = (frameIndex + 1) % frames.length;
  };

  return {
    start(msg?: string) {
      if (msg) currentMessage = msg;
      if (!isRunning) {
        isRunning = true;
        if (process.stdout.isTTY) {
          process.stdout.write('\x1b[?25l'); // hide cursor
          timer = setInterval(render, 80);
        } else {
          console.log(`  ${symbols.bullet} ${currentMessage}`);
        }
      }
      return this;
    },
    update(msg: string) {
      currentMessage = msg;
      if (!process.stdout.isTTY) {
        console.log(`  ${symbols.bullet} ${currentMessage}`);
      }
      return this;
    },
    succeed(msg?: string) {
      this.stop();
      console.log(`\r  ${colors.green(symbols.check)} ${msg ?? currentMessage}\x1b[0K`);
      return this;
    },
    fail(msg?: string) {
      this.stop();
      console.log(`\r  ${colors.red(symbols.cross)} ${colors.red(msg ?? currentMessage)}\x1b[0K`);
      return this;
    },
    warn(msg?: string) {
      this.stop();
      console.log(`\r  ${colors.yellow(symbols.warn)} ${colors.yellow(msg ?? currentMessage)}\x1b[0K`);
      return this;
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (isRunning) {
        isRunning = false;
        if (process.stdout.isTTY) {
          process.stdout.write('\r\x1b[0K\x1b[?25h'); // show cursor
        }
      }
      return this;
    }
  };
}

/**
 * Render File Changes Tree & Summary
 */
export function renderFileChanges(changes: {
  createdFiles: string[];
  modifiedFiles: string[];
  addedEnvVars: string[];
}) {
  console.log(`\n${colors.bold('Changes')}`);
  changes.createdFiles.forEach((file) => {
    console.log(`  ${colors.green('+')} ${file}`);
  });
  changes.modifiedFiles.forEach((file) => {
    console.log(`  ${colors.yellow('~')} ${file}`);
  });
  if (changes.addedEnvVars.length > 0) {
    console.log(`  ${colors.cyan(symbols.diamondOutline)} Environment variables updated.`);
    console.log(`  ${colors.yellow(symbols.warn)} ${colors.yellow('Restart your development server if it is already running.')}`);
  }
}

/**
 * Render Verification Success Card
 */
export function renderVerificationCard(result: {
  eventName: string;
  projectName?: string;
  environment?: string;
  source?: string;
  receivedAt?: string;
}) {
  const line = '────────────────────────────────────────────';
  console.log();
  console.log(`  ${colors.green(symbols.check)} ${colors.bold(colors.green('Connection verified'))}`);
  console.log(`  ${colors.dim(line)}`);
  console.log(`  ${colors.dim('Event')}        ${colors.bold(result.eventName)}`);
  console.log(`  ${colors.dim('Project')}      ${result.projectName ?? 'My Application'}`);
  console.log(`  ${colors.dim('Environment')}  ${result.environment ?? 'development'}`);
  console.log(`  ${colors.dim('Source')}       ${result.source ?? 'localhost:3000'}`);
  console.log(`  ${colors.dim('Received')}     ${result.receivedAt ?? 'just now'}`);
  console.log(`  ${colors.dim(line)}`);
  console.log(`\n  ${colors.bold('TraceIQ is connected and receiving data.')}`);
  console.log();
}

/**
 * Render Final Setup Report
 */
export function renderSetupReport(report: {
  detectedFramework: string;
  detectedSdk: string;
  sdkVersion?: string;
  enabledProducts: string[];
  filesChanged: string[];
  envVarsConfigured: string[];
  verificationStatus: string;
  firstVerifiedEvent?: { name: string; timestamp: string };
  warnings: string[];
  recommendations: string[];
}) {
  console.log(`\n${colors.bold('═══ TraceIQ Setup Report ═══')}`);
  console.log(`  ${colors.dim('Framework:')}       ${report.detectedFramework}`);
  console.log(`  ${colors.dim('SDK:')}             ${report.detectedSdk} ${report.sdkVersion ? `(v${report.sdkVersion})` : ''}`);
  console.log(`  ${colors.dim('Products:')}        ${report.enabledProducts.join(', ')}`);
  console.log(`  ${colors.dim('Files changed:')}   ${report.filesChanged.join(', ')}`);
  console.log(`  ${colors.dim('Env configured:')}  ${report.envVarsConfigured.join(', ')}`);
  console.log(
    `  ${colors.dim('Verification:')}    ${
      report.verificationStatus === 'verified' ? colors.green('✓ Verified') : colors.yellow(report.verificationStatus)
    }`
  );

  if (report.firstVerifiedEvent) {
    console.log(
      `  ${colors.dim('First event:')}     ${report.firstVerifiedEvent.name} at ${report.firstVerifiedEvent.timestamp}`
    );
  }

  if (report.warnings.length > 0) {
    console.log(`\n  ${colors.yellow(colors.bold('Warnings:'))}`);
    report.warnings.forEach((w) => console.log(`   ${colors.yellow(symbols.warn)} ${w}`));
  }

  if (report.recommendations.length > 0) {
    console.log(`\n  ${colors.cyan(colors.bold('Recommendations:'))}`);
    report.recommendations.forEach((r) => console.log(`   ${colors.cyan(symbols.diamondOutline)} ${r}`));
  }

  console.log(`\n  ${colors.bold('Browser CSP requirement:')}`);
  console.log(`  connect-src must allow https://api.traceiq.run`);

  console.log(`\n${colors.dim('═════════════════════════════')}\n`);
}

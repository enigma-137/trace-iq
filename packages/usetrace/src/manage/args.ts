/**
 * Minimal argv parser for the management commands.
 * Supports positionals, `--flag value`, `--flag=value`, and boolean flags.
 */
export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

const BOOLEAN_FLAGS = new Set(['follow', 'f', 'json', 'help', 'h', 'yes', 'print', 'dry-run', 'no-open']);

const ALIASES: Record<string, string> = {
  f: 'follow',
  h: 'help',
  n: 'limit',
  p: 'project',
  l: 'level',
  s: 'search'
};

export function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      const isLong = arg.startsWith('--');
      let name = arg.slice(isLong ? 2 : 1);
      let value: string | undefined;

      const eqIndex = name.indexOf('=');
      if (eqIndex !== -1) {
        value = name.slice(eqIndex + 1);
        name = name.slice(0, eqIndex);
      }

      if (!isLong && ALIASES[name]) {
        name = ALIASES[name];
      }

      if (value !== undefined) {
        flags[name] = value;
      } else if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = true;
      } else if (args[i + 1] !== undefined && !args[i + 1].startsWith('-')) {
        flags[name] = args[++i];
      } else {
        flags[name] = true;
      }
      continue;
    }

    positionals.push(arg);
  }

  return { positionals, flags };
}

export function flagString(flags: ParsedArgs['flags'], name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function flagNumber(flags: ParsedArgs['flags'], name: string): number | undefined {
  const value = flagString(flags, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function flagBool(flags: ParsedArgs['flags'], name: string): boolean {
  return flags[name] === true || flags[name] === 'true';
}

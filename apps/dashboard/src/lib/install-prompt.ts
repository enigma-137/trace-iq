// The prompt behind "Install with AI" in the Setup Wizard. Unlike the docs prompt (written for a
// chat window), this one is for a coding assistant working inside the person's repository: it
// should edit the files, wire the credentials, verify, and report, without stopping to ask
// questions the wizard already knows the answers to.

import { AI_LANGUAGES, type AiLanguage, type AiLanguageId } from '@/app/docs/ai-prompt';

/** The stacks offered as chips. `mcp` is not an app SDK, so it isn't one. */
export const INSTALL_STACKS: Array<{ id: AiLanguageId; label: string; hint: string }> = [
  { id: 'javascript', label: 'Next.js / React / JS', hint: 'Browser SDK' },
  { id: 'node', label: 'Node.js', hint: 'Express, NestJS, scripts' },
  { id: 'python', label: 'Python', hint: 'Django, Flask, FastAPI' },
  { id: 'php', label: 'PHP', hint: 'Laravel, Symfony' },
  { id: 'react-native', label: 'React Native', hint: 'Expo or bare' },
  { id: 'flutter', label: 'Flutter', hint: 'iOS and Android' },
  { id: 'swift', label: 'Swift', hint: 'iOS and macOS' },
  { id: 'kotlin', label: 'Kotlin', hint: 'Android and JVM' },
  { id: 'rust', label: 'Rust', hint: 'Axum, Actix' },
  { id: 'other', label: 'Other', hint: 'Go, Ruby, Java… over HTTP' }
];

export interface InstallPromptInput {
  language: AiLanguage;
  projectId: string;
  projectName: string;
  /** Omitted until a write key exists; the prompt then says so rather than inventing one. */
  writeKey?: string;
  apiUrl: string;
  /** Product ids picked in the wizard's first step. */
  products: string[];
}

const SERVER_STACKS: AiLanguageId[] = ['node', 'python', 'php', 'rust', 'other'];
const MOBILE_STACKS: AiLanguageId[] = ['react-native', 'flutter', 'swift', 'kotlin'];

const PRODUCT_LABELS: Record<string, string> = {
  'product-analytics': 'product analytics',
  'web-analytics': 'web analytics',
  'error-tracking': 'error tracking',
  'feature-flags': 'feature flags',
  'revenue-analytics': 'revenue',
  'user-analytics': 'user analytics',
  'web-vitals': 'web vitals',
  funnels: 'funnels'
};

/** Where each stack keeps its credentials, so the assistant follows the project's own convention. */
function credentialsGuidance(id: AiLanguageId, apiUrl: string): string[] {
  if (id === 'javascript') {
    return [
      'Put the three values in environment variables using the framework\'s public prefix, and add the names (without real values) to the env example file if there is one:',
      `   Next.js: NEXT_PUBLIC_TRACEIQ_PROJECT_ID, NEXT_PUBLIC_TRACEIQ_WRITE_KEY, NEXT_PUBLIC_TRACEIQ_API_URL (${apiUrl})`,
      '   Vite: VITE_TRACEIQ_PROJECT_ID, VITE_TRACEIQ_WRITE_KEY, VITE_TRACEIQ_API_URL',
      'Write the real values to the local env file (.env.local for Next.js) and make sure that file is git-ignored.'
    ];
  }
  if (SERVER_STACKS.includes(id)) {
    return [
      `Read them from environment variables: TRACEIQ_PROJECT_ID, TRACEIQ_WRITE_KEY and TRACEIQ_ENDPOINT (${apiUrl}). Without TRACEIQ_ENDPOINT most SDKs send to localhost, so set it everywhere.`,
      'Write the real values to the local env file, add the names (without values) to the env example file, and make sure the real file is git-ignored.'
    ];
  }
  if (MOBILE_STACKS.includes(id)) {
    return [
      'Keep the values in the project\'s own configuration mechanism (build config, --dart-define, Info.plist/xcconfig, BuildConfig, or an env package), not scattered through the code.'
    ];
  }
  return ['Keep the values out of the source: use the project\'s existing configuration or environment variables.'];
}

/** Stack-specific advice that stops the common ways an install breaks an app. */
function stackWarnings(id: AiLanguageId): string[] {
  if (id === 'javascript') {
    return [
      'Initialize in the browser only: nothing may touch `window` while the page renders on the server. In Next.js App Router, create a small `"use client"` provider that calls `initialize()` inside a `useEffect`, and mount it in the root layout around the `{children}` rendered inside the JSX. Never edit the layout function\'s parameter list.',
      'Initialize once, not on every render.'
    ];
  }
  if (id === 'node') {
    return ['Create one shared client for the whole process, and call `await traceiq.shutdown()` before short-lived processes such as scripts and serverless functions exit.'];
  }
  if (id === 'python' || id === 'php' || id === 'rust') {
    return ['Create one shared client. Flush or shut it down before a short-lived process exits so queued events are sent.'];
  }
  return [];
}

export function buildInstallPrompt({ language, projectId, projectName, writeKey, apiUrl, products }: InstallPromptInput): string {
  const picked = products.map((id) => PRODUCT_LABELS[id]).filter(Boolean);
  const browserOptions =
    language.id === 'javascript'
      ? [
          `Turn on page views (autoTrackPageViews: ${products.includes('web-analytics') || products.includes('product-analytics')}), `,
          `error capture (autoCaptureExceptions: ${products.includes('error-tracking')}), `,
          `web vitals (autoCaptureWebVitals: ${products.includes('web-vitals')}) and rage clicks (autoCaptureRageClicks: true) in \`initialize()\`.`
        ].join('')
      : null;

  const init = language.init.split('__API_BASE_URL__').join(apiUrl);
  const writeKeyLine = writeKey
    ? `- Write key: ${writeKey}`
    : '- Write key: not created yet. Tell me to create one in TraceIQ → Setup Wizard before this can send events. Do not invent one.';

  const lines: string[] = [
    `Install TraceIQ analytics in this project, end to end. You can see the repository, so make the changes yourself instead of describing them.`,
    '',
    'PROJECT',
    `- TraceIQ project: ${projectName}`,
    `- Project ID: ${projectId}`,
    writeKeyLine,
    `- API endpoint: ${apiUrl}`,
    `- Chosen stack: ${INSTALL_STACKS.find((item) => item.id === language.id)?.label ?? language.label}. Confirm it from the repository (package.json, requirements.txt, composer.json, pubspec.yaml, etc.). If the project is actually something else, use the matching TraceIQ SDK and say so.`
  ];
  if (picked.length > 0) lines.push(`- Features I want: ${picked.join(', ')}.`);

  lines.push(
    '',
    'STEPS',
    language.id === 'other'
      ? '1. There is no SDK for this language, so there is nothing to install. Send events to the TraceIQ HTTP API instead, from one small helper.'
      : `1. Install the SDK with the project's own package manager (check the lockfile): ${language.install}`
  );
  lines.push('2. Initialize it once, near the application entry point. Reference code, with the credentials read from configuration rather than typed in:', indent(init));
  lines.push('3. Credentials:', ...credentialsGuidance(language.id, apiUrl).map((line) => `   ${line}`));

  let step = 4;
  for (const text of [...stackWarnings(language.id), ...(browserOptions ? [browserOptions] : [])]) {
    lines.push(`${step}. ${text}`);
    step += 1;
  }
  lines.push(
    `${step}. If the app has sign-in, call identify once the user is known, using the same stable id the backend uses (database id or email). Skip this if there is no auth flow.`,
    `${step + 1}. Analytics must never break the app: a TraceIQ failure should never throw into your code or block a request or a render.`
  );

  // The docs' own notes for this SDK, for reference. Install and "create a project" repeat the
  // steps above, so they are left out rather than competing with them.
  const notes = language.steps.filter((text) => !/^(Install the SDK|Create a project)/.test(text));
  if (notes.length > 0) lines.push('', 'SDK NOTES (reference)', ...notes.map((text) => `- ${text}`));

  lines.push(
    '',
    'VERIFY',
    '- Run the checks this project already has (build, typecheck, tests) and fix anything you broke.',
    "- Start the app and load a page, or run the code path, so a first event is sent. TraceIQ's Setup Wizard is open and listening: it shows Connected when that first event arrives. If you cannot run the app, say so and tell me what to do.",
    '',
    'ONLY STOP TO ASK IF YOU ARE BLOCKED',
    'For example, a monorepo with several apps (ask which one), or two incompatible setups. Otherwise make the sensible choice and note it.',
    '',
    'WHEN YOU ARE DONE, TELL ME',
    '- the files you created or changed',
    '- the environment variables I must also set where this app is deployed (Vercel, Render, a server)',
    '- anything you did not do'
  );

  if (language.docs.length > 0) {
    lines.push('', 'DOCS', ...language.docs.map((doc) => `- ${doc.label}: https://traceiq.run${doc.href}`));
  }
  return lines.join('\n');
}

const indent = (text: string) => text.split('\n').map((line) => `   ${line}`).join('\n');

export function findInstallLanguage(id: AiLanguageId): AiLanguage {
  return AI_LANGUAGES.find((language) => language.id === id) ?? AI_LANGUAGES[0];
}

// The prompt users paste into Claude Code, Cursor or another coding assistant to add
// revenue tracking to their app. Shared by Settings → Revenue and the Revenue docs.

export const DEFAULT_SUCCESS_EVENT = 'payment_succeeded';
export const DEFAULT_FAILED_EVENT = 'payment_failed';
export const DEFAULT_INGEST_ENDPOINT = 'https://api.traceiq.run';

export type RevenueBackend = 'node' | 'python' | 'php' | 'rust' | 'http';

export const REVENUE_BACKENDS: { id: RevenueBackend; label: string; hint: string }[] = [
  { id: 'node', label: 'Node.js', hint: 'Express, NestJS, Next.js API routes' },
  { id: 'python', label: 'Python', hint: 'Django, Flask, FastAPI' },
  { id: 'php', label: 'PHP', hint: 'Laravel, Symfony' },
  { id: 'rust', label: 'Rust', hint: 'Axum, Actix' },
  { id: 'http', label: 'Other', hint: 'Go, Ruby, Java, .NET: HTTP API' }
];

interface ExampleOptions {
  successEvent?: string;
  currency?: string;
  amountProperty?: string;
}

/** The SDK setup each backend needs, as prompt lines (install, client, env). */
function setupSteps(backend: RevenueBackend, endpoint: string): string {
  switch (backend) {
    case 'python':
      return `   - Install the TraceIQ Python SDK: pip install traceiq-py (add it to requirements.txt or pyproject). It uses only the standard library and flushes on a background thread.
   - Create one shared client, for example in a traceiq.py module (in Django, alongside settings or in a core app):
     import os
     from traceiq import Client
     traceiq = Client(project_id=os.environ["TRACEIQ_PROJECT_ID"], write_key=os.environ["TRACEIQ_WRITE_KEY"], endpoint=os.environ.get("TRACEIQ_ENDPOINT", "${endpoint}"))
   - Use this SDK. Don't write your own HTTP calls to TraceIQ.`;
    case 'php':
      return `   - Install the TraceIQ PHP SDK: composer require traceiq/traceiq-php (PHP 8.1+, no dependencies).
   - Create one shared client (in Laravel, bind it as a singleton in a service provider):
     use TraceIQ\\Client;
     $traceiq = new Client(projectId: getenv('TRACEIQ_PROJECT_ID'), writeKey: getenv('TRACEIQ_WRITE_KEY'), endpoint: getenv('TRACEIQ_ENDPOINT') ?: '${endpoint}');
   - PHP has no background thread: events flush at the batch size and on request shutdown. In queue workers and CLI scripts, call $traceiq->shutdown() when the job ends.`;
    case 'rust':
      return `   - Add the TraceIQ crate: cargo add traceiq serde_json. It flushes on a background thread.
   - Create one shared client (for example in your app state):
     let traceiq = traceiq::Client::builder(&std::env::var("TRACEIQ_PROJECT_ID")?, &std::env::var("TRACEIQ_WRITE_KEY")?)
         .endpoint(&std::env::var("TRACEIQ_ENDPOINT").unwrap_or_else(|_| "${endpoint}".into()))
         .build();
   - Call traceiq.shutdown() on graceful shutdown so queued events are sent.`;
    case 'http':
      return `   - There is no SDK for this language, so send events to the TraceIQ HTTP API:
     POST ${endpoint}/v1/events
     Headers: content-type: application/json, x-traceiq-write-key: <TRACEIQ_WRITE_KEY>
     Body: { "projectId": "<TRACEIQ_PROJECT_ID>", "userId": "...", "eventName": "...", "properties": { ... }, "timestamp": "<ISO 8601>" }
     A successful response is { "accepted": true, "eventId": "evt_..." }. Several events at once: POST /v1/events/batch with { "projectId": "...", "batch": [ ...events ] } (up to 500).
   - Wrap this in one small helper (for example traceiq.Capture(event, userId, properties)) with a short timeout, and call it off the request path (a goroutine, background job or queue) so the webhook response never waits on it.`;
    default:
      return `   - Install the TraceIQ Node SDK: npm install traceiq-node.
   - Create one shared client:
     import { TraceIQ } from 'traceiq-node';
     export const traceiq = new TraceIQ({ projectId: process.env.TRACEIQ_PROJECT_ID!, writeKey: process.env.TRACEIQ_WRITE_KEY!, endpoint: process.env.TRACEIQ_ENDPOINT ?? '${endpoint}' });
   - In serverless functions, await traceiq.flush() before returning.`;
  }
}

/** How to send the success event in each backend, as indented prompt lines. */
function captureCall(backend: RevenueBackend, successEvent: string, currency: string, amountProperty: string): string {
  switch (backend) {
    case 'python':
      return `     traceiq.capture(
         "${successEvent}",
         user_id=<the same user id the frontend passes to traceiq.identify>,
         properties={
             "${amountProperty}": <amount in the main currency unit: naira, not kobo; dollars, not cents>,
             "currency": "<ISO code, e.g. ${currency}>",
             "provider": "<paystack | flutterwave | stripe | …>",
             "reference": <the provider's transaction reference>,
             "plan": <plan or product, if any>,
         },
     )`;
    case 'php':
      return `     $traceiq->capture(
         event: '${successEvent}',
         userId: <the same user id the frontend passes to traceiq.identify>,
         properties: [
             '${amountProperty}' => <amount in the main currency unit: naira, not kobo; dollars, not cents>,
             'currency' => '<ISO code, e.g. ${currency}>',
             'provider' => '<paystack | flutterwave | stripe | …>',
             'reference' => <the provider's transaction reference>,
             'plan' => <plan or product, if any>,
         ],
     );`;
    case 'rust':
      return `     traceiq.capture("${successEvent}", Some(<the same user id the frontend passes to traceiq.identify>), None,
         Some(serde_json::json!({
             "${amountProperty}": <amount in the main currency unit: naira, not kobo; dollars, not cents>,
             "currency": "<ISO code, e.g. ${currency}>",
             "provider": "<paystack | flutterwave | stripe | …>",
             "reference": <the provider's transaction reference>,
             "plan": <plan or product, if any>
         })), None, None);`;
    case 'http':
      return `     POST /v1/events with
     {
       "projectId": "<TRACEIQ_PROJECT_ID>",
       "userId": <the same user id the frontend passes to traceiq.identify>,
       "eventName": "${successEvent}",
       "properties": {
         "${amountProperty}": <amount in the main currency unit: naira, not kobo; dollars, not cents>,
         "currency": "<ISO code, e.g. ${currency}>",
         "provider": "<paystack | flutterwave | stripe | …>",
         "reference": <the provider's transaction reference>,
         "plan": <plan or product, if any>
       },
       "timestamp": "<when the provider confirmed it, ISO 8601>"
     }`;
    default:
      return `     traceiq.capture({
       event: '${successEvent}',
       userId: <the same user id the frontend passes to traceiq.identify>,
       properties: {
         ${amountProperty}: <amount in the main currency unit: naira, not kobo; dollars, not cents>,
         currency: '<ISO code, e.g. ${currency}>',
         provider: '<paystack | flutterwave | stripe | …>',
         reference: <the provider's transaction reference>,
         plan: <plan or product, if any>
       }
     });`;
  }
}

/** A short, real-looking snippet for the Revenue settings page. */
export function buildRevenueExample(
  backend: RevenueBackend,
  { successEvent = DEFAULT_SUCCESS_EVENT, currency = 'USD', amountProperty = 'amount' }: ExampleOptions = {}
): { language: string; code: string } {
  switch (backend) {
    case 'python':
      return {
        language: 'Python',
        code: `traceiq.capture(
    "${successEvent}",
    user_id=user.email,
    properties={"${amountProperty}": 5000, "currency": "${currency}", "reference": "T123"},
)`
      };
    case 'php':
      return {
        language: 'PHP',
        code: `$traceiq->capture(
    event: '${successEvent}',
    userId: $user->email,
    properties: ['${amountProperty}' => 5000, 'currency' => '${currency}', 'reference' => 'T123'],
);`
      };
    case 'rust':
      return {
        language: 'Rust',
        code: `traceiq.capture("${successEvent}", Some(&user.email), None,
    Some(serde_json::json!({ "${amountProperty}": 5000, "currency": "${currency}", "reference": "T123" })),
    None, None);`
      };
    case 'http':
      return {
        language: 'HTTP',
        code: `curl -X POST ${DEFAULT_INGEST_ENDPOINT}/v1/events \\
  -H 'content-type: application/json' \\
  -H 'x-traceiq-write-key: YOUR_PROJECT_WRITE_KEY' \\
  -d '{ "projectId": "YOUR_PROJECT_ID", "userId": "user@example.com",
        "eventName": "${successEvent}",
        "properties": { "${amountProperty}": 5000, "currency": "${currency}", "reference": "T123" } }'`
      };
    default:
      return {
        language: 'Node.js',
        code: `traceiq.capture({
  event: '${successEvent}',
  userId: user.email,
  properties: { ${amountProperty}: 5000, currency: '${currency}', reference: 'T123' }
});`
      };
  }
}

export function buildRevenueSetupPrompt({
  projectId,
  currency = 'USD',
  successEvent = DEFAULT_SUCCESS_EVENT,
  failedEvent = DEFAULT_FAILED_EVENT,
  amountProperty = 'amount',
  backend = 'node',
  endpoint = DEFAULT_INGEST_ENDPOINT
}: {
  projectId?: string;
  currency?: string;
  successEvent?: string;
  failedEvent?: string;
  amountProperty?: string;
  backend?: RevenueBackend;
  endpoint?: string;
}) {
  const label = REVENUE_BACKENDS.find((item) => item.id === backend)?.label ?? 'Node.js';
  const language = backend === 'http' ? 'this language' : label;

  return `Add revenue tracking to this app with TraceIQ. Track every successful and failed payment from the backend (${backend === 'http' ? 'using the TraceIQ HTTP API' : label}), where the payment provider confirms it.

1. Find the payment flow
   - Find the payment provider (Paystack, Flutterwave, Stripe, Monnify, Paddle or another) and where payments are confirmed: the provider's webhook handler and any "verify transaction" call.
   - If there is no webhook handler, add one using the provider's signature check (for example Paystack's x-paystack-signature HMAC, Stripe's constructEvent).
   - Reuse the existing payment logic. Only add the tracking calls.

2. Set up TraceIQ for ${language}
${setupSteps(backend, endpoint)}
   - Add TRACEIQ_PROJECT_ID${projectId ? ` (${projectId})` : ''}, TRACEIQ_WRITE_KEY and TRACEIQ_ENDPOINT (${endpoint}) to the env example file. Never hard-code the write key. Without TRACEIQ_ENDPOINT the SDKs send to localhost.

3. Use the same user id as the frontend
   - Payment events must use the exact id the frontend passes to traceiq.identify(), or they won't join the user's journey.
   - Look for that identify call in this repository. If the frontend lives in another repository, ask me which id it uses (email, database id or UUID). Don't assume the backend's user id matches.

4. Send "${successEvent}" when a payment is confirmed
   - Only after the provider confirms it (Paystack charge.success, Flutterwave charge.completed with status "successful", Stripe payment_intent.succeeded or invoice.paid).
${captureCall(backend, successEvent, currency, amountProperty)}
   - Paystack and Stripe send amounts in the smallest unit, so divide by 100.
   - Send it once per payment. Webhooks are retried, so skip a reference you've already recorded.

5. Send "${failedEvent}" when a payment fails
   - On the provider's failure webhook (Paystack charge.failed, Stripe payment_intent.payment_failed, Flutterwave status "failed"), and when your own verify call says it failed.
   - Same properties as above plus reason: <the provider's failure message or code>.
   - Don't include card numbers, CVV, bank details or the customer's email in properties.

6. Clean up existing events
   - Events that only show intent (checkout_started, plan_selected, redirected to the gateway) must not carry an "${amountProperty}" property. Rename it to "price" if you need it.
   - Keep the existing frontend checkout events as funnel steps.

7. Before finishing
   - Tracking must never throw, fail or delay payment processing or the webhook response. Catch and log any analytics error.
   - Add or update tests for the webhook handler: a successful payment, a failed payment, and the same webhook delivered twice.
   - Tell me the exact event names you used for successful and failed payments, so I can select them in TraceIQ → Settings → Revenue.`;
}

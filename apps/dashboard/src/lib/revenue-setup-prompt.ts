// The prompt users paste into Claude Code, Cursor or another coding assistant to add
// revenue tracking to their app. Shared by Settings → Revenue and the Revenue docs.

export const DEFAULT_SUCCESS_EVENT = 'payment_succeeded';
export const DEFAULT_FAILED_EVENT = 'payment_failed';

export function buildRevenueSetupPrompt({
  projectId,
  currency = 'USD',
  successEvent = DEFAULT_SUCCESS_EVENT,
  failedEvent = DEFAULT_FAILED_EVENT
}: {
  projectId?: string;
  currency?: string;
  successEvent?: string;
  failedEvent?: string;
}) {
  return `Add revenue tracking to this app with TraceIQ. Track every successful and failed payment from the backend, where the payment provider confirms it.

1. Find the payment flow
   - Find the payment provider (Paystack, Flutterwave, Stripe, Monnify, Paddle or another) and where payments are confirmed: the provider's webhook handler and any "verify transaction" call.
   - If there is no webhook handler, add one using the provider's signature check (for example Paystack's x-paystack-signature HMAC, Stripe's constructEvent).

2. Set up the TraceIQ server SDK
   - Install traceiq-node if it isn't installed.
   - Create one shared client:
     import { TraceIQ } from 'traceiq-node';
     export const traceiq = new TraceIQ({ projectId: process.env.TRACEIQ_PROJECT_ID!, writeKey: process.env.TRACEIQ_WRITE_KEY! });
   - Add TRACEIQ_PROJECT_ID${projectId ? ` (${projectId})` : ''} and TRACEIQ_WRITE_KEY to the env example file. Never hard-code the write key.
   - For a non-Node backend, send the same events with a POST to the TraceIQ ingest API instead.

3. Send "${successEvent}" when a payment is confirmed
   - Only after the provider confirms it (Paystack charge.success, Flutterwave charge.completed with status "successful", Stripe payment_intent.succeeded or invoice.paid).
   - traceiq.capture({
       event: '${successEvent}',
       userId: <the same user id the frontend passes to traceiq.identify>,
       properties: {
         amount: <amount in the main currency unit: naira, not kobo; dollars, not cents>,
         currency: '<ISO code, e.g. ${currency}>',
         provider: '<paystack | flutterwave | stripe | …>',
         reference: <the provider's transaction reference>,
         plan: <plan or product, if any>
       }
     });
   - Paystack and Stripe send amounts in the smallest unit, so divide by 100.
   - Send it once per payment. Webhooks are retried, so skip a reference you've already recorded.

4. Send "${failedEvent}" when a payment fails
   - On the provider's failure webhook (Paystack charge.failed, Stripe payment_intent.payment_failed, Flutterwave status "failed"), and when your own verify call says it failed.
   - Same properties as above plus reason: <the provider's failure message or code>.
   - Don't include card numbers, CVV, bank details or the customer's email in properties.

5. Clean up existing events
   - Events that only show intent (checkout_started, plan_selected, redirected to the gateway) must not carry an "amount" property. Rename it to "price" if you need it.
   - Keep the existing frontend checkout events as funnel steps.

6. Before finishing
   - Make sure capture never throws or delays the webhook response; the SDK batches in the background. Call traceiq.flush() before exit in serverless functions.
   - Add or update tests for the webhook handler.
   - Tell me the exact event names you used for successful and failed payments, so I can select them in TraceIQ → Settings → Revenue.`;
}

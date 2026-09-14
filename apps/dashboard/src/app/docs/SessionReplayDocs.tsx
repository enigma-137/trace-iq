import type { ReactNode } from "react";
import Link from "next/link";
import { SDK_VERSIONS } from "@/lib/sdkVersions";
import { CodeBlock } from "./CodeBlock";

interface SessionReplayDocsProps {
  projectId: string;
  apiBaseUrl: string;
}

export function SessionReplayDocs({
  projectId,
  apiBaseUrl,
}: SessionReplayDocsProps) {
  return (
    <div className="space-y-8">
      <ReplaySection id="session-replay" title="Session Replay">
        <ReplayP>
          Reconstruct how a browser or mobile app session unfolded without
          recording a video. The browser SDK captures a sanitized rrweb stream;
          the React Native SDK captures content-free structural snapshots and
          interaction markers. Both use Replay&apos;s separate retention controls
          and the Replays workspace, but have different recorders and players.
        </ReplayP>
        <Callout tone="info" title="Choose your SDK">
          For browser replay, complete the{" "}
          <Link
            className="font-semibold underline underline-offset-4"
            href="/docs?page=quickstart"
          >
            JavaScript installation guide
          </Link>{" "}
          first and use the current browser SDK (v{SDK_VERSIONS.javascript}) or
          later. For an iOS/Android app, start with the{" "}
          <Link className="font-semibold underline underline-offset-4" href="/docs?page=react-native">
            React Native / Expo SDK
          </Link>{" "}
          and follow the mobile section below. Mobile replay requires the
          recorder-enabled <ReplayMono>traceiq-react-native@0.2.0</ReplayMono>;
          confirm that version is published before installing it.
        </Callout>
        <Callout tone="warning" title="Privacy starts in your application">
          Browser DOM replay can contain personal data; conservative masking
          and two sanitization passes reduce that risk. Mobile replay instead
          sends placeholder geometry, never text or image content. You remain
          responsible for your notice, lawful basis or consent, reviewed safe
          regions, retention choice, and data-subject process. Neither masking
          nor structural capture guarantees legal compliance.
        </Callout>
      </ReplaySection>

      <ReplaySection id="replay-overview" title="What Session Replay does">
        <ReplayP>
          Browser replay dynamically loads{" "}
          <ReplayMono>@rrweb/record</ReplayMono>, records DOM snapshots and
          incremental changes, sanitizes every event before transport, and
          uploads bounded chunks. The API sanitizes each decoded chunk again,
          compresses it, and stores the payload outside PostgreSQL. PostgreSQL
          contains searchable ownership, timing, size, checksum, status, and
          retention metadata—not the rrweb DOM payload. React Native replay
          uses the separate <ReplayMono>mobile-structural-v1</ReplayMono> format
          and never loads rrweb. Its snapshots contain a static screen ID,
          viewport, and explicitly marked placeholder rectangles; tap, scroll,
          navigation, and lifecycle events form the timeline.
        </ReplayP>
        <ReplayBullets
          items={[
            [
              "Captured",
              "DOM structure, sanitized text and attributes, DOM mutations, and supported interaction events needed to reconstruct the session.",
            ],
            [
              "Not a video",
              "TraceIQ does not record a screen-capture or camera stream and does not store rendered video frames.",
            ],
            [
              "Intentionally omitted",
              "Canvas recording and font collection are disabled. Scripts and several nonessential head/comment nodes are slimmed from rrweb snapshots.",
            ],
            [
              "Frames",
              "Iframe content is blocked by default. Cross-origin frames are never recorded; a reviewed same-origin frame requires an explicit opt-in and must pass safety checks.",
            ],
            [
              "Separate lifecycle",
              "Replay payloads have their own enablement, sampling, upload, storage, retention, deletion, and authorization path. Normal analytics events continue independently.",
            ],
          ]}
        />
      </ReplaySection>

      <ReplaySection
        id="replay-requirements"
        title="Requirements and availability"
      >
        <ReplayBullets
          items={[
            [
              "Supported SDKs",
              `Use traceiq-sdk-js ${SDK_VERSIONS.javascript} or later for browser replay, or traceiq-react-native 0.2.0 or later for iOS/Android structural replay. The Node.js SDK does not record sessions.`,
            ],
            [
              "Browser runtime",
              "Replay requires a browser document plus fetch and AbortController. Native CompressionStream support is optional; the SDK falls back to uncompressed JSON transport and the API still compresses storage.",
            ],
            [
              "Mobile runtime",
              "React Native / Expo replay runs on iOS and Android. It uses JavaScript-managed opt-in views, not browser DOM capture, screenshots, video, or rrweb.",
            ],
            [
              "Project setting",
              "An owner or admin must enable Session Replay for the project in Dashboard → Settings → Session Replay. The default is off.",
            ],
            [
              "SDK opt-in",
              "Your browser or React Native initialization must also set replay.enabled to true and explicitly grant consent. A dashboard setting alone does not start a recorder.",
            ],
            [
              "Cloud availability",
              "TraceIQ Cloud includes Session Replay with Pro and blocks it on Free. A Pro organization is entitled automatically, but an owner/admin must still select flows and switch recording on. An emergency operator kill switch may still disable it.",
            ],
            [
              "Self-hosting",
              "Replay is available without a Cloud entitlement, but the TraceIQ operator must configure persistent replay storage and apply the replay schema before enabling it. Application code only needs the correct API endpoint.",
            ],
          ]}
        />
      </ReplaySection>

      <ReplaySection id="replay-enable" title="Enable browser Replay">
        <ReplayP>
          After completing the JavaScript Quickstart, enable replay for the
          intended project under{" "}
          <Link
            className="font-semibold text-blue-600 hover:underline dark:text-cyan-400"
            href="/dashboard/settings/replay"
          >
            Session Replay settings
          </Link>
          . Keep the conservative defaults—Strict privacy and required
          consent—while validating your integration. Merge the replay block
          below into your existing <ReplayMono>initialize()</ReplayMono> call;
          do not initialize the SDK a second time.
        </ReplayP>
        <ReplayCode>{`import { traceiq } from 'traceiq-sdk-js';

traceiq.initialize({
  projectId: '${projectId}',
  writeKey: 'YOUR_PROJECT_WRITE_KEY',
  endpoint: '${apiBaseUrl}',
  replay: {
    enabled: true,
    requireConsent: true,
  },
});

// Call this only after your CMP reports valid replay consent.
traceiq.grantReplayConsent();`}</ReplayCode>
        <ReplayP>
          Call <ReplayMono>initialize()</ReplayMono> once in your application
          bootstrap. The project write key is the public, project-scoped browser
          credential; never put a dashboard token, Supabase service-role key, or
          other server secret in client code. When consent is withdrawn, call{" "}
          <ReplayMono>traceiq.revokeReplayConsent()</ReplayMono> immediately.
        </ReplayP>
      </ReplaySection>

      <ReplaySection id="replay-react-native" title="React Native / Expo session replay">
        <ReplayP>
          Use <ReplayMono>traceiq-react-native@0.2.0</ReplayMono> or later on
          iOS/Android. The npm <ReplayMono>0.1.0</ReplayMono> release has analytics
          only; check that 0.2.0 is available before installation. Keep your
          existing analytics initialization and add the replay option. In the{" "}
          <Link className="font-semibold text-blue-600 hover:underline dark:text-cyan-400" href="/dashboard/settings/replay">
            project Replay settings
          </Link>
          , enable recording and select a funnel whose first step is the
          accepted event you intend to trigger. Start with Strict privacy and
          required consent.
        </ReplayP>
        <ReplayCode lang="bash">{'npm install traceiq-react-native@^0.2.0'}</ReplayCode>
        <ReplayCode lang="tsx">{`import { createReplayComponents, traceiq } from 'traceiq-react-native';

traceiq.initialize({
  projectId: '${projectId}',
  writeKey: 'YOUR_PROJECT_WRITE_KEY',
  endpoint: '${apiBaseUrl}',
  replay: { enabled: true },
});

// Call only after your app's replay-purpose consent flow succeeds.
traceiq.grantReplayConsent();

// Create once at module scope; IDs are unique positive integers per screen.
const { ReplayScreen, ReplayRegion } = createReplayComponents(traceiq);

function CheckoutScreen() {
  return (
    <ReplayScreen screen="Checkout">
      <ReplayRegion id={1} kind="control"><CheckoutButton /></ReplayRegion>
      <ReplayRegion id={2} kind="blocked"><PaymentForm /></ReplayRegion>
    </ReplayScreen>
  );
}

// Match the first step of a selected funnel. Recording begins only after
// normal analytics ingestion accepts this event and the API grants upload.
traceiq.capture({ event: 'checkout_started' });

// Wire these to your app's lifecycle; do not call them at startup.
function onReplayConsentWithdrawn() { traceiq.revokeReplayConsent(); }
function onLogout() { traceiq.reset(); }`}</ReplayCode>
        <ReplayBullets
          items={[
            [
              "Start gates",
              "Recording stays off until project enablement, a selected funnel's first event accepted by the API, sampling, SDK opt-in, explicit consent, and a short-lived upload grant all pass. A queued or rejected analytics event is not enough. No view layout is measured before the grant.",
            ],
            [
              "Safe regions",
              "ReplayScreen captures viewport dimensions and touch locations. Only ReplayRegion views become nodes; unmarked views remain blank. Use static screen IDs, positive unique region IDs, and block payment, credential, personal-data, native, and third-party surfaces. Input and blocked regions suppress interactions inside them.",
            ],
            [
              "Custom gestures",
              "For custom controls that intercept touches or scrolls, call recordReplayTap(x, y) or recordReplayScroll(x, y, deltaX, deltaY) with replay-screen-relative logical coordinates. Events outside safe regions are dropped.",
            ],
            [
              "Lifecycle and delivery",
              "App backgrounding stops visual capture and requests a best-effort flush. Revocation, logout, or session rotation discards unsent replay content. Chunks stay in memory, never in an on-device replay cache, so a network interruption can leave a gap.",
            ],
            [
              "Privacy and playback",
              "Text, input values, accessibility labels, image pixels, screenshots, network bodies, and arbitrary props are not part of the mobile format. The dashboard draws generic shapes and tap/scroll/navigation/lifecycle markers; it never reconstructs the original UI assets.",
            ],
          ]}
        />
        <ReplayP>
          Normal <ReplayMono>screen()</ReplayMono> and{" "}
          <ReplayMono>capture()</ReplayMono> events remain separate analytics
          events. The replay is associated with their accepted session ID. See
          the{" "}
          <Link className="font-semibold text-blue-600 hover:underline dark:text-cyan-400" href="/docs?page=react-native">
            React Native SDK guide
          </Link>{" "}
          for ordinary event tracking and the{" "}
          <Link className="font-semibold text-blue-600 hover:underline dark:text-cyan-400" href="/dashboard/replays">
            Replays workspace
          </Link>{" "}
          to inspect a recording.
        </ReplayP>
      </ReplaySection>

      <ReplaySection id="replay-settings" title="Dashboard settings">
        <ReplayP>
          Settings are per project. Owners and admins can save them;
          organization entitlements may impose stricter Cloud limits. Recorder
          configuration is fetched when a recording start is attempted, so new
          values govern new starts. Disabling replay also causes the API to
          reject subsequent chunk uploads from an active recorder.
          Previously stored chunks are not erased by changing a setting.
        </ReplayP>
        <ReplayTable
          columns={["Setting", "Default", "Behavior"]}
          rows={[
            [
              "Session Replay",
              "Off",
              "Server-authoritative project switch. Both this and replay.enabled in the SDK must be on.",
            ],
            [
              "Sample rate",
              "10%",
              "Deterministic project rate from 0–100%. The SDK can lower, but cannot raise, this rate.",
            ],
            [
              "Maximum duration",
              "600 seconds",
              "Stops and finalizes capture after this many seconds. Valid project range is 1–14,400 seconds in the current API.",
            ],
            [
              "Retention",
              "30 days",
              "Sets expiry for newly created replays. Valid range is 1–3,650 days, subject to any stricter entitlement.",
            ],
            [
              "Privacy mode",
              "Strict",
              "Strict, Balanced, or Custom behavior described below.",
            ],
            [
              "Require replay consent",
              "On",
              "Prevents rrweb import and start until grantReplayConsent() is called. Client code may add this gate but cannot bypass a required server policy.",
            ],
            [
              "Flows to record",
              "None",
              "Select at least one existing project funnel. Recording starts only after an accepted event matches its current first step; zero selections always means record nothing.",
            ],
            [
              "Custom selectors",
              "None",
              "Additional CSS selectors for masking, blocking, or interaction suppression. Invalid selectors are ignored by the recorder.",
            ],
          ]}
        />
        <Callout tone="info" title="When changes apply">
          Sampling, maximum duration, privacy mode, consent policy, and
          selectors are fixed from the configuration returned for that start
          attempt. Reload or deliberately start a new browser recording to fetch
          changed configuration. Retention changes do not rewrite the expiry of
          existing replays.
        </Callout>
        <Callout tone="info" title="Flow matching and pre-trigger context">
          Replay reuses funnel event-name semantics. A <ReplayMono>$page</ReplayMono>{" "}
          first step matches accepted page events, while a custom first step matches
          that custom event. Route-specific conditions require a route event already
          represented in the funnel model. TraceIQ does not collect a background DOM
          buffer before the match; rrweb is imported only after the qualifying event.
          Once started, one bounded replay continues for the session, and matching
          additional selected funnels associates them with that same replay.
        </Callout>
      </ReplaySection>

      <ReplaySection id="replay-consent" title="Browser consent lifecycle">
        <ReplayP>
          TraceIQ supplies recorder controls, not a consent-management platform.
          Your CMP or consent UI remains the source of truth. Consent is held in
          memory by the SDK and is not restored from cookies or local storage,
          so bridge the current CMP decision on every page load.
        </ReplayP>
        <ReplayCode>{`// Run whenever your CMP's replay-purpose decision changes.
function applyReplayConsent(consented: boolean) {
  if (consented) {
    traceiq.grantReplayConsent();
  } else {
    traceiq.revokeReplayConsent();
  }
}`}</ReplayCode>
        <ReplayBullets
          items={[
            [
              "grantReplayConsent()",
              "Clears a prior revocation and starts a fresh asynchronous eligibility check. The method returns void; recording may still be rejected by configuration, sampling, identity, entitlement, or network checks.",
            ],
            [
              "revokeReplayConsent()",
              "Advances the recorder lifecycle, stops rrweb, aborts in-flight replay requests, clears its upload grant, and discards events still buffered in the page.",
            ],
            [
              "Already uploaded data",
              "Revocation cannot recall chunks already committed by the API. They remain until their expiry or an authorized deletion workflow removes them.",
            ],
            [
              "Grant again",
              "A later grant may start recording again after all current gates are rechecked. Do not treat a previous grant as durable consent.",
            ],
          ]}
        />
        <Callout tone="warning" title="Avoid a startup race">
          If replay consent is required, do not briefly initialize it as granted
          while your CMP is still loading. Start from unknown/denied, initialize
          with requireConsent: true, then call grantReplayConsent() only after
          the current decision is known.
        </Callout>
      </ReplaySection>

      <ReplaySection
        id="replay-start-gates"
        title="When recording actually starts"
      >
        <ReplayP>
          A call to <ReplayMono>startReplay()</ReplayMono> resolves to{" "}
          <ReplayMono>true</ReplayMono> only when recording is active (or was
          already active). The SDK evaluates these gates in order:
        </ReplayP>
        <ol className="grid list-decimal gap-2 pl-5 text-sm leading-6 text-neutral-600 dark:text-slate-400">
          <li>
            The code is running in a browser and the client was initialized with
            replay enabled.
          </li>
          <li>
            The current project, session, anonymous identity, and optional user
            identity are available.
          </li>
          <li>
            The API accepts the project write key and returns an enabled project
            configuration.
          </li>
          <li>
            Any server-required or client-required consent gate is satisfied.
          </li>
          <li>
            The deterministic session sample falls inside the effective rate.
          </li>
          <li>
            The API accepts the project/session/identity match and issues a
            short-lived upload grant.
          </li>
          <li>
            The rrweb recording module loads, the lifecycle epoch is still
            current, and <ReplayMono>record()</ReplayMono> starts successfully.
          </li>
        </ol>
        <ReplayCode>{`const recording = await traceiq.startReplay();

if (!recording) {
  // Inspect the replay config/authorize requests and the checklist above.
  // A false result is expected when consent is absent or the session is sampled out.
}`}</ReplayCode>
        <ReplayP>
          Initialization automatically attempts the same start sequence when{" "}
          <ReplayMono>replay.enabled</ReplayMono> is true. The deprecated
          top-level <ReplayMono>enableReplay</ReplayMono> option still works for
          compatibility, but new integrations should use{" "}
          <ReplayMono>replay.enabled</ReplayMono>.
        </ReplayP>
      </ReplaySection>

      <ReplaySection id="replay-sampling" title="Sampling semantics">
        <ReplayP>
          Sampling is deterministic for the SDK session ID, not random on every
          page view. The browser stores that ID in{" "}
          <ReplayMono>sessionStorage</ReplayMono>, so the same tab/session
          receives the same decision across page reloads while that session
          storage remains available.
        </ReplayP>
        <ReplayBullets
          items={[
            [
              "Effective rate",
              "min(project sample rate, replay.sampleRate in the SDK). Omitting the SDK rate adds no extra reduction.",
            ],
            ["0", "No sessions are selected."],
            ["1", "Every otherwise-eligible session is selected."],
            [
              "Example",
              "A 10% dashboard rate combined with replay.sampleRate: 0.05 records 5%, not 15% and not 10%.",
            ],
            [
              "Configuration changes",
              "A running recorder is not resampled. The next start/configuration request uses the new rate.",
            ],
          ]}
        />
      </ReplaySection>

      <ReplaySection id="replay-chunks" title="Browser snapshots, chunks, and delivery">
        <ReplayP>
          rrweb emits an initial full snapshot and TraceIQ requests another full
          snapshot boundary every 30 seconds. A full snapshot flushes any older
          buffered events and is then flushed immediately so playback pages can
          begin from a usable boundary.
        </ReplayP>
        <ReplayBullets
          items={[
            ["Regular flush", "Every 5 seconds while events are pending."],
            [
              "Batch thresholds",
              "A chunk also flushes at 150 events or an estimated 450,000 uncompressed JSON bytes.",
            ],
            [
              "Lifecycle flush",
              'document.visibilityState="hidden", pagehide, stopReplay(), and the maximum-duration timer request a final flush. The duration timer also sends replay completion.',
            ],
            [
              "Compression",
              "The browser uses gzip + base64 when CompressionStream exists. Otherwise it sends the sanitized event array; the API always sanitizes again and stores gzip.",
            ],
            [
              "Authentication",
              "Configuration and upload authorization use the project write key. Chunk and completion calls use a short-lived grant bound to the project, session, identity, consent policy, privacy mode, and limits. Browser requests omit ambient credentials.",
            ],
            [
              "Retries today",
              "The browser recorder has no persistent queue, retry, or exponential backoff for replay chunks. It removes a chunk from memory before the request and does not requeue a rejected or failed upload. Sequence gaps can therefore produce a partial replay.",
            ],
          ]}
        />
        <Callout tone="warning" title="Unload delivery is best effort">
          Lifecycle uploads use browser keepalive only when the serialized
          request is under 60,000 characters. A browser crash, abrupt process
          kill, offline close, rejected request, or larger unload payload can
          lose the final chunk. Call <ReplayMono>stopReplay()</ReplayMono> while
          the page is still alive when a deliberate workflow needs the best
          chance of flushing; even then, delivery is not transactional.
        </Callout>
      </ReplaySection>

      <ReplaySection
        id="replay-limits"
        title="Size, network, and storage limits"
      >
        <ReplayP>
          The current server defaults below are abuse and memory-safety
          ceilings, not recommended targets. Cloud entitlements or a self-hosted
          operator may impose lower limits. Oversized, malformed, out-of-window,
          or over-capacity chunks are rejected rather than truncated.
        </ReplayP>
        <ReplayTable
          columns={["Boundary", "Current default", "Effect"]}
          rows={[
            [
              "Replay request body",
              "750,000 bytes",
              "Rejected before replay ingestion when Content-Length exceeds the replay request limit; the API also has a 1 MiB global JSON body limit.",
            ],
            [
              "Transport-compressed chunk",
              "700,000 bytes",
              "Maximum decoded gzip input accepted from gzip-base64 transport.",
            ],
            [
              "Expanded chunk",
              "2,000,000 bytes",
              "Maximum JSON output during decompression and maximum sanitized chunk size.",
            ],
            [
              "Events per server chunk",
              "500",
              "The browser flushes earlier at 150, leaving headroom.",
            ],
            [
              "Chunks per replay",
              "3,000",
              "Enforced under the replay lock when a stored chunk is finalized.",
            ],
            [
              "Compressed replay total",
              "250,000,000 bytes",
              "Cumulative server-generated gzip size.",
            ],
            [
              "Expanded replay total",
              "250,000,000 bytes",
              "Cumulative sanitized JSON size and playback expansion ceiling.",
            ],
            [
              "Playback API page",
              "8,000,000 expanded bytes",
              "Chunks are paged and streamed into the player instead of materializing an entire large replay in one response.",
            ],
            [
              "Maximum replay duration",
              "14,400 seconds",
              "Global server ceiling; the project default is 600 seconds and may be lower.",
            ],
            [
              "Browser clock skew",
              "5 minutes",
              "Event and claimed timestamps outside the server-authoritative window are rejected.",
            ],
          ]}
        />
        <ReplayP>
          Large DOMs, rapid mutation loops, and high-frequency interactions
          increase CPU, memory, bandwidth, and storage. Block irrelevant
          animated regions, choose the shortest useful duration, and sample
          conservatively. Replay delivery shares the page network but does not
          use cookies or other ambient credentials.
        </ReplayP>
      </ReplaySection>

      <ReplaySection id="replay-privacy" title="Browser privacy modes and selectors">
        <ReplayTable
          columns={["Mode", "Visible text", "Inputs and known secrets"]}
          rows={[
            [
              "Strict",
              "All visible text is masked.",
              "All form values are masked; known credentials, payment fields, URL secrets, and secret-like text receive permanent handling.",
            ],
            [
              "Balanced",
              "Ordinary visible text is retained.",
              "All form values are still masked. Obvious secret patterns and sensitive attributes are scrubbed.",
            ],
            [
              "Custom",
              "Same baseline as Balanced.",
              "Adds your CSS mask/block/ignore selectors without disabling the permanent safety rules.",
            ],
          ]}
        />
        <ReplayTable
          columns={["Control", "Use it for", "Important behavior"]}
          rows={[
            [
              "data-traceiq-mask",
              "Text that should remain structurally visible but unreadable.",
              "Masks matching text in the browser. Use dashboard or replay.maskSelectors for reusable CSS selectors.",
            ],
            [
              "data-traceiq-block",
              "Whole sensitive widgets or subtrees such as account, authentication, health, or payment panels.",
              "Omits the matching content from rrweb capture. Use dashboard or replay.blockSelectors for reusable CSS selectors.",
            ],
            [
              "data-traceiq-ignore",
              "Suppressing click/input interaction events on noisy controls.",
              "Not a privacy control. The element can still appear in a DOM snapshot; use mask or block for privacy.",
            ],
            [
              'data-traceiq-allow-replay="true"',
              "A reviewed same-origin iframe whose contents are safe to record.",
              "Only an opt-in request. Cross-origin frames and frames with sensitive URL/form signals remain blocked.",
            ],
          ]}
        />
        <ReplayCode lang="html">{`<section data-traceiq-block>
  <!-- Omitted from replay: use for a sensitive account or payment surface. -->
</section>

<span data-traceiq-mask>{customerReference}</span>

<button data-traceiq-ignore>
  <!-- Clicks ignored, but DOM content is not made private by this attribute. -->
</button>`}</ReplayCode>
        <ReplayP>
          All input types—including hidden, password, email, text, textarea,
          select, number, date, and one-time-code inputs—are masked before
          transport. Built-in blocking also covers password inputs, card
          number/CVC and OTP autocomplete fields, checkout forms, and every
          iframe that has not passed the explicit same-origin allowlist checks.
        </ReplayP>
      </ReplaySection>

      <ReplaySection
        id="replay-security"
        title="Security guarantees and boundaries"
      >
        <ReplayBullets
          items={[
            [
              "Before transport",
              "Every rrweb event is cloned and recursively sanitized before it enters an outgoing replay request. Input mutations and hidden values are masked.",
            ],
            [
              "Before persistence",
              "The API decodes within a bounded gzip output limit, validates rrweb shape and timestamps, recursively sanitizes again, then creates a fresh gzip object.",
            ],
            [
              "URLs",
              "Credentials, fragments, dangerous schemes, and query values whose parameter names indicate tokens, passwords, authentication, cards, OTPs, or other secrets are removed. CSS network references are redacted. Ordinary query values can remain, so never place personal or secret data in URLs.",
            ],
            [
              "Obvious secrets",
              "Balanced and Custom still scrub common private keys, JWTs, provider keys, authorization values, card-like numbers, OTP phrases, and named password/token values. Domain-specific secrets can evade pattern matching; block or mask them explicitly.",
            ],
            [
              "Playback isolation",
              "Before playback, the API makes recorded URL attributes and CSS network references inert. The dashboard player uses rrweb’s sandboxed iframe, disables replay canvas, and is served with a replay-specific CSP that blocks external image/media frames and form submission.",
            ],
            [
              "Access isolation",
              "Replay list/playback require an authenticated dashboard user with replay-read scope and an active project membership. Lookups are scoped to the selected project. Settings and deletion require replay-write plus project owner/admin access.",
            ],
            [
              "Storage credentials",
              "Browsers never choose storage object keys and never receive storage service credentials or signed object URLs. Playback is mediated by the TraceIQ API.",
            ],
          ]}
        />
        <Callout tone="warning" title="Review high-risk surfaces yourself">
          Do not allowlist authentication, checkout, payment, health, financial,
          support, or admin iframes. Block sensitive application containers even
          when their input fields are masked: surrounding labels, validation
          messages, account identifiers, and custom widgets can still reveal
          context in Balanced or Custom mode.
        </Callout>
      </ReplaySection>

      <ReplaySection
        id="replay-retention"
        title="Retention, deletion, and revocation"
      >
        <ReplayP>
          A replay’s expiry is calculated from server creation time plus the
          project retention setting. The API does not trust the browser
          timestamp to choose retention. Changing the setting affects newly
          created replays, not existing expiry timestamps.
        </ReplayP>
        <ReplayBullets
          items={[
            [
              "Automatic expiry",
              "A background sweep reconciles stale uploads, then removes expired replay objects and marks their metadata expired. Expiry is eventual rather than guaranteed at the exact second shown.",
            ],
            [
              "Manual/subject deletion",
              "Authorized deletion and project, organization, or data-subject cleanup delete private objects before finalizing metadata deletion. Failures remain retryable rather than reporting a false success.",
            ],
            [
              "Consent withdrawal",
              "Stops current browser capture and discards unsent local events. It does not automatically delete data that already reached storage. Connect withdrawal-related erasure requirements to your own deletion process.",
            ],
            [
              "Metadata",
              "A payload-free deletion audit record may remain after the replay object and active replay metadata are removed, depending on the deletion workflow.",
            ],
          ]}
        />
      </ReplaySection>

      <ReplaySection id="replay-viewing" title="Find and view replays">
        <ReplayP>
          Open{" "}
          <Link
            className="font-semibold text-blue-600 hover:underline dark:text-cyan-400"
            href="/dashboard/replays"
          >
            Dashboard → Replays
          </Link>{" "}
          for the current project. The list shows identity, session ID, entry
          page, start time, duration, device/browser, location metadata from the
          matching analytics session, compressed size, and replay status. User
          timelines and funnel results can link into a session-filtered replay
          list.
        </ReplayP>
        <ReplayBullets
          items={[
            [
              "Browser playback",
              "Select Watch replay. The player waits for at least two rrweb events, starts paused, can skip inactive time, and offers 0.5×, 1×, 2×, 4×, and 8× speeds plus fullscreen.",
            ],
            [
              "Mobile playback",
              "React Native recordings open in the separate structural player. Seek, pause, step between events, change speed (0.5×–4×), or use fullscreen. Shapes are placeholders, not screenshots or restored text/images.",
            ],
            [
              "Large sessions",
              "The browser fetches bounded pages of ready chunks in sequence and appends events to the player.",
            ],
            [
              "Partial sessions",
              "A missing upload produces a sequence gap; available chunks may still play, but the reconstruction can jump or be incomplete.",
            ],
            [
              "Expired/inaccessible",
              "An expired, deleted, cross-project, or unauthorized replay is returned as not found/inaccessible rather than exposing its existence.",
            ],
          ]}
        />
      </ReplaySection>

      <ReplaySection id="replay-troubleshooting" title="Troubleshooting">
        <ReplayTable
          columns={["Symptom", "Likely cause", "Checks"]}
          rows={[
            [
              "No replays appear",
              "One of the start gates failed.",
              "Confirm dashboard enablement, Cloud Pro availability, at least one selected funnel, an accepted event matching its current first step, replay.enabled, consent, a rate above zero, and the selected project ID/write key.",
            ],
            [
              "startReplay() returns false",
              "Often expected gating.",
              "Consent may be absent or the session sampled out. Inspect the config and authorize requests in DevTools for 401/403/network failures.",
            ],
            [
              "Cloud checkbox is disabled",
              "Feature unavailable.",
              "The organization must be on Cloud Pro and must not have an emergency Replay kill switch. SDK code cannot bypass that server-side gate.",
            ],
            [
              "Authorize returns an identity error",
              "Session identity mismatch.",
              "Use the same project/session identity as normal events. Identify a supplied userId in that project before changing replay identity.",
            ],
            [
              "Chunks are missing",
              "Delivery failed.",
              "Look for failed/rejected chunk requests. There is no browser replay retry queue, and unload delivery is best effort.",
            ],
            [
              "Replay is too short",
              "Capture stopped early.",
              "Check maximum duration, revocation, navigation/tab lifecycle, network errors, oversized chunks, and server/entitlement capacity responses.",
            ],
            [
              "Player needs more events",
              "Fewer than two browser rrweb events.",
              "This is often an initial snapshot without a later mutation or a failed second upload.",
            ],
            [
              "No mobile replay starts",
              "A mobile start gate did not pass.",
              "Verify traceiq-react-native 0.2.0+, iOS/Android, replay.enabled, explicit consent, project enablement, a selected funnel's accepted first-step event, sampling, and the upload grant. A locally queued event does not qualify.",
            ],
            [
              "Layout/assets differ",
              "Privacy isolation.",
              "Blocked subtrees, disabled iframe/canvas/font capture, CSS URL redaction, and playback network neutralization intentionally reduce fidelity.",
            ],
            [
              "Self-hosted start fails",
              "Endpoint/schema/storage.",
              "Verify HTTPS reachability, project enablement, replay schema availability, and that operator-configured storage is writable.",
            ],
          ]}
        />
        <ReplayP>
          Set <ReplayMono>debug: true</ReplayMono> during local troubleshooting
          to surface replay delivery failures in the browser console. Do not
          enable verbose diagnostics in a way that captures or forwards
          sensitive application state.
        </ReplayP>
      </ReplaySection>

      <ReplaySection
        id="replay-self-hosted"
        title="Self-hosted and custom API endpoints"
      >
        <ReplayP>
          Point <ReplayMono>endpoint</ReplayMono> at the public base URL of your
          TraceIQ API. The SDK appends the managed replay configuration,
          authorization, chunk, and completion paths. Do not append{" "}
          <ReplayMono>/v1</ReplayMono> yourself.
        </ReplayP>
        <ReplayCode>{`traceiq.initialize({
  projectId: '${projectId}',
  writeKey: 'YOUR_PROJECT_WRITE_KEY',
  endpoint: 'https://analytics.example.com',
  replay: { enabled: true, requireConsent: true },
});`}</ReplayCode>
        <ReplayBullets
          items={[
            [
              "TLS",
              "Use HTTPS in production so replay requests cannot be observed or modified in transit.",
            ],
            [
              "CSP",
              "Allow the TraceIQ API origin in your application’s connect-src directive. npm/bundler integrations do not load rrweb from a third-party CDN.",
            ],
            [
              "CORS",
              "The supplied TraceIQ API treats replay ingestion paths as browser SDK endpoints and accepts the project write-key and replay-token headers. Preserve that behavior if a proxy sits in front.",
            ],
            [
              "Storage",
              "Filesystem versus Supabase replay storage is an API/operator concern. Never expose REPLAY_STORAGE_DRIVER, storage paths, bucket credentials, or SUPABASE_SERVICE_ROLE_KEY in browser variables.",
            ],
          ]}
        />
      </ReplaySection>

      <ReplaySection id="replay-nextjs" title="Next.js consent-aware example">
        <ReplayP>
          Mount a client component once near the root of your application and
          pass it the current decision from your CMP. Treat an unknown decision
          as denied. The example deliberately keeps the SDK write key in a{" "}
          <ReplayMono>NEXT_PUBLIC_*</ReplayMono> variable because it is the
          project’s browser ingestion key—not a server secret.
        </ReplayP>
        <ReplayCode lang="tsx">{`'use client';

import { useEffect, useRef } from 'react';
import { traceiq } from 'traceiq-sdk-js';

type ReplayConsent = 'unknown' | 'granted' | 'denied';

export function TraceIQClient({ replayConsent }: { replayConsent: ReplayConsent }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    traceiq.initialize({
      projectId: process.env.NEXT_PUBLIC_TRACEIQ_PROJECT_ID!,
      writeKey: process.env.NEXT_PUBLIC_TRACEIQ_WRITE_KEY!,
      endpoint: process.env.NEXT_PUBLIC_TRACEIQ_API_URL!,
      replay: {
        enabled: true,
        requireConsent: true,
        sampleRate: 0.1, // optional extra cap; never raises the dashboard rate
      },
    });
  }, []);

  useEffect(() => {
    if (replayConsent === 'granted') {
      traceiq.grantReplayConsent();
    } else {
      traceiq.revokeReplayConsent();
    }
  }, [replayConsent]);

  return null;
}`}</ReplayCode>
        <ReplayP>
          Keep this component mounted across route changes. Do not read consent
          once and forget it: pass subsequent CMP changes so withdrawal invokes
          revocation immediately. Never expose{" "}
          <ReplayMono>SUPABASE_SERVICE_ROLE_KEY</ReplayMono>, a personal access
          token, or a dashboard bearer token through{" "}
          <ReplayMono>NEXT_PUBLIC_*</ReplayMono>.
        </ReplayP>
      </ReplaySection>

      <ReplaySection id="replay-api" title="Browser SDK API reference">
        <ReplayTable
          columns={["API", "Type/default", "Meaning"]}
          rows={[
            [
              "replay.enabled",
              "boolean / false",
              "Creates the replay recorder and automatically attempts startup. rrweb is still loaded only after every gate passes.",
            ],
            [
              "replay.requireConsent",
              "boolean / unset",
              "Adds a client consent gate. true cannot be overridden by a looser dashboard setting; false cannot bypass a server-required gate.",
            ],
            [
              "replay.sampleRate",
              "number 0–1 / unset",
              "Optional client-side ceiling combined with the dashboard rate using Math.min.",
            ],
            [
              "replay.maskSelectors",
              "string[] / []",
              "Additional CSS selectors whose matching text is masked.",
            ],
            [
              "replay.blockSelectors",
              "string[] / []",
              "Additional CSS selectors whose matching subtrees are omitted.",
            ],
            [
              "replay.ignoreSelectors",
              "string[] / []",
              "Additional selectors whose interaction events are ignored; not a privacy boundary.",
            ],
            [
              "grantReplayConsent()",
              "void",
              "Signals current consent and asynchronously attempts a new start.",
            ],
            [
              "revokeReplayConsent()",
              "void",
              "Stops capture, aborts in-flight replay work, and discards unsent replay events.",
            ],
            [
              "startReplay()",
              "Promise<boolean>",
              "Explicitly attempts the full start sequence; true means active/already active.",
            ],
            [
              "stopReplay()",
              "void",
              "Stops rrweb and best-effort flushes/completes the current recording without changing project settings.",
            ],
            [
              "enableReplay",
              "deprecated boolean",
              "Compatibility alias for opting in. Prefer replay.enabled in all new code.",
            ],
          ]}
        />
        <ReplayP>
          Replay’s config/authorize/chunk protocol is managed by the browser
          SDK. Do not construct rrweb uploads or storage keys yourself; doing so
          bypasses the compatibility and privacy behavior that the public SDK
          maintains.
        </ReplayP>
        <Callout tone="info" title="Initialize once">
          Re-calling <ReplayMono>initialize()</ReplayMono> is not a
          replay-settings refresh mechanism and can replace the client’s
          recorder reference while earlier browser listeners are still
          installed. Initialize once at application bootstrap; use the consent
          and start/stop methods for lifecycle changes, and let a new page load
          fetch newly saved project configuration.
        </Callout>
      </ReplaySection>

      <ReplaySection
        id="replay-analytics-events"
        title="Replay versus normal analytics events"
      >
        <ReplayP>
          Session Replay does not replace <ReplayMono>track()</ReplayMono>,{" "}
          <ReplayMono>page()</ReplayMono>, <ReplayMono>identify()</ReplayMono>,
          exceptions, Web Vitals, or <ReplayMono>$api_request</ReplayMono>{" "}
          events. Those events power searchable analytics, funnels, users,
          errors, and API performance. Browser replay is a separate rrweb
          stream; mobile replay is a separate structural stream. Both link to
          accepted analytics events by project/session identity so you can
          inspect the surrounding experience.
        </ReplayP>
        <ReplayBullets
          items={[
            [
              "Independent controls",
              "Disabling replay does not disable ordinary event collection. Replay consent controls only the replay recorder; apply your broader consent policy to normal analytics separately.",
            ],
            [
              "Different payloads",
              "Normal event properties are structured analytics data. Browser replay chunks contain sanitized DOM events; mobile chunks contain placeholder geometry and interaction markers. Both payload formats are stored outside PostgreSQL.",
            ],
            [
              "Different failure modes",
              "An analytics event can arrive while its replay is sampled out, disabled, expired, or partial. Do not use replay availability as proof that an analytics event did or did not occur.",
            ],
            [
              "Shared context",
              "Consistent project, session, anonymous ID, and user identity are what allow user timelines and funnel views to find related replays.",
            ],
          ]}
        />
      </ReplaySection>
    </div>
  );
}

function ReplaySection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-b border-neutral-200 py-8 first:pt-0 last:border-0 dark:border-slate-800"
    >
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
        {title}
      </h2>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function ReplayP({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-6 text-neutral-600 dark:text-slate-400">
      {children}
    </p>
  );
}

function ReplayMono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.5 font-mono text-xs text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
      {children}
    </code>
  );
}

function ReplayCode({
  children,
  lang = "ts",
}: {
  children: string;
  lang?: string;
}) {
  return <CodeBlock codeText={children} lang={lang} />;
}

function ReplayBullets({ items }: { items: Array<[string, string]> }) {
  return (
    <ul className="grid gap-2">
      {items.map(([term, description]) => (
        <li
          key={term}
          className="text-sm leading-6 text-neutral-600 dark:text-slate-400"
        >
          <span className="font-semibold text-neutral-900 dark:text-slate-200">
            {term}:
          </span>{" "}
          {description}
        </li>
      ))}
    </ul>
  );
}

function ReplayTable({
  columns,
  rows,
}: {
  columns: [string, string, string];
  rows: Array<[string, string, string]>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-slate-800">
      <div className="hidden grid-cols-[minmax(150px,.75fr)_minmax(140px,.7fr)_minmax(0,1.7fr)] gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500 md:grid">
        {columns.map((column) => (
          <span key={column}>{column}</span>
        ))}
      </div>
      <div className="divide-y divide-neutral-200 dark:divide-slate-800">
        {rows.map(([first, second, third]) => (
          <div
            key={first}
            className="grid min-w-0 gap-1 px-4 py-3 md:grid-cols-[minmax(150px,.75fr)_minmax(140px,.7fr)_minmax(0,1.7fr)] md:gap-4"
          >
            <span className="min-w-0 break-words font-mono text-xs text-neutral-900 dark:text-white">
              {first}
            </span>
            <span className="min-w-0 break-words font-mono text-xs text-neutral-500 dark:text-slate-400">
              {second}
            </span>
            <span className="min-w-0 break-words text-sm leading-5 text-neutral-600 dark:text-slate-400">
              {third}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning";
  title: string;
  children: ReactNode;
}) {
  const styles =
    tone === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/20 dark:text-amber-100"
      : "border-blue-300 bg-blue-50 text-blue-950 dark:border-cyan-500/40 dark:bg-cyan-950/20 dark:text-cyan-100";
  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs leading-5 opacity-90">{children}</p>
    </div>
  );
}

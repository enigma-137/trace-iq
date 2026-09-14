# Mobile structural replay v1 contract

Status: **contract, replay API, opt-in React Native and Flutter capture, and dashboard playback implemented**. The existing browser/rrweb path is unchanged. This v1 scope covers React Native and Flutter on iOS and Android; Flutter web remains on its own future design path.

`v1.schema.json` is the normative JSON shape. `packages/types/src/mobile-replay.ts` mirrors it for TypeScript consumers and supplies semantic checks that JSON Schema cannot express. The JSON fixtures in `fixtures/` are language-neutral conformance inputs for the API, React Native, and Flutter test suites. Changes to required fields or meaning require a new format version rather than silent reinterpretation.

## Recording model

The stored format identifier is `mobile-structural-v1`, distinct from `rrweb-json-gzip`. A chunk is a JSON object with `format`, `version`, `runtime`, `platform`, zero-based `sequence`, and an ordered `events` array. Timestamps are Unix milliseconds. Every chunk begins with a complete structural `snapshot` so it can be independently rendered after gaps or paginated playback. Node IDs are ephemeral and unique **within that snapshot**, not stable across snapshots. A child must follow its parent; blocked nodes must have no descendants.

Coordinates and rectangles use viewport-relative logical pixels (points on iOS, density-independent pixels on Android), not physical image pixels. Scroll deltas use the same units. The capture adapter must normalize orientation changes with a new snapshot. Project ID, session ID, anonymous/user identity, consent state, and upload grant belong to the authenticated replay API request/token, not the stored visual payload. Existing request, chunk, and replay byte ceilings still apply in addition to the schema's item limits.

The v1 event vocabulary is deliberately small:

| Event | Data | Playback meaning |
| --- | --- | --- |
| `snapshot` | Static screen ID, viewport, bounded nodes | Replace the structural screen |
| `tap` | Coordinates | Show a touch marker |
| `scroll` | Coordinates and deltas | Move the viewport marker |
| `navigation` | Static destination screen ID | Mark a route transition |
| `lifecycle` | Foreground/background | Pause or resume the timeline |

Nodes contain only an ephemeral numeric ID, optional parent ID, kind, and rectangle. `text`, `image`, and `input` are **placeholders**, not their content. The player may draw generic shapes; it must not infer or fetch the original app's assets. Screen IDs must be developer-supplied static identifiers such as `Checkout.Payment`, never a route with user data or query parameters. No keystrokes, accessibility labels, text, form values, image pixels, screenshots, video, network bodies, URLs, arbitrary props, or component names are permitted in v1. Unknown fields and event types are invalid.

## Privacy rules for producers

- Recording is off by default. The client must wait for project enablement, a selected funnel event **accepted by the API**, deterministic sampling, SDK opt-in, required consent, and a short-lived server upload grant. There is no pre-trigger visual buffer.
- SDKs must make text and input values impossible to serialize into this contract. Sensitive surfaces (credentials, payments, personal data, embedded/native views, and unknown third-party views) are blocked by default or omitted. A blocked region is one placeholder rectangle with no descendants; suppress taps and scroll anchors inside it.
- Revoking consent, opting out, logging out, or disabling recording stops capture, aborts in-flight work, and discards buffered mobile payloads. Backgrounding stops visual capture. Already uploaded chunks follow existing retention and deletion rules.
- Do not persist mobile replay chunks on the device in v1. Network interruption may leave a gap, but must not create an unencrypted cache of potentially sensitive visual telemetry. Later persistence requires a separately reviewed encryption and deletion design.
- Schema validation is necessary but insufficient. The API must repeat semantic checks and reject suspicious payloads; never rely on SDK masking alone. A static screen ID can still be misused, so customer documentation and SDK APIs must explicitly ban dynamic values.

## Integration boundaries

The replay API branches on a server-validated, signed-grant-bound format, uses the v1 schema and semantic validator for mobile chunks, and retains the same project/session identity, consent, flow authorization, byte ceilings, private object storage, retention, and deletion protections as browser replay. Mobile chunks never pass through the rrweb sanitizer. The API records the format and version on replay metadata, not just individual chunks, and playback includes the format for player dispatch. The dashboard routes mobile events to a separate structural player that draws only generic placeholders, never to rrweb.

For a mobile recording, request `POST /v1/replays/authorize` with the normal project/session identity, consent state, and `recordingFormat: "mobile-structural-v1"`. The response is a short-lived, format-bound upload token and replay ID. Send each v1 chunk object as the `events` field of `POST /v1/replays/chunks`, with the same `sequence` in the request envelope and chunk. Alternatively, `encoding: "gzip-base64"` may carry the gzipped chunk object in `encodedEvents`. Browser clients omit `recordingFormat` and continue sending rrweb event arrays. The dashboard list and playback responses expose `recordingFormat`; mobile playback also returns the validated event stream and its runtime/platform metadata. SDKs must not request an upload token until their trigger event has been accepted by normal analytics ingestion.

The React Native SDK now adds a stable `sessionId` to normal event ingestion and rotates it on lifecycle/logout boundaries. Flutter already sends a session ID. Both SDKs associate a replay with the exact session whose accepted event triggered a selected funnel; an event merely queued locally is not enough to authorize recording.

## Conformance checks

Run `npm.cmd test --workspace=@traceiq/api -- mobile-replay-contract`, `npm.cmd test --workspace=traceiq-react-native`, and `npm.cmd test --workspace=@traceiq/dashboard -- mobile-replay-player.test.ts` on Windows, or the equivalent `npm` commands elsewhere. Run `flutter test` from `packages/sdk-flutter` when the Flutter SDK is installed. The API fixture suite checks valid React Native and Flutter payloads, rejects free-form content/image data, and exercises ordering, tree, and blocked-region invariants. The React Native recorder suite checks its emitted chunks against the same JSON schema; Flutter tests check delivery gating and the structural payload fields. The dashboard tests check pagination, timeline reconstruction, and that the player does not mount captured content or external assets.

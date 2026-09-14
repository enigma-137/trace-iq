# Mobile session replay pilot

This checklist covers the first React Native and Flutter iOS/Android pilot for
`mobile-structural-v1`. It is a structural timeline, not video or rrweb: the
dashboard draws placeholder geometry and interaction markers only. Flutter web
and a pixel-accurate player are out of scope.

## Before enabling a project

1. Deploy the replay API and dashboard with format-aware playback, then update
   the app to a recorder-enabled SDK. Keep the existing browser replay path
   available and verify a browser recording still opens in rrweb.
2. Confirm the project's Replay entitlement, private storage, retention,
   deletion process, selected funnel, and sampling settings. Start with one
   internal project, one selected first-step event, and a small sample rate.
3. Obtain explicit mobile replay consent through the app's own consent flow.
   Configure the SDK with `replay.enabled: true`, but grant consent only after
   that flow succeeds. Revocation and logout must stop capture immediately.
4. Mark only reviewed, content-free regions. Keep credentials, payment forms,
   personal data, native/third-party surfaces, and unknown views blocked or
   unmarked. Screen IDs must be static slugs, never dynamic routes or user data.
5. Confirm the selected funnel's first event is accepted by normal analytics
   ingestion before expecting a replay grant. A locally queued or rejected
   event must not start visual capture.

## Pilot walkthrough

- With consent absent, exercise the funnel and confirm no mobile replay grant
  or chunks are sent. Grant consent, trigger an accepted first-step event, and
  confirm a single replay is associated with that session.
- Navigate between two instrumented screens, tap and scroll a safe region,
  rotate the device, background and foreground the app, then complete or stop
  the session. Inspect the dashboard timeline: snapshots replace geometry,
  navigation and lifecycle are visible, and the markers align with the events.
- Inspect the replay list and detail view for the Mobile structural badge and
  the correct runtime/platform. Seek, pause, change speed, step between events,
  and use fullscreen. Verify malformed/expired/deleted recordings fail clearly.
- Inspect a sampled stored chunk and playback response. It must contain no
  text, input values, accessibility labels, image pixels, screenshots, URLs,
  network bodies, or arbitrary component props. Taps and scroll anchors inside
  blocked regions must be absent.
- Revoke consent during an active recording; then repeat for logout, app
  background, network failure, and project Replay disablement. No new chunks
  should upload afterward. Previously uploaded chunks remain under normal
  retention/deletion policy. Expect gaps on network failure: v1 deliberately
  has no on-device replay cache.
- Run the React Native recorder, API contract, and dashboard player test suites.
  The app team should run Flutter tests and device checks in its own Flutter
  environment before enabling Flutter in the pilot.

## Acceptance and rollback

The pilot is acceptable only when consent and funnel gating hold, private data
is absent from chunks and playback, mobile sessions play without affecting
browser sessions, and retention/deletion work for both formats. Record any
device-specific layout, touch, or lifecycle discrepancies before increasing
sampling. If a privacy or authorization invariant fails, disable Replay for
the project (or the organization emergency switch), stop the app-side opt-in,
and follow the existing replay deletion process for affected recordings.

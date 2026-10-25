# Releasing the SDKs

Each SDK is released by pushing a tag. The release workflow checks that the tag
matches the version in the package's own files, runs the tests, builds the package
and publishes it. A mismatched tag fails before anything is published.

| SDK | Registry | Package | Tag | Version lives in |
| --- | --- | --- | --- | --- |
| Python | PyPI | `traceiq-py` | `python-v0.2.0` | `sdks/python/pyproject.toml` and `sdks/python/traceiq/__init__.py` |
| Kotlin | Maven Central | `run.traceiq:traceiq` | `kotlin-v0.2.0` | `sdks/kotlin/build.gradle.kts` |

The other packages are published by hand; see [Publishing by hand](#publishing-by-hand).

| SDK | Registry | Package | Version lives in |
| --- | --- | --- | --- |
| Browser | npm | `traceiq-sdk-js` | `packages/sdk-js/package.json` and `context.sdk.version` in `packages/sdk-js/src/core/client.ts` |
| Node | npm | `traceiq-node` | `packages/node/package.json` |
| React Native | npm | `traceiq-react-native` | `packages/react-native/package.json` |
| Rust | crates.io | `traceiq` | `sdks/rust/Cargo.toml` (then `cargo update -p traceiq` to refresh `Cargo.lock`) |
| Flutter | pub.dev | `traceiq_flutter` | `packages/sdk-flutter/pubspec.yaml` |

Each package keeps a `CHANGELOG.md`; add the release's entry in the same PR as the version bump. After
publishing, update `apps/dashboard/src/lib/sdkVersions.ts` so the docs show the new versions.

To release: bump the version in those files, merge, then

```bash
git tag python-v0.2.0 && git push origin python-v0.2.0
```

CI already builds both packages on every pull request (`python -m build` and
`gradle publishToMavenLocal`), so packaging problems show up before release day.

## One-time setup

### PyPI (Python)

PyPI Trusted Publishing lets the workflow publish without an API token.

1. Sign in to [pypi.org](https://pypi.org) as the project owner. Because `traceiq-py` already exists,
   the publisher must be added on the project itself: **Your projects → traceiq-py → Manage →
   Publishing** (https://pypi.org/manage/project/traceiq-py/settings/publishing/). A publisher added
   under **Your account → Publishing** is a *pending* publisher, which only applies to new project
   names and is ignored here; the release then fails with `invalid-publisher`.
2. Add a GitHub publisher:
   - Owner: `enigma-137`
   - Repository: `trace-iq`
   - Workflow: `release-python.yml`
   - Environment: `pypi`
3. In GitHub, create the `pypi` environment under **Settings → Environments**. Adding
   yourself as a required reviewer makes every release wait for your approval.

### Maven Central (Kotlin)

1. Create an account at [central.sonatype.com](https://central.sonatype.com).
2. **Verify the `run.traceiq` namespace.** Add it under **Namespaces**. Central shows a
   verification key; add it as a DNS TXT record on `traceiq.run`, then click **Verify**.
3. **Create a publishing token** under **Account → Generate User Token**. It gives a
   username and a password.
4. **Create a signing key.** Central requires every artifact to be GPG-signed:
   ```bash
   gpg --quick-gen-key "TraceIQ Releases <you@traceiq.run>" rsa4096 sign 2y
   gpg --keyserver keyserver.ubuntu.com --send-keys <KEY_ID>   # Central checks this server
   gpg --armor --export-secret-keys <KEY_ID>                   # value for SIGNING_KEY
   ```
5. In GitHub, create the `maven-central` environment and add these secrets to it:

   | Secret | Value |
   | --- | --- |
   | `MAVEN_CENTRAL_USERNAME` | Token username from step 3 |
   | `MAVEN_CENTRAL_PASSWORD` | Token password from step 3 |
   | `SIGNING_KEY` | The armored private key from step 4 |
   | `SIGNING_KEY_PASSWORD` | The key's passphrase |

The workflow uploads, validates and releases in one step. A first release usually
appears on Maven Central within about 30 minutes.

## Publishing by hand

Bump the version and changelog in a PR, merge it, then publish from an up-to-date `main`.

### npm (`traceiq-sdk-js`, `traceiq-node`, `traceiq-react-native`, `traceiq-cli`, `traceiq-mcp-server`)

```bash
npm ci --legacy-peer-deps
npm whoami                                   # npm login if needed
npm publish --workspace=traceiq-sdk-js --dry-run
npm publish --workspace=traceiq-sdk-js       # add --otp=123456 with 2FA
```

`prepack` (or `prepublishOnly` for React Native) builds the package, and `CHANGELOG.md` is in each
package's `files`. Check the dry run lists the expected version and files. A new version can take a
minute to show in `npm view <package> version`.

### crates.io (`traceiq`)

```bash
cd sdks/rust
cargo login                                  # token from crates.io/settings/tokens, publish-update scope
cargo test --locked
cargo publish --dry-run
cargo publish
```

On Windows with Smart App Control or another application-control policy, the local build can fail
with `LoadLibraryExW failed: An Application Control policy has blocked this file` (proc-macro DLLs).
Don't disable the policy. CI's Rust job already runs `cargo test --locked` on Linux, so publish with
`cargo publish --dry-run --no-verify` and then `cargo publish --no-verify`. Published crate versions
can only be yanked, never deleted.

### pub.dev (`traceiq_flutter`)

```bash
cd packages/sdk-flutter
flutter pub get
flutter analyze
flutter test
flutter pub publish --dry-run                # expect "Package has 0 warnings"
flutter pub publish
```

The first publish asks you to sign in with Google; that account becomes the uploader.

## Not automated yet

- **Swift:** SwiftPM installs from a git repository with `Package.swift` at its root,
  so it needs either a separate mirror repository or a root `Package.swift`. Until then the docs
  tell users to add `sdks/swift` as a local package.
- **Kotlin:** the release workflow is ready, but the Maven Central setup above hasn't been done, so
  nothing is published yet. The docs tell users to `gradle publishToMavenLocal` from a clone.
- **npm, crates.io and pub.dev** are published by hand (above).

# Releasing the SDKs

Each SDK is released by pushing a tag. The release workflow checks that the tag
matches the version in the package's own files, runs the tests, builds the package
and publishes it. A mismatched tag fails before anything is published.

| SDK | Registry | Package | Tag | Version lives in |
| --- | --- | --- | --- | --- |
| Python | PyPI | `traceiq-py` | `python-v0.2.0` | `sdks/python/pyproject.toml` and `sdks/python/traceiq/__init__.py` |
| Kotlin | Maven Central | `run.traceiq:traceiq` | `kotlin-v0.2.0` | `sdks/kotlin/build.gradle.kts` |

To release: bump the version in those files, merge, then

```bash
git tag python-v0.2.0 && git push origin python-v0.2.0
```

CI already builds both packages on every pull request (`python -m build` and
`gradle publishToMavenLocal`), so packaging problems show up before release day.

## One-time setup

### PyPI (Python)

PyPI Trusted Publishing lets the workflow publish without an API token.

1. Sign in to [pypi.org](https://pypi.org). If `traceiq-py` already exists, open it and go to
   **Manage → Publishing**. Otherwise, go to **Your account → Publishing** and add a
   *pending* publisher, which reserves the name until the first release.
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

## Not automated yet

- **Swift:** SwiftPM installs from a git repository with `Package.swift` at its root,
  so it needs either a separate mirror repository or a root `Package.swift`.
- **npm** (`traceiq-sdk-js`, `traceiq-node`, `traceiq-react-native`, `traceiq-cli`,
  `traceiq-mcp-server`), **crates.io** (`traceiq`) and **pub.dev** (`traceiq_flutter`)
  are still published by hand.

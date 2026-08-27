# Privacy and data collection

This document describes the current TraceIQ software defaults. It is not a certification, a hosted-service privacy policy, or legal advice. The organization deploying TraceIQ determines its purposes, configuration, legal basis, notices, and response to data-subject or consumer requests.

## Browser storage

The JavaScript SDK does not set browser cookies. When storage is available, it creates:

- `traceiq.anonymousId` in `localStorage`, which persists until it is cleared or rotated.
- `traceiq.sessionId` in `sessionStorage`, which normally lasts for the browser-tab session.

Cookie rules in some jurisdictions also cover local storage, scripts, tags, and similar storage or access technologies. “Cookie-free” therefore does not mean that notice or consent is never required.

## Information the browser SDK can send

Every event can contain:

- Project, anonymous, session, and optional user identifiers
- Event name, timestamp, and arbitrary developer-supplied properties
- Current URL, path, query string, referrer, and page title; standard UTM parameters are also extracted into structured campaign fields
- Browser user agent, operating system, browser version, locale, viewport, and timezone
- Page performance measurements (CLS, INP, LCP, FCP, and TTFB), including their values and quality ratings
- Connection type when the browser exposes it
- Group identifiers and traits supplied by the application

Automatic exception capture can include an error type, message, stack, source filename, and line or column. Optional request capture can include a request URL or normalized path, HTTP method, status, and duration.

The API can add the request IP address and derive approximate country, region, or city information from trusted proxy headers or an offline GeoIP database. Outbound webhooks can send selected event information to endpoints configured by the operator.

Saved dashboards can be exposed through optional public links. Each link is read-only, can expire or be revoked, and exposes only the summary, chart data, or saved configuration selected by its creator. Anyone possessing an active link can access those selected sections without signing in, so operators should treat share URLs as secrets and avoid sharing views containing sensitive filters or measurements.

## Personal data

Anonymous IDs, user IDs, IP addresses, URLs, query strings, location, device attributes, and pseudonymous identifiers may be personal data. Arbitrary event properties, traits, URLs, and error stacks may also contain email addresses, account IDs, health or financial information, authentication material, or other sensitive values if an integrating application sends them.

Do not place secrets, passwords, access tokens, complete payment-card data, or unnecessary sensitive information in event properties, URLs, traits, or exception messages.

## Current controls and limitations

TraceIQ currently provides project isolation, write-key authentication, dashboard authorization, self-hosted storage, and data export. The schema includes a project retention setting, but automatic retention enforcement is not currently implemented. A complete end-user access, correction, deletion, consent-management, IP-anonymization, and global-privacy-control workflow is also not yet provided.

Operators should establish their own procedures for:

- Data minimization and an allowlist of approved event properties
- Consent or another appropriate legal basis
- Privacy notices and disclosure of storage technologies
- Retention enforcement and secure deletion
- Access, correction, portability, and deletion requests
- Vendor and webhook review
- Database access, encryption, backup, and incident response

## Compliance language

TraceIQ should be described as self-hostable and configurable, not “GDPR compliant,” “CCPA compliant,” “PII-free,” or “consent-free” by default. Compliance depends on who operates the deployment, what data they configure it to collect, how they use that data, and which laws apply.

Useful official references include the European Commission's [examples of personal data and pseudonymous data](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en), the UK ICO's [guidance on storage and access technologies](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/), and the California Attorney General's [CCPA overview](https://oag.ca.gov/privacy/ccpa).

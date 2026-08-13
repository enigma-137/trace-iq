# API Spec

Status as of 2026-06-27: this is the target API contract. The current API app has module shells only; these endpoints still need controllers, validation, persistence, and tests.

## Event Ingestion

`POST /v1/events`

Accepts a single event from SDKs or trusted server clients.
Use the project write key in the `x-traceiq-write-key` header.

```json
{
  "projectId": "proj_demo",
  "userId": "user_123",
  "sessionId": "sess_123",
  "eventName": "signup_completed",
  "properties": {
    "plan": "premium"
  },
  "timestamp": "2026-06-24T00:00:00.000Z"
}
```

Current MVP response:

```json
{
  "accepted": true,
  "eventId": "evt_..."
}
```

## Recent Events

`GET /v1/events/recent?projectId=proj_demo&limit=25`

Returns recent events for early dashboard/API verification.

Requires the project write key in the `x-traceiq-write-key` header (or as a `Bearer` token), exactly like `POST /v1/events`. Unauthenticated requests are rejected.

## Batch Ingestion

`POST /v1/events/batch`

Accepts an array of events. The API should validate each event independently and return accepted and rejected counts.

## SDK packages

- JavaScript SDK: [traceiq-sdk-js on npm](https://www.npmjs.com/package/traceiq-sdk-js)
- React Native SDK: [traceiq-react-native on npm](https://www.npmjs.com/package/traceiq-react-native)
- Python SDK: [traceiq-py on PyPI](https://pypi.org/project/traceiq-py/0.1.0/)
- Rust SDK: [traceiq on crates.io](https://crates.io/crates/traceiq)
- MCP server: [traceiq-mcp-server on npm](https://www.npmjs.com/package/traceiq-mcp-server)

## Future Endpoints

- `GET /v1/users/:id/timeline`
- `POST /v1/funnels`
- `GET /v1/funnels/:id/results`
- `GET /v1/replay/sessions/:sessionId`
- `GET /v1/insights`

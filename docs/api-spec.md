# API Spec

## Event Ingestion

`POST /v1/events`

Accepts a single event from SDKs or trusted server clients.

```json
{
  "organizationId": "org_123",
  "projectId": "proj_123",
  "userId": "user_123",
  "sessionId": "sess_123",
  "eventName": "signup_completed",
  "properties": {
    "plan": "premium"
  },
  "timestamp": "2026-06-24T00:00:00.000Z"
}
```

## Batch Ingestion

`POST /v1/events/batch`

Accepts an array of events. The API should validate each event independently and return accepted and rejected counts.

## Future Endpoints

- `GET /v1/users/:id/timeline`
- `POST /v1/funnels`
- `GET /v1/funnels/:id/results`
- `GET /v1/replay/sessions/:sessionId`
- `GET /v1/insights`

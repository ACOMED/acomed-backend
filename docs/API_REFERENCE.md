# ACOMED Backend API Reference

This document describes the backend APIs used by Web and Mobile clients for authentication, offline synchronization, and dynamic template loading.

## Base URL

Use your environment-specific API hostname.

Example:

```
https://api.acomed.example.com
```

## Authentication

### POST /api/auth/login

Authenticates a user and returns a JWT token to be sent on subsequent protected endpoints.

#### Request Headers

- `Content-Type: application/json`

#### Request Body

```json
{
  "email": "inspector@acomed.com",
  "password": "StrongPassword123"
}
```

#### Success Response (200)

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "<JWT_TOKEN>",
    "user": {
      "id": "0f2a49aa-2f7c-4f0a-9e86-2bbde69369c4",
      "tenant_id": "f2ce5a8b-a875-4ef0-8e49-a3ec0f25cfd2",
      "full_name": "Jane Inspector",
      "email": "inspector@acomed.com",
      "role": "INSPECTOR",
      "created_at": "2026-04-01T08:00:00.000Z",
      "updated_at": "2026-04-21T10:30:00.000Z"
    }
  }
}
```

#### Error Responses

- `400`: missing email or password
- `401`: invalid credentials

## Sync Engine

### POST /api/sync

Protected endpoint used by mobile/offline clients to send local mutations and reconcile with server state.

#### Request Headers

- `Authorization: Bearer <JWT_TOKEN>`
- `Content-Type: application/json`

#### Last-Write-Wins Conflict Resolution

The sync engine applies Last-Write-Wins (LWW) using `updated_at` timestamps:

- If an incoming record does not exist on the server, it is inserted.
- If the incoming record exists and `incoming.updated_at > server.updated_at`, the server record is updated.
- If `incoming.updated_at <= server.updated_at`, incoming changes are ignored.

This logic is applied independently for:

- `audits`
- `answers`
- `capas`

Tenant boundaries are enforced from JWT (`tenant_id`) to prevent cross-tenant data writes.

#### Expected Request Payload

```json
{
  "audits": [
    {
      "id": "AUD-1001",
      "inspector_id": "USR-001",
      "facility_id": "FAC-007",
      "status": "IN_PROGRESS",
      "scheduled_date": "2026-04-20",
      "created_at": "2026-04-20T08:00:00.000Z",
      "updated_at": "2026-04-21T15:31:00.000Z"
    }
  ],
  "answers": [
    {
      "id": "ANS-9001",
      "audit_id": "AUD-1001",
      "question_id": "Q-003",
      "response_value": "true",
      "created_at": "2026-04-21T15:20:00.000Z",
      "updated_at": "2026-04-21T15:31:05.000Z"
    }
  ],
  "capas": [
    {
      "id": "CAPA-501",
      "audit_id": "AUD-1001",
      "non_conformity_desc": "Pallet labels missing on rack C2",
      "assigned_to": "quality.manager@acomed.com",
      "status": "OPEN",
      "due_date": "2026-04-30",
      "created_at": "2026-04-21T15:21:00.000Z",
      "updated_at": "2026-04-21T15:31:10.000Z"
    }
  ]
}
```

#### Success Response (200)

```json
{
  "success": true,
  "message": "Sync successful",
  "data": {
    "syncedAudits": ["AUD-1001"],
    "syncedAnswers": ["ANS-9001"],
    "syncedCapas": ["CAPA-501"]
  }
}
```

#### Error Responses

- `400`: payload shape invalid (arrays required)
- `401`: missing or invalid token
- `403`: audit or related data does not belong to tenant

## Templates

### GET /api/templates/:id

Protected endpoint that returns a dynamic template definition used to render audit screens at runtime.

#### Request Headers

- `Authorization: Bearer <JWT_TOKEN>`

#### Path Parameters

- `id` (string): template identifier

#### Example Request

```
GET /api/templates/TPL-GMP-001
```

#### Success Response (200)

Returns template metadata, sections, and a `questions` array describing each UI field.

```json
{
  "success": true,
  "message": "Template fetched successfully.",
  "data": {
    "id": "TPL-GMP-001",
    "name": "Warehouse GMP Compliance Audit",
    "version": 3,
    "questions": [
      {
        "id": "Q-001",
        "question_text": "Inspector full name",
        "answer_type": "TEXT",
        "parent_question_id": null,
        "prerequisite_condition": null
      }
    ]
  }
}
```

#### Client Integration Notes

- Frontend must request template at audit start or cache refresh.
- UI composition must be based on `questions` and their `answer_type`.
- Conditional visibility must be computed from `parent_question_id` + `prerequisite_condition`.

## Notifications

### POST /api/notifications/register-device

Registers or updates the mobile device push token for the logged-in user.

#### Request Headers

- `Authorization: Bearer <JWT_TOKEN>`
- `Content-Type: application/json`

#### Request Body

```json
{
  "fcm_token": "bk3RNwZs3Qg:CI2g_D84...",
  "device_type": "android"
}
```

#### Success Response (200)

```json
{
  "success": true,
  "message": "Device registered successfully.",
  "data": {
    "id": "3f9b3b75-3bc2-4cc9-8d6b-e0f041ec3a9b",
    "user_id": "0f2a49aa-2f7c-4f0a-9e86-2bbde69369c4",
    "fcm_token": "bk3RNwZs3Qg:CI2g_D84...",
    "device_type": "android",
    "updated_at": "2026-05-23T21:30:00.000Z"
  }
}
```

#### Error Responses

- `400`: missing `fcm_token` or `device_type`, or invalid `device_type`
- `401`: missing or invalid token

## Test Accounts (QA / Integration)

Use these accounts for integration tests and dashboard/mobile validation.

- Admin
  - email: `test.admin@acomed.tech`
  - password: `AcomedTest@123`
  - role: `admin`
- Inspector
  - email: `test.inspector@acomed.tech`
  - password: `InspectorTest@123`
  - role: `inspector`

These users are created by migration file:

`database/migrations/02_seed_test_accounts.sql`

## How to Use the API (Quick Flow)

### 1) Login

```bash
curl -X POST "https://api.acomed.tech/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.admin@acomed.tech",
    "password": "AcomedTest@123"
  }'
```

Copy `data.token` from the response.

### 2) Get Dynamic Template

```bash
curl -X GET "https://api.acomed.tech/api/templates/TPL-GMP-001" \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### 3) Send Sync Payload

```bash
curl -X POST "https://api.acomed.tech/api/sync" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "audits": [],
    "answers": [],
    "capas": []
  }'
```

### 4) Health Check

```bash
curl -X GET "https://api.acomed.tech/health"
```

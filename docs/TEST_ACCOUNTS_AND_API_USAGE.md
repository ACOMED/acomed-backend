# Test Accounts and API Usage

This guide gives QA, Dashboard, and Mobile teams ready-to-use credentials and an end-to-end API call flow.

## 1) Test Accounts

The migration `database/migrations/02_seed_test_accounts.sql` creates two accounts.

### Account A (Admin)

- Email: `test.admin@acomed.tech`
- Password: `AcomedTest@123`
- Role: `admin`

### Account B (Inspector)

- Email: `test.inspector@acomed.tech`
- Password: `InspectorTest@123`
- Role: `inspector`

## 2) Apply Migration

Run the migration against your target database before login testing.

Example using `psql`:

```bash
psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -f database/migrations/02_seed_test_accounts.sql
```

## 3) API Base URL

Production:

```text
https://api.acomed.tech
```

## 4) Login and Get JWT Token

```bash
curl -X POST "https://api.acomed.tech/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test.admin@acomed.tech",
    "password": "AcomedTest@123"
  }'
```

The response contains `data.token`. Use it as Bearer token for protected routes.

## 5) Call Protected Templates Endpoint

```bash
curl -X GET "https://api.acomed.tech/api/templates/TPL-GMP-001" \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

Expected result:

- `200` if token is valid.
- `401` if token is missing/invalid.

## 6) Call Protected Sync Endpoint

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

Expected result:

- `200` for valid payload and token.
- `400` if payload is malformed (for example, `audits` is not an array).
- `401` if token is missing/invalid.

## 7) Browser Dashboard Notes

For browser-based dashboard calls:

- Always send `Authorization: Bearer <JWT_TOKEN>` on protected endpoints.
- Ensure requests use `https://api.acomed.tech` as API origin.
- If you get `401`, first refresh login token.

## 8) Health Check

```bash
curl -X GET "https://api.acomed.tech/health"
```

Expected result: `200` with a JSON payload containing `status: ok`.

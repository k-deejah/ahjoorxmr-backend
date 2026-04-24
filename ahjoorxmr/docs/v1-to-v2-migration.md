# v1 to v2 API Migration Guide

> **Sunset Date:** `V1_SUNSET_DATE` (see `.env.example`). After this date all v1 routes return `410 Gone`.

All v1 routes are prefixed `/api/v1/`. All v2 routes are prefixed `/api/v2/`.

---

## Groups

### GET /api/v1/groups → GET /api/v2/groups
No breaking change in request. Response no longer includes `members` array.

**v1 response:**
```json
{ "id": "uuid", "name": "My Group", "members": [...], "status": "ACTIVE" }
```
**v2 response:**
```json
{ "id": "uuid", "name": "My Group", "status": "ACTIVE" }
```

### GET /api/v1/groups/:id → GET /api/v2/groups/:id
Same change: `members` field removed from response.

### GET members (new in v2)
Use the dedicated endpoint:
```
GET /api/v2/groups/:id/members
```
Returns the same membership array that was previously embedded in the group response.

### POST /api/v1/groups → POST /api/v2/groups
No breaking changes.

### PATCH /api/v1/groups/:id → PATCH /api/v2/groups/:id
No breaking changes.

### DELETE /api/v1/groups/:id → DELETE /api/v2/groups/:id
No breaking changes.

### POST /api/v1/groups/:id/activate → POST /api/v2/groups/:id/activate
No breaking changes.

### POST /api/v1/groups/:id/advance-round → POST /api/v2/groups/:id/advance-round
No breaking changes.

### POST /api/v1/groups/:id/rounds/:round/payout → POST /api/v2/groups/:id/rounds/:round/payout
No breaking changes.

### GET /api/v1/groups/:id/contract-state → GET /api/v2/groups/:id/contract-state
No breaking changes.

---

## Users

### GET /api/v1/users → GET /api/v2/users
No breaking changes.

### GET /api/v1/users/:id → GET /api/v2/users/:id
No breaking changes.

---

## Auth

### POST /api/v1/auth/login → POST /api/v2/auth/login
No breaking changes.

### POST /api/v1/auth/refresh → POST /api/v2/auth/refresh
No breaking changes.

### POST /api/v1/auth/logout → POST /api/v2/auth/logout
No breaking changes.

---

## Memberships

### GET /api/v1/memberships → GET /api/v2/memberships
No breaking changes.

### POST /api/v1/memberships → POST /api/v2/memberships
No breaking changes.

---

## Contributions

### GET /api/v1/contributions → GET /api/v2/contributions
No breaking changes.

### POST /api/v1/contributions → POST /api/v2/contributions
No breaking changes.

---

## Deprecation Headers

All v1 responses include:

| Header | Value |
|--------|-------|
| `Deprecation` | `true` |
| `Sunset` | RFC 7231 date string from `V1_SUNSET_DATE` |
| `Link` | `<APP_URL/api/v2>; rel="successor-version"` |

---

## Detecting Deprecated Usage

Admins can query which clients are still calling v1:

```
GET /api/v1/admin/deprecation-usage
Authorization: Bearer <admin-token>
```

Response:
```json
{
  "totalCalls": 142,
  "byRoute": { "/api/v1/groups": 100, "/api/v1/users": 42 },
  "byUser": { "user-uuid-1": 80, "anonymous": 62 },
  "generatedAt": "2025-01-01T00:00:00.000Z"
}
```

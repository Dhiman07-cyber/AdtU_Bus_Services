# Missed Bus Feature — Final (Proximity-Aware, No Admin, No Audit)

## Purpose

Enable a student who missed their assigned bus to request pickup from nearby buses — but only when the assigned bus is not clearly approaching. If the assigned driver is still approaching (within 100 m or ETA trending down), the assigned driver is politely asked to wait for a short window. Otherwise, candidate buses are discovered and notified. This feature is driver-driven, uses minimal new DB state, has no admin override, and produces no audit logs.

## Key Traits

* Minimal DB change (single `missed_bus_requests` table).
* Server-only writes; all operations idempotent.
* ORS-enabled ETA checks with exact maintenance toast on ORS Stage-1 failures.
* 100 m proximity threshold for assigned-bus wait logic.
* Driver-wait lifecycle with lightweight monitoring.
* Temporary, cheap location sharing via `student_location` JSON on the request row.
* Workers process small batches and early-exit for free-tier friendliness.

---

## Schema (single new table)

```sql
CREATE TABLE missed_bus_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op_id text UNIQUE,                -- idempotency key from client
  student_id text NOT NULL,
  route_id text NOT NULL,
  stop_id text NOT NULL,
  student_seq int NULL,             -- cached route sequence (optional)
  stage text NOT NULL DEFAULT 'pending', -- pending / waiting_assigned / searching / pending_candidates / approved / rejected / expired / cancelled
  trip_candidates jsonb NULL,       -- small array [{trip_id, bus_id, eta_minutes, nearby}]
  candidate_trip_id uuid NULL,      -- on approval
  student_location jsonb NULL,      -- optional short-lived {lat,lng,ts}
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  responded_by text NULL,
  responded_at timestamptz NULL
);
CREATE INDEX ON missed_bus_requests(student_id);
CREATE INDEX ON missed_bus_requests(op_id);
CREATE INDEX ON missed_bus_requests(stage);
```

---

## Configuration Knobs

```typescript
const CONFIG = {
  NEARBY_THRESHOLD_METERS: 100,       // Proximity threshold for "bus is nearby"
  BOARDING_THRESHOLD_METERS: 10,      // Final boarding detection
  AVG_MINUTES_PER_STOP: 3,            // Fallback ETA calculation
  REQUEST_EXPIRES_MINUTES: 15,        // Request TTL
  ASSIGNED_WAIT_MAX_SECONDS: 180,     // Max driver wait time
  DRIVER_HEARTBEAT_TIMEOUT_SEC: 60,   // Driver must have recent heartbeat
  ORS_MANDATORY: false,               // If true, ORS failure blocks request
  ORS_TIMEOUT_MS: 3000,               // ORS request timeout
  RATE_LIMIT_PER_DAY: 3,              // Max requests per student per day
  WORKER_LIMIT: 50                    // Rows processed per worker run
};
```

---

## Flow Overview

### Stage-1: Assigned Bus Check

1. Student taps **"I Missed My Bus"** → server computes `student_seq` from route data.
2. Server queries `driver_status` for student's assigned bus (by `bus_id`).
3. **Proximity Check**: If bus location and student stop location are available:
   - Compute **Haversine distance** between bus and student's stop.
   - If `distance <= NEARBY_THRESHOLD_METERS` (100m):
     - **DO NOT proceed** with missed bus request.
     - Return message: `"Your assigned bus appears nearby — please wait a few minutes so the driver can pick you up."`
4. **ETA Check** (if not within proximity):
   - If ORS enabled: call ORS to compute ETA. On ORS failure → **maintenance toast** and abort.
   - If ETA is decreasing (bus approaching) → ask student to wait.
   - If bus has passed (`bus_seq >= student_seq`) or ETA increasing → proceed to Stage-2.
5. **Fallback**: If no location data available, use sequence-based check:
   - If `bus_seq < student_seq` → assigned bus hasn't passed → return "assigned_on_way".
   - If `bus_seq >= student_seq` → bus has passed → proceed to Stage-2.

### Stage-2: Candidate Search

Only executed if assigned bus has clearly passed or is not approaching:

1. Query `driver_status` for other active drivers on the same route.
2. Filter candidates:
   - `status = 'on_trip'`
   - `bus_seq < student_seq` (bus hasn't passed)
   - Recent heartbeat (within `DRIVER_HEARTBEAT_TIMEOUT_SEC`)
3. Compute ETA for each candidate.
4. If no candidates → return: `"Currently no bus is available to pick you up."`
5. If candidates exist → create `missed_bus_requests` row, notify candidate drivers.

---

## API Endpoints

### POST `/api/missed-bus/raise`

**Input:** `{ opId, routeId, stopId, assignedBusId }` (token provides studentId)

**Response Stages:**
- `pending`: Request created, waiting for driver response
- `waiting_assigned`: Assigned bus is nearby, student asked to wait
- `assigned_on_way`: Assigned bus approaching, cannot raise request
- `no_candidates`: No eligible buses found
- `maintenance`: ORS failure (Stage-1)
- `rate_limited`: Daily limit exceeded

### POST `/api/missed-bus/driver-response`

**Input:** `{ requestId, decision: 'accept' | 'reject' }`

- First accept wins via atomic DB update.
- On accept: `stage='approved'`, student notified.

### POST `/api/missed-bus/cancel`

- Sets `stage='cancelled'`, clears `student_location`, notifies drivers.

### GET `/api/missed-bus/status`

- Returns student's current active request (if any).

---

## UI Messages (Exact Text)

| Scenario | Message |
|----------|---------|
| Maintenance (ORS fail) | `"This feature is currently under maintenance. Sorry for the inconvenience caused"` |
| Assigned nearby | `"Your assigned bus appears nearby — please wait a few minutes so the driver can pick you up."` |
| Assigned on way | `"Your assigned bus is still on the way. Alternate buses are not available yet."` |
| Searching | `"Searching other buses to help you. We'll notify you shortly."` |
| Request pending | `"Pickup request sent to nearby buses. We'll notify you when a driver accepts."` |
| Accepted | `"Good news — Bus {busNumber} will pick you up. Please head to {stopName}."` |
| No candidates | `"Currently no bus is available to pick you up. Please wait for the next bus or try again later."` |
| Expired | `"Your pickup request expired. Please try again if needed."` |
| Rate limited | `"You have reached the missed-bus request limit. Try again later."` |

---

## Security

- Firebase JWT required for all endpoints.
- All writes done by server with service role; clients cannot mutate DB directly.
- `studentId`/`driverId` extracted from token (never from request body).
- Rate-limiting: 3 requests/day per student.
- Location data ephemeral and removed at completion/expiry.

---

## Edge Cases

| Case | Handling |
|------|----------|
| Assigned bus within 100m | Return `assigned_on_way` message, don't create request |
| Assigned bus ETA decreasing | Return `assigned_on_way` message |
| ORS Stage-1 failure | Immediate maintenance toast, abort |
| Multiple drivers accept | Atomic update ensures only first wins |
| Driver heartbeat stale | Skip that driver in candidate list |
| All candidates reject | Mark request expired, notify student |
| Student cancels mid-flow | Set `stage='cancelled'`, notify drivers |

---

## Testing Checklist

### Unit Tests
- [ ] Haversine distance calculation (100m threshold)
- [ ] Student sequence derivation from route data
- [ ] ORS success/failure branching

### Integration Tests
- [ ] Assigned bus within 100m → returns `assigned_on_way`
- [ ] Assigned bus passed → candidate search executes
- [ ] ORS fails in Stage-1 → maintenance toast
- [ ] First driver accept wins, others get `already_handled`
- [ ] Rate limiting enforced

### Manual Testing
1. Student taps "Missed Bus" when assigned bus is 50m away → should show "bus is nearby" message
2. Student taps "Missed Bus" when assigned bus has passed → should search for candidates
3. Simulate ORS quota exhausted → maintenance toast appears
4. Test rate limit with 3+ requests in same day

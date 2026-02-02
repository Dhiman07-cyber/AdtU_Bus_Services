# Multi-Driver Lock System (Simplified)

A robust, secure system for managing multiple drivers per bus with exclusive lock-based trip control and automatic heartbeat recovery.

> **"The system enforces exclusive bus operation using a server-controlled distributed lock and automatic heartbeat recovery, without manual overrides or administrative intervention."**

## Overview

This system implements a distributed lock mechanism that ensures only one driver can operate a bus at any given time, even when multiple drivers are assigned to the same bus for different shifts.

### Key Features

- **Distributed Lock**: Firestore-based lock per bus prevents concurrent operations
- **Heartbeat System**: Keep-alive mechanism with automatic stale lock cleanup
- **Automatic Recovery**: No manual intervention - locks are released automatically
- **Idempotent Operations**: Safe retries with server-generated trip IDs

### What's NOT Included (by design)

- ❌ Audit logging (trip_events table)
- ❌ Admin override endpoints
- ❌ Force release functionality
- ❌ Manual lock management

## Architecture

```
┌─────────────────┐
│   Driver App    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│              API Endpoints                   │
│  /driver/can-operate                        │
│  /driver/start-trip                         │
│  /driver/heartbeat                          │
│  /driver/end-trip                           │
└─────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐      ┌─────────────────┐
│    Firestore    │      │    Supabase     │
│  ─────────────  │      │  ─────────────  │
│  buses/{busId}  │      │  active_trips   │
│  .activeTripLock│      │                 │
└─────────────────┘      └─────────────────┘
                              │
                              ▼
                  ┌─────────────────────┐
                  │  Cleanup Worker     │
                  │  (Cron - 1 minute)  │
                  └─────────────────────┘
```

## Data Model

### Firestore: `buses/{busId}.activeTripLock`

```typescript
{
  active: boolean,           // true if bus is currently locked
  tripId: string | null,     // UUID of the active trip  
  driverId: string | null,   // UID of the driver holding the lock
  shift: 'morning' | 'evening' | 'both' | null,
  since: Timestamp | null,   // When lock was acquired
  expiresAt: Timestamp | null // TTL for display purposes
}
```

### Supabase: `active_trips`

Live trip records for currently running trips.

| Column | Type | Description |
|--------|------|-------------|
| trip_id | UUID | Primary key |
| bus_id | TEXT | Bus identifier |
| driver_id | TEXT | Driver UID |
| route_id | TEXT | Route identifier |
| shift | TEXT | morning, evening, or both |
| status | TEXT | active or ended |
| start_time | TIMESTAMPTZ | Trip start timestamp |
| end_time | TIMESTAMPTZ | Trip end timestamp |
| last_heartbeat | TIMESTAMPTZ | Last heartbeat received |
| metadata | JSONB | Additional trip metadata |

## API Endpoints

### `POST /api/driver/can-operate`

Check if driver can operate a specific bus.

**Request:**
```json
{
  "idToken": "firebase-id-token",
  "busId": "bus-001"
}
```

**Response (allowed):**
```json
{
  "allowed": true
}
```

**Response (denied):**
```json
{
  "allowed": false,
  "reason": "This bus is currently being operated by another driver. Please wait or try again later."
}
```

### `POST /api/driver/start-trip`

Start a trip with exclusive lock acquisition.

**Request:**
```json
{
  "idToken": "firebase-id-token",
  "busId": "bus-001",
  "routeId": "route-001",
  "shift": "morning"
}
```

**Response (success):**
```json
{
  "success": true,
  "tripId": "uuid-v4",
  "busId": "bus-001",
  "timestamp": "2026-01-26T16:00:00.000Z"
}
```

**Response (conflict - 409):**
```json
{
  "success": false,
  "reason": "This bus is currently being operated by another driver. Please wait or try again later.",
  "errorCode": "LOCKED_BY_OTHER"
}
```

### `POST /api/driver/heartbeat`

Update heartbeat for active trip.

**Request:**
```json
{
  "idToken": "firebase-id-token",
  "tripId": "uuid-v4",
  "busId": "bus-001"
}
```

### `POST /api/driver/end-trip`

End a trip cleanly.

**Request:**
```json
{
  "idToken": "firebase-id-token",
  "tripId": "uuid-v4",
  "busId": "bus-001"
}
```

## Lock Lifecycle

### Starting a Trip

1. Driver calls `/api/driver/start-trip`
2. Server acquires Firestore lock via transaction
3. Server creates `active_trips` record in Supabase
4. If step 2 fails: return 409 conflict
5. If step 3 fails: release Firestore lock, return error

### During Trip

1. Driver sends heartbeat every 5 seconds
2. Server updates `last_heartbeat` in Supabase
3. Server extends `expiresAt` in Firestore

### Ending a Trip

Lock is released ONLY by:
1. **Driver ending trip** - calls `/api/driver/end-trip`
2. **Heartbeat timeout** - cleanup worker releases after 60 seconds of no heartbeat

## Heartbeat & TTL

- **Heartbeat frequency**: 5 seconds from driver app
- **Timeout threshold**: 60 seconds (configurable)
- **Lock TTL**: 120 seconds (for display)

## Cleanup Worker

Runs every minute via Vercel Cron:

1. Calls `cleanup_stale_locks()` database function
2. Finds trips with `last_heartbeat > 60 seconds ago`
3. Marks them as `status = 'ended'`
4. Releases corresponding Firestore locks
5. Broadcasts `trip_ended` event

## Environment Variables

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
NEXT_PUBLIC_FIREBASE_PROJECT_ID=xxx
FIREBASE_CLIENT_EMAIL=xxx
FIREBASE_PRIVATE_KEY=xxx

# Optional (with defaults)
HEARTBEAT_TIMEOUT=60        # seconds
LOCK_TTL=120                # seconds
CRON_SECRET=xxx             # for cron endpoint auth
```

## Deployment

### 1. Run SQL Migration

Execute in Supabase SQL Editor:
```sql
-- File: supabase/migrations/001_multi_driver_lock.sql
```

Or use the complete schema:
```sql
-- File: supabase/COMPLETE_SCHEMA.sql
```

### 2. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### 3. Deploy to Vercel

```bash
vercel --prod
```

## Frontend Integration

### Using the useTripLock Hook

```tsx
import { useTripLock } from '@/hooks/useTripLock';
import { TripLockModal, HeartbeatIndicator, SessionExpiredModal } from '@/components/driver';

function TrackBusPage({ busId, routeId }) {
  const {
    tripState,
    isLoading,
    error,
    canOperate,
    lockDenialReason,
    checkCanOperate,
    startTrip,
    endTrip,
    heartbeatStatus
  } = useTripLock();

  const [showLockModal, setShowLockModal] = useState(false);

  useEffect(() => {
    async function check() {
      const allowed = await checkCanOperate(busId);
      if (!allowed) setShowLockModal(true);
    }
    check();
  }, [busId]);

  if (showLockModal) {
    return (
      <TripLockModal
        isOpen={true}
        onClose={() => setShowLockModal(false)}
        onRetry={() => checkCanOperate(busId).then(allowed => {
          if (allowed) setShowLockModal(false);
        })}
      />
    );
  }

  return (
    <div>
      <HeartbeatIndicator status={heartbeatStatus} lastHeartbeat={null} />
      {tripState.isActive ? (
        <button onClick={endTrip}>End Trip</button>
      ) : (
        <button onClick={() => startTrip(busId, routeId)}>
          Start Trip
        </button>
      )}
    </div>
  );
}
```

## Files

```
src/
├── app/api/driver/
│   ├── can-operate/route.ts
│   ├── start-trip/route.ts
│   ├── heartbeat/route.ts
│   └── end-trip/route.ts
├── app/api/cron/
│   └── cleanup-stale-locks/route.ts
├── lib/services/
│   └── trip-lock-service.ts
├── hooks/
│   └── useTripLock.ts
└── components/driver/
    ├── TripLockModal.tsx
    ├── HeartbeatIndicator.tsx
    ├── SessionExpiredModal.tsx
    └── index.ts

supabase/
├── migrations/
│   └── 001_multi_driver_lock.sql
└── COMPLETE_SCHEMA.sql
```

## Acceptance Criteria

✅ No audit rows are created anywhere  
✅ No admin endpoint exists  
✅ Lock is released only by driver ending trip OR heartbeat timeout cleanup worker  
✅ Two drivers can never operate the same bus at the same time  
✅ Fully automatic with no manual overrides  

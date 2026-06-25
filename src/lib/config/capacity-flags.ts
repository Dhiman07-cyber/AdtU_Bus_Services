/**
 * ─────────────────────────────────────────────────────────────────────────────
 * UNIFIED FEATURE FLAG — Phase 1 Seat-Ownership Architecture
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The finalized business rule: a student's bus seat is released at SOFT BLOCK
 * (not at hard delete). This flag is the SINGLE switch that turns the entire
 * seat-release architecture on or off. It is all-or-nothing by design — there is
 * never a state where some paths release seats while others do not.
 *
 * HOW THE "ONE MODE OR THE OTHER" GUARANTEE IS ENFORCED:
 *
 *   The flag gates exactly ONE write: the soft-block path's capacity decrement +
 *   the `seatReleasedAt` marker on the student document.
 *
 *   Every downstream path keys off the `seatReleasedAt` MARKER, not off this flag
 *   and not off `status`:
 *     - Delete paths skip their decrement iff the marker is present (seat already
 *       released) → no double-decrement.
 *     - Late renewal re-increments iff the marker is present (seat was released)
 *       then clears it → no double-increment, no stale occupancy.
 *
 *   Because the marker is created ONLY when this flag is enabled, a given student
 *   is unambiguously in exactly one mode:
 *     - marker present  ⇒ seat WAS released  ⇒ all paths treat them as released
 *     - marker absent    ⇒ seat NOT released ⇒ all paths use legacy occupancy
 *
 *   This makes the rollout reversible WITHOUT a code revert: flip the env var.
 *   Students released while the flag was on keep their markers and stay correct
 *   even if the flag is later turned off.
 *
 * OPERATIONAL GUIDANCE:
 *   Do NOT enable this in production until the Stage C reconciliation is deployed
 *   (it is the self-healing net for any failed soft-block decrement). Recommended
 *   sequence: deploy code (flag off) → run a staging dry-run → enable.
 *
 * Default: OFF (legacy behavior — seats released only at hard/manual delete).
 */
export function isSeatReleaseAtSoftBlockEnabled(): boolean {
  return process.env.SEAT_RELEASE_AT_SOFT_BLOCK === 'true';
}

/**
 * The canonical "seat was released and not yet reclaimed" predicate.
 *
 * `seatReleasedAt` is an ISO timestamp written at soft block (when the flag is on)
 * and cleared (set to null) when a late renewal reclaims the seat. Its PRESENCE —
 * not the student's `status` — is the authoritative signal that the bus counter
 * was already decremented for this student.
 *
 * Keying on the marker (rather than `status === 'soft_blocked'`) is what makes the
 * delete and renewal paths correct for BOTH legacy soft-blocked students (blocked
 * under the old flag-off behavior → never decremented → marker absent) and
 * new-architecture soft-blocked students (decremented → marker present).
 */
export function wasSeatReleased(studentData: Record<string, any> | undefined | null): boolean {
  return !!(studentData && studentData.seatReleasedAt);
}

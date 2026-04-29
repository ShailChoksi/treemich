/**
 * Explicit per-route limits for handlers that do expensive DB, parser, ZIP, or filesystem work.
 *
 * The app also has a global limiter in `app.ts`; these local route configs make the protection
 * visible at the high-cost handler declarations and keep them stricter than ordinary API reads.
 */
export const EXPENSIVE_ROUTE_RATE_LIMIT = {
  max: 30,
  timeWindow: 60_000
} as const;

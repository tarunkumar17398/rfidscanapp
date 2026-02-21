

# Plan: Fix Real-time Dashboard Updates During Long Scanning Sessions

## Problem
Two issues are causing the dashboard to not reflect all scanned tags during long (5-10 min) scanning sessions:

1. **Debounce prevents ANY updates during active scanning**: The current 500ms debounce resets on every new scan event. Since tags come in faster than every 500ms (20-60 tags/sec), the timer keeps resetting and `fetchStats()` never fires until scanning completely stops. This is why you only see updates after stopping.

2. **Race condition in scan buffer processing**: In ScannerContext, the buffer is cleared synchronously (`scanBufferRef.length = 0`) while the async API call is still referencing it. Tags can be silently lost during high-speed scanning. Also, the `useEffect` depends on `totalScans` which it updates, causing interval recreation.

## Solution

### Fix 1: Replace Debounce with Throttle on Dashboard
Switch from debounce (wait until quiet) to throttle (fire at most once per interval). This ensures `fetchStats()` runs every 2 seconds during active scanning, not just when scanning stops.

```text
DEBOUNCE (current - broken):
  scan scan scan scan scan scan ... STOP ... [500ms] -> fetchStats()
  ^--- never fires during scanning

THROTTLE (fix):
  scan scan scan ... [2s] -> fetchStats() ... scan scan ... [2s] -> fetchStats()
  ^--- fires every 2 seconds during scanning
```

**Changes to `src/pages/Dashboard.tsx`:**
- Replace the debounce timer with a throttle that calls `fetchStats()` at most once every 2 seconds
- Uses a `lastFetchTime` tracker and a pending flag to ensure consistent updates

### Fix 2: Fix Buffer Race Condition in ScannerContext
**Changes to `src/contexts/ScannerContext.tsx`:**
- Copy the buffer contents before clearing to prevent the async API call from losing tags
- Remove `totalScans` from the `useEffect` dependency array and use a ref instead, preventing interval recreation
- This ensures no tags are silently dropped during long sessions

## Technical Details

| Component | Issue | Fix |
|-----------|-------|-----|
| Dashboard.tsx | Debounce blocks updates during scanning | Switch to 2-second throttle |
| ScannerContext.tsx | Buffer cleared before async API finishes | Copy buffer before clearing |
| ScannerContext.tsx | `totalScans` in deps causes interval churn | Use ref for running total |

## Expected Outcome
- Dashboard "Scanned" count updates every ~2 seconds during active scanning
- No tags lost during long scanning sessions
- Smooth performance maintained at high scan rates


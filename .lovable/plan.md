
# Plan: Enable Real-time Dashboard Updates with Proper Pagination

## Problem Identified
The "Scanned" count on the dashboard doesn't update in real-time during active scanning. After investigation:

1. **The `scans` table is NOT in the Supabase realtime publication** - This is why the realtime subscription in Dashboard.tsx (lines 104-119) never receives any events
2. **Pagination is already implemented** - The `getStats()` function already fetches data in batches of 1000, so data above 1000+ is handled correctly

## Solution

### Step 1: Enable Realtime for the Scans Table
Run a database migration to add the `scans` table to the Supabase realtime publication.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.scans;
```

This will enable the existing realtime subscription to receive INSERT events when new scans are recorded.

### Step 2: Add Debounce to Prevent Server Overload
Currently, the realtime handler calls `fetchStats()` on every single scan event. During high-speed scanning (20+ tags per second), this could overwhelm the server.

**Current code (Dashboard.tsx lines 114-116):**
```javascript
() => {
  console.log('New scan detected, refreshing stats...');
  fetchStats();
}
```

**Enhanced approach:**
- Add a debounce timer (500ms) that batches multiple scan events
- Only call `fetchStats()` once after the debounce period
- This prevents excessive API calls while still providing near-real-time updates

### Step 3: No Changes Needed for Pagination
The current implementation already handles 1000+ items correctly:
- `getStats()` fetches inventory in batches of 1000 (lines 35-53)
- `getStats()` fetches scans in batches of 1000 (lines 57-81)
- `getMissingItems()` already uses pagination (implemented previously)
- `getLiveScans()` has 25,000 limit (sufficient for display)

---

## Technical Summary

| Component | Change |
|-----------|--------|
| Database Migration | `ALTER PUBLICATION supabase_realtime ADD TABLE public.scans;` |
| Dashboard.tsx | Add debounce wrapper around `fetchStats()` in realtime handler |

## Expected Outcome
- Dashboard "Scanned" count updates within ~500ms of new scans
- Server load stays manageable during high-speed scanning
- All 1000+ items continue to be handled correctly with existing pagination

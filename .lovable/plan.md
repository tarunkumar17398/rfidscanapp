

# Plan: Zebra-Inspired Smart Inventory Scanning

After researching Zebra's 123RFID Desktop and their RFID SDK, here are the key techniques they use that we can adapt for your Chafon H102 scanner. While we can't use Zebra's proprietary reader firmware features, we can replicate their **software-side intelligence** which is where most of the magic happens.

## What Zebra Does (and What We Can Steal)

### 1. Unique Tag Reporting (Already Partially Done)
Zebra's reader reports each unique tag only once per session. Your batch-scan edge function already does server-side dedup per cycle -- good. But the **client-side** still sends duplicates to the server unnecessarily, wasting bandwidth during long sessions.

### 2. Discovery Rate Tracking + Completion Detection
Zebra tracks "unique tags per second" and shows a progress curve. When the discovery rate drops to near zero, you know you've found (almost) all tags. This is the single most impactful feature for 5-10 minute scan sessions.

### 3. Smart Auto-Session Switching
Zebra dynamically switches between session modes. Start with S1 (fast discovery, tags go quiet after responding), then when discovery slows, auto-switch to S0 (re-reads everything) to catch stragglers that were missed.

### 4. Tag Population Estimate
Zebra lets you set expected tag count so the reader optimizes its anti-collision algorithm. We already know the inventory count from the database -- we can use this.

### 5. RSSI-Based Filtering
Zebra filters out weak signals (distant tags or reflections) to reduce false reads. The Chafon H102 includes RSSI data in its responses that we're currently ignoring.

---

## Implementation Plan

### Feature 1: Client-Side Duplicate Suppression for API Calls
**File: `src/contexts/ScannerContext.tsx`**

Currently, every tag (including duplicates) gets sent to the batch-scan API. Add a filter so only **new unique tags** are sent to the server. Duplicates are still tracked locally for the UI but skip the API call entirely.

This reduces API calls dramatically during long sessions (e.g., 2000 tags scanned but only 800 unique = 60% fewer API calls).

### Feature 2: Smart Scan Progress Indicator
**New file: `src/components/ScanProgress.tsx`**
**Modified: `src/contexts/ScannerContext.tsx`**

Track and display:
- **Unique tags found** vs **expected total** (from inventory count)
- **Discovery rate** (new unique tags per second) -- when this drops below 1/sec for 10 seconds, show "scan likely complete"
- **Progress bar** showing percentage of expected inventory found
- **Time elapsed** for the current scan session

This is the biggest UX win from Zebra -- knowing when you're "done" without manually checking.

### Feature 3: Auto-Session Switching (Smart Inventory Mode)
**File: `src/contexts/ScannerContext.tsx`**

Implement a "Smart Mode" toggle that:
1. Starts in **S1** (fast discovery, minimal duplicates)
2. Monitors the unique discovery rate
3. When rate drops below threshold (e.g., less than 2 new tags in 5 seconds), auto-switches to **S0** (re-reads all tags to catch stragglers)
4. After S0 pass finds no new tags for 10 seconds, signals "scan complete"

This mimics Zebra's multi-round inventory algorithm.

### Feature 4: RSSI Extraction and Weak Signal Filtering
**File: `src/lib/rfidScanner.ts`**

The Chafon H102 response bytes contain RSSI data (typically at byte index 5 or 6). Currently we ignore this. Changes:
- Parse RSSI value from the response
- Include RSSI in the tag callback data
- Add optional minimum RSSI threshold to filter out weak/distant reads
- Display signal strength per tag in the Live Scans view

### Feature 5: Optimized Batch API Calls
**File: `src/contexts/ScannerContext.tsx`**

Only send truly new (unseen-by-server) tags in API batches:
- Maintain a `serverConfirmedTags` Set that tracks what the server already knows about
- When batch-scan returns results, mark confirmed tags
- Skip sending any tag that's already confirmed by the server
- This prevents re-sending the same tags across multiple 500ms batch intervals

---

## Technical Summary

| Feature | Zebra Equivalent | Impact |
|---------|-----------------|--------|
| Client-side dedup for API | Unique Tag Report | 50-60% fewer API calls |
| Progress indicator | Inventory progress bar | Know when scan is complete |
| Auto-session switching | Smart Inventory Mode | Find all tags faster |
| RSSI extraction | Signal strength filtering | Fewer false reads |
| Server-confirmed tag tracking | Session-aware reporting | Zero wasted API calls |

## Expected Outcome
- Dashboard updates reliably during entire 5-10 min sessions
- Clear visual indicator showing scan completion percentage
- Automatic optimization that finds all 2000+ tags faster
- Dramatically reduced server load during long scans
- Professional Zebra-like scanning experience


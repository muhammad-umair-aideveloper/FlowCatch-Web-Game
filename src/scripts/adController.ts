/**
 * adController.ts
 * Manages ad break timing, H5 Games Ads API hooks, and banner refresh.
 * Follows IAB and Google H5 Games Ads guidelines for viewability and UX.
 */

declare global {
  interface Window {
    adBreak?: (opts: AdBreakOptions) => void;
    adConfig?: (opts: AdConfigOptions) => void;
  }
}

interface AdBreakOptions {
  type: 'preroll' | 'midgame' | 'reward' | 'browsergame';
  name?: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  adBreakDone?: (info: { breakStatus: string }) => void;
}

interface AdConfigOptions {
  preloadAdBreaks?: 'on' | 'off';
  onReady?: () => void;
  sound?: 'on' | 'off';
}

// ─── Active engagement tracking ───────────────────────────────────────────────

let sessionStartMs = 0;
let lastInteractionTs = 0;
let activeEngagementMs = 0;
let lastTickTs = 0;
let engagementTimer: ReturnType<typeof setInterval> | null = null;

export function initAdController(): void {
  const now = Date.now();
  sessionStartMs = now;
  lastInteractionTs = now;
  lastTickTs = now;
  activeEngagementMs = 0;

  // Configure H5 Games Ads — preload breaks so they are ready instantly
  if (typeof window.adConfig === 'function') {
    window.adConfig({
      preloadAdBreaks: 'on',
      sound: 'on',
      onReady: () => {
        console.debug('[AdController] H5 Games Ads ready');
      },
    });
  }

  // Count active engagement seconds whenever document is visible and interacted recently
  if (engagementTimer) clearInterval(engagementTimer);
  engagementTimer = setInterval(() => {
    const current = Date.now();
    const dt = current - lastTickTs;
    lastTickTs = current;

    // Active if document is visible and user interacted within the last 20 seconds
    if (!document.hidden && current - lastInteractionTs < 20_000) {
      activeEngagementMs += dt;
    }
  }, 1000);
}

/** Call on every user interaction to track active engagement */
export function pingEngagement(): void {
  const now = Date.now();
  lastInteractionTs = now;
}

/** Returns total active engagement in milliseconds */
export function getEngagementMs(): number {
  return activeEngagementMs;
}

// ─── Shift-break interstitial ─────────────────────────────────────────────────

/**
 * Trigger a midgame ad break between shifts.
 * Only fires if player has been active for >= 60 seconds (IAB viewability).
 */
export function triggerShiftBreakAd(opts: {
  onBeforeAd: () => void;
  onAfterAd: () => void;
}): void {
  const engagementSec = getEngagementMs() / 1000;

  if (typeof window.adBreak !== 'function') {
    opts.onAfterAd();
    return;
  }

  // Enforce 60-second viewability threshold
  if (engagementSec < 60) {
    opts.onAfterAd();
    return;
  }

  window.adBreak({
    type: 'midgame',
    name: 'shift-complete-break',
    beforeAd: opts.onBeforeAd,
    afterAd: opts.onAfterAd,
    adBreakDone: (info) => {
      console.debug('[AdController] Break done:', info?.breakStatus);
      opts.onAfterAd();
    },
  });
}

// ─── Banner slot refresh ──────────────────────────────────────────────────────

/**
 * Refresh a specific ad slot by slot ID.
 * Call after 30+ seconds of active engagement or between shifts.
 */
export function refreshBannerSlot(slotId: string): void {
  console.debug(`[AdController] Refresh slot: ${slotId}`);

  // Dispatch custom event for external ad network handlers
  const event = new CustomEvent('adSlotRefresh', { detail: { slotId } });
  document.dispatchEvent(event);
}

/** Cleanup: call when leaving the game page */
export function destroyAdController(): void {
  if (engagementTimer) {
    clearInterval(engagementTimer);
    engagementTimer = null;
  }
}

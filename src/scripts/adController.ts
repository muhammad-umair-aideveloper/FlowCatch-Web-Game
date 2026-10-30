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

// ─── Session timer (tracks active play time for refresh gating) ───────────────

let sessionStartMs = 0;
let totalEngagementMs = 0;
let lastActiveTs = 0;
let bannerRefreshTimer: ReturnType<typeof setInterval> | null = null;

export function initAdController(): void {
  sessionStartMs = Date.now();
  lastActiveTs = Date.now();

  // Configure H5 Games Ads — preload breaks so they're ready instantly
  if (typeof window.adConfig === 'function') {
    window.adConfig({
      preloadAdBreaks: 'on',
      sound: 'on',
      onReady: () => {
        console.debug('[AdController] H5 Games Ads ready');
      },
    });
  }

  // Schedule banner slot refresh every 30 seconds of active engagement
  bannerRefreshTimer = setInterval(() => {
    const now = Date.now();
    if (now - lastActiveTs < 5000) {
      totalEngagementMs += 30_000;
    }
  }, 30_000);
}

/** Call on every user interaction to track active engagement */
export function pingEngagement(): void {
  lastActiveTs = Date.now();
}

/** Returns total active engagement in milliseconds */
export function getEngagementMs(): number {
  return totalEngagementMs + (Date.now() - Math.max(sessionStartMs, lastActiveTs - 5000));
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
    // H5 Games Ads not loaded — skip gracefully
    opts.onAfterAd();
    return;
  }

  if (engagementSec < 60) {
    // Not enough engagement for a viewable ad — skip
    opts.onAfterAd();
    return;
  }

  window.adBreak({
    type: 'midgame',
    name: 'shift-complete-break',
    beforeAd: opts.onBeforeAd,
    afterAd: opts.onAfterAd,
    adBreakDone: (info) => {
      console.debug('[AdController] Break done:', info.breakStatus);
      if (info.breakStatus !== 'viewed') {
        opts.onAfterAd();
      }
    },
  });
}

// ─── Banner slot refresh ──────────────────────────────────────────────────────

/**
 * Refresh a specific ad slot by slot ID.
 * Call after 30+ seconds of active engagement or between shifts.
 * Stub: replace with your ad network's refresh API (GPT, Prebid, etc.)
 */
export function refreshBannerSlot(slotId: string): void {
  // Google Publisher Tag example:
  // if (window.googletag && window.googletag.pubads) {
  //   const slot = window._adSlots?.[slotId];
  //   if (slot) window.googletag.pubads().refresh([slot]);
  // }
  console.debug(`[AdController] Refresh slot: ${slotId}`);

  // Dispatch custom event for any external ad framework to listen to
  const event = new CustomEvent('adSlotRefresh', { detail: { slotId } });
  document.dispatchEvent(event);
}

/** Cleanup: call when leaving the game page */
export function destroyAdController(): void {
  if (bannerRefreshTimer) {
    clearInterval(bannerRefreshTimer);
    bannerRefreshTimer = null;
  }
}

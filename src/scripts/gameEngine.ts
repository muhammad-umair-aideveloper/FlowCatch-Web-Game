/**
 * gameEngine.ts
 * Core 60FPS conveyor belt game loop using requestAnimationFrame + delta-time.
 * Handles item movement, drag-and-drop, AABB collision, scoring, and shift management.
 */

import type {
  TaxonomyPack,
  TaxonomyItem,
  ActiveConveyorItem,
  BinRect,
  FloatingPopup,
  GameState,
  ShiftConfig,
  ShiftPerformance,
  ShiftId,
  CategoryBinId,
} from '../types/game.js';

import {
  startBeltHum,
  stopBeltHum,
  playPickup,
  playDrop,
  playCorrect,
  playError,
  playIncinerate,
  playShiftComplete,
  playSpeedSurge,
} from './soundEngine.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_W = 100;
const ITEM_H = 64;
const BELT_Y = 0;           // items sit on the belt track (offset from track top)
const FLIGHT_DURATION = 0.4; // seconds for parabolic arc
const POPUP_DURATION = 1200; // ms

const SHIFT_CONFIGS: ShiftConfig[] = [
  {
    shiftNumber: 1,
    name: 'Shift 1',
    itemCount: 10,
    speedMultiplier: 1.0,
    spawnIntervalMs: 3200,
    hasSpeedSurge: false,
    hasMysteryCrates: false,
    targetDurationSec: 90,
  },
  {
    shiftNumber: 2,
    name: 'Shift 2',
    itemCount: 15,
    speedMultiplier: 1.3,
    spawnIntervalMs: 2600,
    hasSpeedSurge: true,
    hasMysteryCrates: false,
    targetDurationSec: 110,
  },
  {
    shiftNumber: 3,
    name: 'Shift 3',
    itemCount: 20,
    speedMultiplier: 1.6,
    spawnIntervalMs: 2000,
    hasSpeedSurge: true,
    hasMysteryCrates: true,
    targetDurationSec: 130,
  },
];

// ─── Fisher-Yates Shuffle ─────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ─── AABB Collision ───────────────────────────────────────────────────────────

function aabbHit(
  ix: number, iy: number, iw: number, ih: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ix < bx + bw && ix + iw > bx && iy < by + bh && iy + ih > by;
}

// ─── Engine Class ─────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: 'score_update'; score: number; streak: number }
  | { type: 'life_lost'; lives: number }
  | { type: 'shift_complete'; performance: ShiftPerformance }
  | { type: 'game_over'; history: ShiftPerformance[] }
  | { type: 'item_sorted'; correct: boolean; explanation: string; itemLabel: string }
  | { type: 'popup'; popup: FloatingPopup }
  | { type: 'items_changed'; items: ActiveConveyorItem[] };

export class ConveyorGameEngine {
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private pack: TaxonomyPack;
  private binRects: BinRect[] = [];
  private rafId: number = 0;
  private lastTs: number = 0;
  private beltOffset: number = 0;

  // State
  private state: GameState = {
    phase: 'idle',
    currentShift: 1,
    score: 0,
    streak: 0,
    maxStreak: 0,
    lives: 3,
    shiftHistory: [],
    selectedItemUid: null,
  };

  // Item queues
  private itemQueue: TaxonomyItem[] = [];
  private activeItems: ActiveConveyorItem[] = [];
  private popups: FloatingPopup[] = [];

  // Spawn timing
  private lastSpawnTime: number = 0;
  private shiftItemsSpawned: number = 0;
  private shiftItemsSettled: number = 0;
  private shiftStartTime: number = 0;

  // Current shift perf
  private currentPerf: ShiftPerformance = this.blankPerf(1);

  // Event listeners
  private listeners: Array<(e: GameEvent) => void> = [];

  // ── Interaction state ───────────────────────────────────────────────────────
  private dragItem: ActiveConveyorItem | null = null;
  private pointerDown = false;

  constructor(canvas: HTMLCanvasElement, pack: TaxonomyPack) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d')!;
    this.pack = pack;
    this.attachPointerEvents();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  on(cb: (e: GameEvent) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  setBinRects(rects: BinRect[]): void {
    this.binRects = rects;
  }

  start(): void {
    this.state.phase = 'shift_active';
    this.state.currentShift = 1;
    this.state.score = 0;
    this.state.streak = 0;
    this.state.maxStreak = 0;
    this.state.lives = 3;
    this.state.shiftHistory = [];
    this.loadShift(1);
    startBeltHum();
    this.lastTs = performance.now();
    this.loop(this.lastTs);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    stopBeltHum();
    this.state.phase = 'idle';
  }

  resumeAfterBreak(): void {
    if (this.state.currentShift < 3) {
      const next = (this.state.currentShift + 1) as ShiftId;
      this.state.currentShift = next;
      this.loadShift(next);
      this.state.phase = 'shift_active';
      this.lastTs = performance.now();
      this.loop(this.lastTs);
      startBeltHum();
    } else {
      this.emit({ type: 'game_over', history: this.state.shiftHistory });
      this.state.phase = 'game_over';
    }
  }

  // Click-to-select accessibility
  selectItem(uid: string): void {
    this.state.selectedItemUid = uid;
  }

  sortSelectedItem(binId: CategoryBinId): void {
    if (!this.state.selectedItemUid) return;
    const item = this.activeItems.find(i => i.uid === this.state.selectedItemUid);
    if (!item || item.state !== 'conveyor') return;
    this.state.selectedItemUid = null;
    this.launchToBin(item, binId);
  }

  // ─── Private: Shift Management ──────────────────────────────────────────────

  private blankPerf(shift: ShiftId): ShiftPerformance {
    return {
      shiftNumber: shift,
      totalItems: 0,
      sortedCorrectly: 0,
      sortedIncorrectly: 0,
      incinerated: 0,
      accuracy: 0,
      maxStreak: 0,
      pointsEarned: 0,
      missedItems: [],
    };
  }

  private loadShift(shiftId: ShiftId): void {
    const cfg = SHIFT_CONFIGS[shiftId - 1]!;
    this.shiftItemsSpawned = 0;
    this.shiftItemsSettled = 0;
    this.shiftStartTime = performance.now();
    this.lastSpawnTime = performance.now();
    this.currentPerf = this.blankPerf(shiftId);
    this.activeItems = [];

    // Build shuffled queue — repeat items if pack has fewer than needed
    const base = shuffle(this.pack.items);
    const queue: TaxonomyItem[] = [];
    while (queue.length < cfg.itemCount) {
      queue.push(...base);
    }
    this.itemQueue = queue.slice(0, cfg.itemCount);
  }

  private getShiftConfig(): ShiftConfig {
    return SHIFT_CONFIGS[this.state.currentShift - 1]!;
  }

  // ─── Private: RAF Loop ──────────────────────────────────────────────────────

  private loop = (ts: number): void => {
    if (this.state.phase !== 'shift_active') return;

    const dt = Math.min((ts - this.lastTs) / 1000, 0.05); // cap at 50ms
    this.lastTs = ts;

    this.update(dt, ts);
    this.render(ts);

    this.rafId = requestAnimationFrame(this.loop);
  };

  // ─── Private: Update ────────────────────────────────────────────────────────

  private update(dt: number, now: number): void {
    const cfg = this.getShiftConfig();
    const baseSpeed = 90 * cfg.speedMultiplier; // px/s at base

    // Spawn new items
    if (
      this.shiftItemsSpawned < this.itemQueue.length &&
      now - this.lastSpawnTime >= cfg.spawnIntervalMs
    ) {
      this.spawnItem(this.itemQueue[this.shiftItemsSpawned]!, baseSpeed, cfg, now);
      this.shiftItemsSpawned++;
      this.lastSpawnTime = now;
    }

    // Belt scroll offset for visual animation
    this.beltOffset = (this.beltOffset + baseSpeed * dt * 0.5) % 32;

    // Update each item
    for (let i = this.activeItems.length - 1; i >= 0; i--) {
      const item = this.activeItems[i]!;

      if (item.state === 'conveyor') {
        item.x += item.speed * dt;

        // Hit the incinerator (right edge)
        if (item.x > this.canvas.width - 20) {
          item.state = 'falling_incinerator';
          playIncinerate();
          this.recordMiss(item, 'missed_off_edge');
          setTimeout(() => this.removeItem(item.uid), 500);
        }
      } else if (item.state === 'parabolic_flight') {
        item.flightProgress += dt / FLIGHT_DURATION;
        if (item.flightProgress >= 1) {
          item.flightProgress = 1;
          item.state = 'sorted';
          this.settleItem(item);
          setTimeout(() => this.removeItem(item.uid), 300);
        } else {
          const t = item.flightProgress;
          const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          item.x = item.flightStartX + (item.flightTargetX - item.flightStartX) * ease;
          const arc = Math.sin(t * Math.PI) * -80;
          item.y = item.flightStartY + (item.flightTargetY - item.flightStartY) * ease + arc;
        }
      } else if (item.state === 'falling_incinerator') {
        item.y += 200 * dt;
      }
    }

    // Update popups
    this.popups = this.popups.filter(p => now - p.createdAt < p.duration);

    // Shift complete check
    if (
      this.shiftItemsSpawned >= this.itemQueue.length &&
      this.activeItems.filter(i => i.state === 'conveyor' || i.state === 'dragged' || i.state === 'parabolic_flight').length === 0
    ) {
      this.completeShift();
    }
  }

  private spawnItem(
    item: TaxonomyItem,
    baseSpeed: number,
    cfg: ShiftConfig,
    now: number,
  ): void {
    const isMystery = cfg.hasMysteryCrates && Math.random() < 0.2;
    const isSpeedSurge = cfg.hasSpeedSurge && Math.random() < 0.15;
    const speed = baseSpeed * (isSpeedSurge ? 2.0 : 1.0);

    if (isSpeedSurge) playSpeedSurge();

    const active: ActiveConveyorItem = {
      uid: `${item.id}-${now}-${Math.random().toString(36).slice(2, 6)}`,
      itemData: item,
      x: -ITEM_W - 10,
      y: 0,
      width: ITEM_W,
      height: ITEM_H,
      speed,
      isSpeedSurge,
      isMystery,
      isRevealed: !isMystery,
      state: 'conveyor',
      dragCurrentX: 0,
      dragCurrentY: 0,
      dragOffsetX: 0,
      dragOffsetY: 0,
      flightProgress: 0,
      flightStartX: 0,
      flightStartY: 0,
      flightTargetX: 0,
      flightTargetY: 0,
    };

    this.activeItems.push(active);
    this.emit({ type: 'items_changed', items: [...this.activeItems] });
  }

  private launchToBin(item: ActiveConveyorItem, binId: CategoryBinId): void {
    const bin = this.binRects.find(b => b.id === binId);
    if (!bin) return;

    playDrop();

    item.state = 'parabolic_flight';
    item.targetBinId = binId;
    item.flightProgress = 0;
    item.flightStartX = item.state === 'dragged' ? item.dragCurrentX : item.x;
    item.flightStartY = item.state === 'dragged' ? item.dragCurrentY : this.getBeltY();
    item.flightTargetX = bin.x + bin.width / 2 - ITEM_W / 2;
    item.flightTargetY = bin.y + 10;
  }

  private settleItem(item: ActiveConveyorItem): void {
    const correct = item.itemData.correctBinId === item.targetBinId;
    this.shiftItemsSettled++;

    if (correct) {
      this.state.streak++;
      this.state.maxStreak = Math.max(this.state.maxStreak, this.state.streak);
      const pts = 100 + (this.state.streak - 1) * 25;
      this.state.score += pts;
      this.currentPerf.sortedCorrectly++;
      this.currentPerf.pointsEarned += pts;
      playCorrect(Math.min(this.state.streak, 4));
      this.addPopup(`+${pts}`, item.flightTargetX + ITEM_W / 2, item.flightTargetY, '#4ade80');
      if (this.state.streak >= 3) {
        this.addPopup(`🔥 x${this.state.streak}`, item.flightTargetX + ITEM_W / 2, item.flightTargetY - 30, '#f59e0b');
      }
    } else {
      this.state.streak = 0;
      this.state.lives = Math.max(0, this.state.lives - 1);
      this.currentPerf.sortedIncorrectly++;
      playError();
      this.addPopup('✗ Wrong!', item.flightTargetX + ITEM_W / 2, item.flightTargetY, '#f87171');
    }

    this.currentPerf.totalItems++;
    this.currentPerf.accuracy =
      this.currentPerf.totalItems > 0
        ? Math.round((this.currentPerf.sortedCorrectly / this.currentPerf.totalItems) * 100)
        : 0;

    this.emit({ type: 'score_update', score: this.state.score, streak: this.state.streak });
    this.emit({
      type: 'item_sorted',
      correct,
      explanation: item.itemData.explanation,
      itemLabel: item.itemData.label,
    });

    if (this.state.lives <= 0) {
      setTimeout(() => this.endGame(), 400);
    }
  }

  private recordMiss(item: ActiveConveyorItem, action: string): void {
    this.state.streak = 0;
    this.shiftItemsSettled++;
    this.currentPerf.incinerated++;
    this.currentPerf.totalItems++;
    const bin = this.pack.bins.find(b => b.id === item.itemData.correctBinId);
    this.currentPerf.missedItems.push({
      item: item.itemData,
      userAction: action,
      correctCategory: bin?.label ?? item.itemData.correctBinId,
      reason: item.itemData.explanation,
    });
    this.emit({ type: 'score_update', score: this.state.score, streak: 0 });
  }

  private completeShift(): void {
    if (this.state.phase !== 'shift_active') return;
    this.state.phase = 'shift_break';
    this.currentPerf.maxStreak = this.state.maxStreak;
    this.state.shiftHistory.push({ ...this.currentPerf });
    cancelAnimationFrame(this.rafId);
    stopBeltHum();
    playShiftComplete();
    this.emit({ type: 'shift_complete', performance: { ...this.currentPerf } });
  }

  private endGame(): void {
    this.state.phase = 'game_over';
    cancelAnimationFrame(this.rafId);
    stopBeltHum();
    this.emit({ type: 'game_over', history: [...this.state.shiftHistory] });
  }

  private removeItem(uid: string): void {
    this.activeItems = this.activeItems.filter(i => i.uid !== uid);
    this.emit({ type: 'items_changed', items: [...this.activeItems] });
  }

  // ─── Private: Render ────────────────────────────────────────────────────────

  private getBeltY(): number {
    return this.canvas.height * 0.32;
  }

  private render(now: number): void {
    const c = this.ctx2d;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);

    this.drawBelt(c, W, H);
    this.drawItems(c, now);
    this.drawPopups(c, now);
  }

  private drawBelt(c: CanvasRenderingContext2D, W: number, H: number): void {
    const beltY = this.getBeltY();
    const trackH = ITEM_H + 24;

    // Belt track background
    c.fillStyle = '#0f141c';
    c.fillRect(0, beltY - 8, W, trackH + 16);

    // Animated tread pattern
    c.fillStyle = '#1e2530';
    const treadW = 32;
    const offset = this.beltOffset;
    for (let x = -treadW + (offset % treadW); x < W + treadW; x += treadW) {
      c.fillRect(x, beltY, 4, trackH);
    }

    // Top/bottom rail
    const grad = c.createLinearGradient(0, beltY - 8, 0, beltY + 4);
    grad.addColorStop(0, '#3a4759');
    grad.addColorStop(1, '#2d3748');
    c.fillStyle = grad;
    c.fillRect(0, beltY - 8, W, 8);
    c.fillRect(0, beltY + trackH, W, 8);

    // Rollers
    for (let x = 20; x < W; x += 80) {
      c.fillStyle = '#3a4759';
      c.beginPath();
      c.ellipse(x, beltY - 8, 8, 8, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(x, beltY + trackH + 8, 8, 8, 0, 0, Math.PI * 2);
      c.fill();
    }

    // Danger zone / incinerator on right
    const dangerX = W - 48;
    const blink = Math.sin(Date.now() / 200) > 0;
    c.fillStyle = blink ? '#ef444499' : '#ef444466';
    c.fillRect(dangerX, beltY - 8, 48, trackH + 16);
    c.fillStyle = blink ? '#fbbf24' : '#f59e0b';
    c.font = 'bold 20px sans-serif';
    c.textAlign = 'center';
    c.fillText('🔥', dangerX + 24, beltY + trackH / 2 + 8);
  }

  private drawItems(c: CanvasRenderingContext2D, now: number): void {
    const beltY = this.getBeltY();

    for (const item of this.activeItems) {
      let drawX: number;
      let drawY: number;

      if (item.state === 'dragged') {
        drawX = item.dragCurrentX - item.dragOffsetX;
        drawY = item.dragCurrentY - item.dragOffsetY;
      } else if (item.state === 'parabolic_flight' || item.state === 'sorted') {
        drawX = item.x;
        drawY = item.y;
      } else if (item.state === 'falling_incinerator') {
        drawX = item.x;
        drawY = beltY + item.y;
      } else {
        drawX = item.x;
        drawY = beltY + (ITEM_H - item.height) / 2 - 4;
      }

      // Shadow
      c.shadowColor = 'rgba(0,0,0,0.4)';
      c.shadowBlur = 8;
      c.shadowOffsetY = 4;

      // Crate body
      const isSelected = item.uid === this.state.selectedItemUid;
      const bgColor = item.isSpeedSurge ? '#7c3aed' : (item.isMystery && !item.isRevealed ? '#374151' : '#1e2d3d');
      const borderColor = isSelected ? '#f59e0b' : (item.isSpeedSurge ? '#a78bfa' : '#38bdf8');

      c.fillStyle = bgColor;
      c.strokeStyle = borderColor;
      c.lineWidth = isSelected ? 3 : 2;
      this.roundRect(c, drawX, drawY, ITEM_W, ITEM_H, 8);
      c.fill();
      c.stroke();

      c.shadowColor = 'transparent';
      c.shadowBlur = 0;
      c.shadowOffsetY = 0;

      if (item.isMystery && !item.isRevealed) {
        // Mystery crate
        c.fillStyle = '#9ca3af';
        c.font = '28px sans-serif';
        c.textAlign = 'center';
        c.fillText('❓', drawX + ITEM_W / 2, drawY + ITEM_H / 2 + 10);
      } else {
        // Icon
        c.font = '24px sans-serif';
        c.textAlign = 'center';
        c.fillText(item.itemData.icon, drawX + ITEM_W / 2, drawY + 26);

        // Label
        c.fillStyle = '#e2e8f0';
        c.font = `bold 11px sans-serif`;
        c.textAlign = 'center';
        const label = item.itemData.label.length > 14 ? item.itemData.label.slice(0, 13) + '…' : item.itemData.label;
        c.fillText(label, drawX + ITEM_W / 2, drawY + 44);

        // Sub-label (formula)
        if (item.itemData.subLabel) {
          c.fillStyle = '#94a3b8';
          c.font = '9px monospace';
          c.fillText(item.itemData.subLabel, drawX + ITEM_W / 2, drawY + 57);
        }
      }
    }
  }

  private drawPopups(c: CanvasRenderingContext2D, now: number): void {
    for (const popup of this.popups) {
      const age = now - popup.createdAt;
      const t = age / popup.duration;
      const alpha = Math.max(0, 1 - t * t);
      const yOffset = -50 * t;

      c.globalAlpha = alpha;
      c.fillStyle = popup.color;
      c.font = 'bold 18px sans-serif';
      c.textAlign = 'center';
      c.fillText(popup.text, popup.x, popup.y + yOffset);
      c.globalAlpha = 1;
    }
  }

  private roundRect(
    c: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
  ): void {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  private addPopup(text: string, x: number, y: number, color: string): void {
    const popup: FloatingPopup = {
      id: `popup-${Date.now()}-${Math.random()}`,
      text,
      x,
      y,
      color,
      createdAt: performance.now(),
      duration: POPUP_DURATION,
    };
    this.popups.push(popup);
    this.emit({ type: 'popup', popup });
  }

  // ─── Pointer Events ─────────────────────────────────────────────────────────

  private attachPointerEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  private getCanvasPos(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.state.phase !== 'shift_active') return;
    const { x, y } = this.getCanvasPos(e);
    const beltY = this.getBeltY();

    for (let i = this.activeItems.length - 1; i >= 0; i--) {
      const item = this.activeItems[i]!;
      if (item.state !== 'conveyor') continue;

      const ix = item.x;
      const iy = beltY + (ITEM_H - item.height) / 2 - 4;

      if (aabbHit(x, y, 1, 1, ix, iy, ITEM_W, ITEM_H)) {
        // Reveal mystery on click
        if (item.isMystery && !item.isRevealed) {
          item.isRevealed = true;
          return;
        }
        this.canvas.setPointerCapture(e.pointerId);
        this.pointerDown = true;
        item.state = 'dragged';
        item.dragCurrentX = x;
        item.dragCurrentY = y;
        item.dragOffsetX = x - ix;
        item.dragOffsetY = y - iy;
        this.dragItem = item;
        playPickup();
        break;
      }
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragItem || !this.pointerDown) return;
    const { x, y } = this.getCanvasPos(e);
    this.dragItem.dragCurrentX = x;
    this.dragItem.dragCurrentY = y;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.dragItem) return;
    const { x, y } = this.getCanvasPos(e);

    // Check AABB against each bin
    let dropped = false;
    for (const bin of this.binRects) {
      if (aabbHit(x, y, 1, 1, bin.x, bin.y, bin.width, bin.height)) {
        this.dragItem.state = 'conveyor'; // reset before launch
        this.launchToBin(this.dragItem, bin.id);
        dropped = true;
        break;
      }
    }

    if (!dropped) {
      // Return to belt
      this.dragItem.state = 'conveyor';
    }

    this.dragItem = null;
    this.pointerDown = false;
  };

  // ─── Event Emitter ──────────────────────────────────────────────────────────

  private emit(event: GameEvent): void {
    this.listeners.forEach(l => l(event));
  }

  // ─── Getters ────────────────────────────────────────────────────────────────

  getState(): Readonly<GameState> {
    return this.state;
  }

  getActiveItems(): ActiveConveyorItem[] {
    return this.activeItems;
  }
}

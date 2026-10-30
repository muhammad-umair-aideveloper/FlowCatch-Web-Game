// ─── Bin / Category ───────────────────────────────────────────────────────────

export type CategoryBinId = string;

export interface BinColorTheme {
  bg: string;        // Tailwind bg class
  border: string;    // Tailwind border class
  text: string;      // Tailwind text class
  accent: string;    // hex accent color for canvas glow
  glow: string;      // box-shadow glow value
  pillBg: string;    // badge background
}

export interface CategoryBin {
  id: CategoryBinId;
  label: string;
  colorTheme: BinColorTheme;
  icon: string;           // emoji
  shortRuleHint: string;  // 1-line tooltip hint
}

// ─── Taxonomy Item ────────────────────────────────────────────────────────────

export interface TaxonomyItem {
  id: string;
  label: string;
  subLabel?: string;   // e.g. chemical formula
  icon: string;        // emoji
  correctBinId: CategoryBinId;
  explanation: string; // shown in correction toast
}

// ─── SEO / Curriculum Guide ───────────────────────────────────────────────────

export interface RuleTableRow {
  category: string;
  criteria: string;
  examples: string[];
  keyIndicator: string;
}

export interface StudentMistake {
  mistake: string;
  correction: string;
  why: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface SeoGuideContent {
  overview: string;
  pedagogicalObjectives: string[];
  sortingRulesTable: RuleTableRow[];
  commonStudentMistakes: StudentMistake[];
  faqs: FAQItem[];
}

// ─── Taxonomy Pack (one subject = one page) ───────────────────────────────────

export interface TaxonomyPack {
  slug: string;
  seoTitle: string;
  metaDescription: string;
  h1Heading: string;
  gradeLevel: string;
  subjectCategory: string;
  curriculumStandard: string;
  estimatedPlayTimeMinutes: string;
  bins: CategoryBin[];
  items: TaxonomyItem[];
  seoGuideContent: SeoGuideContent;
}

// ─── Runtime Game Engine ──────────────────────────────────────────────────────

export type ShiftId = 1 | 2 | 3;

export interface ShiftConfig {
  shiftNumber: ShiftId;
  name: string;
  itemCount: number;
  speedMultiplier: number;
  spawnIntervalMs: number;
  hasSpeedSurge: boolean;
  hasMysteryCrates: boolean;
  targetDurationSec: number;
}

export interface ActiveConveyorItem {
  uid: string;
  itemData: TaxonomyItem;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;            // px per second
  isSpeedSurge: boolean;
  isMystery: boolean;
  isRevealed: boolean;
  state: 'conveyor' | 'dragged' | 'parabolic_flight' | 'falling_incinerator' | 'sorted' | 'missed';
  // drag
  dragCurrentX: number;
  dragCurrentY: number;
  dragOffsetX: number;
  dragOffsetY: number;
  // arc flight
  flightProgress: number;   // 0→1
  flightStartX: number;
  flightStartY: number;
  flightTargetX: number;
  flightTargetY: number;
  targetBinId?: CategoryBinId;
}

export interface BinRect {
  id: CategoryBinId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloatingPopup {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;  // hex
  createdAt: number;
  duration: number; // ms
}

export interface ShiftPerformance {
  shiftNumber: ShiftId;
  totalItems: number;
  sortedCorrectly: number;
  sortedIncorrectly: number;
  incinerated: number;
  accuracy: number;
  maxStreak: number;
  pointsEarned: number;
  missedItems: {
    item: TaxonomyItem;
    userAction: string;
    correctCategory: string;
    reason: string;
  }[];
}

export interface GameState {
  phase: 'idle' | 'shift_active' | 'shift_break' | 'game_over';
  currentShift: ShiftId;
  score: number;
  streak: number;
  maxStreak: number;
  lives: number;
  shiftHistory: ShiftPerformance[];
  selectedItemUid: string | null; // for click-to-select a11y mode
}

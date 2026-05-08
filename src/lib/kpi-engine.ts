/**
 * KPI Calculation Engine
 *
 * Single source of truth for:
 *  - period derivation (H1/H2/FY from quarters) by aggregation type
 *  - achievement % calculation by scoring type
 *  - period consistency validation
 *  - value-origin CSS styling (user-entered vs calculated)
 *  - human-readable label maps for all three enum types
 *
 * Used by AddKpiModal, KpiTable, actuals-upload, dashboards,
 * and the weighting-assignment page.
 */

// ── Enum types ────────────────────────────────────────────────────────────────

export type PeriodAggType =
  | "additive_flow"
  | "snapshot_stock"
  | "weighted_average"
  | "ratio"
  | "derived_formula"
  | "milestone_state"
  | "composite_index";

export type ScoringType =
  | "higher_is_better"
  | "lower_is_better"
  | "target_range"
  | "threshold_tiered"
  | "binary";

export type InputMode =
  | "periodic"
  | "cumulative_to_date"
  | "period_end_snapshot"
  | "component_based"
  | "manual_aggregate";

// ── Period constants ──────────────────────────────────────────────────────────

export const PERIODS = ["q1", "q2", "h1", "q3", "q4", "h2", "fullyear"] as const;
export type Period = (typeof PERIODS)[number];

export const QUARTER_PERIODS = ["q1", "q2", "q3", "q4"] as const;
export type QuarterPeriod = (typeof QUARTER_PERIODS)[number];

export const DERIVED_PERIODS = new Set<Period>(["h1", "h2", "fullyear"]);

/** Periods that accept binary targets/actuals */
export const BINARY_EDITABLE_PERIODS = new Set<Period>(["h1", "fullyear"]);

export const PERIOD_LABEL: Record<Period, string> = {
  q1: "Q1", q2: "Q2", h1: "H1", q3: "Q3", q4: "Q4", h2: "H2", fullyear: "FY",
};

// ── Value origin ──────────────────────────────────────────────────────────────

export type ValueOrigin = "user_entered" | "calculated" | "none";

/**
 * Tailwind class strings for value display.
 * user_entered = blue text on bright-yellow background
 * calculated   = normal foreground, no background (muted italic optional via the caller)
 */
export const VALUE_STYLE: Record<ValueOrigin, string> = {
  user_entered: "text-blue-700 bg-yellow-100 font-medium",
  calculated:   "text-foreground",
  none:         "text-muted-foreground",
};

// ── Period derivation ─────────────────────────────────────────────────────────

export type DerivedPeriods = {
  h1: number | null;
  h2: number | null;
  fy: number | null;
  /** Which derived values were computable */
  origin: { h1: ValueOrigin; h2: ValueOrigin; fy: ValueOrigin };
};

/**
 * Given the four quarterly values, compute H1, H2, and FY based on the
 * aggregation type.  Returns null for any period that cannot be derived
 * from available inputs.
 */
export function derivePeriods(
  q1: number | null,
  q2: number | null,
  q3: number | null,
  q4: number | null,
  aggType: PeriodAggType | null | undefined,
): DerivedPeriods {
  const type = aggType ?? "additive_flow";

  switch (type) {
    case "additive_flow":
    case "ratio":
    case "derived_formula":
    case "composite_index": {
      const h1 = q1 !== null && q2 !== null ? q1 + q2 : null;
      const h2 = q3 !== null && q4 !== null ? q3 + q4 : null;
      const fy = h1 !== null && h2 !== null ? h1 + h2 : null;
      return {
        h1, h2, fy,
        origin: {
          h1: h1 !== null ? "calculated" : "none",
          h2: h2 !== null ? "calculated" : "none",
          fy: fy !== null ? "calculated" : "none",
        },
      };
    }

    case "snapshot_stock":
    case "milestone_state": {
      // Each period is independent; derived periods = latest available in the window
      const h1 = q2 ?? q1;
      const h2 = q4 ?? q3;
      const fy = q4 ?? q3 ?? q2 ?? q1;
      return {
        h1, h2, fy,
        origin: {
          h1: h1 !== null ? "calculated" : "none",
          h2: h2 !== null ? "calculated" : "none",
          fy: fy !== null ? "calculated" : "none",
        },
      };
    }

    case "weighted_average": {
      const h1 =
        q1 !== null && q2 !== null
          ? (q1 + q2) / 2
          : q1 ?? q2;
      const h2 =
        q3 !== null && q4 !== null
          ? (q3 + q4) / 2
          : q3 ?? q4;
      const fy =
        q1 !== null && q2 !== null && q3 !== null && q4 !== null
          ? (q1 + q2 + q3 + q4) / 4
          : null;
      return {
        h1, h2, fy,
        origin: {
          h1: h1 !== null ? "calculated" : "none",
          h2: h2 !== null ? "calculated" : "none",
          fy: fy !== null ? "calculated" : "none",
        },
      };
    }

    default:
      return { h1: null, h2: null, fy: null, origin: { h1: "none", h2: "none", fy: "none" } };
  }
}

/**
 * Derive a single period value from a full period map.
 * Used by KpiTable to compute the read-only derived cells.
 */
export function deriveSinglePeriod(
  periodTargets: Partial<Record<string, { target_value: number | null; target_binary: boolean | null }>>,
  period: "h1" | "h2" | "fullyear",
  aggType: PeriodAggType | null | undefined,
): number | null {
  const q1 = periodTargets["q1"]?.target_value ?? null;
  const q2 = periodTargets["q2"]?.target_value ?? null;
  const q3 = periodTargets["q3"]?.target_value ?? null;
  const q4 = periodTargets["q4"]?.target_value ?? null;
  const d = derivePeriods(q1, q2, q3, q4, aggType);
  if (period === "h1")       return d.h1;
  if (period === "h2")       return d.h2;
  if (period === "fullyear") return d.fy;
  return null;
}

// ── Achievement calculation ───────────────────────────────────────────────────

/**
 * Compute achievement percentage.  Returns null when the calculation is
 * not possible (missing data, division by zero, etc.).
 *
 * scoringType governs the formula; kpiTypeFallback is used when
 * scoringType is not yet set (legacy rows).
 */
export function calcAchievementPct(
  actual: number | null,
  actualBinary: boolean | null,
  target: number | null,
  targetBinary: boolean | null,
  scoringType: ScoringType | null | undefined,
  kpiTypeFallback?: "progressive" | "binary" | "benchmark" | null,
): number | null {
  const st = scoringType ?? (kpiTypeFallback === "binary" ? "binary" : "higher_is_better");

  switch (st) {
    case "binary":
      if (actualBinary === null) return null;
      return actualBinary === targetBinary ? 100 : 0;

    case "higher_is_better":
      if (actual === null || target === null || target === 0) return null;
      return Math.round((actual / target) * 100 * 100) / 100;

    case "lower_is_better":
      if (actual === null || actual === 0 || target === null) return null;
      return Math.round((target / actual) * 100 * 100) / 100;

    case "target_range":
      // Requires min/max; fall back to higher_is_better until range config is stored
      if (actual === null || target === null || target === 0) return null;
      return Math.round((actual / target) * 100 * 100) / 100;

    case "threshold_tiered":
      // Requires tier thresholds; fall back to higher_is_better
      if (actual === null || target === null || target === 0) return null;
      return Math.round((actual / target) * 100 * 100) / 100;

    default:
      return null;
  }
}

/**
 * Format an achievement % for display (e.g. "94.50%").
 * Returns "—" when null.
 */
export function fmtAchievement(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct.toFixed(1)}%`;
}

// ── Period consistency validation ────────────────────────────────────────────

export type ConsistencyResult = { valid: boolean; errors: string[] };

/**
 * For additive KPIs, verify that user-supplied H1/H2/FY are consistent
 * with the quarterly values.  All other aggregation types are treated as
 * independent and are always valid.
 */
export function validatePeriodConsistency(
  periods: Partial<Record<Period, number | null>>,
  aggType: PeriodAggType | null | undefined,
  tolerance = 0.01,
): ConsistencyResult {
  const errors: string[] = [];
  const type = aggType ?? "additive_flow";

  if (type === "additive_flow" || type === "ratio" || type === "composite_index") {
    const q1 = periods.q1 ?? null;
    const q2 = periods.q2 ?? null;
    const q3 = periods.q3 ?? null;
    const q4 = periods.q4 ?? null;
    const h1 = periods.h1 ?? null;
    const h2 = periods.h2 ?? null;
    const fy = periods.fullyear ?? null;

    if (q1 !== null && q2 !== null && h1 !== null) {
      const exp = q1 + q2;
      if (Math.abs(exp - h1) > tolerance)
        errors.push(`H1 must equal Q1+Q2 (${q1}+${q2}=${exp}), got ${h1}`);
    }
    if (q3 !== null && q4 !== null && h2 !== null) {
      const exp = q3 + q4;
      if (Math.abs(exp - h2) > tolerance)
        errors.push(`H2 must equal Q3+Q4 (${q3}+${q4}=${exp}), got ${h2}`);
    }
    if (h1 !== null && h2 !== null && fy !== null) {
      const exp = h1 + h2;
      if (Math.abs(exp - fy) > tolerance)
        errors.push(`FY must equal H1+H2 (${h1}+${h2}=${exp}), got ${fy}`);
    }
    // Cross-check: q1+q2+q3+q4 vs fy when h1/h2 missing
    if (q1 !== null && q2 !== null && q3 !== null && q4 !== null && fy !== null) {
      const exp = q1 + q2 + q3 + q4;
      if (Math.abs(exp - fy) > tolerance && h1 === null && h2 === null)
        errors.push(`FY must equal Q1+Q2+Q3+Q4 (${exp}), got ${fy}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Smart defaults ────────────────────────────────────────────────────────────

/**
 * When a user picks a period aggregation type, return sensible defaults
 * for scoring_type and input_mode.
 */
export function defaultsForAggType(aggType: PeriodAggType): {
  scoringType: ScoringType;
  inputMode: InputMode;
} {
  switch (aggType) {
    case "additive_flow":
      return { scoringType: "higher_is_better", inputMode: "periodic" };
    case "snapshot_stock":
      return { scoringType: "higher_is_better", inputMode: "period_end_snapshot" };
    case "weighted_average":
      return { scoringType: "higher_is_better", inputMode: "periodic" };
    case "ratio":
      return { scoringType: "higher_is_better", inputMode: "component_based" };
    case "derived_formula":
      return { scoringType: "higher_is_better", inputMode: "manual_aggregate" };
    case "milestone_state":
      return { scoringType: "binary", inputMode: "periodic" };
    case "composite_index":
      return { scoringType: "higher_is_better", inputMode: "component_based" };
  }
}

/**
 * Derive the legacy kpi_type from new fields, for backward-compat writes
 * to kpi_definitions.kpi_type.
 */
export function inferLegacyKpiType(
  aggType: PeriodAggType | null | undefined,
  scoringType: ScoringType | null | undefined,
): "progressive" | "binary" | "benchmark" {
  if (aggType === "milestone_state" || scoringType === "binary") return "binary";
  if (
    aggType === "snapshot_stock" ||
    aggType === "weighted_average" ||
    aggType === "ratio"
  ) return "benchmark";
  return "progressive";
}

/**
 * True when the given period should be a derived (read-only) cell for
 * the given aggregation type in the target/actuals table.
 */
export function isDerivedPeriod(period: Period, aggType: PeriodAggType | null | undefined): boolean {
  const type = aggType ?? "additive_flow";
  // snapshot / milestone: all periods independent
  if (type === "snapshot_stock" || type === "milestone_state") return false;
  // manual_aggregate & derived_formula: all editable
  return DERIVED_PERIODS.has(period);
}

// ── Human-readable label maps ────────────────────────────────────────────────

export const PERIOD_AGG_META: Record<
  PeriodAggType,
  { label: string; shortLabel: string; description: string }
> = {
  additive_flow: {
    label: "Additive Flow",
    shortLabel: "Additive",
    description:
      "Values accumulate across periods: Q1+Q2=H1, Q3+Q4=H2, H1+H2=FY. Use for revenue, headcount, costs.",
  },
  snapshot_stock: {
    label: "Snapshot / Stock",
    shortLabel: "Snapshot",
    description:
      "Each period captures the current state independently. Use for rates, margins, scores, balances.",
  },
  weighted_average: {
    label: "Weighted Average",
    shortLabel: "Average",
    description:
      "H1 = avg(Q1,Q2); H2 = avg(Q3,Q4); FY = avg of all quarters. Use for averages like employee satisfaction.",
  },
  ratio: {
    label: "Ratio",
    shortLabel: "Ratio",
    description:
      "Numerator ÷ denominator per period (e.g. win-rate = wins ÷ proposals). Enter components separately.",
  },
  derived_formula: {
    label: "Derived Formula",
    shortLabel: "Formula",
    description:
      "Custom calculation logic; periods do not aggregate automatically. All values entered manually.",
  },
  milestone_state: {
    label: "Milestone / State",
    shortLabel: "Milestone",
    description:
      "Tracks whether a condition has been reached by period-end (yes/no). Use for binary completion KPIs.",
  },
  composite_index: {
    label: "Composite Index",
    shortLabel: "Composite",
    description:
      "Weighted blend of multiple sub-measures. Enter component values; index is computed.",
  },
};

export const SCORING_TYPE_META: Record<
  ScoringType,
  { label: string; description: string }
> = {
  higher_is_better: {
    label: "Higher is Better",
    description: "Achievement = actual ÷ target × 100%. Exceeding target scores above 100%.",
  },
  lower_is_better: {
    label: "Lower is Better",
    description:
      "Achievement = target ÷ actual × 100%. Use for cost, churn, defect rate — lower = better.",
  },
  target_range: {
    label: "Target Range",
    description:
      "100% when actual falls within the acceptable [min, max] band; scales outside the range.",
  },
  threshold_tiered: {
    label: "Threshold Tiered",
    description: "Score jumps at defined thresholds (e.g. bronze / silver / gold levels).",
  },
  binary: {
    label: "Binary",
    description: "100% if the milestone was achieved, 0% if not.",
  },
};

export const INPUT_MODE_META: Record<
  InputMode,
  { label: string; description: string }
> = {
  periodic: {
    label: "Periodic",
    description: "Enter a value for each quarter; H1, H2, and FY are derived automatically.",
  },
  cumulative_to_date: {
    label: "Cumulative to Date",
    description:
      "Each period's value is the running total since the start of the year (e.g. YTD revenue).",
  },
  period_end_snapshot: {
    label: "Period-End Snapshot",
    description:
      "Enter the value at the end of each period; all 7 periods are independent.",
  },
  component_based: {
    label: "Component Based",
    description:
      "Enter numerator and denominator separately so the ratio can be computed per period.",
  },
  manual_aggregate: {
    label: "Manual Aggregate",
    description:
      "Enter any period value freely; no automatic derivation between periods.",
  },
};

// ── Formatting helpers ────────────────────────────────────────────────────────

/**
 * Format a numeric or binary target/actual for display.
 * Binary values show ✓ / ✗ / — instead of true/false.
 */
export function fmtValue(
  value: number | null | undefined,
  binary: boolean | null | undefined,
  scoringType: ScoringType | null | undefined,
  kpiTypeFallback?: "progressive" | "binary" | "benchmark" | null,
): string {
  const isBin =
    scoringType === "binary" ||
    (scoringType == null && kpiTypeFallback === "binary");

  if (isBin) {
    if (binary === true)  return "✓";
    if (binary === false) return "✗";
    return "—";
  }
  if (value === null || value === undefined) return "—";
  return String(value);
}

import { describe, it, expect } from "vitest";
import {
  isCalcModelSchemaMissing,
  omitCalcModelFields,
  MIGRATION_NAME,
  MIGRATION_HINT,
} from "@/lib/kpi-save-compat";

describe("isCalcModelSchemaMissing", () => {
  it("detects the exact PostgREST error for input_mode", () => {
    expect(
      isCalcModelSchemaMissing(
        "Could not find the 'input_mode' column of 'kpi_definitions' in the schema cache",
      ),
    ).toBe(true);
  });

  it("detects the exact PostgREST error for period_agg_type", () => {
    expect(
      isCalcModelSchemaMissing(
        "Could not find the 'period_agg_type' column of 'kpi_definitions' in the schema cache",
      ),
    ).toBe(true);
  });

  it("detects the exact PostgREST error for scoring_type", () => {
    expect(
      isCalcModelSchemaMissing(
        "Could not find the 'scoring_type' column of 'kpi_definitions' in the schema cache",
      ),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(
      isCalcModelSchemaMissing(
        "could not find the 'INPUT_MODE' column of 'kpi_definitions' in the schema cache",
      ),
    ).toBe(true);
  });

  it("returns false for unrelated column errors", () => {
    expect(
      isCalcModelSchemaMissing(
        "Could not find the 'driver' column of 'kpi_definitions' in the schema cache",
      ),
    ).toBe(false);
  });

  it("returns false for generic network errors", () => {
    expect(isCalcModelSchemaMissing("Failed to fetch")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isCalcModelSchemaMissing("")).toBe(false);
  });
});

describe("omitCalcModelFields", () => {
  it("strips all three calculation-model fields", () => {
    const payload = {
      title:           "Revenue",
      kpi_type:        "progressive" as const,
      driver:          "growth",
      period_agg_type: "additive_flow",
      scoring_type:    "higher_is_better",
      input_mode:      "periodic",
      is_active:       true,
    };
    const result = omitCalcModelFields(payload);
    expect(result).not.toHaveProperty("period_agg_type");
    expect(result).not.toHaveProperty("scoring_type");
    expect(result).not.toHaveProperty("input_mode");
  });

  it("preserves all other fields", () => {
    const payload = {
      title:           "Revenue",
      kpi_type:        "progressive" as const,
      driver:          "growth",
      period_agg_type: "additive_flow",
      scoring_type:    "higher_is_better",
      input_mode:      "periodic",
      is_active:       true,
    };
    const result = omitCalcModelFields(payload);
    expect(result).toMatchObject({
      title:     "Revenue",
      kpi_type:  "progressive",
      driver:    "growth",
      is_active: true,
    });
  });

  it("works on a payload that has none of the three fields", () => {
    const payload = { title: "Test", kpi_type: "binary" as const };
    const result = omitCalcModelFields(payload);
    expect(result).toEqual({ title: "Test", kpi_type: "binary" });
  });
});

describe("module constants", () => {
  it("MIGRATION_NAME references the correct migration file", () => {
    expect(MIGRATION_NAME).toBe("20260512000000_kpi_model_refactor.sql");
  });

  it("MIGRATION_HINT mentions the migration name", () => {
    expect(MIGRATION_HINT).toContain(MIGRATION_NAME);
  });

  it("MIGRATION_HINT includes the schema cache refresh command", () => {
    expect(MIGRATION_HINT).toContain("NOTIFY pgrst");
  });
});

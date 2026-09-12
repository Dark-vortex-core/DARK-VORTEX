import type {
  VxRiskFactor,
  VxRiskResult,
  VxSeverity,
} from "./vx-types.js";

/* =========================================================
   🌑 DARK VORTEX — VX RISK ENGINE
   ⚡ Powered by Vortex Tech

   Responsibilities:
   - Normalize risk factors
   - Calculate bounded risk scores
   - Determine severity
   - Preserve the existing VX scoring model
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

const MIN_SCORE = 0;
const MAX_SCORE = 100;
const DEFAULT_CONFIDENCE = 50;

const MAX_FACTOR_NAME_LENGTH = 120;
const MAX_FACTOR_REASON_LENGTH = 300;
const MAX_FACTORS = 100;

/* =========================================================
   CLAMP
========================================================= */

function clamp(
  value: number,
  min = MIN_SCORE,
  max = MAX_SCORE,
): number {
  if (
    !Number.isFinite(value)
  ) {
    return min;
  }

  return Math.max(
    min,
    Math.min(
      max,
      value,
    ),
  );
}

/* =========================================================
   SAFE TEXT
========================================================= */

function cleanText(
  value: unknown,
  maxLength: number,
): string {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  const text =
    String(value)
      .replace(/\r/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (!text) {
    return "";
  }

  return text.length <= maxLength
    ? text
    : `${text.slice(
        0,
        maxLength - 1,
      )}…`;
}

/* =========================================================
   SEVERITY
========================================================= */

/**
 * Converts a risk score into the corresponding
 * VX severity level.
 *
 * Existing thresholds are preserved:
 * 80+  = CRITICAL
 * 60+  = HIGH
 * 30+  = MEDIUM
 * <30  = LOW
 */
export function getSeverity(
  score: number,
): VxSeverity {
  const safeScore =
    clamp(score);

  if (
    safeScore >= 80
  ) {
    return "CRITICAL";
  }

  if (
    safeScore >= 60
  ) {
    return "HIGH";
  }

  if (
    safeScore >= 30
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

/* =========================================================
   FACTOR NORMALIZATION
========================================================= */

function normalizeFactor(
  factor: VxRiskFactor,
): VxRiskFactor | null {
  if (
    !factor ||
    typeof factor !== "object"
  ) {
    return null;
  }

  const score =
    Number(factor.score);

  if (
    !Number.isFinite(score) ||
    score <= 0
  ) {
    return null;
  }

  const name =
    cleanText(
      factor.name,
      MAX_FACTOR_NAME_LENGTH,
    );

  const reason =
    cleanText(
      factor.reason,
      MAX_FACTOR_REASON_LENGTH,
    );

  if (!name) {
    return null;
  }

  return {
    name,
    score: Math.round(
      clamp(score),
    ),
    reason:
      reason ||
      "No reason provided",
  };
}

/* =========================================================
   FACTOR DEDUPLICATION
========================================================= */

function normalizeFactors(
  factors: VxRiskFactor[],
): VxRiskFactor[] {
  if (
    !Array.isArray(factors)
  ) {
    return [];
  }

  const result:
    VxRiskFactor[] = [];

  const seen =
    new Set<string>();

  for (
    const factor of factors
  ) {
    const normalized =
      normalizeFactor(
        factor,
      );

    if (!normalized) {
      continue;
    }

    const key =
      normalized.name
        .toLowerCase();

    /*
     * Prevent the same factor from being
     * counted repeatedly by accident.
     */
    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    result.push(
      normalized,
    );

    if (
      result.length >=
      MAX_FACTORS
    ) {
      break;
    }
  }

  return result;
}

/* =========================================================
   RISK CALCULATION
========================================================= */

/**
 * Calculates the combined risk score from multiple
 * risk factors.
 *
 * The existing progressive-diminishing scoring model
 * is intentionally preserved.
 */
export function calculateRisk(
  factors: VxRiskFactor[],
  confidence = DEFAULT_CONFIDENCE,
): VxRiskResult {
  const safeFactors =
    normalizeFactors(
      factors,
    );

  let score = 0;

  for (
    const factor of safeFactors
  ) {
    const factorScore =
      clamp(
        factor.score,
      );

    /*
     * Each subsequent factor contributes
     * progressively less as the score rises.
     *
     * This preserves the existing VX model.
     */
    const contribution =
      factorScore *
      (
        1 -
        score / 140
      );

    score +=
      contribution;

    /*
     * Keep intermediate values bounded.
     */
    score =
      clamp(
        score,
      );
  }

  const safeScore =
    Math.round(
      clamp(score),
    );

  const safeConfidence =
    Math.round(
      clamp(
        confidence,
      ),
    );

  return {
    score:
      safeScore,

    severity:
      getSeverity(
        safeScore,
      ),

    confidence:
      safeConfidence,

    factors:
      safeFactors,
  };
}

/* =========================================================
   CREATE RISK FACTOR
========================================================= */

/**
 * Creates a normalized VX risk factor.
 *
 * Scores are constrained to 0–100.
 */
export function createRiskFactor(
  name: string,
  score: number,
  reason: string,
): VxRiskFactor {
  return {
    name:
      cleanText(
        name,
        MAX_FACTOR_NAME_LENGTH,
      ) ||
      "unknown-factor",

    score:
      Math.round(
        clamp(score),
      ),

    reason:
      cleanText(
        reason,
        MAX_FACTOR_REASON_LENGTH,
      ) ||
      "No reason provided",
  };
}
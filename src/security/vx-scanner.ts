/* =========================================================
   🌑 DARK VORTEX — VX SECURITY SCANNER

   ⚡ Historical / Deep Security Analysis
   ⚡ Powered by Vortex Tech

   Responsibilities:

   - Run manual/deep scans
   - Preserve visible scan progress
   - Analyze historical activity efficiently
   - Feed behavioral evidence into VX detector/engine
   - Produce useful risk summaries
   - Support clean cancellation
   - Keep historical detector state isolated
   - Avoid treating suspicious activity as confirmed malicious
   - Preserve deterministic scan results
   - Prevent malformed historical data from breaking scans
========================================================= */

import { randomUUID } from "node:crypto";

import type {
  VxActor,
  VxGroupContext,
  VxSeverity,
} from "./vx-types.js";

import {
  detectVxMessage,
  clearVxHistoricalActivity,
} from "./vx-detector.js";

import {
  getSeverity,
} from "./vx-risk.js";

/* =========================================================
   TYPES
========================================================= */

export interface VxScanParticipant {
  jid: string;
  name?: string;
  phoneNumber?: string;
}

export interface VxScanActivity {
  jid: string;
  text?: string;
  timestamp: number;
  command?: string;
  hasLink?: boolean;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface VxScanProgress {
  progress: number;
  stage: string;
  message: string;
}

export interface VxScanFinding {
  jid: string;
  name?: string;
  riskScore: number;
  severity: VxSeverity;
  confidence: number;
  indicators: string[];
  messagesAnalyzed: number;
  commands: number;
  links: number;
  firstSeen?: number;
  lastSeen?: number;
}

export interface VxScanResult {
  scanId: string;
  group: VxGroupContext;
  startedAt: number;
  completedAt: number;
  aborted: boolean;
  participantsScanned: number;
  messagesAnalyzed: number;
  suspiciousCount: number;
  highRiskCount: number;
  criticalRiskCount: number;
  highestRisk: number;
  findings: VxScanFinding[];
}

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_ACTIVITY_PER_PARTICIPANT = 500;
const MAX_FINDINGS = 100;
const MAX_INDICATORS_PER_FINDING = 20;

const PROGRESS = {
  INITIALIZING: 10,
  LOADING: 30,
  PARTICIPANTS_START: 40,
  PARTICIPANTS_END: 60,
  BEHAVIORAL_START: 60,
  BEHAVIORAL_END: 70,
  THREAT_ANALYSIS: 80,
  FINALIZING: 90,
  COMPLETE: 100,
} as const;

/* =========================================================
   REGEX / NORMALIZATION
========================================================= */

const URL_PATTERN =
  /https?:\/\/[^\s]+|www\.[^\s]+/i;

/* =========================================================
   HELPERS
========================================================= */

function clamp(
  value: number,
  min = 0,
  max = 100,
): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(
    min,
    Math.min(
      max,
      Math.round(value),
    ),
  );
}

function safeNumber(
  value: unknown,
  fallback = 0,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function normalizeJid(
  jid: string,
): string {
  return String(jid || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
}

function normalizePhoneNumber(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const digits = value.replace(
    /\D/g,
    "",
  );

  return digits || undefined;
}

function participantKey(
  jid: string,
): string {
  return normalizeJid(jid);
}

function createScanId(): string {
  return `VX-SCAN-${Date.now()}-${randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase()}`;
}

function getParticipantName(
  participant: VxScanParticipant,
): string {
  return (
    participant.name?.trim() ||
    participant.phoneNumber?.trim() ||
    participant.jid
  );
}

function createProgress(
  progress: number,
  stage: string,
  message: string,
): VxScanProgress {
  return {
    progress: clamp(progress),
    stage: String(
      stage || "UNKNOWN",
    ),
    message: String(
      message || "",
    ),
  };
}

async function emitProgress(
  callback:
    | ((
        progress: VxScanProgress,
      ) => void | Promise<void>)
    | undefined,
  progress: VxScanProgress,
): Promise<void> {
  if (!callback) {
    return;
  }

  try {
    await callback(progress);
  } catch (error) {
    /*
     * UI/progress failure must never
     * terminate the security scan.
     */
    console.error(
      "[VX] Scanner progress callback error:",
      error,
    );
  }
}

function isAborted(
  callback?: () => boolean,
): boolean {
  if (!callback) {
    return false;
  }

  try {
    return Boolean(
      callback(),
    );
  } catch (error) {
    /*
     * A broken abort callback should not
     * silently abort a valid scan.
     */
    console.error(
      "[VX] Scanner abort callback error:",
      error,
    );

    return false;
  }
}

function calculateParticipantProgress(
  index: number,
  total: number,
): number {
  if (total <= 0) {
    return PROGRESS.PARTICIPANTS_END;
  }

  const ratio =
    (index + 1) / total;

  return Math.round(
    PROGRESS.PARTICIPANTS_START +
      ratio *
        (
          PROGRESS.PARTICIPANTS_END -
          PROGRESS.PARTICIPANTS_START
        ),
  );
}

/* =========================================================
   PARTICIPANT NORMALIZATION
========================================================= */

function normalizeParticipant(
  participant: VxScanParticipant,
): VxScanParticipant | null {
  if (
    !participant ||
    typeof participant.jid !== "string"
  ) {
    return null;
  }

  const jid = normalizeJid(
    participant.jid,
  );

  if (!jid) {
    return null;
  }

  return {
    jid,
    name:
      typeof participant.name === "string"
        ? participant.name.trim() || undefined
        : undefined,
    phoneNumber:
      normalizePhoneNumber(
        participant.phoneNumber,
      ),
  };
}

function deduplicateParticipants(
  participants: VxScanParticipant[],
): VxScanParticipant[] {
  const result: VxScanParticipant[] = [];
  const seen = new Set<string>();

  for (
    const participant of participants
  ) {
    const normalized =
      normalizeParticipant(
        participant,
      );

    if (!normalized) {
      continue;
    }

    const key = participantKey(
      normalized.jid,
    );

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

/* =========================================================
   ACTIVITY NORMALIZATION
========================================================= */

function normalizeActivity(
  event: VxScanActivity,
): VxScanActivity | null {
  if (
    !event ||
    typeof event.jid !== "string"
  ) {
    return null;
  }

  const jid = normalizeJid(
    event.jid,
  );

  if (!jid) {
    return null;
  }

  const text =
    typeof event.text === "string"
      ? event.text
      : undefined;

  const command =
    typeof event.command === "string"
      ? event.command.trim() || undefined
      : undefined;

  const timestamp =
    safeNumber(
      event.timestamp,
      Date.now(),
    );

  const hasLink = Boolean(
    event.hasLink ||
      URL_PATTERN.test(text || ""),
  );

  return {
    jid,
    text,
    timestamp:
      timestamp > 0
        ? timestamp
        : Date.now(),
    command,
    hasLink,
    type:
      typeof event.type === "string"
        ? event.type
        : undefined,
    metadata:
      event.metadata &&
      typeof event.metadata === "object"
        ? event.metadata
        : undefined,
  };
}

/* =========================================================
   ACTIVITY INDEX
========================================================= */

interface IndexedActivity {
  events: VxScanActivity[];
  messages: number;
  commands: number;
  links: number;
  firstSeen?: number;
  lastSeen?: number;
}

function buildActivityIndex(
  activity: VxScanActivity[],
): Map<string, IndexedActivity> {
  const index =
    new Map<
      string,
      IndexedActivity
    >();

  for (
    const rawEvent of activity
  ) {
    const event =
      normalizeActivity(
        rawEvent,
      );

    if (!event) {
      continue;
    }

    const key =
      participantKey(
        event.jid,
      );

    let entry =
      index.get(key);

    if (!entry) {
      entry = {
        events: [],
        messages: 0,
        commands: 0,
        links: 0,
      };

      index.set(
        key,
        entry,
      );
    }

    /*
     * Counters represent all supplied
     * activity records.
     *
     * The event array is bounded so a huge
     * historical dataset cannot create
     * uncontrolled memory growth.
     */
    entry.messages += 1;

    if (event.command) {
      entry.commands += 1;
    }

    if (event.hasLink) {
      entry.links += 1;
    }

    if (
      entry.events.length <
      MAX_ACTIVITY_PER_PARTICIPANT
    ) {
      entry.events.push(event);
    }

    const timestamp =
      safeNumber(
        event.timestamp,
      );

    if (timestamp > 0) {
      if (
        entry.firstSeen === undefined ||
        timestamp < entry.firstSeen
      ) {
        entry.firstSeen =
          timestamp;
      }

      if (
        entry.lastSeen === undefined ||
        timestamp > entry.lastSeen
      ) {
        entry.lastSeen =
          timestamp;
      }
    }
  }

  /*
   * Deterministic chronological order.
   */
  for (
    const entry of index.values()
  ) {
    entry.events.sort(
      (a, b) =>
        safeNumber(a.timestamp) -
        safeNumber(b.timestamp),
    );
  }

  return index;
}

/* =========================================================
   HISTORICAL EVENT NORMALIZATION
========================================================= */

function normalizeHistoricalEvent(
  event: VxScanActivity,
): {
  text?: string;
  command?: string;
  hasLink: boolean;
  timestamp: number;
} {
  const text =
    typeof event.text === "string"
      ? event.text
      : undefined;

  const command =
    typeof event.command === "string"
      ? event.command
      : undefined;

  return {
    text,
    command,
    hasLink:
      Boolean(
        event.hasLink ||
          URL_PATTERN.test(
            text || "",
          ),
      ),
    timestamp:
      safeNumber(
        event.timestamp,
        Date.now(),
      ),
  };
}

/* =========================================================
   DETECTION SUMMARY
========================================================= */

interface DetectionSummary {
  riskScore?: number;
  severity?: VxSeverity;
  confidence?: number;
  indicators?: string[];
}

/* =========================================================
   FINDING BUILDER
========================================================= */

function createFinding(
  participant: VxScanParticipant,
  indexed: IndexedActivity,
  detectionResults: DetectionSummary[],
): VxScanFinding | null {
  if (!detectionResults.length) {
    return null;
  }

  let highestRisk = 0;
  let highestConfidence = 0;

  let severity: VxSeverity = "LOW";

  const indicators =
    new Set<string>();

  const severityRank:
    Record<VxSeverity, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };

  for (
    const result of detectionResults
  ) {
    const risk =
      clamp(
        safeNumber(
          result.riskScore,
        ),
      );

    const confidence =
      clamp(
        safeNumber(
          result.confidence,
        ),
      );

    highestRisk =
      Math.max(
        highestRisk,
        risk,
      );

    highestConfidence =
      Math.max(
        highestConfidence,
        confidence,
      );

    if (
      result.severity &&
      severityRank[result.severity] >
        severityRank[severity]
    ) {
      severity =
        result.severity;
    }

    for (
      const indicator of
        result.indicators || []
    ) {
      const normalized =
        String(
          indicator || "",
        ).trim();

      if (!normalized) {
        continue;
      }

      if (
        indicators.size <
        MAX_INDICATORS_PER_FINDING
      ) {
        indicators.add(
          normalized,
        );
      }
    }
  }

  /*
   * Do not create empty findings.
   */
  if (
    highestRisk <= 0 &&
    indicators.size === 0
  ) {
    return null;
  }

  return {
    jid: participant.jid,

    name:
      getParticipantName(
        participant,
      ),

    riskScore:
      Math.round(
        highestRisk,
      ),

    severity,

    confidence:
      Math.round(
        highestConfidence,
      ),

    indicators:
      [...indicators],

    messagesAnalyzed:
      indexed.messages,

    commands:
      indexed.commands,

    links:
      indexed.links,

    firstSeen:
      indexed.firstSeen,

    lastSeen:
      indexed.lastSeen,
  };
}

/* =========================================================
   FINDING DEDUPLICATION
========================================================= */

function deduplicateFindings(
  findings: VxScanFinding[],
): VxScanFinding[] {
  const byJid =
    new Map<
      string,
      VxScanFinding
    >();

  const severityRank:
    Record<VxSeverity, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };

  for (
    const finding of findings
  ) {
    const key =
      participantKey(
        finding.jid,
      );

    const existing =
      byJid.get(key);

    if (!existing) {
      byJid.set(
        key,
        finding,
      );

      continue;
    }

    /*
     * Merge duplicate evidence.
     */
    existing.riskScore =
      Math.max(
        existing.riskScore,
        finding.riskScore,
      );

    existing.confidence =
      Math.max(
        existing.confidence,
        finding.confidence,
      );

    if (
      severityRank[finding.severity] >
      severityRank[existing.severity]
    ) {
      existing.severity =
        finding.severity;
    }

    const mergedIndicators =
      new Set([
        ...existing.indicators,
        ...finding.indicators,
      ]);

    existing.indicators =
      [...mergedIndicators].slice(
        0,
        MAX_INDICATORS_PER_FINDING,
      );

    existing.messagesAnalyzed =
      Math.max(
        existing.messagesAnalyzed,
        finding.messagesAnalyzed,
      );

    existing.commands =
      Math.max(
        existing.commands,
        finding.commands,
      );

    existing.links =
      Math.max(
        existing.links,
        finding.links,
      );

    if (
      finding.firstSeen !== undefined &&
      (
        existing.firstSeen === undefined ||
        finding.firstSeen <
          existing.firstSeen
      )
    ) {
      existing.firstSeen =
        finding.firstSeen;
    }

    if (
      finding.lastSeen !== undefined &&
      (
        existing.lastSeen === undefined ||
        finding.lastSeen >
          existing.lastSeen
      )
    ) {
      existing.lastSeen =
        finding.lastSeen;
    }
  }

  return [
    ...byJid.values(),
  ];
}

/* =========================================================
   ABORT RESULT
========================================================= */

function createAbortedResult(
  scanId: string,
  group: VxGroupContext,
  startedAt: number,
  participantsScanned: number,
  messagesAnalyzed: number,
  suspiciousCount: number,
  highRiskCount: number,
  criticalRiskCount: number,
  highestRisk: number,
  findings: VxScanFinding[],
): VxScanResult {
  const completedAt =
    Date.now();

  return {
    scanId,
    group,
    startedAt,
    completedAt,
    aborted: true,
    participantsScanned,
    messagesAnalyzed,
    suspiciousCount,
    highRiskCount,
    criticalRiskCount,
    highestRisk:
      Math.round(
        highestRisk,
      ),
    findings:
      deduplicateFindings(
        findings,
      ).slice(
        0,
        MAX_FINDINGS,
      ),
  };
}

/* =========================================================
   SCANNER
========================================================= */

export async function runVxScan(
  group: VxGroupContext,
  participants: VxScanParticipant[],
  activity: VxScanActivity[] = [],
  onProgress?: (
    progress: VxScanProgress,
  ) => void | Promise<void>,
  isAbortedCallback?: () => boolean,
): Promise<VxScanResult> {
  const scanId =
    createScanId();

  const startedAt =
    Date.now();

  const safeParticipants =
    deduplicateParticipants(
      Array.isArray(
        participants,
      )
        ? participants
        : [],
    );

  const safeActivity =
    Array.isArray(activity)
      ? activity
          .map(
            normalizeActivity,
          )
          .filter(
            (
              event,
            ): event is VxScanActivity =>
              Boolean(event),
          )
      : [];

  const findings:
    VxScanFinding[] = [];

  let participantsScanned = 0;
  let messagesAnalyzed = 0;
  let suspiciousCount = 0;
  let highRiskCount = 0;
  let criticalRiskCount = 0;
  let highestRisk = 0;

  /*
   * Historical detector state is isolated
   * by scanId.
   *
   * This is deliberately cleaned in finally.
   */
  try {
    /* =====================================================
       INITIALIZING — 10%
    ===================================================== */

    await emitProgress(
      onProgress,
      createProgress(
        PROGRESS.INITIALIZING,
        "INITIALIZING",
        `Initializing Dark Vortex security scanner — ${scanId}.`,
      ),
    );

    if (
      isAborted(
        isAbortedCallback,
      )
    ) {
      return createAbortedResult(
        scanId,
        group,
        startedAt,
        participantsScanned,
        messagesAnalyzed,
        suspiciousCount,
        highRiskCount,
        criticalRiskCount,
        highestRisk,
        findings,
      );
    }

    /* =====================================================
       LOADING — 30%
    ===================================================== */

    await emitProgress(
      onProgress,
      createProgress(
        PROGRESS.LOADING,
        "LOADING",
        `Loading ${safeParticipants.length} participant(s) and ${safeActivity.length} historical event(s)...`,
      ),
    );

    const activityIndex =
      buildActivityIndex(
        safeActivity,
      );

    if (
      isAborted(
        isAbortedCallback,
      )
    ) {
      return createAbortedResult(
        scanId,
        group,
        startedAt,
        participantsScanned,
        messagesAnalyzed,
        suspiciousCount,
        highRiskCount,
        criticalRiskCount,
        highestRisk,
        findings,
      );
    }

    /* =====================================================
       PARTICIPANT SCAN — 40–60%
    ===================================================== */

    await emitProgress(
      onProgress,
      createProgress(
        PROGRESS.PARTICIPANTS_START,
        "PARTICIPANT_SCAN",
        "Beginning participant security analysis...",
      ),
    );

    if (
      safeParticipants.length === 0
    ) {
      await emitProgress(
        onProgress,
        createProgress(
          PROGRESS.PARTICIPANTS_END,
          "PARTICIPANT_SCAN",
          "No valid participants were supplied for analysis.",
        ),
      );
    }

    for (
      let index = 0;
      index < safeParticipants.length;
      index++
    ) {
      if (
        isAborted(
          isAbortedCallback,
        )
      ) {
        return createAbortedResult(
          scanId,
          group,
          startedAt,
          participantsScanned,
          messagesAnalyzed,
          suspiciousCount,
          highRiskCount,
          criticalRiskCount,
          highestRisk,
          findings,
        );
      }

      const participant =
        safeParticipants[index];

      if (!participant) {
        continue;
      }

      const key =
        participantKey(
          participant.jid,
        );

      const indexed =
        activityIndex.get(key);

      participantsScanned += 1;

      if (
        !indexed ||
        indexed.events.length === 0
      ) {
        await emitProgress(
          onProgress,
          createProgress(
            calculateParticipantProgress(
              index,
              safeParticipants.length,
            ),
            "PARTICIPANT_SCAN",
            `Analyzed ${getParticipantName(participant)} — no historical events available.`,
          ),
        );

        continue;
      }

      const actor: VxActor = {
        jid:
          participant.jid,

        name:
          participant.name ||
          participant.phoneNumber,

        phoneNumber:
          participant.phoneNumber,
      };

      const detectionResults:
        DetectionSummary[] = [];

      /* ===================================================
         HISTORICAL EVENTS
      =================================================== */

      for (
        const event of indexed.events
      ) {
        if (
          isAborted(
            isAbortedCallback,
          )
        ) {
          return createAbortedResult(
            scanId,
            group,
            startedAt,
            participantsScanned,
            messagesAnalyzed,
            suspiciousCount,
            highRiskCount,
            criticalRiskCount,
            highestRisk,
            findings,
          );
        }

        const normalized =
          normalizeHistoricalEvent(
            event,
          );

        messagesAnalyzed += 1;

        try {
          /*
           * Historical analysis MUST NOT
           * create a live security incident.
           *
           * analysisContext keeps detector
           * behavioral history scoped to this
           * individual scan.
           */
          const detection =
            await detectVxMessage(
              {
                group,

                actor,

                text:
                  normalized.text,

                command:
                  normalized.command,

                hasLink:
                  normalized.hasLink,

                timestamp:
                  normalized.timestamp,

                createIncident:
                  false,

                analysisContext:
                  scanId,
              },
            );

          const risk =
            clamp(
              safeNumber(
                detection.risk,
              ),
            );

          const confidence =
            clamp(
              safeNumber(
                detection.confidence,
              ),
            );

          const severity =
            getSeverity(
              risk,
            );

          detectionResults.push({
            riskScore: risk,
            severity,
            confidence,

            indicators:
              Array.isArray(
                detection.indicators,
              )
                ? detection.indicators
                : [],
          });
        } catch (error) {
          /*
           * A single malformed historical
           * event must never terminate the
           * complete scan.
           */
          console.error(
            "[VX] Historical detection error:",
            error,
          );
        }
      }

      const finding =
        createFinding(
          participant,
          indexed,
          detectionResults,
        );

      if (finding) {
        findings.push(
          finding,
        );

        highestRisk =
          Math.max(
            highestRisk,
            finding.riskScore,
          );
      }

      await emitProgress(
        onProgress,
        createProgress(
          calculateParticipantProgress(
            index,
            safeParticipants.length,
          ),
          "PARTICIPANT_SCAN",
          `Analyzed ${getParticipantName(participant)} — ${indexed.events.length} event(s) processed.`,
        ),
      );
    }

    /* =====================================================
       BEHAVIORAL ANALYSIS — 60–70%
    ===================================================== */

    await emitProgress(
      onProgress,
      createProgress(
        PROGRESS.BEHAVIORAL_START,
        "BEHAVIORAL_ANALYSIS",
        "Analyzing message frequency, repetition, commands and link behavior...",
      ),
    );

    if (
      isAborted(
        isAbortedCallback,
      )
    ) {
      return createAbortedResult(
        scanId,
        group,
        startedAt,
        participantsScanned,
        messagesAnalyzed,
        suspiciousCount,
        highRiskCount,
        criticalRiskCount,
        highestRisk,
        findings,
      );
    }

    /*
     * Findings are now deduplicated before
     * threat correlation.
     */
    const normalizedFindings =
      deduplicateFindings(
        findings,
      );

    findings.length = 0;

    findings.push(
      ...normalizedFindings,
    );

    await emitProgress(
      onProgress,
      createProgress(
        PROGRESS.BEHAVIORAL_END,
        "BEHAVIORAL_ANALYSIS",
        `Behavioral analysis complete — ${messagesAnalyzed} message(s) evaluated.`,
      ),
    );

    /* =====================================================
       THREAT ANALYSIS — 80%
    ===================================================== */

    await emitProgress(
      onProgress,
      createProgress(
        PROGRESS.THREAT_ANALYSIS,
        "THREAT_ANALYSIS",
        "Correlating security indicators and calculating threat severity...",
      ),
    );

    if (
      isAborted(
        isAbortedCallback,
      )
    ) {
      return createAbortedResult(
        scanId,
        group,
        startedAt,
        participantsScanned,
        messagesAnalyzed,
        suspiciousCount,
        highRiskCount,
        criticalRiskCount,
        highestRisk,
        findings,
      );
    }

    /* =====================================================
       FINAL FINDING ORDER
    ===================================================== */

    findings.sort(
      (
        a,
        b,
      ) => {
        if (
          b.riskScore !==
          a.riskScore
        ) {
          return (
            b.riskScore -
            a.riskScore
          );
        }

        if (
          b.confidence !==
          a.confidence
        ) {
          return (
            b.confidence -
            a.confidence
          );
        }

        return a.jid.localeCompare(
          b.jid,
        );
      },
    );

    /*
     * Hard bound the final result.
     */
    if (
      findings.length >
      MAX_FINDINGS
    ) {
      findings.length =
        MAX_FINDINGS;
    }

    suspiciousCount =
      findings.filter(
        finding =>
          finding.riskScore > 0 ||
          finding.indicators.length > 0,
      ).length;

    highRiskCount =
      findings.filter(
        finding =>
          finding.severity === "HIGH",
      ).length;

    criticalRiskCount =
      findings.filter(
        finding =>
          finding.severity === "CRITICAL",
      ).length;

    highestRisk =
      findings.length > 0
        ? findings.reduce(
            (
              highest,
              finding,
            ) =>
              Math.max(
                highest,
                finding.riskScore,
              ),
            0,
          )
        : 0;

    /* =====================================================
       FINALIZING — 90%
    ===================================================== */

    await emitProgress(
      onProgress,
      createProgress(
        PROGRESS.FINALIZING,
        "FINALIZING",
        `Finalizing scan — ${findings.length} finding(s), highest risk ${Math.round(highestRisk)}/100.`,
      ),
    );

    if (
      isAborted(
        isAbortedCallback,
      )
    ) {
      return createAbortedResult(
        scanId,
        group,
        startedAt,
        participantsScanned,
        messagesAnalyzed,
        suspiciousCount,
        highRiskCount,
        criticalRiskCount,
        highestRisk,
        findings,
      );
    }

    const completedAt =
      Date.now();

    /* =====================================================
       COMPLETE — 100%
    ===================================================== */

    await emitProgress(
      onProgress,
      createProgress(
        PROGRESS.COMPLETE,
        "COMPLETE",
        `Security scan complete — ${participantsScanned} participant(s), ${messagesAnalyzed} message(s), ${findings.length} finding(s).`,
      ),
    );

    return {
      scanId,
      group,
      startedAt,
      completedAt,
      aborted: false,
      participantsScanned,
      messagesAnalyzed,
      suspiciousCount,
      highRiskCount,
      criticalRiskCount,
      highestRisk:
        Math.round(
          highestRisk,
        ),
      findings,
    };
  } finally {
    /*
     * CRITICAL:
     *
     * Remove ONLY this scan's historical
     * detector state.
     *
     * Never clear live monitoring state.
     */
    try {
      clearVxHistoricalActivity(
        scanId,
      );
    } catch (error) {
      console.error(
        "[VX] Historical scanner cleanup error:",
        error,
      );
    }
  }
}

/* =========================================================
   SCAN SUMMARY
========================================================= */

export function summarizeVxScan(
  result: VxScanResult,
): string[] {
  const duration =
    Math.max(
      0,
      result.completedAt -
        result.startedAt,
    );

  const durationSeconds =
    (
      duration /
      1000
    ).toFixed(1);

  return [
    `🆔 Scan: ${result.scanId}`,

    `👥 Participants: ${result.participantsScanned}`,

    `💬 Messages: ${result.messagesAnalyzed}`,

    `🔎 Findings: ${result.suspiciousCount}`,

    `🟠 High Risk: ${result.highRiskCount}`,

    `🔴 Critical: ${result.criticalRiskCount}`,

    `📊 Highest Risk: ${Math.round(
      result.highestRisk,
    )}/100`,

    `⏱️ Duration: ${durationSeconds}s`,

    `⚙️ Status: ${
      result.aborted
        ? "ABORTED"
        : "COMPLETED"
    }`,
  ];
}

/* =========================================================
   FINDING HELPERS
========================================================= */

export function getHighestRiskVxFinding(
  result: VxScanResult,
): VxScanFinding | undefined {
  if (
    !result.findings.length
  ) {
    return undefined;
  }

  return result.findings[0];
}

export function getVxScanFindingsBySeverity(
  result: VxScanResult,
  severity: VxSeverity,
): VxScanFinding[] {
  return result.findings.filter(
    finding =>
      finding.severity ===
      severity,
  );
}

export function getVxScanDuration(
  result: VxScanResult,
): number {
  return Math.max(
    0,
    result.completedAt -
      result.startedAt,
  );
}

/* =========================================================
   SCAN STATUS HELPERS
========================================================= */

export function isVxScanAborted(
  result: VxScanResult,
): boolean {
  return result.aborted;
}

export function hasVxScanFindings(
  result: VxScanResult,
): boolean {
  return result.findings.length > 0;
}

export function getVxScanRiskLevel(
  result: VxScanResult,
): VxSeverity {
  return getSeverity(
    clamp(
      result.highestRisk,
    ),
  );
}
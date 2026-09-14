/* =========================================================
   🌑 DARK VORTEX BOT — AUTOMATIC BOT DETECTOR
   ⚡ Powered by Vortex Tech

   PURPOSE:
   - Passive behavioral bot detection
   - Observable message analysis only
   - Persistent sender profiles
   - Confidence-based detection
   - AI-assisted behavioral analysis
   - Automatic security alerts

   IMPORTANT:
   - Does NOT inspect credentials
   - Does NOT inspect private IP addresses
   - Does NOT bypass WhatsApp security
   - Does NOT attempt account takeover
   - Detection is probabilistic, not absolute
   - AI analysis is advisory only
   - Existing protection remains enforcement authority
========================================================= */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  WAMessage,
} from "@whiskeysockets/baileys";

import {
  analyzeBotBehaviorWithAI,
  type BotBehaviorAIResult,
} from "./dark-vortex-ai.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const DATA_DIR = path.resolve(
  process.cwd(),
  "src/data/vortex",
);

const PROFILES_FILE = path.join(
  DATA_DIR,
  "bot-profiles.json",
);

const MAX_PROFILES = 1000;
const MAX_HISTORY = 40;

/*
 * A behavioral detector should be conservative.
 *
 * 75+  = suspicious enough to alert
 * 90+  = high-risk behavioral pattern
 */
const ALERT_THRESHOLD = 75;
const HIGH_RISK_THRESHOLD = 90;

const ALERT_COOLDOWN_MS =
  10 * 60 * 1000;


/* =========================================================
   AI CONFIGURATION
========================================================= */

/*
 * AI is intentionally used as a second opinion.
 *
 * The local behavioral detector remains the primary
 * evidence source.
 *
 * AI is only called when enough behavioral evidence
 * exists.
 */
const AI_MIN_MESSAGES = 8;

const AI_MIN_BEHAVIORAL_CONFIDENCE = 30;

const AI_COMBINATION_MIN_CONFIDENCE = 65;


/* =========================================================
   TYPES
========================================================= */

export interface BotProfile {
  jid: string;

  firstSeen: string;
  lastSeen: string;

  totalMessages: number;

  repeatedMessages: number;
  burstEvents: number;
  automationSignals: number;
  commandLikeMessages: number;
  interactiveMessages: number;

  averageIntervalMs: number;

  confidence: number;

  lastAlertAt: number;

  recentMessages: MessageObservation[];
  recentIntervals: number[];
}

export interface MessageObservation {
  timestamp: number;

  /*
   * Hash is used for repetition detection.
   */
  hash: string;

  /*
   * Short observable text sample used by the AI
   * behavioral analyzer.
   *
   * Optional for backward compatibility with existing
   * bot-profiles.json files.
   */
  text?: string;

  textLength: number;

  isCommandLike: boolean;

  isInteractive: boolean;
}

export interface BotDetectionResult {
  jid: string;

  /*
   * Final combined confidence.
   *
   * If AI is unavailable, this remains the local
   * behavioral confidence.
   */
  confidence: number;

  risk:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  suspicious: boolean;

  signals: string[];

  profile: BotProfile;

  /*
   * Optional AI assessment.
   *
   * This is advisory intelligence and is never itself
   * an enforcement decision.
   */
  ai?: BotBehaviorAIResult;
}


/* =========================================================
   FILE HELPERS
========================================================= */

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(
    DATA_DIR,
    {
      recursive: true,
    },
  );

  try {
    await fs.access(
      PROFILES_FILE,
    );
  } catch {
    await fs.writeFile(
      PROFILES_FILE,
      JSON.stringify(
        {},
        null,
        2,
      ),
      "utf8",
    );
  }
}


async function readProfiles(): Promise<
  Record<string, BotProfile>
> {
  await ensureDataFile();

  try {
    const raw =
      await fs.readFile(
        PROFILES_FILE,
        "utf8",
      );

    const parsed =
      JSON.parse(
        raw,
      ) as Record<string, BotProfile>;

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      return {};
    }

    return parsed;

  } catch {
    return {};
  }
}


async function writeProfiles(
  profiles: Record<string, BotProfile>,
): Promise<void> {
  await ensureDataFile();

  await fs.writeFile(
    PROFILES_FILE,
    JSON.stringify(
      profiles,
      null,
      2,
    ),
    "utf8",
  );
}


/* =========================================================
   HASHING
========================================================= */

function normalizeText(
  text: string,
): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


function hashText(
  text: string,
): string {
  return crypto
    .createHash("sha256")
    .update(
      normalizeText(text),
    )
    .digest("hex");
}


/* =========================================================
   MESSAGE EXTRACTION
========================================================= */

function getMessageText(
  message: WAMessage,
): string {
  const content =
    message.message;

  if (!content) {
    return "";
  }

  if (
    content.conversation
  ) {
    return content.conversation;
  }

  if (
    content.extendedTextMessage?.text
  ) {
    return content.extendedTextMessage.text;
  }

  if (
    content.imageMessage?.caption
  ) {
    return content.imageMessage.caption;
  }

  if (
    content.videoMessage?.caption
  ) {
    return content.videoMessage.caption;
  }

  if (
    content.documentMessage?.caption
  ) {
    return content.documentMessage.caption;
  }

  return "";
}


/* =========================================================
   AI MESSAGE SAMPLE SANITIZATION
========================================================= */

/*
 * Only a short observable text sample is retained.
 *
 * This prevents the AI-analysis history from becoming
 * unnecessarily large.
 */
function createAISafeTextSample(
  text: string,
): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}


/* =========================================================
   OBSERVABLE STRUCTURE CHECKS
========================================================= */

function isInteractiveMessage(
  message: WAMessage,
): boolean {
  const content =
    message.message;

  if (!content) {
    return false;
  }

  return Boolean(
    content.interactiveMessage ||
    content.buttonsMessage ||
    content.listMessage ||
    content.templateMessage ||
    content.botInvokeMessage,
  );
}


function isCommandLike(
  text: string,
): boolean {
  const normalized =
    text.trim();

  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith(".") ||
    normalized.startsWith("!") ||
    normalized.startsWith("/") ||
    normalized.startsWith("#")
  );
}


/* =========================================================
   PROFILE
========================================================= */

function createProfile(
  jid: string,
  now: number,
): BotProfile {
  const timestamp =
    new Date(
      now,
    ).toISOString();

  return {
    jid,

    firstSeen:
      timestamp,

    lastSeen:
      timestamp,

    totalMessages: 0,

    repeatedMessages: 0,
    burstEvents: 0,
    automationSignals: 0,
    commandLikeMessages: 0,
    interactiveMessages: 0,

    averageIntervalMs: 0,

    confidence: 0,

    lastAlertAt: 0,

    recentMessages: [],
    recentIntervals: [],
  };
}


/* =========================================================
   SIGNAL ANALYSIS
========================================================= */

function analyzeProfile(
  profile: BotProfile,
  text: string,
  isInteractive: boolean,
  now: number,
): {
  confidence: number;
  signals: string[];
} {
  const signals: string[] = [];

  let score = 0;

  /*
   * Require enough behavioral history before scoring.
   *
   * This prevents a single unusual message from becoming
   * a bot detection.
   */
  if (
    profile.totalMessages < 5
  ) {
    return {
      confidence: 0,

      signals: [
        "Insufficient behavioral history.",
      ],
    };
  }

  /* -------------------------------------------------------
     Repetition
  ------------------------------------------------------- */

  if (
    profile.repeatedMessages >= 2
  ) {
    score += 20;

    signals.push(
      "Repeated message pattern detected.",
    );
  }

  if (
    profile.repeatedMessages >= 4
  ) {
    score += 15;

    signals.push(
      "Persistent repeated content detected.",
    );
  }

  if (
    profile.repeatedMessages >= 7
  ) {
    score += 10;

    signals.push(
      "High-frequency repeated content detected.",
    );
  }

  /* -------------------------------------------------------
     Burst activity
  ------------------------------------------------------- */

  if (
    profile.burstEvents >= 2
  ) {
    score += 18;

    signals.push(
      "Rapid message burst behavior detected.",
    );
  }

  if (
    profile.burstEvents >= 5
  ) {
    score += 12;

    signals.push(
      "Repeated rapid activity bursts observed.",
    );
  }

  if (
    profile.burstEvents >= 10
  ) {
    score += 8;

    signals.push(
      "Sustained high-frequency activity observed.",
    );
  }

  /* -------------------------------------------------------
     Command-like activity

     IMPORTANT:
     Command usage is telemetry only.

     A human using several bot commands must NOT
     automatically become more suspicious.
  ------------------------------------------------------- */

  if (
    profile.commandLikeMessages >= 5
  ) {
    signals.push(
      "Repeated command-like messages observed.",
    );
  }

  /* -------------------------------------------------------
     Interactive automation structures
  ------------------------------------------------------- */

  if (
    profile.interactiveMessages >= 2
  ) {
    score += 8;

    signals.push(
      "Repeated interactive message structures observed.",
    );
  }

  if (
    profile.interactiveMessages >= 5
  ) {
    score += 10;

    signals.push(
      "Persistent interactive automation-style activity observed.",
    );
  }

  /* -------------------------------------------------------
     Automation signals
  ------------------------------------------------------- */

  if (
    profile.automationSignals >= 3
  ) {
    score += 8;

    signals.push(
      "Multiple observable automation indicators detected.",
    );
  }

  if (
    profile.automationSignals >= 6
  ) {
    score += 8;

    signals.push(
      "Persistent automation-style activity detected.",
    );
  }

  /* -------------------------------------------------------
     Timing consistency

     Timing is useful only when combined with other
     behavioral evidence.
  ------------------------------------------------------- */

  let regularRapidTiming =
    false;

  if (
    profile.recentIntervals.length >= 5
  ) {
    const intervals =
      profile.recentIntervals;

    const average =
      intervals.reduce(
        (sum, value) =>
          sum + value,
        0,
      ) /
      intervals.length;

    const variance =
      intervals.reduce(
        (sum, value) =>
          sum +
          Math.pow(
            value - average,
            2,
          ),
        0,
      ) /
      intervals.length;

    const deviation =
      Math.sqrt(
        variance,
      );

    const coefficient =
      average > 0
        ? deviation / average
        : 1;

    regularRapidTiming =
      average < 5000 &&
      coefficient < 0.25;

    if (
      regularRapidTiming
    ) {
      score += 10;

      signals.push(
        "Highly regular rapid-response timing observed.",
      );
    }
  }

  /* -------------------------------------------------------
     Current interactive message

     This is supporting evidence only.
  ------------------------------------------------------- */

  if (
    isInteractive &&
    profile.interactiveMessages >= 2
  ) {
    score += 4;

    signals.push(
      "Current message contains an observable automation-style structure.",
    );
  }

  /* -------------------------------------------------------
     Sustained activity
  ------------------------------------------------------- */

  if (
    profile.totalMessages >= 25 &&
    profile.burstEvents >= 5
  ) {
    score += 8;

    signals.push(
      "Sustained high-frequency activity observed.",
    );
  }

  /* -------------------------------------------------------
     Independent-signal requirement

     Prevent one category from dominating the result.
  ------------------------------------------------------- */

  const independentSignals =
    [
      profile.repeatedMessages >= 2,
      profile.burstEvents >= 2,
      profile.interactiveMessages >= 2,
      profile.automationSignals >= 3,
      regularRapidTiming,
    ].filter(
      Boolean,
    ).length;

  if (
    independentSignals <= 1
  ) {
    score =
      Math.min(
        score,
        45,
      );
  }

  if (
    independentSignals === 2 &&
    score > 84
  ) {
    score = 84;
  }

  return {
    confidence:
      Math.min(
        100,
        Math.max(
          0,
          Math.round(score),
        ),
      ),

    signals,
  };
}


/* =========================================================
   AI EVIDENCE DECISION
========================================================= */

function shouldUseBotAI(
  profile: BotProfile,
  behavioralConfidence: number,
): boolean {
  if (
    profile.totalMessages <
    AI_MIN_MESSAGES
  ) {
    return false;
  }

  return (
    behavioralConfidence >=
      AI_MIN_BEHAVIORAL_CONFIDENCE ||
    (
      profile.repeatedMessages >= 2 &&
      profile.burstEvents >= 2
    ) ||
    profile.automationSignals >= 3
  );
}


/* =========================================================
   BUILD AI INPUT
========================================================= */

function buildBotAIInput(
  profile: BotProfile,
  behavioralConfidence: number,
  behavioralRisk:
    | "LOW"
    | "MEDIUM"
    | "HIGH",
): {
  totalMessages: number;
  repeatedMessages: number;
  burstEvents: number;
  automationSignals: number;
  commandLikeMessages: number;
  interactiveMessages: number;
  averageIntervalMs: number;
  behavioralConfidence: number;
  behavioralRisk:
    | "LOW"
    | "MEDIUM"
    | "HIGH";
  recentMessages: string[];
  recentIntervals: number[];
} {
  const recentMessages =
    profile.recentMessages
      .slice(-12)
      .map(
        observation =>
          observation.text?.trim() ||
          "[message content unavailable]",
      )
      .filter(Boolean);

  return {
    totalMessages:
      profile.totalMessages,

    repeatedMessages:
      profile.repeatedMessages,

    burstEvents:
      profile.burstEvents,

    automationSignals:
      profile.automationSignals,

    commandLikeMessages:
      profile.commandLikeMessages,

    interactiveMessages:
      profile.interactiveMessages,

    averageIntervalMs:
      profile.averageIntervalMs,

    behavioralConfidence,

    behavioralRisk,

    recentMessages,

    recentIntervals:
      profile.recentIntervals
        .slice(-12),
  };
}


/* =========================================================
   COMBINE LOCAL + AI ASSESSMENT
========================================================= */

function combineBotAssessment(
  behavioralConfidence: number,
  behavioralSignals: string[],
  ai: BotBehaviorAIResult | null,
): {
  confidence: number;
  risk:
    | "LOW"
    | "MEDIUM"
    | "HIGH";
  signals: string[];
} {
  /*
   * If AI did not return a result, preserve the original
   * local detector behavior exactly.
   */
  if (!ai) {
    const risk =
      behavioralConfidence >=
      HIGH_RISK_THRESHOLD
        ? "HIGH"
        : behavioralConfidence >= 50
          ? "MEDIUM"
          : "LOW";

    return {
      confidence:
        behavioralConfidence,

      risk,

      signals:
        behavioralSignals,
    };
  }

  /*
   * AI confidence must be reasonably strong before it
   * contributes to the final assessment.
   */
  if (
    ai.confidence <
    AI_COMBINATION_MIN_CONFIDENCE
  ) {
    return {
      confidence:
        behavioralConfidence,

      risk:
        behavioralConfidence >=
        HIGH_RISK_THRESHOLD
          ? "HIGH"
          : behavioralConfidence >= 50
            ? "MEDIUM"
            : "LOW",

      signals:
        [
          ...behavioralSignals,
          "AI analysis returned low-confidence evidence.",
        ],
    };
  }

  /*
   * Conservative combination:
   *
   * 55% local behavioral evidence
   * 45% AI behavioral assessment
   *
   * This prevents the AI from completely overriding
   * the local detector.
   */
  const combined =
    Math.round(
      behavioralConfidence * 0.55 +
      ai.botProbability * 0.45,
    );

  const confidence =
    Math.max(
      0,
      Math.min(
        100,
        combined,
      ),
    );

  let risk:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  if (
    confidence >=
    HIGH_RISK_THRESHOLD
  ) {
    risk = "HIGH";
  } else if (
    confidence >= 50
  ) {
    risk = "MEDIUM";
  } else {
    risk = "LOW";
  }

  const signals =
    [
      ...behavioralSignals,
    ];

  for (
    const signal of ai.signals
  ) {
    const formatted =
      `AI: ${signal}`;

    if (
      !signals.includes(
        formatted,
      )
    ) {
      signals.push(
        formatted,
      );
    }
  }

  if (
    ai.reason &&
    !signals.some(
      signal =>
        signal.startsWith(
          "AI assessment:",
        ),
    )
  ) {
    signals.push(
      `AI assessment: ${ai.reason}`,
    );
  }

  return {
    confidence,

    risk,

    signals:
      signals.slice(0, 12),
  };
}


/* =========================================================
   MAIN DETECTOR
========================================================= */

export async function analyzeIncomingMessage(
  jid: string,
  message: WAMessage,
): Promise<BotDetectionResult> {
  const now =
    Date.now();

  const profiles =
    await readProfiles();

  let profile =
    profiles[jid];

  if (!profile) {
    profile =
      createProfile(
        jid,
        now,
      );
  }

  /*
   * Backward compatibility for profiles created before
   * AI message samples were introduced.
   */
  if (
    !Array.isArray(
      profile.recentMessages,
    )
  ) {
    profile.recentMessages = [];
  }

  if (
    !Array.isArray(
      profile.recentIntervals,
    )
  ) {
    profile.recentIntervals = [];
  }

  const text =
    getMessageText(
      message,
    );

  const normalized =
    normalizeText(
      text,
    );

  /*
   * Empty text should not participate in repeated-message
   * detection because many media messages naturally have
   * no caption.
   */
  const hasText =
    normalized.length > 0;

  const hash =
    hasText
      ? hashText(text)
      : "";

  const interactive =
    isInteractiveMessage(
      message,
    );

  const commandLike =
    isCommandLike(
      text,
    );

  /* -------------------------------------------------------
     Interval tracking
  ------------------------------------------------------- */

  const previous =
    profile.recentMessages.at(-1);

  if (previous) {
    const interval =
      Math.max(
        0,
        now -
          previous.timestamp,
      );

    if (
      interval > 0 &&
      interval <
        10 * 60 * 1000
    ) {
      profile.recentIntervals.push(
        interval,
      );

      if (
        profile.recentIntervals.length >
        MAX_HISTORY
      ) {
        profile.recentIntervals.shift();
      }

      /*
       * A burst is a message arriving within 3 seconds
       * of the previous message.
       */
      if (
        interval < 3000
      ) {
        profile.burstEvents++;
      }
    }
  }

  /* -------------------------------------------------------
     Repetition tracking
  ------------------------------------------------------- */

  if (
    hasText
  ) {
    const repeated =
      profile.recentMessages.some(
        (item) =>
          item.hash === hash &&
          item.hash !== "" &&
          now -
            item.timestamp <
            5 * 60 * 1000,
      );

    if (
      repeated
    ) {
      profile.repeatedMessages++;
    }
  }

  /* -------------------------------------------------------
     Observable automation signals

     Interactive structures are meaningful observable
     evidence, but they are NOT proof of a bot.
  ------------------------------------------------------- */

  if (
    interactive
  ) {
    profile.interactiveMessages++;
    profile.automationSignals++;
  }

  /*
   * Commands are recorded for telemetry/profile
   * information only.
   *
   * They deliberately do NOT increase automationSignals.
   */
  if (
    commandLike
  ) {
    profile.commandLikeMessages++;
  }

  /* -------------------------------------------------------
     Store observation
  ------------------------------------------------------- */

  profile.recentMessages.push({
    timestamp: now,

    hash,

    /*
     * Keep only a short text sample for the AI analyzer.
     *
     * This does not replace the hash-based repetition
     * detection.
     */
    text:
      hasText
        ? createAISafeTextSample(
            text,
          )
        : undefined,

    textLength:
      text.length,

    isCommandLike:
      commandLike,

    isInteractive:
      interactive,
  });

  if (
    profile.recentMessages.length >
    MAX_HISTORY
  ) {
    profile.recentMessages.shift();
  }

  profile.totalMessages++;

  profile.lastSeen =
    new Date(
      now,
    ).toISOString();

  if (
    profile.recentIntervals.length
  ) {
    profile.averageIntervalMs =
      Math.round(
        profile.recentIntervals.reduce(
          (sum, value) =>
            sum + value,
          0,
        ) /
          profile.recentIntervals.length,
      );
  }

  /* -------------------------------------------------------
     LOCAL BEHAVIORAL ANALYSIS
  ------------------------------------------------------- */

  const analysis =
    analyzeProfile(
      profile,
      text,
      interactive,
      now,
    );

  profile.confidence =
    analysis.confidence;

  /* -------------------------------------------------------
     Local risk before AI
  ------------------------------------------------------- */

  const localConfidence =
    analysis.confidence;

  let localRisk:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  if (
    localConfidence >=
    HIGH_RISK_THRESHOLD
  ) {
    localRisk = "HIGH";
  } else if (
    localConfidence >= 50
  ) {
    localRisk = "MEDIUM";
  } else {
    localRisk = "LOW";
  }

  /* -------------------------------------------------------
     AI BEHAVIORAL ANALYSIS
  ------------------------------------------------------- */

  let aiResult:
    | BotBehaviorAIResult
    | null = null;

  if (
    shouldUseBotAI(
      profile,
      localConfidence,
    )
  ) {
    try {
      const aiInput =
        buildBotAIInput(
          profile,
          localConfidence,
          localRisk,
        );

      /*
       * IMPORTANT:
       *
       * The JID is used only locally for the AI cooldown
       * map inside dark-vortex-ai.ts.
       *
       * It is NOT included in the AI prompt.
       */
      aiResult =
        await analyzeBotBehaviorWithAI(
          aiInput,
          jid,
        );

    } catch (error) {
      /*
       * AI failure must never break the normal
       * behavioral detector.
       */
      console.error(
        "[DARK VORTEX BOT AI] Analysis failed:",
        error,
      );

      aiResult = null;
    }
  }

  /* -------------------------------------------------------
     COMBINED ASSESSMENT
  ------------------------------------------------------- */

  const combined =
    combineBotAssessment(
      localConfidence,
      analysis.signals,
      aiResult,
    );

  const confidence =
    combined.confidence;

  /*
   * Keep the persistent profile's confidence based on
   * the final assessment so profile inspection reflects
   * the latest combined result.
   */
  profile.confidence =
    confidence;

  /* -------------------------------------------------------
     Persist
  ------------------------------------------------------- */

  profiles[jid] =
    profile;

  const keys =
    Object.keys(
      profiles,
    );

  if (
    keys.length >
    MAX_PROFILES
  ) {
    const oldest =
      keys.sort(
        (a, b) =>
          new Date(
            profiles[a]!.lastSeen,
          ).getTime() -
          new Date(
            profiles[b]!.lastSeen,
          ).getTime(),
      )[0];

    if (oldest) {
      delete profiles[
        oldest
      ];
    }
  }

  await writeProfiles(
    profiles,
  );

  /* -------------------------------------------------------
     Final result
  ------------------------------------------------------- */

  return {
    jid,

    confidence,

    risk:
      combined.risk,

    suspicious:
      confidence >=
      ALERT_THRESHOLD,

    signals:
      combined.signals,

    profile,

    ...(aiResult
      ? {
          ai: aiResult,
        }
      : {}),
  };
}


/* =========================================================
   ALERT COOLDOWN
========================================================= */

export async function shouldAlert(
  jid: string,
): Promise<boolean> {
  const profiles =
    await readProfiles();

  const profile =
    profiles[jid];

  if (!profile) {
    return false;
  }

  const now =
    Date.now();

  if (
    now -
      profile.lastAlertAt <
    ALERT_COOLDOWN_MS
  ) {
    return false;
  }

  profile.lastAlertAt =
    now;

  profiles[jid] =
    profile;

  await writeProfiles(
    profiles,
  );

  return true;
}


/* =========================================================
   ALERT FORMATTER
========================================================= */

export function formatBotDetectionAlert(
  result: BotDetectionResult,
  mention: string,
): string {
  const signalLines =
    result.signals.length
      ? result.signals
          .slice(0, 8)
          .map(
            (signal) =>
              `• ${signal}`,
          )
      : [
          "• No strong signal available.",
        ];

  const lines = [
    "🌑 DARK VORTEX • BOT DETECTOR",
    "",
    `Target: ${mention}`,
    `Bot probability: ${result.confidence}%`,
    `Risk: ${result.risk}`,
  ];

  if (
    result.ai
  ) {
    lines.push(
      `AI probability: ${result.ai.botProbability}%`,
      `AI confidence: ${result.ai.confidence}%`,
      `AI assessment: ${
        result.ai.automated
          ? "Likely automated"
          : "No strong automation conclusion"
      }`,
    );
  }

  lines.push(
    "",
    "Detected signals:",
    ...signalLines,
    "",
    "Assessment is based only on observable behavior.",
    "AI analysis is advisory; protection enforcement remains under Dark Vortex security systems.",
    "",
    "⚡ VORTEX TECH",
  );

  return lines.join(
    "\n",
  );
}


/* =========================================================
   PROFILE ACCESS
========================================================= */

export async function getBotProfile(
  jid: string,
): Promise<BotProfile | null> {
  const profiles =
    await readProfiles();

  return (
    profiles[jid] ||
    null
  );
}


export async function clearBotProfile(
  jid: string,
): Promise<void> {
  const profiles =
    await readProfiles();

  delete profiles[jid];

  await writeProfiles(
    profiles,
  );
}


/* =========================================================
   CONFIG ACCESS
========================================================= */

export function getBotDetectorConfig(): {
  alertThreshold: number;
  highRiskThreshold: number;
  alertCooldownMs: number;
  aiMinMessages: number;
  aiMinBehavioralConfidence: number;
} {
  return {
    alertThreshold:
      ALERT_THRESHOLD,

    highRiskThreshold:
      HIGH_RISK_THRESHOLD,

    alertCooldownMs:
      ALERT_COOLDOWN_MS,

    aiMinMessages:
      AI_MIN_MESSAGES,

    aiMinBehavioralConfidence:
      AI_MIN_BEHAVIORAL_CONFIDENCE,
  };
}
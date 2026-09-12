/* =========================================================
   🌑 DARK VORTEX — VX DETECTOR

   Behavioral Threat & Bot Detection Engine

   WhatsApp Message
        ↓
   VX Detector
        ↓
   VX Engine
        ↓
   VX Risk
        ↓
   VX Incidents
        ↓
   VX Logger

   Historical scans use isolated activity contexts.

   ⚡ Powered by Vortex Tech
========================================================= */

import { analyzeVxEvent } from "./vx-engine.js";

import { createRiskFactor } from "./vx-risk.js";

import type {
  VxActor,
  VxEvent,
  VxGroupContext,
} from "./vx-types.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const WINDOW_MS =
  60_000;

const BURST_WINDOW_MS =
  10_000;

const BURST_MESSAGE_COUNT =
  5;

const MAX_HISTORY =
  100;

const PROFILE_EXPIRY_MS =
  15 * 60_000;

const MAX_PROFILES =
  10_000;

const MAX_HISTORICAL_CONTEXTS =
  200;

const MAX_HISTORICAL_PROFILES_PER_CONTEXT =
  10_000;

const MAX_INDICATORS =
  30;

const MAX_URLS =
  20;

const MAX_TEXT_LENGTH =
  20_000;

const LIVE_CONTEXT =
  "live";


/* =========================================================
   TYPES
========================================================= */

interface ActivityEntry {
  timestamp: number;
  textHash: string;
  hasLink: boolean;
  command?: string;
}

interface ActivityProfile {
  entries: ActivityEntry[];
  lastSeen: number;
}

export interface DetectMessageInput {
  group: VxGroupContext;

  actor: VxActor;

  text?: string;

  command?: string;

  hasLink?: boolean;

  /**
   * Message timestamp.
   *
   * Historical scans should provide the original
   * timestamp.
   */
  timestamp?: number;

  /**
   * false = historical analysis.
   * true/undefined = live detection.
   */
  createIncident?: boolean;

  /**
   * Stable context used by historical scans.
   * Normally the scan ID.
   */
  analysisContext?: string;
}

export interface VxDetectionResult {
  suspicious: boolean;

  risk: number;

  confidence: number;

  indicators: ReturnType<
    typeof normalizeIndicators
  >;

  factors: ReturnType<
    typeof createRiskFactor
  >[];

  event?: VxEvent;
}


/* =========================================================
   ACTIVITY STORES
========================================================= */

const liveActivity =
  new Map<
    string,
    ActivityProfile
  >();

const historicalActivity =
  new Map<
    string,
    Map<
      string,
      ActivityProfile
    >
  >();


/* =========================================================
   SAFE NUMBERS
========================================================= */

function safeTimestamp(
  value: unknown,
): number {
  const timestamp =
    Number(value);

  if (
    !Number.isFinite(
      timestamp,
    ) ||
    timestamp <= 0
  ) {
    return Date.now();
  }

  /*
   * Do not allow absurd future timestamps to
   * poison rolling-window calculations.
   */
  const now =
    Date.now();

  if (
    timestamp >
    now + 24 * 60 * 60 * 1000
  ) {
    return now;
  }

  return timestamp;
}


function safeScore(
  value: unknown,
): number {
  const score =
    Number(value);

  if (
    !Number.isFinite(
      score,
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        score,
      ),
    ),
  );
}


/* =========================================================
   HASHING
========================================================= */

function hashText(
  text: string,
): string {
  let hash =
    5381;

  for (
    let index = 0;
    index < text.length;
    index++
  ) {
    hash =
      (
        (
          hash << 5
        ) -
        hash
      ) ^
      text.charCodeAt(
        index,
      );

    hash |=
      0;
  }

  return Math.abs(
    hash,
  ).toString(16);
}


/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeText(
  text?: string,
): string {
  return String(
    text || "",
  )
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .slice(
      0,
      MAX_TEXT_LENGTH,
    );
}


function normalizeContext(
  context?: string,
): string {
  const value =
    String(
      context || "",
    )
      .trim()
      .slice(
        0,
        200,
      );

  return (
    value ||
    "historical"
  );
}


function normalizeActor(
  actor: VxActor,
): string {
  const value =
    String(
      actor.jid ||
        actor.phoneNumber ||
        "unknown",
    )
      .trim()
      .toLowerCase();

  return (
    value ||
    "unknown"
  );
}


function normalizeGroup(
  group: VxGroupContext,
): string {
  const value =
    String(
      group.jid ||
        "unknown",
    )
      .trim()
      .toLowerCase();

  return (
    value ||
    "unknown"
  );
}


function normalizeCommand(
  command?: string,
): string | undefined {
  const value =
    String(
      command || "",
    )
      .trim()
      .toLowerCase()
      .slice(
        0,
        200,
      );

  return value ||
    undefined;
}


function normalizeIndicators(
  indicators: string[],
): string[] {
  if (
    !Array.isArray(
      indicators,
    )
  ) {
    return [];
  }

  const seen =
    new Set<string>();

  const result: string[] =
    [];

  for (
    const indicator of indicators
  ) {
    const value =
      String(
        indicator || "",
      )
        .trim()
        .slice(
          0,
          140,
        );

    if (!value) {
      continue;
    }

    const key =
      value.toLowerCase();

    if (
      seen.has(
        key,
      )
    ) {
      continue;
    }

    seen.add(
      key,
    );

    result.push(
      value,
    );

    if (
      result.length >=
      MAX_INDICATORS
    ) {
      break;
    }
  }

  return result;
}


/* =========================================================
   PROFILE KEY
========================================================= */

function createProfileKey(
  group: VxGroupContext,
  actor: VxActor,
): string {
  return [
    normalizeGroup(
      group,
    ),
    normalizeActor(
      actor,
    ),
  ].join("::");
}


/* =========================================================
   URL ANALYSIS
========================================================= */

function extractUrls(
  text: string,
): string[] {
  const matches =
    text.match(
      /https?:\/\/[^\s]+|www\.[^\s]+/gi,
    ) || [];

  return Array.from(
    new Set(
      matches
        .slice(
          0,
          MAX_URLS,
        )
        .map(
          url =>
            url
              .trim()
              .slice(
                0,
                2000,
              ),
        ),
    ),
  );
}


function analyzeUrls(
  text: string,
): {
  hasLink: boolean;
  suspicious: boolean;
  indicators: string[];
} {
  const urls =
    extractUrls(
      text,
    );

  if (
    urls.length ===
    0
  ) {
    return {
      hasLink:
        false,

      suspicious:
        false,

      indicators:
        [],
    };
  }

  const indicators:
    string[] =
    [];

  let suspicious =
    false;

  for (
    const rawUrl of urls
  ) {
    const url =
      rawUrl.toLowerCase();

    /*
     * These are observable indicators.
     * They are NOT proof that a URL is malicious.
     */

    if (
      /(?:bit\.ly|tinyurl\.com|t\.co)\//i.test(
        url,
      )
    ) {
      suspicious =
        true;

      indicators.push(
        "SHORTENED_URL",
      );
    }

    if (
      /(?:\/|=)(login|verify|verification|secure-account|confirm-account)(?:[/?#=&]|$)/i.test(
        url,
      )
    ) {
      suspicious =
        true;

      indicators.push(
        "SUSPICIOUS_URL_PATH",
      );
    }

    if (
      url.includes("@")
    ) {
      suspicious =
        true;

      indicators.push(
        "URL_USERINFO_PATTERN",
      );
    }

    if (
      url.startsWith(
        "javascript:",
      ) ||
      url.startsWith(
        "data:",
      )
    ) {
      suspicious =
        true;

      indicators.push(
        "NON_HTTP_URL_SCHEME",
      );
    }
  }

  return {
    hasLink:
      true,

    suspicious,

    indicators:
      normalizeIndicators(
        indicators,
      ),
  };
}


/* =========================================================
   ACTIVITY HELPERS
========================================================= */

function pruneProfile(
  profile: ActivityProfile,
  now: number,
): void {
  const cutoff =
    now -
    WINDOW_MS;

  profile.entries =
    profile.entries.filter(
      entry =>
        Number.isFinite(
          entry.timestamp,
        ) &&
        entry.timestamp >=
          cutoff &&
        entry.timestamp <=
          now,
    );

  if (
    profile.entries.length >
    MAX_HISTORY
  ) {
    profile.entries =
      profile.entries.slice(
        -MAX_HISTORY,
      );
  }

  profile.lastSeen =
    now;
}


function getLiveProfile(
  key: string,
  now: number,
): ActivityProfile {
  let profile =
    liveActivity.get(
      key,
    );

  if (!profile) {
    profile = {
      entries:
        [],

      lastSeen:
        now,
    };

    liveActivity.set(
      key,
      profile,
    );
  }

  pruneProfile(
    profile,
    now,
  );

  return profile;
}


function getHistoricalProfile(
  context: string,
  key: string,
  now: number,
): ActivityProfile {
  let contextStore =
    historicalActivity.get(
      context,
    );

  if (!contextStore) {
    /*
     * Prevent unbounded historical-context growth.
     */
    if (
      historicalActivity.size >=
      MAX_HISTORICAL_CONTEXTS
    ) {
      const oldestContext =
        [
          ...historicalActivity.entries(),
        ]
          .sort(
            (
              a,
              b,
            ) =>
              getContextLastSeen(
                a[1],
              ) -
              getContextLastSeen(
                b[1],
              ),
          )[0]?.[0];

      if (
        oldestContext
      ) {
        historicalActivity.delete(
          oldestContext,
        );
      }
    }

    contextStore =
      new Map<
        string,
        ActivityProfile
      >();

    historicalActivity.set(
      context,
      contextStore,
    );
  }

  let profile =
    contextStore.get(
      key,
    );

  if (!profile) {
    if (
      contextStore.size >=
      MAX_HISTORICAL_PROFILES_PER_CONTEXT
    ) {
      const oldestProfile =
        [
          ...contextStore.entries(),
        ]
          .sort(
            (
              a,
              b,
            ) =>
              a[1].lastSeen -
              b[1].lastSeen,
          )[0]?.[0];

      if (
        oldestProfile
      ) {
        contextStore.delete(
          oldestProfile,
        );
      }
    }

    profile = {
      entries:
        [],

      lastSeen:
        now,
    };

    contextStore.set(
      key,
      profile,
    );
  }

  pruneProfile(
    profile,
    now,
  );

  return profile;
}


function getContextLastSeen(
  store: Map<
    string,
    ActivityProfile
  >,
): number {
  let latest =
    0;

  for (
    const profile of
      store.values()
  ) {
    if (
      profile.lastSeen >
      latest
    ) {
      latest =
        profile.lastSeen;
    }
  }

  return latest;
}


/* =========================================================
   FREQUENCY ANALYSIS
========================================================= */

function analyzeFrequency(
  entries: ActivityEntry[],
): {
  messages: number;
  messagesPerMinute: number;
  burst: boolean;
} {
  if (
    entries.length ===
    0
  ) {
    return {
      messages:
        0,

      messagesPerMinute:
        0,

      burst:
        false,
    };
  }

  const timestamps =
    entries
      .map(
        entry =>
          entry.timestamp,
      )
      .filter(
        timestamp =>
          Number.isFinite(
            timestamp,
          ),
      )
      .sort(
        (
          a,
          b,
        ) =>
          a - b,
      );

  if (
    timestamps.length ===
    0
  ) {
    return {
      messages:
        0,

      messagesPerMinute:
        0,

      burst:
        false,
    };
  }

  const first =
    timestamps[0];

  const last =
    timestamps[
      timestamps.length - 1
    ];

  const duration =
    Math.max(
      1_000,
      last - first,
    );

  const messagesPerMinute =
    timestamps.length /
    (
      duration /
      60_000
    );

  let burst =
    false;

  let start =
    0;

  for (
    let end = 0;
    end <
    timestamps.length;
    end++
  ) {
    while (
      start < end &&
      timestamps[end] -
        timestamps[start] >
        BURST_WINDOW_MS
    ) {
      start++;
    }

    if (
      end -
        start +
        1 >=
      BURST_MESSAGE_COUNT
    ) {
      burst =
        true;

      break;
    }
  }

  return {
    messages:
      timestamps.length,

    messagesPerMinute,

    burst,
  };
}


/* =========================================================
   REPETITION ANALYSIS
========================================================= */

function analyzeRepetition(
  entries: ActivityEntry[],
): {
  repeated: number;
  ratio: number;
} {
  if (
    entries.length ===
    0
  ) {
    return {
      repeated:
        0,

      ratio:
        0,
    };
  }

  const counts =
    new Map<
      string,
      number
    >();

  for (
    const entry of entries
  ) {
    counts.set(
      entry.textHash,
      (
        counts.get(
          entry.textHash,
        ) || 0
      ) + 1,
    );
  }

  let repeated =
    0;

  for (
    const count of
      counts.values()
  ) {
    if (
      count >=
      2
    ) {
      repeated +=
        count;
    }
  }

  return {
    repeated,

    ratio:
      repeated /
      entries.length,
  };
}


/* =========================================================
   AUTOMATION TIMING
========================================================= */

function analyzeTiming(
  entries: ActivityEntry[],
): {
  regular: boolean;
  averageIntervalMs: number;
} {
  if (
    entries.length <
    4
  ) {
    return {
      regular:
        false,

      averageIntervalMs:
        0,
    };
  }

  const timestamps =
    entries
      .map(
        entry =>
          entry.timestamp,
      )
      .filter(
        timestamp =>
          Number.isFinite(
            timestamp,
          ),
      )
      .sort(
        (
          a,
          b,
        ) =>
          a - b,
      );

  const intervals:
    number[] =
    [];

  for (
    let index = 1;
    index <
    timestamps.length;
    index++
  ) {
    const interval =
      timestamps[index] -
      timestamps[index - 1];

    if (
      interval > 0 &&
      interval <=
        WINDOW_MS
    ) {
      intervals.push(
        interval,
      );
    }
  }

  if (
    intervals.length <
    3
  ) {
    return {
      regular:
        false,

      averageIntervalMs:
        0,
    };
  }

  const average =
    intervals.reduce(
      (
        sum,
        value,
      ) =>
        sum + value,
      0,
    ) /
    intervals.length;

  const variance =
    intervals.reduce(
      (
        sum,
        value,
      ) =>
        sum +
        Math.pow(
          value -
            average,
          2,
        ),
      0,
    ) /
    intervals.length;

  const standardDeviation =
    Math.sqrt(
      variance,
    );

  const coefficient =
    average > 0
      ? standardDeviation /
        average
      : 1;

  return {
    regular:
      coefficient <=
        0.15 &&
      average <=
        15_000,

    averageIntervalMs:
      Math.round(
        average,
      ),
  };
}


/* =========================================================
   COMMAND ANALYSIS
========================================================= */

function isCommandLike(
  text: string,
  command?: string,
): boolean {
  if (
    command &&
    command.trim()
  ) {
    return true;
  }

  const value =
    text.trim();

  if (!value) {
    return false;
  }

  /*
   * Common bot-command prefixes.
   */
  if (
    /^[.!/#$]/.test(
      value,
    )
  ) {
    return true;
  }

  /*
   * Slash-style commands.
   */
  return /^\/[a-z0-9_-]+(?:\s|$)/i.test(
    value,
  );
}


/* =========================================================
   AUTOMATION SIGNALS
========================================================= */

function detectAutomationSignals(
  text: string,
): string[] {
  const lower =
    text.toLowerCase();

  const signals:
    string[] =
    [];

  if (
    lower.includes(
      "click here",
    )
  ) {
    signals.push(
      "AUTOMATION_LANGUAGE",
    );
  }

  if (
    lower.includes(
      "tap here",
    )
  ) {
    signals.push(
      "AUTOMATION_LANGUAGE",
    );
  }

  if (
    lower.includes(
      "reply with",
    )
  ) {
    signals.push(
      "AUTOMATION_LANGUAGE",
    );
  }

  if (
    lower.includes(
      "send this message",
    )
  ) {
    signals.push(
      "AUTOMATION_LANGUAGE",
    );
  }

  if (
    lower.includes(
      "forward this",
    )
  ) {
    signals.push(
      "FORWARDING_LANGUAGE",
    );
  }

  return normalizeIndicators(
    signals,
  );
}


/* =========================================================
   LIVE CLEANUP
========================================================= */

function cleanupLiveActivity(
  now = Date.now(),
): void {
  for (
    const [
      key,
      profile,
    ] of liveActivity
  ) {
    if (
      now -
        profile.lastSeen >
      PROFILE_EXPIRY_MS
    ) {
      liveActivity.delete(
        key,
      );
    }
  }

  if (
    liveActivity.size <=
    MAX_PROFILES
  ) {
    return;
  }

  const removeCount =
    liveActivity.size -
    MAX_PROFILES;

  const oldest =
    [
      ...liveActivity.entries(),
    ]
      .sort(
        (
          a,
          b,
        ) =>
          a[1].lastSeen -
          b[1].lastSeen,
      )
      .slice(
        0,
        removeCount,
      );

  for (
    const [
      key,
    ] of oldest
  ) {
    liveActivity.delete(
      key,
    );
  }
}


/* =========================================================
   HISTORICAL CLEANUP
========================================================= */

function cleanupHistoricalActivity(
  now = Date.now(),
): void {
  for (
    const [
      context,
      store,
    ] of historicalActivity
  ) {
    for (
      const [
        key,
        profile,
      ] of store
    ) {
      if (
        now -
          profile.lastSeen >
        PROFILE_EXPIRY_MS
      ) {
        store.delete(
          key,
        );
      }
    }

    if (
      store.size ===
      0
    ) {
      historicalActivity.delete(
        context,
      );
    }
  }
}


/* =========================================================
   MAIN DETECTOR
========================================================= */

export async function detectVxMessage(
  input: DetectMessageInput,
): Promise<VxDetectionResult> {
  const now =
    safeTimestamp(
      input.timestamp,
    );

  const historical =
    input.createIncident ===
    false;

  const text =
    normalizeText(
      input.text,
    );

  const command =
    normalizeCommand(
      input.command,
    );

  const actor =
    input.actor;

  const group =
    input.group;

  const key =
    createProfileKey(
      group,
      actor,
    );

  const context =
    historical
      ? normalizeContext(
          input.analysisContext,
        )
      : LIVE_CONTEXT;

  const profile =
    historical
      ? getHistoricalProfile(
          context,
          key,
          now,
        )
      : getLiveProfile(
          key,
          now,
        );

  const urlAnalysis =
    analyzeUrls(
      text,
    );

  const hasLink =
    Boolean(
      input.hasLink ||
        urlAnalysis.hasLink,
    );

  /*
   * Empty messages receive a unique hash so multiple
   * empty events cannot all appear to be identical.
   */
  const textHash =
    text.length > 0
      ? hashText(
          text,
        )
      : `empty-${now}-${hasLink ? "link" : "message"}`;

  const entry:
    ActivityEntry = {
    timestamp:
      now,

    textHash,

    hasLink,

    command,
  };

  profile.entries.push(
    entry,
  );

  pruneProfile(
    profile,
    now,
  );

  if (
    historical
  ) {
    /*
     * Historical cleanup is deliberately separate
     * from live cleanup.
     */
    cleanupHistoricalActivity(
      now,
    );
  } else {
    cleanupLiveActivity(
      now,
    );
  }

  const entries =
    profile.entries;

  const frequency =
    analyzeFrequency(
      entries,
    );

  const repetition =
    analyzeRepetition(
      entries,
    );

  const timing =
    analyzeTiming(
      entries,
    );

  /*
   * Count actual command fields.
   */
  const storedCommandCount =
    entries.filter(
      item =>
        Boolean(
          item.command,
        ),
    ).length;

  const currentCommandLike =
    isCommandLike(
      text,
      command,
    );

  const commandLikeMessages =
    storedCommandCount +
    (
      currentCommandLike &&
      !command
        ? 1
        : 0
    );

  const automationSignals =
    detectAutomationSignals(
      text,
    );

  const indicators:
    string[] =
    [];

  const factors:
    ReturnType<
      typeof createRiskFactor
    >[] =
    [];


/* =========================================================
   FREQUENCY
========================================================= */

  if (
    frequency.messages >=
    12
  ) {
    indicators.push(
      "HIGH_MESSAGE_FREQUENCY",
    );

    factors.push(
      createRiskFactor(
        "message-frequency",
        20,
        `${frequency.messages} messages observed in the rolling window.`,
      ),
    );
  }

  if (
    frequency.messagesPerMinute >=
    15
  ) {
    indicators.push(
      "HIGH_MESSAGES_PER_MINUTE",
    );

    factors.push(
      createRiskFactor(
        "message-rate",
        25,
        `Observed rate approximately ${frequency.messagesPerMinute.toFixed(
          1,
        )} messages/minute.`,
      ),
    );
  }


/* =========================================================
   BURST
========================================================= */

  if (
    frequency.burst
  ) {
    indicators.push(
      "MESSAGE_BURST",
    );

    factors.push(
      createRiskFactor(
        "burst-behavior",
        18,
        "Five or more messages were observed within a ten-second interval.",
      ),
    );
  }


/* =========================================================
   REPETITION
========================================================= */

  if (
    repetition.ratio >=
      0.5 &&
    repetition.repeated >=
      4
  ) {
    indicators.push(
      "REPEATED_MESSAGES",
    );

    factors.push(
      createRiskFactor(
        "message-repetition",
        22,
        `${repetition.repeated} messages matched previously observed message content.`,
      ),
    );
  }


/* =========================================================
   COMMAND-LIKE ACTIVITY
========================================================= */

  if (
    commandLikeMessages >=
    5
  ) {
    indicators.push(
      "COMMAND_LIKE_ACTIVITY",
    );

    factors.push(
      createRiskFactor(
        "command-pattern",
        14,
        `${commandLikeMessages} command-like messages observed.`,
      ),
    );
  }


/* =========================================================
   LINKS
========================================================= */

  if (
    hasLink
  ) {
    indicators.push(
      "LINK_ACTIVITY",
    );

    factors.push(
      createRiskFactor(
        "link-activity",
        8,
        "The actor has sent a message containing a URL.",
      ),
    );
  }


/* =========================================================
   URL CHARACTERISTICS
========================================================= */

  if (
    urlAnalysis.suspicious
  ) {
    indicators.push(
      ...urlAnalysis.indicators,
    );

    factors.push(
      createRiskFactor(
        "suspicious-url",
        30,
        "The URL contains observable characteristics that increase security risk.",
      ),
    );
  }


/* =========================================================
   AUTOMATION LANGUAGE
========================================================= */

  if (
    automationSignals.length >
    0
  ) {
    indicators.push(
      ...automationSignals,
    );

    factors.push(
      createRiskFactor(
        "automation-language",
        10,
        "The message contains language commonly associated with automated interaction.",
      ),
    );
  }


/* =========================================================
   REGULAR TIMING
========================================================= */

  if (
    timing.regular
  ) {
    indicators.push(
      "REGULAR_MESSAGE_TIMING",
    );

    factors.push(
      createRiskFactor(
        "regular-timing",
        18,
        `Messages show unusually regular timing with an average interval of ${timing.averageIntervalMs}ms.`,
      ),
    );
  }


/* =========================================================
   MESSAGE SIZE
========================================================= */

  if (
    text.length >=
    8_000
  ) {
    indicators.push(
      "OVERSIZED_MESSAGE",
    );

    factors.push(
      createRiskFactor(
        "message-size",
        10,
        `Message length is approximately ${text.length} characters.`,
      ),
    );
  }


/* =========================================================
   EVIDENCE CATEGORIES
========================================================= */

  const categories =
    new Set<string>();

  if (
    frequency.messages >=
      12 ||
    frequency.messagesPerMinute >=
      15
  ) {
    categories.add(
      "frequency",
    );
  }

  if (
    frequency.burst
  ) {
    categories.add(
      "burst",
    );
  }

  if (
    repetition.ratio >=
    0.5
  ) {
    categories.add(
      "repetition",
    );
  }

  if (
    commandLikeMessages >=
    5
  ) {
    categories.add(
      "command",
    );
  }

  if (
    urlAnalysis.suspicious
  ) {
    categories.add(
      "url",
    );
  }

  if (
    automationSignals.length >
    0
  ) {
    categories.add(
      "automation",
    );
  }

  if (
    timing.regular
  ) {
    categories.add(
      "timing",
    );
  }

  if (
    text.length >=
    8_000
  ) {
    categories.add(
      "size",
    );
  }


/* =========================================================
   CONFIDENCE
========================================================= */

  let confidence =
    25;

  if (
    categories.size >=
    1
  ) {
    confidence =
      55;
  }

  if (
    categories.size >=
    2
  ) {
    confidence =
      70;
  }

  if (
    categories.size >=
    3
  ) {
    confidence =
      82;
  }

  if (
    categories.size >=
    4
  ) {
    confidence =
      90;
  }

  /*
   * Small histories cannot produce very high confidence.
   */
  if (
    entries.length <
    5
  ) {
    confidence =
      Math.min(
        confidence,
        45,
      );
  }


/* =========================================================
   SUSPICIOUS DECISION
========================================================= */

  const suspicious =
    factors.length >
      0 &&
    (
      categories.size >=
        2 ||
      urlAnalysis.suspicious ||
      frequency.messagesPerMinute >=
        20 ||
      repetition.ratio >=
        0.7
    );

  const finalIndicators =
    normalizeIndicators(
      indicators,
    );


/* =========================================================
   CENTRAL VX ENGINE
========================================================= */

  let event:
    | VxEvent
    | undefined;

  try {
    event =
      await analyzeVxEvent({
        type:
          "BOT",

        group,

        actor,

        text,

        command,

        indicators:
          finalIndicators,

        factors,

        confidence,

        /*
         * Historical scans NEVER create incidents.
         *
         * Live detections create incidents only when
         * the detector has actually classified the event
         * as suspicious.
         */
        createIncident:
          !historical &&
          suspicious,

        metadata: {
          detector:
            "VX-DETECTOR",

          historical,

          analysisContext:
            historical
              ? context
              : undefined,

          messagesObserved:
            entries.length,

          messagesPerMinute:
            frequency.messagesPerMinute,

          repeatedMessages:
            repetition.repeated,

          repetitionRatio:
            repetition.ratio,

          commandLikeMessages,

          regularTiming:
            timing.regular,

          averageIntervalMs:
            timing.averageIntervalMs,

          linkDetected:
            hasLink,

          suspiciousUrl:
            urlAnalysis.suspicious,

          evidenceCategories:
            categories.size,
        },
      });
  } catch (error) {
    /*
     * Detection must remain available even if a
     * downstream engine/logging/incident operation fails.
     */
    console.error(
      "[VX] Detector engine error:",
      error,
    );
  }


/* =========================================================
   FINAL RISK
========================================================= */

  /*
   * The central engine is authoritative when it
   * returned a risk result.
   *
   * Local calculation is retained only as a fallback.
   */
  let risk =
    0;

  if (
    event?.risk
  ) {
    risk =
      safeScore(
        event.risk.score,
      );

    /*
     * The engine may normalize confidence based on
     * evidence quality. Use that authoritative value
     * when available.
     */
    confidence =
      safeScore(
        event.risk.confidence,
      );
  } else {
    for (
      const factor of factors
    ) {
      const factorScore =
        safeScore(
          factor.score,
        );

      /*
       * Keep the fallback bounded and non-negative.
       */
      const contribution =
        factorScore *
        Math.max(
          0,
          1 -
            risk /
              140,
        );

      risk +=
        contribution;

      if (
        risk >=
        100
      ) {
        risk =
          100;

        break;
      }
    }

    risk =
      safeScore(
        risk,
      );
  }


/* =========================================================
   RETURN
========================================================= */

  return {
    suspicious,

    risk,

    confidence:

      Math.round(
        Math.max(
          0,
          Math.min(
            100,
            confidence,
          ),
        ),
      ),

    indicators:
      finalIndicators,

    factors,

    event,
  };
}


/* =========================================================
   HISTORICAL CLEANUP
========================================================= */

/**
 * Clear one historical scan context.
 *
 * If no context is supplied, all historical detector
 * state is cleared.
 */
export function clearVxHistoricalActivity(
  analysisContext?: string,
): void {
  if (
    !analysisContext
  ) {
    historicalActivity.clear();

    return;
  }

  historicalActivity.delete(
    normalizeContext(
      analysisContext,
    ),
  );
}


/**
 * Remove expired historical profiles.
 */
export function cleanupVxHistoricalActivity(
  analysisContext?: string,
  now = Date.now(),
): void {
  const contexts =
    analysisContext
      ? [
          normalizeContext(
            analysisContext,
          ),
        ]
      : [
          ...historicalActivity.keys(),
        ];

  for (
    const context of contexts
  ) {
    const store =
      historicalActivity.get(
        context,
      );

    if (!store) {
      continue;
    }

    for (
      const [
        key,
        profile,
      ] of store
    ) {
      if (
        now -
          profile.lastSeen >
        PROFILE_EXPIRY_MS
      ) {
        store.delete(
          key,
        );
      }
    }

    if (
      store.size ===
      0
    ) {
      historicalActivity.delete(
        context,
      );
    }
  }
}


/* =========================================================
   LIVE CLEANUP
========================================================= */

export function cleanupVxActivity(
  now = Date.now(),
): void {
  cleanupLiveActivity(
    now,
  );
}


/* =========================================================
   LIVE PROFILE ACCESS
========================================================= */

export function getVxDetectorProfile(
  group: VxGroupContext,
  actor: VxActor,
): {
  entries: ActivityEntry[];
  lastSeen: number;
} | null {
  const key =
    createProfileKey(
      group,
      actor,
    );

  const profile =
    liveActivity.get(
      key,
    );

  if (!profile) {
    return null;
  }

  /*
   * Return copies so callers cannot mutate internal
   * detector state.
   */
  return {
    entries:
      profile.entries.map(
        entry => ({
          ...entry,
        }),
      ),

    lastSeen:
      profile.lastSeen,
  };
}


/* =========================================================
   CLEAR LIVE PROFILE
========================================================= */

export function clearVxDetectorProfile(
  group: VxGroupContext,
  actor: VxActor,
): boolean {
  const key =
    createProfileKey(
      group,
      actor,
    );

  return liveActivity.delete(
    key,
  );
}


/* =========================================================
   CLEAR ALL LIVE PROFILES
========================================================= */

export function clearVxDetectorProfiles(): void {
  liveActivity.clear();
}


/* =========================================================
   DIAGNOSTICS
========================================================= */

export function getVxDetectorDiagnostics(): {
  liveProfiles: number;
  historicalContexts: number;
  historicalProfiles: number;
} {
  let historicalProfiles =
    0;

  for (
    const store of
      historicalActivity.values()
  ) {
    historicalProfiles +=
      store.size;
  }

  return {
    liveProfiles:
      liveActivity.size,

    historicalContexts:
      historicalActivity.size,

    historicalProfiles,
  };
}
/* =========================================================
   🌑 DARK VORTEX — VX SECURITY REPORTS

   ⚡ Security / Bot / Scan / Monitor Reports
   ⚡ Powered by Vortex Tech

   Responsibilities:
   - Format VX bot intelligence
   - Format VX incidents
   - Format VX scan results
   - Format VX scan findings
   - Format VX monitor sessions
   - Keep presentation separate from detection logic
   - Sanitize report output
   - Prevent sensitive values from leaking
   - Preserve accurate severity/risk information
   - Remain compatible with existing VX modules
========================================================= */

import type {
  VxIncident,
  VxSeverity,
  VxAction,
} from "./vx-types.js";

import type {
  VxBotProfile,
} from "./vx-bot.js";

/* =========================================================
   CONSTANTS
========================================================= */

const FOOTER = "⚡ Powered by Vortex Tech";

const MAX_NAME_LENGTH = 80;
const MAX_REASON_LENGTH = 240;
const MAX_ID_LENGTH = 100;
const MAX_GROUP_LENGTH = 80;
const MAX_INDICATORS = 10;
const MAX_INDICATOR_LENGTH = 140;
const MAX_ACTIONS = 10;
const MAX_REPORT_LINES = 120;

/* =========================================================
   SEVERITY
========================================================= */

const SEVERITY_RANK: Record<VxSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function severityIcon(
  severity: VxSeverity,
): string {
  switch (severity) {
    case "CRITICAL":
      return "🔴";

    case "HIGH":
      return "🟠";

    case "MEDIUM":
      return "🟡";

    case "LOW":
    default:
      return "🟢";
  }
}

function severityFromRisk(
  risk: number,
): VxSeverity {
  if (risk >= 80) {
    return "CRITICAL";
  }

  if (risk >= 60) {
    return "HIGH";
  }

  if (risk >= 30) {
    return "MEDIUM";
  }

  return "LOW";
}

function normalizeSeverity(
  value: unknown,
  risk: number,
): VxSeverity {
  const normalized =
    String(value ?? "")
      .trim()
      .toUpperCase();

  if (
    normalized === "LOW" ||
    normalized === "MEDIUM" ||
    normalized === "HIGH" ||
    normalized === "CRITICAL"
  ) {
    return normalized;
  }

  return severityFromRisk(risk);
}

/* =========================================================
   SAFE VALUE HELPERS
========================================================= */

function containsSensitiveMaterial(
  value: string,
): boolean {
  return /finalkey|password|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret|bearer\s+[a-z0-9._-]+/i.test(
    value,
  );
}

function cleanText(
  value: unknown,
  maxLength = 200,
): string {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  let text = String(value)
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "";
  }

  if (
    containsSensitiveMaterial(text)
  ) {
    return "[REDACTED]";
  }

  if (
    text.length >
    maxLength
  ) {
    text =
      `${text.slice(
        0,
        Math.max(
          1,
          maxLength - 1,
        ),
      )}…`;
  }

  return text;
}

function safeId(
  value: unknown,
): string {
  const cleaned =
    cleanText(
      value,
      MAX_ID_LENGTH,
    );

  return cleaned || "Unknown";
}

function formatNumber(
  value: unknown,
): string {
  const number = Number(value);

  const safe =
    Number.isFinite(number)
      ? Math.max(
          0,
          Math.round(number),
        )
      : 0;

  return safe.toLocaleString(
    "en-US",
  );
}

function safeName(
  name?: string,
): string {
  return (
    cleanText(
      name,
      MAX_NAME_LENGTH,
    ) ||
    "Unknown"
  );
}

function safePhone(
  phone?: string,
): string {
  if (!phone) {
    return "Unknown";
  }

  const normalized =
    String(phone)
      .replace(
        /@.*$/,
        "",
      )
      .replace(
        /:\d+$/,
        "",
      )
      .replace(
        /\D/g,
        "",
      );

  if (!normalized) {
    return "Unknown";
  }

  return `+${normalized}`;
}

function safeJid(
  jid?: string,
): string {
  if (!jid) {
    return "Unknown";
  }

  const normalized =
    String(jid)
      .trim()
      .toLowerCase();

  if (
    !normalized ||
    containsSensitiveMaterial(
      normalized,
    )
  ) {
    return "[REDACTED]";
  }

  return cleanText(
    normalized,
    MAX_ID_LENGTH,
  ) || "Unknown";
}

function safeGroupName(
  name?: string,
): string {
  return (
    cleanText(
      name,
      MAX_GROUP_LENGTH,
    ) ||
    "Unknown"
  );
}

function safeReason(
  reason?: string,
): string {
  return (
    cleanText(
      reason,
      MAX_REASON_LENGTH,
    ) ||
    "No reason provided"
  );
}

function safeRisk(
  value: unknown,
): number {
  const number = Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(number),
    ),
  );
}

function safePercentage(
  value: unknown,
): number {
  return safeRisk(value);
}

function safeCount(
  value: unknown,
): number {
  const number = Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(number),
  );
}

function safeRate(
  value: unknown,
): string {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return "0.0";
  }

  return Math.min(
    1000000,
    number,
  ).toFixed(1);
}

/* =========================================================
   INDICATORS
========================================================= */

function formatIndicators(
  indicators:
    | unknown[]
    | undefined,
  emptyText =
    "No behavioral indicators recorded",
): string[] {
  if (
    !Array.isArray(
      indicators,
    )
  ) {
    return [
      `┃ • ${emptyText}`,
    ];
  }

  const seen =
    new Set<string>();

  const cleaned:
    string[] = [];

  for (
    const indicator of indicators
  ) {
    const value =
      cleanText(
        indicator,
        MAX_INDICATOR_LENGTH,
      );

    if (
      !value ||
      value === "[REDACTED]"
    ) {
      continue;
    }

    const key =
      value.toLowerCase();

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    cleaned.push(value);

    if (
      cleaned.length >=
      MAX_INDICATORS
    ) {
      break;
    }
  }

  if (
    cleaned.length === 0
  ) {
    return [
      `┃ • ${emptyText}`,
    ];
  }

  return cleaned.map(
    indicator =>
      `┃ • ${indicator}`,
  );
}

/* =========================================================
   ACTIONS
========================================================= */

function formatActions(
  actions:
    | VxAction[]
    | undefined,
): string[] {
  if (
    !Array.isArray(actions) ||
    actions.length === 0
  ) {
    return [
      "┃ • NONE",
    ];
  }

  const seen =
    new Set<string>();

  const output:
    string[] = [];

  for (
    const action of actions
  ) {
    const value =
      cleanText(
        action,
        50,
      );

    if (
      !value ||
      value === "[REDACTED]"
    ) {
      continue;
    }

    const key =
      value.toUpperCase();

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    output.push(
      `┃ • ${value}`,
    );

    if (
      output.length >=
      MAX_ACTIONS
    ) {
      break;
    }
  }

  return output.length
    ? output
    : ["┃ • NONE"];
}

/* =========================================================
   REPORT LINE SAFETY
========================================================= */

function limitReportLines(
  lines: string[],
): string[] {
  if (
    lines.length <=
    MAX_REPORT_LINES
  ) {
    return lines;
  }

  return [
    ...lines.slice(
      0,
      MAX_REPORT_LINES - 2,
    ),
    "┃",
    "┃ • Report output truncated for safety.",
  ];
}

function finalizeReport(
  lines: string[],
): string {
  const sanitized =
    lines
      .map(line =>
        cleanText(
          line,
          1000,
        ),
      )
      .filter(Boolean);

  return limitReportLines(
    sanitized,
  ).join("\n");
}

/* =========================================================
   DATE
========================================================= */

function formatDate(
  timestamp?: number,
): string {
  if (
    timestamp === undefined ||
    timestamp === null ||
    !Number.isFinite(
      Number(timestamp),
    ) ||
    Number(timestamp) <= 0
  ) {
    return "Unknown";
  }

  try {
    const date =
      new Date(
        Number(timestamp),
      );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return "Unknown";
    }

    return date.toLocaleString(
      "en-US",
      {
        dateStyle: "medium",
        timeStyle: "short",
      },
    );
  } catch {
    return "Unknown";
  }
}

/* =========================================================
   VX BOT REPORT
========================================================= */

export function formatVxBotReport(
  profile: VxBotProfile,
  groupName?: string,
  incident?: VxIncident,
): string {
  const risk =
    safeRisk(
      profile.riskScore,
    );

  const confidence =
    safePercentage(
      profile.confidence,
    );

  const severity =
    normalizeSeverity(
      profile.severity,
      risk,
    );

  const indicators =
    formatIndicators(
      profile.indicators,
      "No behavioral indicators recorded",
    );

  const detectionLabel =
    severity === "CRITICAL"
      ? "🚨 CRITICAL BOT-LIKE BEHAVIOR"
      : severity === "HIGH"
        ? "🚨 HIGH-RISK BOT-LIKE BEHAVIOR"
        : severity === "MEDIUM"
          ? "⚠️ MODERATE BOT-LIKE BEHAVIOR"
          : "🟢 LOW-RISK BOT-LIKE ACTIVITY";

  const incidentLine =
    incident
      ? `┃ 🆔 Incident: ${safeId(
          incident.id,
        )}`
      : "";

  const lines = [
    "╭━━━〔 🤖 VX BOT INTELLIGENCE 〕━━━╮",
    "┃",
    `┃ ${detectionLabel}`,
    "┃",
    `┃ 👤 Name: ${safeName(
      profile.name,
    )}`,
    `┃ 📱 Number: ${safePhone(
      profile.phoneNumber,
    )}`,
    "┃",
    `┃ 🎯 Confidence: ${confidence}%`,
    `┃ ⚠️ Risk: ${risk}/100`,
    `┃ ${severityIcon(
      severity,
    )} Severity: ${severity}`,
    "┃",
    `┃ 📍 Group: ${safeGroupName(
      groupName,
    )}`,
    incidentLine,
    "┃",
    "┃ 📊 BEHAVIOR",
    `┃ 📨 Messages: ${formatNumber(
      profile.messageCount,
    )}`,
    `┃ ⚡ Commands: ${formatNumber(
      profile.commandCount,
    )}`,
    `┃ 🔗 Links: ${formatNumber(
      profile.linkCount,
    )}`,
    `┃ 🔁 Repeated: ${formatNumber(
      profile.repeatedMessageCount,
    )}`,
    `┃ 👥 Groups: ${formatNumber(
      profile.groupsSeen,
    )}`,
    `┃ ⏱️ Activity: ${safeRate(
      profile.averageMessagesPerMinute,
    )}/min`,
    "┃",
    "┃ 🔎 INDICATORS",
    ...indicators,
    "┃",
    "┃ 🛡️ VX STATUS",
    "┃ ✓ Threat profile recorded",
    "┃ ✓ Behavioral intelligence updated",
    incident
      ? "┃ ✓ Security incident linked"
      : "┃ ✓ Activity recorded",
    "┃ ✓ Continued monitoring supported",
    "┃",
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
    FOOTER,
  ];

  return finalizeReport(
    lines,
  );
}

/* =========================================================
   VX INCIDENT REPORT
========================================================= */

export function formatVxIncidentReport(
  incident: VxIncident,
): string {
  const risk =
    safeRisk(
      incident.riskScore,
    );

  const confidence =
    safePercentage(
      incident.confidence,
    );

  const severity =
    normalizeSeverity(
      incident.severity,
      risk,
    );

  const indicators =
    formatIndicators(
      incident.indicators,
      "No additional indicators",
    );

  const actions =
    formatActions(
      incident.actions,
    );

  const eventCount =
    Array.isArray(
      incident.eventIds,
    )
      ? incident.eventIds.length
      : 0;

  const lines = [
    "╭━━━〔 🛡️ VX SECURITY INCIDENT 〕━━━╮",
    "┃",
    `┃ ${severityIcon(
      severity,
    )} ${severity} INCIDENT`,
    "┃",
    `┃ 🆔 ID: ${safeId(
      incident.id,
    )}`,
    `┃ 📌 Type: ${
      cleanText(
        incident.type,
        60,
      ) || "UNKNOWN"
    }`,
    `┃ 📍 Group: ${safeGroupName(
      incident.group?.name,
    )}`,
    `┃ 👤 Name: ${safeName(
      incident.actor?.name,
    )}`,
    `┃ 📱 Number: ${safePhone(
      incident.actor?.phoneNumber,
    )}`,
    "┃",
    `┃ ⚠️ Risk: ${risk}/100`,
    `┃ 🎯 Confidence: ${confidence}%`,
    `┃ 📊 Status: ${
      cleanText(
        incident.status,
        40,
      ) || "UNKNOWN"
    }`,
    "┃",
    `┃ 📝 ${safeReason(
      incident.reason,
    )}`,
    "┃",
    "┃ 🔎 INDICATORS",
    ...indicators,
    "┃",
    "┃ 🛡️ ACTIONS",
    ...actions,
    "┃",
    "┃ 📚 EVENT HISTORY",
    `┃ Events linked: ${formatNumber(
      eventCount,
    )}`,
    `┃ Created: ${formatDate(
      incident.createdAt,
    )}`,
    `┃ Updated: ${formatDate(
      incident.updatedAt,
    )}`,
    incident.resolvedAt
      ? `┃ Resolved: ${formatDate(
          incident.resolvedAt,
        )}`
      : "",
    "┃",
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
    FOOTER,
  ];

  return finalizeReport(
    lines,
  );
}

/* =========================================================
   VX SCAN REPORT
========================================================= */

export interface VxScanReportInput {
  scanId?: string;
  id?: string;

  group: {
    name?: string;
    jid: string;
  };

  participantsScanned: number;

  messagesAnalyzed?: number;
  suspiciousCount?: number;

  eventsAnalyzed?: number;
  threatsDetected?: number;

  highRiskCount?: number;
  criticalRiskCount?: number;

  incidentsCreated?: number;

  highestRisk: number;

  completed?: boolean;
  completedAt?: number;
  aborted: boolean;

  findings?: unknown[];
}

export function formatVxScanReport(
  result: VxScanReportInput,
): string {
  const scanId =
    safeId(
      result.scanId ||
        result.id,
    );

  const eventsAnalyzed =
    safeCount(
      result.messagesAnalyzed ??
        result.eventsAnalyzed ??
        0,
    );

  const threatsDetected =
    safeCount(
      result.suspiciousCount ??
        result.threatsDetected ??
        0,
    );

  const incidentsCreated =
    safeCount(
      result.incidentsCreated ??
        0,
    );

  const completed =
    result.completed ??
    !result.aborted;

  const highestRisk =
    safeRisk(
      result.highestRisk,
    );

  const riskSeverity =
    severityFromRisk(
      highestRisk,
    );

  const highRisk =
    safeCount(
      result.highRiskCount,
    );

  const criticalRisk =
    safeCount(
      result.criticalRiskCount,
    );

  const findingsCount =
    Array.isArray(
      result.findings,
    )
      ? result.findings.length
      : 0;

  const status =
    result.aborted
      ? "🛑 SCAN ABORTED"
      : completed
        ? "✅ SCAN COMPLETED"
        : "⚙️ SCAN IN PROGRESS";

  const lines = [
    "╭━━━〔 🔎 VX SECURITY SCAN 〕━━━╮",
    "┃",
    `┃ ${status}`,
    "┃",
    `┃ 🆔 Scan: ${scanId}`,
    `┃ 📍 Group: ${safeGroupName(
      result.group?.name,
    )}`,
    "┃",
    `┃ 👥 Participants: ${formatNumber(
      result.participantsScanned,
    )}`,
    `┃ 🧠 Events analyzed: ${formatNumber(
      eventsAnalyzed,
    )}`,
    `┃ 🚨 Suspicious activity: ${formatNumber(
      threatsDetected,
    )}`,
    `┃ 🔎 Findings: ${formatNumber(
      findingsCount,
    )}`,
    `┃ 🟠 High risk: ${formatNumber(
      highRisk,
    )}`,
    `┃ 🔴 Critical risk: ${formatNumber(
      criticalRisk,
    )}`,
    `┃ 🛡️ Incidents: ${formatNumber(
      incidentsCreated,
    )}`,
    "┃",
    `┃ ⚠️ Highest risk: ${highestRisk}/100`,
    `┃ ${severityIcon(
      riskSeverity,
    )} Severity: ${riskSeverity}`,
    result.completedAt
      ? `┃ 🕐 Completed: ${formatDate(
          result.completedAt,
        )}`
      : "",
    "┃",
    completed
      ? "┃ ✓ Scan data finalized"
      : result.aborted
        ? "┃ ✓ Scan safely terminated"
        : "┃ ⏳ Scan is still running",
    "┃",
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
    FOOTER,
  ];

  return finalizeReport(
    lines,
  );
}

/* =========================================================
   VX MONITOR REPORT
========================================================= */

export interface VxMonitorReportInput {
  id: string;
  groupName?: string;
  eventsProcessed: number;
  threatsDetected: number;
  incidentsCreated: number;
  active: boolean;
}

export function formatVxMonitorReport(
  monitor: VxMonitorReportInput,
): string {
  const state =
    monitor.active
      ? "🟢 LIVE MONITORING"
      : "🔴 MONITOR OFFLINE";

  const events =
    safeCount(
      monitor.eventsProcessed,
    );

  const threats =
    safeCount(
      monitor.threatsDetected,
    );

  const incidents =
    safeCount(
      monitor.incidentsCreated,
    );

  const lines = [
    "╭━━━〔 👁️ VX MONITOR 〕━━━╮",
    "┃",
    `┃ ${state}`,
    "┃",
    `┃ 🆔 Session: ${safeId(
      monitor.id,
    )}`,
    `┃ 📍 Group: ${safeGroupName(
      monitor.groupName,
    )}`,
    "┃",
    `┃ 📨 Events: ${formatNumber(
      events,
    )}`,
    `┃ 🚨 Threats: ${formatNumber(
      threats,
    )}`,
    `┃ 🛡️ Incidents: ${formatNumber(
      incidents,
    )}`,
    "┃",
    "┃ 🤖 Bot Intelligence • ACTIVE",
    "┃ 📨 Behavioral Analysis • ACTIVE",
    "┃ 🔗 Link Analysis • ACTIVE",
    "┃ 👥 Activity Analysis • ACTIVE",
    "┃ 📜 Audit Logging • ACTIVE",
    "┃",
    monitor.active
      ? "┃ 👁️ VX IS MONITORING LIVE ACTIVITY."
      : "┃ 🛑 VX IS NOT MONITORING THIS SESSION.",
    "┃",
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
    FOOTER,
  ];

  return finalizeReport(
    lines,
  );
}

/* =========================================================
   VX SCAN FINDING REPORT
========================================================= */

export interface VxScanFindingReportInput {
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

export function formatVxScanFindingReport(
  finding: VxScanFindingReportInput,
): string {
  const risk =
    safeRisk(
      finding.riskScore,
    );

  const confidence =
    safePercentage(
      finding.confidence,
    );

  const severity =
    normalizeSeverity(
      finding.severity,
      risk,
    );

  const indicators =
    formatIndicators(
      finding.indicators,
      "No additional indicators",
    );

  const lines = [
    "╭━━━〔 🔎 VX SCAN FINDING 〕━━━╮",
    "┃",
    `┃ ${severityIcon(
      severity,
    )} ${severity} FINDING`,
    "┃",
    `┃ 👤 Name: ${safeName(
      finding.name,
    )}`,
    `┃ 📱 JID: ${safeJid(
      finding.jid,
    )}`,
    "┃",
    `┃ ⚠️ Risk: ${risk}/100`,
    `┃ 🎯 Confidence: ${confidence}%`,
    "┃",
    "┃ 📊 ACTIVITY",
    `┃ 📨 Messages: ${formatNumber(
      finding.messagesAnalyzed,
    )}`,
    `┃ ⚡ Commands: ${formatNumber(
      finding.commands,
    )}`,
    `┃ 🔗 Links: ${formatNumber(
      finding.links,
    )}`,
    `┃ 🕐 First seen: ${formatDate(
      finding.firstSeen,
    )}`,
    `┃ 🕐 Last seen: ${formatDate(
      finding.lastSeen,
    )}`,
    "┃",
    "┃ 🔎 INDICATORS",
    ...indicators,
    "┃",
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
    FOOTER,
  ];

  return finalizeReport(
    lines,
  );
}
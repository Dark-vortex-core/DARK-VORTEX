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

const FOOTER =
  "╰─── ⚡ VORTEX TECH ───╯";

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
   REPORT HELPERS
========================================================= */

function reportHeader(
  title: string,
): string[] {
  return [
    "🌑 *DARK VORTEX*",
    "",
    `⚡ *${title}*`,
    "",
  ];
}

function reportSection(
  title: string,
): string {
  return `╭─「 ${title} 」`;
}

function reportSectionEnd(): string {
  return "╰────────────────────";
}

function reportLine(
  label: string,
  value: string | number,
): string {
  return `│ ${label.padEnd(14)}: ${value}`;
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

  const limited =
    limitReportLines(
      sanitized,
    );

  return [
    ...limited,
    "",
    FOOTER,
  ].join("\n");
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
      `│ • ${emptyText}`,
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
      `│ • ${emptyText}`,
    ];
  }

  return cleaned.map(
    indicator =>
      `│ • ${indicator}`,
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
      "│ • NONE",
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
      `│ • ${value}`,
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
    : ["│ • NONE"];
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
    "│",
    "│ • Report output truncated for safety.",
  ];
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
      ? "CRITICAL BOT-LIKE BEHAVIOR"
      : severity === "HIGH"
        ? "HIGH-RISK BOT-LIKE BEHAVIOR"
        : severity === "MEDIUM"
          ? "MODERATE BOT-LIKE BEHAVIOR"
          : "LOW-RISK BOT-LIKE ACTIVITY";

  const lines = [
    ...reportHeader(
      "VX BOT INTELLIGENCE",
    ),

    reportSection(
      "DETECTION",
    ),
    `│ ${severityIcon(
      severity,
    )} ${detectionLabel}`,
    `│ Risk          : ${risk}/100`,
    `│ Confidence    : ${confidence}%`,
    `│ Severity      : ${severity}`,
    reportSectionEnd(),

    "",
    reportSection(
      "TARGET",
    ),
    reportLine(
      "Name",
      safeName(
        profile.name,
      ),
    ),
    reportLine(
      "Number",
      safePhone(
        profile.phoneNumber,
      ),
    ),
    reportLine(
      "Group",
      safeGroupName(
        groupName,
      ),
    ),
    ...(incident
      ? [
          reportLine(
            "Incident",
            safeId(
              incident.id,
            ),
          ),
        ]
      : []),
    reportSectionEnd(),

    "",
    reportSection(
      "BEHAVIOR",
    ),
    reportLine(
      "Messages",
      formatNumber(
        profile.messageCount,
      ),
    ),
    reportLine(
      "Commands",
      formatNumber(
        profile.commandCount,
      ),
    ),
    reportLine(
      "Links",
      formatNumber(
        profile.linkCount,
      ),
    ),
    reportLine(
      "Repeated",
      formatNumber(
        profile.repeatedMessageCount,
      ),
    ),
    reportLine(
      "Groups Seen",
      formatNumber(
        profile.groupsSeen,
      ),
    ),
    reportLine(
      "Activity",
      `${safeRate(
        profile.averageMessagesPerMinute,
      )}/min`,
    ),
    reportSectionEnd(),

    "",
    reportSection(
      "INDICATORS",
    ),
    ...indicators,
    reportSectionEnd(),

    "",
    reportSection(
      "VX STATUS",
    ),
    "│ Threat profile recorded",
    "│ Behavioral intelligence updated",
    incident
      ? "│ Security incident linked"
      : "│ Activity recorded",
    "│ Continued monitoring supported",
    reportSectionEnd(),
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
    ...reportHeader(
      "VX SECURITY INCIDENT",
    ),

    reportSection(
      "THREAT",
    ),
    `│ ${severityIcon(
      severity,
    )} ${severity} INCIDENT`,
    `│ Risk          : ${risk}/100`,
    `│ Confidence    : ${confidence}%`,
    reportSectionEnd(),

    "",
    reportSection(
      "INCIDENT",
    ),
    reportLine(
      "ID",
      safeId(
        incident.id,
      ),
    ),
    reportLine(
      "Type",
      cleanText(
        incident.type,
        60,
      ) || "UNKNOWN",
    ),
    reportLine(
      "Status",
      cleanText(
        incident.status,
        40,
      ) || "UNKNOWN",
    ),
    reportLine(
      "Group",
      safeGroupName(
        incident.group?.name,
      ),
    ),
    reportLine(
      "Name",
      safeName(
        incident.actor?.name,
      ),
    ),
    reportLine(
      "Number",
      safePhone(
        incident.actor?.phoneNumber,
      ),
    ),
    reportSectionEnd(),

    "",
    reportSection(
      "REASON",
    ),
    `│ ${safeReason(
      incident.reason,
    )}`,
    reportSectionEnd(),

    "",
    reportSection(
      "INDICATORS",
    ),
    ...indicators,
    reportSectionEnd(),

    "",
    reportSection(
      "ACTIONS",
    ),
    ...actions,
    reportSectionEnd(),

    "",
    reportSection(
      "EVENT HISTORY",
    ),
    reportLine(
      "Events Linked",
      formatNumber(
        eventCount,
      ),
    ),
    reportLine(
      "Created",
      formatDate(
        incident.createdAt,
      ),
    ),
    reportLine(
      "Updated",
      formatDate(
        incident.updatedAt,
      ),
    ),
    ...(incident.resolvedAt
      ? [
          reportLine(
            "Resolved",
            formatDate(
              incident.resolvedAt,
            ),
          ),
        ]
      : []),
    reportSectionEnd(),
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
      ? "ABORTED"
      : completed
        ? "COMPLETE"
        : "IN PROGRESS";

  const lines = [
    ...reportHeader(
      "VX SECURITY SCAN",
    ),

    reportSection(
      "SCAN STATUS",
    ),
    `│ Status        : ${status}`,
    reportLine(
      "Scan",
      scanId,
    ),
    reportLine(
      "Group",
      safeGroupName(
        result.group?.name,
      ),
    ),
    reportSectionEnd(),

    "",
    reportSection(
      "ANALYSIS",
    ),
    reportLine(
      "Participants",
      formatNumber(
        result.participantsScanned,
      ),
    ),
    reportLine(
      "Events",
      formatNumber(
        eventsAnalyzed,
      ),
    ),
    reportLine(
      "Suspicious",
      formatNumber(
        threatsDetected,
      ),
    ),
    reportLine(
      "Findings",
      formatNumber(
        findingsCount,
      ),
    ),
    reportSectionEnd(),

    "",
    reportSection(
      "RISK",
    ),
    reportLine(
      "High Risk",
      formatNumber(
        highRisk,
      ),
    ),
    reportLine(
      "Critical",
      formatNumber(
        criticalRisk,
      ),
    ),
    reportLine(
      "Incidents",
      formatNumber(
        incidentsCreated,
      ),
    ),
    `│ Highest Risk  : ${highestRisk}/100`,
    `│ Severity      : ${severityIcon(
      riskSeverity,
    )} ${riskSeverity}`,
    reportSectionEnd(),

    ...(result.completedAt
      ? [
          "",
          reportSection(
            "TIMING",
          ),
          reportLine(
            "Completed",
            formatDate(
              result.completedAt,
            ),
          ),
          reportSectionEnd(),
        ]
      : []),

    "",
    reportSection(
      "VX RESULT",
    ),
    completed
      ? "│ Scan data finalized"
      : result.aborted
        ? "│ Scan safely terminated"
        : "│ Scan is still running",
    reportSectionEnd(),
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
      ? "LIVE"
      : "OFFLINE";

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
    ...reportHeader(
      "VX MONITOR",
    ),

    reportSection(
      "MONITOR STATUS",
    ),
    `│ Status        : ${state}`,
    reportLine(
      "Session",
      safeId(
        monitor.id,
      ),
    ),
    reportLine(
      "Group",
      safeGroupName(
        monitor.groupName,
      ),
    ),
    reportSectionEnd(),

    "",
    reportSection(
      "ACTIVITY",
    ),
    reportLine(
      "Events",
      formatNumber(
        events,
      ),
    ),
    reportLine(
      "Threats",
      formatNumber(
        threats,
      ),
    ),
    reportLine(
      "Incidents",
      formatNumber(
        incidents,
      ),
    ),
    reportSectionEnd(),

    "",
    reportSection(
      "VX ENGINES",
    ),
    "│ Bot Intelligence    : ACTIVE",
    "│ Behavioral Analysis : ACTIVE",
    "│ Link Analysis       : ACTIVE",
    "│ Activity Analysis   : ACTIVE",
    "│ Audit Logging       : ACTIVE",
    reportSectionEnd(),

    "",
    monitor.active
      ? "👁️ VX is monitoring live activity."
      : "🛑 VX is not monitoring this session.",
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
    ...reportHeader(
      "VX SCAN FINDING",
    ),

    reportSection(
      "THREAT",
    ),
    `│ ${severityIcon(
      severity,
    )} ${severity} FINDING`,
    `│ Risk          : ${risk}/100`,
    `│ Confidence    : ${confidence}%`,
    reportSectionEnd(),

    "",
    reportSection(
      "TARGET",
    ),
    reportLine(
      "Name",
      safeName(
        finding.name,
      ),
    ),
    reportLine(
      "JID",
      safeJid(
        finding.jid,
      ),
    ),
    reportSectionEnd(),

    "",
    reportSection(
      "ACTIVITY",
    ),
    reportLine(
      "Messages",
      formatNumber(
        finding.messagesAnalyzed,
      ),
    ),
    reportLine(
      "Commands",
      formatNumber(
        finding.commands,
      ),
    ),
    reportLine(
      "Links",
      formatNumber(
        finding.links,
      ),
    ),
    reportLine(
      "First Seen",
      formatDate(
        finding.firstSeen,
      ),
    ),
    reportLine(
      "Last Seen",
      formatDate(
        finding.lastSeen,
      ),
    ),
    reportSectionEnd(),

    "",
    reportSection(
      "INDICATORS",
    ),
    ...indicators,
    reportSectionEnd(),
  ];

  return finalizeReport(
    lines,
  );
}
/* =========================================================
   🌑 DARK VORTEX — PREMIUM WHATSAPP MESSAGE ENGINE
   ⚡ Powered by Vortex Tech

   RESPONSIBILITY:
   • Presentation / formatting only
   • Mobile-friendly WhatsApp UI
   • Safe dynamic text handling
   • Progress / operation presentation
   • Audit presentation helpers
   • Existing exports preserved

   IMPORTANT:
   This file does NOT own command execution, permissions,
   operation state, persistence, or security decisions.
========================================================= */

import {
  getCommands,
} from "../commands/registry.js";

import {
  getPrefix,
} from "../services/prefix.js";


/* =========================================================
   BRAND
========================================================= */

export const BRAND =
  "🌑 DARK VORTEX BOT";

export const POWERED_BY =
  "⚡ Powered by Vortex Tech";


/* =========================================================
   UI CONSTANTS
========================================================= */

const BOX_WIDTH = 30;

/*
 * WhatsApp messages can become extremely large when dynamic
 * logs/findings are inserted. Keep formatting bounded.
 *
 * This is intentionally conservative and does not attempt to
 * enforce an undocumented WhatsApp hard limit.
 */
const MAX_LINE_LENGTH = 180;
const MAX_BOX_LINES = 80;
const MAX_LIST_ITEMS = 60;


/* =========================================================
   SECRET / SENSITIVE DATA PROTECTION
========================================================= */

const SECRET_PATTERNS: RegExp[] = [
  /finalkey/gi,
  /final[\s_-]*key/gi,
  /password/gi,
  /passwd/gi,
  /secret/gi,
  /api[\s_-]*key/gi,
  /access[\s_-]*token/gi,
  /refresh[\s_-]*token/gi,
  /auth[\s_-]*token/gi,
  /session[\s_-]*token/gi,
  /bearer/gi,
  /private[\s_-]*key/gi,
  /client[\s_-]*secret/gi,
  /authorization/gi,
  /cookie/gi,
];

/*
 * Redact obvious key=value / token=value style secrets.
 * This is presentation-layer protection only.
 * Actual secret protection must also exist at the storage,
 * logging, configuration, and command layers.
 */
function redactSecrets(
  value: string
): string {

  let result = String(value);

  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(
      pattern,
      "[REDACTED]"
    );
  }

  result = result.replace(
    /([A-Za-z0-9_-]{12,})\s*[:=]\s*([^\s,;]+)/g,
    "$1=[REDACTED]"
  );

  result = result.replace(
    /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
    "Bearer [REDACTED]"
  );

  return result;
}


/* =========================================================
   SAFE TEXT HELPERS
========================================================= */

function cleanLine(
  line: unknown
): string {

  if (
    line === undefined ||
    line === null
  ) {
    return "";
  }

  return redactSecrets(
    String(line)
      .replace(/\r/g, "")
      .replace(/\n/g, " ")
      .trim()
  );
}


function visibleLength(
  text: string
): number {

  return [
    ...String(text)
  ].length;
}


function truncateText(
  text: string,
  maxLength = MAX_LINE_LENGTH
): string {

  const clean =
    cleanLine(text);

  if (
    visibleLength(clean) <=
    maxLength
  ) {
    return clean;
  }

  if (maxLength <= 1) {
    return clean.slice(
      0,
      Math.max(0, maxLength)
    );
  }

  return (
    [...clean]
      .slice(0, maxLength - 1)
      .join("") +
    "…"
  );
}


function normalizeLines(
  lines: unknown[] = []
): string[] {

  return lines
    .filter(
      (line) =>
        line !== undefined &&
        line !== null
    )
    .map(cleanLine)
    .map(
      (line) =>
        truncateText(line)
    )
    .filter(
      (line) =>
        line.length > 0
    )
    .slice(
      0,
      MAX_BOX_LINES
    );
}


function createBorder(
  length = BOX_WIDTH
): string {

  return "━".repeat(
    Math.max(
      1,
      length
    )
  );
}


function fitLine(
  text: unknown,
  width = BOX_WIDTH
): string {

  const clean =
    truncateText(
      String(text),
      width
    );

  const length =
    visibleLength(clean);

  if (length >= width) {
    return [
      ...clean
    ]
      .slice(0, width)
      .join("");
  }

  return (
    clean +
    " ".repeat(
      width - length
    )
  );
}


function centeredLine(
  text: unknown,
  width = BOX_WIDTH
): string {

  const clean =
    truncateText(
      String(text),
      width
    );

  const length =
    visibleLength(clean);

  if (length >= width) {
    return [
      ...clean
    ]
      .slice(0, width)
      .join("");
  }

  const total =
    width - length;

  const left =
    Math.floor(
      total / 2
    );

  const right =
    total - left;

  return (
    " ".repeat(left) +
    clean +
    " ".repeat(right)
  );
}


/* =========================================================
   VORTEX BOX ENGINE
========================================================= */

export function vortexBox(
  title: string,
  lines: string[] = []
): string {

  const cleanTitle =
    truncateText(
      title,
      BOX_WIDTH - 8
    );

  const safeLines =
    normalizeLines(lines);

  const titleText =
    `〔 ${cleanTitle} 〕`;

  const titleLength =
    visibleLength(titleText);

  const remaining =
    Math.max(
      2,
      BOX_WIDTH - titleLength
    );

  const top =
    `╭━━${titleText}${"━".repeat(
      remaining
    )}╮`;

  const body =
    safeLines.map(
      (line) =>
        `┃ ◈ ${line}`
    );

  return [
    top,
    "┃",
    ...body,
    "┃",
    `┃ ${POWERED_BY}`,
    `╰${createBorder()}╯`,
  ].join("\n");
}


/* =========================================================
   VORTEX HEADER
========================================================= */

export function vortexHeader(
  title: string,
  subtitle?: string
): string {

  const sub =
    subtitle ||
    "⚡ VORTEX CORE";

  return [
    `╭${createBorder()}╮`,
    `┃${centeredLine(
      "🌑 DARK VORTEX"
    )}┃`,
    `┃${centeredLine(
      sub
    )}┃`,
    `╰${createBorder()}╯`,
    "",
    `╭━━〔 ${cleanLine(
      title
    )} 〕━━╮`,
  ].join("\n");
}


/* =========================================================
   VORTEX SECTION
========================================================= */

export function vortexSection(
  title: string,
  lines: string[] = []
): string {

  const safeLines =
    normalizeLines(lines);

  return [
    `╭━━〔 ${truncateText(
      title,
      BOX_WIDTH - 8
    )} 〕━━╮`,
    "┃",
    ...safeLines.map(
      (line) =>
        `┃ ${line}`
    ),
    "┃",
    `╰${createBorder()}╯`,
  ].join("\n");
}


/* =========================================================
   VORTEX LIST
========================================================= */

export function vortexList(
  items: string[]
): string {

  return items
    .filter(
      (item) =>
        item !== undefined &&
        item !== null &&
        String(item).trim()
    )
    .slice(
      0,
      MAX_LIST_ITEMS
    )
    .map(
      (item) =>
        `┃ ◈ ${truncateText(
          String(item)
        )}`
    )
    .join("\n");
}


/* =========================================================
   VORTEX COMMAND
========================================================= */

export function vortexCommand(
  name: string,
  description?: string
): string {

  const prefix =
    getPrefix();

  const commandLine =
    `◈ ${prefix}${cleanLine(name)}`;

  if (!description) {
    return commandLine;
  }

  return [
    commandLine,
    `  └─ ${cleanLine(
      description
    )}`,
  ].join("\n");
}


/* =========================================================
   VORTEX STATUS
========================================================= */

export function vortexStatus(
  label: string,
  enabled: boolean
): string {

  return (
    `┃ ◈ ${cleanLine(
      label
    )} : ${
      enabled
        ? "🟢 ON"
        : "🔴 OFF"
    }`
  );
}


/* =========================================================
   STANDARD RESPONSE BUILDERS
========================================================= */

export function success(
  title: string,
  lines: string[] = []
): string {

  return vortexBox(
    `✅ ${title}`,
    lines
  );
}


export function error(
  title: string,
  lines: string[] = []
): string {

  return vortexBox(
    `❌ ${title}`,
    lines
  );
}


export function warning(
  title: string,
  lines: string[] = []
): string {

  return vortexBox(
    `⚠️ ${title}`,
    lines
  );
}


export function info(
  title: string,
  lines: string[] = []
): string {

  return vortexBox(
    `ℹ️ ${title}`,
    lines
  );
}


export function security(
  title: string,
  lines: string[] = []
): string {

  return vortexBox(
    `🛡️ ${title}`,
    lines
  );
}


export function system(
  title: string,
  lines: string[] = []
): string {

  return vortexBox(
    `⚙️ ${title}`,
    lines
  );
}


export function command(
  title: string,
  lines: string[] = []
): string {

  return vortexBox(
    `⚡ ${title}`,
    lines
  );
}


/* =========================================================
   LEGACY SECTION / ROW HELPERS
========================================================= */

export function section(
  title: string
): string {

  return (
    `┣━━〔 ${cleanLine(
      title
    )} 〕━━┫`
  );
}


export function row(
  label: string,
  value: string
): string {

  return (
    `◈ ${cleanLine(
      label
    )} : ${cleanLine(
      value
    )}`
  );
}


/* =========================================================
   FOOTER
========================================================= */

export function footer(): string {
  return POWERED_BY;
}


/* =========================================================
   USER / TARGET HELPERS
========================================================= */

export function cleanUserNumber(
  jid: string
): string {

  return String(jid || "")
    .split(":")[0]
    .replace(
      "@s.whatsapp.net",
      ""
    )
    .replace(
      "@lid",
      ""
    )
    .replace(
      /[^\d+]/g,
      ""
    );
}


export function userMention(
  jid: string
): string {

  return `@${cleanUserNumber(jid)}`;
}


export function targetLine(
  jid: string
): string {

  return (
    `👤 Target: ${userMention(jid)}`
  );
}


/* =========================================================
   TIME / MEMORY
========================================================= */

export function formatUptime(
  seconds: number
): string {

  let remaining =
    Number.isFinite(seconds)
      ? Math.max(
          0,
          Math.floor(seconds)
        )
      : 0;

  const days =
    Math.floor(
      remaining / 86400
    );

  remaining %= 86400;

  const hours =
    Math.floor(
      remaining / 3600
    );

  remaining %= 3600;

  const minutes =
    Math.floor(
      remaining / 60
    );

  const secs =
    remaining % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(
      `${days}d`
    );
  }

  if (hours > 0) {
    parts.push(
      `${hours}h`
    );
  }

  if (minutes > 0) {
    parts.push(
      `${minutes}m`
    );
  }

  parts.push(
    `${secs}s`
  );

  return parts.join(" ");
}


export function formatBytes(
  bytes: number
): string {

  if (
    !Number.isFinite(bytes) ||
    bytes < 0
  ) {
    return "0 MB";
  }

  const mb =
    bytes /
    1024 /
    1024;

  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }

  return `${(
    mb / 1024
  ).toFixed(2)} GB`;
}


/* =========================================================
   PROGRESS HELPERS
========================================================= */

export function progressBar(
  progress: number,
  width = 18
): string {

  const safeProgress =
    Number.isFinite(progress)
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(progress)
          )
        )
      : 0;

  const safeWidth =
    Math.max(
      4,
      Math.floor(width)
    );

  const filled =
    Math.round(
      (safeProgress / 100) *
      safeWidth
    );

  const empty =
    Math.max(
      0,
      safeWidth - filled
    );

  return (
    `[${"█".repeat(
      filled
    )}${"░".repeat(
      empty
    )}] ${safeProgress}%`
  );
}


export function operationProgress(
  operationId: string,
  commandName: string,
  stage: string,
  progress: number,
  detail?: string
): string {

  const lines = [
    `🆔 Operation : ${cleanLine(
      operationId
    )}`,
    `⚡ Command : ${cleanLine(
      commandName
    )}`,
    `◈ Stage : ${cleanLine(
      stage
    )}`,
    `📊 Progress : ${progressBar(
      progress
    )}`,
  ];

  if (detail) {
    lines.push(
      "",
      `◈ ${cleanLine(detail)}`
    );
  }

  return system(
    "OPERATION IN PROGRESS",
    lines
  );
}


export function operationCompleted(
  operationId: string,
  commandName: string,
  detail?: string
): string {

  const lines = [
    `🆔 Operation : ${cleanLine(
      operationId
    )}`,
    `⚡ Command : ${cleanLine(
      commandName
    )}`,
    "◈ Stage : COMPLETED",
    `📊 Progress : ${progressBar(100)}`,
  ];

  if (detail) {
    lines.push(
      "",
      `◈ ${cleanLine(detail)}`
    );
  }

  return success(
    "OPERATION COMPLETED",
    lines
  );
}


export function operationFailed(
  operationId: string,
  commandName: string,
  stage: string,
  reason: string
): string {

  return error(
    "OPERATION FAILED",
    [
      `🆔 Operation : ${cleanLine(
        operationId
      )}`,
      `⚡ Command : ${cleanLine(
        commandName
      )}`,
      `◈ Stage : ${cleanLine(
        stage
      )}`,
      "",
      `🔴 Reason : ${cleanLine(
        reason
      )}`,
    ]
  );
}


/* =========================================================
   AUDIT PRESENTATION
========================================================= */

export function auditLine(
  operationId: string,
  commandName: string,
  stage: string,
  status: string,
  progress?: number
): string {

  const progressText =
    progress === undefined
      ? ""
      : ` • ${Math.max(
          0,
          Math.min(
            100,
            Math.round(progress)
          )
        )}%`;

  return (
    `◈ ${cleanLine(
      commandName
    )} • ${cleanLine(
      stage
    )} • ${cleanLine(
      status
    )}${progressText} • ID: ${cleanLine(
      operationId
    )}`
  );
}


export function auditResponse(
  title: string,
  lines: string[] = []
): string {

  return security(
    title,
    lines
  );
}


/* =========================================================
   COMMAND SUCCESS
========================================================= */

export function commandSuccess(
  action: string,
  details: string[] = []
): string {

  return success(
    "ACTION COMPLETED",
    [
      `⚡ Action : ${cleanLine(action)}`,
      "",
      ...details,
      "",
      "🟢 Status : COMPLETED",
    ]
  );
}


/* =========================================================
   COMMAND FAILURE
========================================================= */

export function commandFailed(
  action: string,
  reason: string,
  help?: string
): string {

  const lines = [
    `⚡ Action : ${cleanLine(action)}`,
    "",
    `🔴 Reason : ${cleanLine(reason)}`,
  ];

  if (help) {
    lines.push(
      "",
      `💡 ${cleanLine(help)}`
    );
  }

  return error(
    "ACTION FAILED",
    lines
  );
}


/* =========================================================
   COMMAND USAGE
========================================================= */

export function commandUsage(
  commandName: string,
  usage: string,
  description?: string
): string {

  const prefix =
    getPrefix();

  const normalizedUsage =
    usage.startsWith(prefix)
      ? usage
      : `${prefix}${usage}`;

  const lines = [
    `⚡ Command : ${cleanLine(
      commandName
    )}`,
    "",
    "📝 USAGE",
    `◈ ${cleanLine(
      normalizedUsage
    )}`,
  ];

  if (description) {
    lines.push(
      "",
      "💡 DESCRIPTION",
      `◈ ${cleanLine(
        description
      )}`
    );
  }

  return info(
    "COMMAND GUIDE",
    lines
  );
}


/* =========================================================
   GROUP REQUIRED
========================================================= */

export function groupRequired(
  commandName: string
): string {

  return error(
    "GROUP ONLY",
    [
      `⚡ Command : ${cleanLine(
        commandName
      )}`,
      "",
      "👥 This command requires",
      "a WhatsApp group.",
      "",
      "💡 Open a group and try again.",
    ]
  );
}


/* =========================================================
   BOT ADMIN REQUIRED
========================================================= */

export function botAdminRequired(): string {

  return error(
    "ADMIN ACCESS REQUIRED",
    [
      "🛡️ Dark Vortex must be",
      "a group administrator.",
      "",
      "💡 Promote Dark Vortex to admin",
      "and try again.",
    ]
  );
}


/* =========================================================
   TARGET REQUIRED
========================================================= */

export function targetRequired(
  commandName: string
): string {

  return error(
    "TARGET REQUIRED",
    [
      `⚡ Command : ${cleanLine(
        commandName
      )}`,
      "",
      "👤 Reply to the target user's",
      "message before using this command.",
      "",
      "📝 EXAMPLE",
      `◈ ${getPrefix()}${cleanLine(
        commandName
      )}`,
    ]
  );
}


/* =========================================================
   WARNINGS
========================================================= */

export function warningIssued(
  user: string,
  count: number,
  limit: number,
  reason: string
): string {

  const safeCount =
    Number.isFinite(count)
      ? Math.max(
          0,
          Math.floor(count)
        )
      : 0;

  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          0,
          Math.floor(limit)
        )
      : 0;

  return warning(
    "WARNING ISSUED",
    [
      `👤 User : ${cleanLine(user)}`,
      `⚠️ Warnings : ${safeCount}/${safeLimit}`,
      "",
      "📋 REASON",
      `◈ ${cleanLine(reason)}`,
      "",
      safeCount >= safeLimit
        ? "🚨 Warning limit reached."
        : `🟡 ${
            Math.max(
              0,
              safeLimit - safeCount
            )
          } warning(s) remaining.`,
    ]
  );
}


export function warningLimitReached(
  user: string,
  limit: number,
  reason: string
): string {

  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          0,
          Math.floor(limit)
        )
      : 0;

  return warning(
    "WARNING LIMIT REACHED",
    [
      `👤 User : ${cleanLine(user)}`,
      `🚨 Limit : ${safeLimit}/${safeLimit}`,
      "",
      "📋 REASON",
      `◈ ${cleanLine(reason)}`,
      "",
      "👢 Removing user from group...",
    ]
  );
}


export function warningStatus(
  user: string,
  count: number,
  limit: number
): string {

  const safeCount =
    Number.isFinite(count)
      ? Math.max(
          0,
          Math.floor(count)
        )
      : 0;

  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          0,
          Math.floor(limit)
        )
      : 0;

  return info(
    "WARNING STATUS",
    [
      `👤 User : ${cleanLine(user)}`,
      `⚠️ Warnings : ${safeCount}/${safeLimit}`,
      "",
      safeCount >= safeLimit
        ? "🔴 Limit reached"
        : "🟢 Within warning limit",
    ]
  );
}


/* =========================================================
   PROTECTION
========================================================= */

export function protectionBlocked(
  type: string,
  action: string,
  target?: string
): string {

  const lines = [
    `🛡️ Protection : ${cleanLine(
      type
    )}`,
  ];

  if (target) {
    lines.push(
      `👤 User : ${cleanLine(target)}`
    );
  }

  lines.push(
    "",
    `⚡ Action : ${cleanLine(action)}`,
    "🟢 Status : ENFORCED"
  );

  return security(
    "PROTECTION ENFORCED",
    lines
  );
}


/* =========================================================
   SYSTEM STATUS
========================================================= */

export function systemStatus(
  lines: string[]
): string {

  return system(
    "SYSTEM STATUS",
    lines
  );
}


/* =========================================================
   PING
========================================================= */

export function pingResponse(
  responseMs: number
): string {

  const safeMs =
    Number.isFinite(responseMs)
      ? Math.max(
          0,
          Math.round(responseMs)
        )
      : 0;

  return vortexBox(
    "🏓 PONG",
    [
      "🟢 Status : ONLINE",
      `⚡ Response : ${safeMs}ms`,
      "🤖 Engine : VORTEX CORE",
      "🛡️ Security : ACTIVE",
      "",
      "⚡ Connection is healthy.",
    ]
  );
}


/* =========================================================
   MAINTENANCE
========================================================= */

export function maintenanceStatus(
  enabled: boolean
): string {

  return system(
    "MAINTENANCE MODE",
    [
      `⚙️ Status : ${
        enabled
          ? "🔴 ACTIVE"
          : "🟢 INACTIVE"
      }`,
      "",
      enabled
        ? "🚧 Command processing is restricted."
        : "🚀 Dark Vortex is operating normally.",
    ]
  );
}


/* =========================================================
   AUTOMATION STATUS
========================================================= */

export function automationStatus(
  welcome: boolean,
  goodbye: boolean,
  autoreply: boolean
): string {

  return system(
    "AUTOMATION STATUS",
    [
      `👋 Welcome : ${
        welcome
          ? "🟢 ON"
          : "🔴 OFF"
      }`,
      `👋 Goodbye : ${
        goodbye
          ? "🟢 ON"
          : "🔴 OFF"
      }`,
      `🤖 Autoreply : ${
        autoreply
          ? "🟢 ON"
          : "🔴 OFF"
      }`,
    ]
  );
}


/* =========================================================
   PROTECTION STATUS
========================================================= */

export function protectionStatus(
  settings: Record<string, boolean>
): string {

  const enabled =
    (value: boolean) =>
      value
        ? "🟢 ON"
        : "🔴 OFF";

  return security(
    "PROTECTION STATUS",
    [
      `🔗 Anti-link : ${enabled(
        Boolean(settings.antilink)
      )}`,
      `💬 Anti-spam : ${enabled(
        Boolean(settings.antispam)
      )}`,
      `🤖 Anti-bot : ${enabled(
        Boolean(settings.antibot)
      )}`,
      `📣 Anti-mention : ${enabled(
        Boolean(settings.antimention)
      )}`,
    ]
  );
}


/* =========================================================
   BROADCAST
========================================================= */

export function broadcastResult(
  sent: number,
  failed: number,
  total: number
): string {

  const safeSent =
    Number.isFinite(sent)
      ? Math.max(
          0,
          Math.floor(sent)
        )
      : 0;

  const safeFailed =
    Number.isFinite(failed)
      ? Math.max(
          0,
          Math.floor(failed)
        )
      : 0;

  const safeTotal =
    Number.isFinite(total)
      ? Math.max(
          0,
          Math.floor(total)
        )
      : 0;

  const deliveryRate =
    safeTotal > 0
      ? Math.round(
          (safeSent / safeTotal) *
          100
        )
      : 0;

  return command(
    "BROADCAST COMPLETE",
    [
      `📢 Total : ${safeTotal}`,
      `✅ Delivered : ${safeSent}`,
      `❌ Failed : ${safeFailed}`,
      `📊 Delivery : ${deliveryRate}%`,
      "",
      safeSent === safeTotal
        ? "🟢 All messages delivered successfully."
        : safeFailed === 0
          ? "🟢 Broadcast completed successfully."
          : "🟡 Broadcast completed with some failures.",
    ]
  );
}


/* =========================================================
   UNKNOWN COMMAND
========================================================= */

export function unknownCommand(
  commandName: string
): string {

  const prefix =
    getPrefix();

  const allCommands =
    getCommands();

  const normalizedCommand =
    cleanLine(commandName)
      .toLowerCase();

  /* =======================================================
     COMMAND EXISTS BUT IS UNAVAILABLE
  ======================================================= */

  const exactMatch =
    allCommands.find(
      (item) =>
        item.name.toLowerCase() ===
          normalizedCommand ||
        item.aliases?.some(
          (alias: string) =>
            alias.toLowerCase() ===
            normalizedCommand
        )
    );

  if (exactMatch) {
    return error(
      "COMMAND UNAVAILABLE",
      [
        `⚡ Command : ${prefix}${cleanLine(
          commandName
        )}`,
        "",
        "❌ This command cannot be used",
        "in the current context.",
        "",
        "📝 USAGE",
        `◈ ${
          exactMatch.usage ||
          `${prefix}${exactMatch.name}`
        }`,
      ]
    );
  }

  /* =======================================================
     SMART SUGGESTIONS
  ======================================================= */

  const suggestions =
    allCommands
      .filter(
        (item) =>
          item.name
            .toLowerCase()
            .startsWith(
              normalizedCommand
            ) ||
          item.aliases?.some(
            (alias: string) =>
              alias
                .toLowerCase()
                .startsWith(
                  normalizedCommand
                )
          )
      )
      .slice(
        0,
        3
      );

  if (
    suggestions.length
  ) {
    return error(
      "UNKNOWN COMMAND",
      [
        `❌ ${prefix}${cleanLine(
          commandName
        )} is not recognized.`,
        "",
        "💡 DID YOU MEAN?",
        ...suggestions.map(
          (item) =>
            `◈ ${
              item.usage ||
              `${prefix}${item.name}`
            }`
        ),
        "",
        `📖 ${prefix}menu`,
        "Open the command center.",
      ]
    );
  }

  /* =======================================================
     NO MATCH
  ======================================================= */

  return error(
    "UNKNOWN COMMAND",
    [
      `❌ ${prefix}${cleanLine(
        commandName
      )} is not recognized.`,
      "",
      `📖 ${prefix}menu`,
      "Open the command center.",
      "",
      `💡 ${prefix}help <command>`,
      "View detailed command information.",
    ]
  );
}


/* =========================================================
   INTERNAL ERROR
========================================================= */

export function internalError(
  context = "command"
): string {

  return error(
    "INTERNAL ERROR",
    [
      "❌ Dark Vortex encountered an unexpected",
      `error while processing the ${cleanLine(
        context
      )}.`,
      "",
      "⚡ Please try again.",
      "",
      "🛡️ Existing configuration was",
      "not intentionally changed.",
    ]
  );
}


/* =========================================================
   TEXT EXPORT HELPER
========================================================= */

/*
 * Useful when another system needs a safe single-line value
 * for logs, audit presentation, command output, etc.
 */
export function safeText(
  value: unknown,
  maxLength = MAX_LINE_LENGTH
): string {

  return truncateText(
    String(value ?? ""),
    Math.max(
      1,
      Math.floor(maxLength)
    )
  );
}


/* =========================================================
   ROW EXPORT HELPER
========================================================= */

export function safeRow(
  label: unknown,
  value: unknown
): string {

  return row(
    safeText(label),
    safeText(value)
  );
}
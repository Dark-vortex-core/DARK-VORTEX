/* =========================================================
   🌑 DARK VORTEX — MESSAGE ENGINE
   ⚡ Powered by Vortex Tech

   Presentation and formatting only.

   STYLE:
   • Menu/help: structured and detailed
   • Normal commands: modern and concise
   • Protection: direct and contextual
   • Vortex/VX: technical and operational
   • Progress operations: visible progress bars
   • Errors: clear reason + next step
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
  "🌑 DARK VORTEX";

export const POWERED_BY =
  "╰─── ⚡ VORTEX TECH ───╯";


/* =========================================================
   CONSTANTS
========================================================= */

const BOX_WIDTH = 30;
const MAX_LINE_LENGTH = 180;
const MAX_BOX_LINES = 80;
const MAX_LIST_ITEMS = 60;


/* =========================================================
   SECRET PROTECTION
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

function redactSecrets(
  value: string,
): string {
  let result = String(value);

  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(
      pattern,
      "[REDACTED]",
    );
  }

  result = result.replace(
    /([A-Za-z0-9_-]{12,})\s*[:=]\s*([^\s,;]+)/g,
    "$1=[REDACTED]",
  );

  result = result.replace(
    /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
    "Bearer [REDACTED]",
  );

  return result;
}


/* =========================================================
   TEXT HELPERS
========================================================= */

function cleanLine(
  line: unknown,
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
      .trim(),
  );
}

function visibleLength(
  text: string,
): number {
  return [
    ...String(text),
  ].length;
}

function truncateText(
  text: string,
  maxLength = MAX_LINE_LENGTH,
): string {
  const clean = cleanLine(text);

  if (
    visibleLength(clean) <= maxLength
  ) {
    return clean;
  }

  if (maxLength <= 1) {
    return [
      ...clean,
    ]
      .slice(0, Math.max(0, maxLength))
      .join("");
  }

  return [
    ...clean,
  ]
    .slice(0, maxLength - 1)
    .join("") + "…";
}

function normalizeLines(
  lines: unknown[] = [],
): string[] {
  return lines
    .filter(
      (line) =>
        line !== undefined &&
        line !== null,
    )
    .map(cleanLine)
    .map((line) => truncateText(line))
    .filter((line) => line.length > 0)
    .slice(0, MAX_BOX_LINES);
}

function createBorder(
  length = BOX_WIDTH,
): string {
  return "━".repeat(
    Math.max(1, length),
  );
}

function centeredLine(
  text: unknown,
  width = BOX_WIDTH,
): string {
  const clean = truncateText(
    String(text),
    width,
  );

  const length = visibleLength(clean);

  if (length >= width) {
    return [
      ...clean,
    ]
      .slice(0, width)
      .join("");
  }

  const total = width - length;
  const left = Math.floor(total / 2);
  const right = total - left;

  return (
    " ".repeat(left) +
    clean +
    " ".repeat(right)
  );
}


/* =========================================================
   MENU / HELP BOXES
========================================================= */

export function vortexBox(
  title: string,
  lines: string[] = [],
): string {
  const cleanTitle = truncateText(
    title,
    BOX_WIDTH - 8,
  );

  const safeLines = normalizeLines(lines);

  const titleText =
    `〔 ${cleanTitle} 〕`;

  const titleLength =
    visibleLength(titleText);

  const remaining = Math.max(
    2,
    BOX_WIDTH - titleLength,
  );

  const top =
    `╭━━${titleText}${"━".repeat(
      remaining,
    )}╮`;

  const body = safeLines.map(
    (line) => `┃ ◈ ${line}`,
  );

  return [
    top,
    "┃",
    ...body,
    "┃",
    `╰${createBorder()}╯`,
  ].join("\n");
}

export function vortexHeader(
  title: string,
  subtitle?: string,
): string {
  const sub =
    subtitle ||
    "⚡ VORTEX CORE";

  return [
    `╭${createBorder()}╮`,
    `┃${centeredLine(
      BRAND,
    )}┃`,
    `┃${centeredLine(
      sub,
    )}┃`,
    `╰${createBorder()}╯`,
    "",
    `╭━━〔 ${cleanLine(
      title,
    )} 〕━━╮`,
  ].join("\n");
}

export function vortexSection(
  title: string,
  lines: string[] = [],
): string {
  const safeLines = normalizeLines(lines);

  return [
    `╭━━〔 ${truncateText(
      title,
      BOX_WIDTH - 8,
    )} 〕━━╮`,
    "┃",
    ...safeLines.map(
      (line) => `┃ ${line}`,
    ),
    "┃",
    `╰${createBorder()}╯`,
  ].join("\n");
}

export function vortexList(
  items: string[],
): string {
  return items
    .filter(
      (item) =>
        item !== undefined &&
        item !== null &&
        String(item).trim(),
    )
    .slice(0, MAX_LIST_ITEMS)
    .map(
      (item) =>
        `┃ ◈ ${truncateText(String(item))}`,
    )
    .join("\n");
}

export function vortexCommand(
  name: string,
  description?: string,
): string {
  const prefix = getPrefix();

  const commandLine =
    `◈ ${prefix}${cleanLine(name)}`;

  if (!description) {
    return commandLine;
  }

  return [
    commandLine,
    `  └─ ${cleanLine(description)}`,
  ].join("\n");
}

export function vortexStatus(
  label: string,
  enabled: boolean,
): string {
  return (
    `${cleanLine(label)}: ${
      enabled ? "ON" : "OFF"
    }`
  );
}


/* =========================================================
   NORMAL RESPONSE BUILDERS
========================================================= */

function simpleResponse(
  heading: string,
  lines: string[] = [],
): string {
  const safeLines = normalizeLines(lines);

  if (safeLines.length === 0) {
    return cleanLine(heading);
  }

  return [
    cleanLine(heading),
    "",
    ...safeLines,
  ].join("\n");
}


/*
 * Normal responses intentionally stay lightweight.
 *
 * Do NOT turn these into dashboard-style boxes.
 */

export function success(
  title: string,
  lines: string[] = [],
): string {
  return simpleResponse(
    `✓ ${cleanLine(title)}`,
    lines,
  );
}

export function error(
  title: string,
  lines: string[] = [],
): string {
  return simpleResponse(
    `✕ ${cleanLine(title)}`,
    lines,
  );
}

export function warning(
  title: string,
  lines: string[] = [],
): string {
  return simpleResponse(
    `⚠️ ${cleanLine(title)}`,
    lines,
  );
}

export function info(
  title: string,
  lines: string[] = [],
): string {
  return simpleResponse(
    `ℹ️ ${cleanLine(title)}`,
    lines,
  );
}

export function security(
  title: string,
  lines: string[] = [],
): string {
  return simpleResponse(
    `🛡️ ${cleanLine(title)}`,
    lines,
  );
}

export function system(
  title: string,
  lines: string[] = [],
): string {
  return simpleResponse(
    `⚙️ ${cleanLine(title)}`,
    lines,
  );
}

export function command(
  title: string,
  lines: string[] = [],
): string {
  return simpleResponse(
    `⚡ ${cleanLine(title)}`,
    lines,
  );
}


/* =========================================================
   LEGACY HELPERS
========================================================= */

export function section(
  title: string,
): string {
  return `┣━━〔 ${cleanLine(title)} 〕━━┫`;
}

export function row(
  label: string,
  value: string,
): string {
  return `◈ ${cleanLine(label)}: ${cleanLine(value)}`;
}

export function footer(): string {
  return POWERED_BY;
}


/* =========================================================
   USER / TARGET HELPERS
========================================================= */

/**
 * Extract a safe phone number from a WhatsApp phone JID.
 *
 * IMPORTANT:
 * LIDs are NOT phone numbers and must never be converted
 * into fake @number displays.
 */
export function cleanUserNumber(
  jid: string,
): string {
  const value = String(jid || "").trim();

  if (!value) {
    return "";
  }

  /*
   * Device-specific JIDs:
   * 2348012345678:12@s.whatsapp.net
   */
  const base = value.split(":")[0];

  /*
   * Only extract numbers from actual WhatsApp phone JIDs.
   */
  if (
    base.includes("@s.whatsapp.net")
  ) {
    return base
      .replace("@s.whatsapp.net", "")
      .replace(/[^\d+]/g, "");
  }

  /*
   * Never expose or convert a LID into a fake
   * phone number.
   */
  if (
    base.includes("@lid")
  ) {
    return "";
  }

  /*
   * Legacy/plain-number compatibility.
   */
  if (
    !base.includes("@")
  ) {
    return base.replace(
      /[^\d+]/g,
      "",
    );
  }

  return "";
}

/**
 * Legacy mention formatter.
 *
 * IMPORTANT:
 * This function is synchronous, so it cannot resolve a
 * LID to a real name by itself.
 *
 * For real identity resolution use:
 *
 * resolveAndFormatIdentity()
 *
 * from src/utils/identity.ts
 */
export function userMention(
  jid: string,
): string {
  const number = cleanUserNumber(jid);

  if (number) {
    return `@${number}`;
  }

  if (
    String(jid || "").endsWith("@lid")
  ) {
    return "@Unknown User";
  }

  return "@Unknown User";
}

/**
 * Legacy target formatter.
 *
 * This remains synchronous for compatibility with existing
 * commands. New code that has access to the socket should
 * use the identity resolver before passing the target here.
 */
export function targetLine(
  jid: string,
): string {
  return `Target: ${userMention(jid)}`;
}

/* =========================================================
   TIME / MEMORY
========================================================= */

export function formatUptime(
  seconds: number,
): string {
  let remaining = Number.isFinite(seconds)
    ? Math.max(0, Math.floor(seconds))
    : 0;

  const days = Math.floor(
    remaining / 86400,
  );

  remaining %= 86400;

  const hours = Math.floor(
    remaining / 3600,
  );

  remaining %= 3600;

  const minutes = Math.floor(
    remaining / 60,
  );

  const secs = remaining % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  parts.push(`${secs}s`);

  return parts.join(" ");
}

export function formatBytes(
  bytes: number,
): string {
  if (
    !Number.isFinite(bytes) ||
    bytes < 0
  ) {
    return "0 MB";
  }

  const mb = bytes / 1024 / 1024;

  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }

  return `${(mb / 1024).toFixed(2)} GB`;
}


/* =========================================================
   PROGRESS
========================================================= */

export function progressBar(
  progress: number,
  width = 18,
): string {
  const safeProgress = Number.isFinite(progress)
    ? Math.max(
        0,
        Math.min(100, Math.round(progress)),
      )
    : 0;

  const safeWidth = Math.max(
    4,
    Math.floor(width),
  );

  const filled = Math.round(
    (safeProgress / 100) * safeWidth,
  );

  const empty = Math.max(
    0,
    safeWidth - filled,
  );

  return (
    `[${"█".repeat(filled)}${"░".repeat(
      empty,
    )}] ${safeProgress}%`
  );
}

export function operationProgress(
  operationId: string,
  commandName: string,
  stage: string,
  progress: number,
  detail?: string,
): string {
  const lines = [
    `Operation: ${cleanLine(operationId)}`,
    `Command: ${cleanLine(commandName)}`,
    `Stage: ${cleanLine(stage)}`,
    progressBar(progress),
  ];

  if (detail) {
    lines.push(
      "",
      cleanLine(detail),
    );
  }

  return simpleResponse(
    `${BRAND} • ${cleanLine(
      commandName,
    ).toUpperCase()}`,
    lines,
  );
}

export function operationCompleted(
  operationId: string,
  commandName: string,
  detail?: string,
): string {
  const lines = [
    `Operation: ${cleanLine(operationId)}`,
    `Command: ${cleanLine(commandName)}`,
    "Stage: COMPLETED",
    progressBar(100),
  ];

  if (detail) {
    lines.push(
      "",
      cleanLine(detail),
    );
  }

  return simpleResponse(
    `${BRAND} • OPERATION COMPLETE`,
    lines,
  );
}

export function operationFailed(
  operationId: string,
  commandName: string,
  stage: string,
  reason: string,
): string {
  return simpleResponse(
    "⚠️ DARK VORTEX • OPERATION FAILED",
    [
      `Operation: ${cleanLine(operationId)}`,
      `Command: ${cleanLine(commandName)}`,
      `Stage: ${cleanLine(stage)}`,
      "",
      `Reason: ${cleanLine(reason)}`,
    ],
  );
}


/* =========================================================
   AUDIT
========================================================= */

export function auditLine(
  operationId: string,
  commandName: string,
  stage: string,
  status: string,
  progress?: number,
): string {
  const progressText =
    progress === undefined
      ? ""
      : ` • ${Math.max(
          0,
          Math.min(100, Math.round(progress)),
        )}%`;

  return (
    `${cleanLine(commandName)} • ${
      cleanLine(stage)
    } • ${cleanLine(status)}${progressText} • ID: ${
      cleanLine(operationId)
    }`
  );
}

export function auditResponse(
  title: string,
  lines: string[] = [],
): string {
  return simpleResponse(
    `🛡️ ${cleanLine(title)}`,
    lines,
  );
}


/* =========================================================
   COMMAND SUCCESS / FAILURE
========================================================= */

export function commandSuccess(
  action: string,
  details: string[] = [],
): string {
  return simpleResponse(
    `✓ ${cleanLine(action)}`,
    details,
  );
}

export function commandFailed(
  action: string,
  reason: string,
  help?: string,
): string {
  const lines = [
    cleanLine(reason),
  ];

  if (help) {
    lines.push(
      "",
      `Try: ${cleanLine(help)}`,
    );
  }

  return simpleResponse(
    `✕ ${cleanLine(action)}`,
    lines,
  );
}


/* =========================================================
   COMMAND USAGE
========================================================= */

export function commandUsage(
  commandName: string,
  usage: string,
  description?: string,
): string {
  const prefix = getPrefix();

  const normalizedUsage =
    usage.startsWith(prefix)
      ? usage
      : `${prefix}${usage}`;

  const lines = [
    `Usage: ${cleanLine(normalizedUsage)}`,
  ];

  if (description) {
    lines.push(
      "",
      cleanLine(description),
    );
  }

  /*
   * Help is intentionally structured.
   * Normal command responses are not.
   */
  return vortexBox(
    `HELP: ${cleanLine(commandName)}`,
    lines,
  );
}


/* =========================================================
   GROUP / PERMISSION RESPONSES
========================================================= */

export function groupRequired(
  commandName: string,
): string {
  return error(
    "Group only",
    [
      `Use ${getPrefix()}${cleanLine(
        commandName,
      )} inside a WhatsApp group.`,
    ],
  );
}

export function botAdminRequired(): string {
  return error(
    "Admin access required",
    [
      "Dark Vortex needs group-admin permission.",
      "Promote the bot and try again.",
    ],
  );
}

export function targetRequired(
  commandName: string,
): string {
  return error(
    "Target required",
    [
      "Reply to the member's message first.",
      "",
      `Example: ${getPrefix()}${cleanLine(
        commandName,
      )}`,
    ],
  );
}


/* =========================================================
   WARNING SYSTEM
========================================================= */

export function warningIssued(
  user: string,
  count: number,
  limit: number,
  reason: string,
): string {
  const safeCount = Number.isFinite(count)
    ? Math.max(0, Math.floor(count))
    : 0;

  const safeLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : 0;

  return warning(
    "Warning issued.",
    [
      `${cleanLine(user)}: warning ${safeCount}/${safeLimit}.`,
      "",
      `Reason: ${cleanLine(reason)}`,
      safeCount >= safeLimit
        ? "The warning limit has been reached."
        : `${Math.max(
            0,
            safeLimit - safeCount,
          )} warning(s) remaining.`,
    ],
  );
}

export function warningLimitReached(
  user: string,
  limit: number,
  reason: string,
): string {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : 0;

  return warning(
    "Warning limit reached.",
    [
      `${cleanLine(user)}: ${safeLimit}/${safeLimit} warnings.`,
      "",
      `Reason: ${cleanLine(reason)}`,
      "Removal from the group is being processed.",
    ],
  );
}

export function warningStatus(
  user: string,
  count: number,
  limit: number,
): string {
  const safeCount = Number.isFinite(count)
    ? Math.max(0, Math.floor(count))
    : 0;

  const safeLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : 0;

  return info(
    "Warning status",
    [
      `${cleanLine(user)}: ${safeCount}/${safeLimit}`,
      safeCount >= safeLimit
        ? "Warning limit reached."
        : "Member is within the warning limit.",
    ],
  );
}


/* =========================================================
   PROTECTION
========================================================= */

export function protectionBlocked(
  type: string,
  action: string,
  target?: string,
): string {
  const normalizedType =
    cleanLine(type).toLowerCase();

  const normalizedAction =
    cleanLine(action).toLowerCase();

  const name =
    target && cleanLine(target)
      ? cleanLine(target)
      : "This member";

  /*
   * Protection responses are intentionally contextual.
   * These should never become large system panels.
   */

  if (
    normalizedType.includes("link") ||
    normalizedAction.includes("link")
  ) {
    return simpleResponse(
      "🔗 Link removed.",
      [
        `${name}, links aren't allowed in this group.`,
      ],
    );
  }

  if (
    normalizedType.includes("spam") ||
    normalizedAction.includes("spam")
  ) {
    return simpleResponse(
      "⚠️ Spam removed.",
      [
        `${name}, spam isn't allowed in this group.`,
      ],
    );
  }

  if (
    normalizedType.includes("mention") ||
    normalizedAction.includes("mention")
  ) {
    return simpleResponse(
      "📣 Mention removed.",
      [
        `${name}, mass mentions aren't allowed here.`,
      ],
    );
  }

  if (
    normalizedType.includes("bot") ||
    normalizedAction.includes("bot")
  ) {
    return simpleResponse(
      "🤖 Bot blocked.",
      [
        `${name}, automated accounts aren't allowed here.`,
      ],
    );
  }

  return security(
    "Protection enforced.",
    [
      `${name}: ${cleanLine(action)}.`,
    ],
  );
}


/* =========================================================
   SYSTEM STATUS
========================================================= */

export function systemStatus(
  lines: string[],
): string {
  return simpleResponse(
    "⚙️ System Status",
    lines,
  );
}


/* =========================================================
   PING
========================================================= */

export function pingResponse(
  responseMs: number,
): string {
  const safeMs = Number.isFinite(responseMs)
    ? Math.max(0, Math.round(responseMs))
    : 0;

  return simpleResponse(
    "🏓 Pong!",
    [
      `Latency: ${safeMs}ms`,
      "Status: Online",
    ],
  );
}


/* =========================================================
   MAINTENANCE
========================================================= */

export function maintenanceStatus(
  enabled: boolean,
): string {
  return system(
    "Maintenance mode",
    [
      enabled
        ? "Command processing is restricted."
        : "Dark Vortex is operating normally.",
      `Status: ${enabled ? "Active" : "Inactive"}`,
    ],
  );
}


/* =========================================================
   AUTOMATION STATUS
========================================================= */

export function automationStatus(
  welcome: boolean,
  goodbye: boolean,
  autoreply: boolean,
): string {
  return system(
    "Automation status",
    [
      `Welcome: ${welcome ? "ON" : "OFF"}`,
      `Goodbye: ${goodbye ? "ON" : "OFF"}`,
      `Autoreply: ${autoreply ? "ON" : "OFF"}`,
    ],
  );
}


/* =========================================================
   PROTECTION STATUS
========================================================= */

export function protectionStatus(
  settings: Record<string, boolean>,
): string {
  const enabled = (value: boolean) =>
    value ? "ON" : "OFF";

  return security(
    "Protection status",
    [
      `Anti-link: ${enabled(
        Boolean(settings.antilink),
      )}`,
      `Anti-spam: ${enabled(
        Boolean(settings.antispam),
      )}`,
      `Anti-bot: ${enabled(
        Boolean(settings.antibot),
      )}`,
      `Anti-mention: ${enabled(
        Boolean(settings.antimention),
      )}`,
    ],
  );
}


/* =========================================================
   BROADCAST
========================================================= */

export function broadcastResult(
  sent: number,
  failed: number,
  total: number,
): string {
  const safeSent = Number.isFinite(sent)
    ? Math.max(0, Math.floor(sent))
    : 0;

  const safeFailed = Number.isFinite(failed)
    ? Math.max(0, Math.floor(failed))
    : 0;

  const safeTotal = Number.isFinite(total)
    ? Math.max(0, Math.floor(total))
    : 0;

  const deliveryRate = safeTotal > 0
    ? Math.round((safeSent / safeTotal) * 100)
    : 0;

  return command(
    "Broadcast complete",
    [
      `Delivered: ${safeSent}/${safeTotal}`,
      `Failed: ${safeFailed}`,
      `Delivery rate: ${deliveryRate}%`,
      "",
      safeFailed === 0
        ? "All messages delivered."
        : "Broadcast completed with some failures.",
    ],
  );
}


/* =========================================================
   UNKNOWN COMMAND
========================================================= */

export function unknownCommand(
  commandName: string,
): string {
  const prefix = getPrefix();
  const allCommands = getCommands();

  const normalizedCommand =
    cleanLine(commandName).toLowerCase();

  const exactMatch = allCommands.find(
    (item) =>
      item.name.toLowerCase() === normalizedCommand ||
      item.aliases?.some(
        (alias: string) =>
          alias.toLowerCase() === normalizedCommand,
      ),
  );

  if (exactMatch) {
    return error(
      "Command unavailable",
      [
        `${prefix}${cleanLine(commandName)} can't be used here.`,
        "",
        `Usage: ${
          exactMatch.usage ||
          `${prefix}${exactMatch.name}`
        }`,
      ],
    );
  }

  const suggestions = allCommands
    .filter(
      (item) =>
        item.name
          .toLowerCase()
          .startsWith(normalizedCommand) ||
        item.aliases?.some(
          (alias: string) =>
            alias
              .toLowerCase()
              .startsWith(normalizedCommand),
        ),
    )
    .slice(0, 3);

  if (suggestions.length) {
    return error(
      "Unknown command",
      [
        `${prefix}${cleanLine(commandName)} isn't recognized.`,
        "",
        "Did you mean:",
        ...suggestions.map(
          (item) =>
            item.usage ||
            `${prefix}${item.name}`,
        ),
        "",
        `Use ${prefix}menu to view commands.`,
      ],
    );
  }

  return error(
    "Unknown command",
    [
      `${prefix}${cleanLine(commandName)} isn't recognized.`,
      "",
      `Use ${prefix}menu to view commands.`,
      `Use ${prefix}help <command> for command details.`,
    ],
  );
}


/* =========================================================
   INTERNAL ERROR
========================================================= */

export function internalError(
  context = "command",
): string {
  return error(
    "Something went wrong.",
    [
      `Dark Vortex couldn't process the ${cleanLine(
        context,
      )}.`,
      "Try again shortly.",
      "",
      "Existing configuration was not intentionally changed.",
    ],
  );
}


/* =========================================================
   SAFE TEXT EXPORTS
========================================================= */

export function safeText(
  value: unknown,
  maxLength = MAX_LINE_LENGTH,
): string {
  return truncateText(
    String(value ?? ""),
    Math.max(1, Math.floor(maxLength)),
  );
}

export function safeRow(
  label: unknown,
  value: unknown,
): string {
  return row(
    safeText(label),
    safeText(value),
  );
}
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ============================================================
// DARK VORTEX — TERMINAL LOGGER
// WolfBot-style static terminal • No dashboard
// ============================================================

const LOG_DIR = path.resolve(
  process.cwd(),
  "src/data/logs",
);

const LOG_FILE = path.join(
  LOG_DIR,
  "dark-vortex.log",
);

// ============================================================
// ANSI COLORS
// ============================================================

const C = {
  reset: "\x1b[0m",

  bold: "\x1b[1m",
  dim: "\x1b[2m",

  cyan: "\x1b[36m",
  brightCyan: "\x1b[96m",

  blue: "\x1b[34m",
  brightBlue: "\x1b[94m",

  purple: "\x1b[35m",
  brightPurple: "\x1b[95m",

  green: "\x1b[32m",
  brightGreen: "\x1b[92m",

  yellow: "\x1b[33m",
  brightYellow: "\x1b[93m",

  red: "\x1b[31m",
  brightRed: "\x1b[91m",

  white: "\x1b[37m",
  brightWhite: "\x1b[97m",

  gray: "\x1b[90m",
};

// ============================================================
// LOG TYPES
// ============================================================

type LogLevel =
  | "INFO"
  | "SUCCESS"
  | "WARNING"
  | "ERROR"
  | "FATAL"
  | "SECURITY"
  | "SYSTEM"
  | "CONNECT"
  | "GROUP"
  | "ACTION"
  | "COMMAND";

// ============================================================
// STORAGE
// ============================================================

function ensureLogDirectory(): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, {
        recursive: true,
      });
    }
  } catch {
    // Logging must never crash the bot.
  }
}

function timestamp(): string {
  const now = new Date();

  return now.toLocaleTimeString(
    "en-GB",
    {
      hour12: false,
      timeZone: "Africa/Lagos",
    },
  );
}

function fileTimestamp(): string {
  return new Date().toISOString();
}

// ============================================================
// SAFE VALUE FORMATTER
// ============================================================

function stringifyPart(
  value: unknown,
): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  /*
   * IMPORTANT:
   *
   * Do NOT JSON.stringify arbitrary objects here.
   *
   * WhatsApp/Baileys objects can contain:
   * - Signal sessions
   * - cryptographic keys
   * - buffers
   * - ratchet state
   * - message keys
   *
   * Logging those objects is both noisy and unsafe.
   */
  if (
    value !== null &&
    typeof value === "object"
  ) {
    return "[object]";
  }

  return String(value);
}

function formatMessage(
  parts: unknown[],
): string {
  return parts
    .map(stringifyPart)
    .join(" ")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// LEVEL STYLING
// ============================================================

function levelColor(
  level: LogLevel,
): string {
  switch (level) {
    case "SUCCESS":
      return C.brightGreen;

    case "WARNING":
      return C.brightYellow;

    case "ERROR":
      return C.brightRed;

    case "FATAL":
      return C.brightRed;

    case "SECURITY":
      return C.brightPurple;

    case "SYSTEM":
      return C.brightYellow;

    case "CONNECT":
      return C.brightCyan;

    case "GROUP":
      return C.brightBlue;

    case "ACTION":
      return C.brightPurple;

    case "COMMAND":
      return C.brightCyan;

    case "INFO":
    default:
      return C.cyan;
  }
}

function levelIcon(
  level: LogLevel,
): string {
  switch (level) {
    case "SUCCESS":
      return "✓";

    case "WARNING":
      return "⚠";

    case "ERROR":
      return "✕";

    case "FATAL":
      return "☠";

    case "SECURITY":
      return "🛡";

    case "SYSTEM":
      return "⚙";

    case "CONNECT":
      return "↔";

    case "GROUP":
      return "👥";

    case "ACTION":
      return "⚡";

    case "COMMAND":
      return "➜";

    case "INFO":
    default:
      return "ℹ";
  }
}

// ============================================================
// TERMINAL OUTPUT
// ============================================================

function terminalLine(
  level: LogLevel,
  message: string,
): void {
  const time =
    `${C.gray}[${timestamp()}]${C.reset}`;

  const levelText =
    `${levelColor(level)}[${level}]${C.reset}`;

  const icon =
    `${levelColor(level)}${levelIcon(level)}${C.reset}`;

  process.stdout.write(
    `${time} ${levelText} ${icon} ${message}\n`,
  );
}

// ============================================================
// PERSISTENT LOGGING
// ============================================================

function writeLog(
  level: LogLevel,
  ...parts: unknown[]
): void {
  const message =
    formatMessage(parts);

  if (!message) {
    return;
  }

  // Persistent file log.
  try {
    ensureLogDirectory();

    const line =
      `[${fileTimestamp()}] [${level}] ${message}\n`;

    fs.appendFileSync(
      LOG_FILE,
      line,
      "utf8",
    );
  } catch {
    // Never allow logging to crash the bot.
  }

  // Clean terminal output.
  try {
    terminalLine(
      level,
      message,
    );
  } catch {
    // Never allow terminal logging to crash the bot.
  }
}

// ============================================================
// LOGGER API
// ============================================================

function info(
  ...parts: unknown[]
): void {
  writeLog(
    "INFO",
    ...parts,
  );
}

function success(
  ...parts: unknown[]
): void {
  writeLog(
    "SUCCESS",
    ...parts,
  );
}

function warn(
  ...parts: unknown[]
): void {
  writeLog(
    "WARNING",
    ...parts,
  );
}

function error(
  ...parts: unknown[]
): void {
  writeLog(
    "ERROR",
    ...parts,
  );
}

function fatal(
  ...parts: unknown[]
): void {
  writeLog(
    "FATAL",
    ...parts,
  );
}

function security(
  ...parts: unknown[]
): void {
  writeLog(
    "SECURITY",
    ...parts,
  );
}

function system(
  ...parts: unknown[]
): void {
  writeLog(
    "SYSTEM",
    ...parts,
  );
}

function connect(
  ...parts: unknown[]
): void {
  writeLog(
    "CONNECT",
    ...parts,
  );
}

function group(
  ...parts: unknown[]
): void {
  writeLog(
    "GROUP",
    ...parts,
  );
}

function action(
  ...parts: unknown[]
): void {
  writeLog(
    "ACTION",
    ...parts,
  );
}

function command(
  ...parts: unknown[]
): void {
  writeLog(
    "COMMAND",
    ...parts,
  );
}

// ============================================================
// INCOMING MESSAGE LOGGER
// ============================================================

export interface IncomingMessageLog {
  type: string;
  message: string;
  from: string;
  delivery: string;
  chat: "PRIVATE" | "GROUP";
  time?: string;
  messageId?: string;
  fromMe?: boolean;
  group?: string;
}

export function incomingMessage(
  data: IncomingMessageLog,
): void {
  try {
    const message =
      data.message
        .replace(/\r?\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const lines = [
      "╭─〔 INCOMING MESSAGE 〕────────────────────────",
      `│ Type       : ${data.type}`,
      `│ Message    : ${message || "[No text]"}`,
      `│ From       : ${data.from}`,
      `│ Delivery   : ${data.delivery}`,
      `│ Chat       : ${data.chat}`,
    ];

    if (data.group) {
      lines.push(
        `│ Group      : ${data.group}`,
      );
    }

    lines.push(
      `│ Time       : ${data.time ?? timestamp()}`,
    );

    if (data.messageId) {
      lines.push(
        `│ Message ID : ${data.messageId}`,
      );
    }

    if (data.fromMe !== undefined) {
      lines.push(
        `│ From Me    : ${data.fromMe ? "YES" : "NO"}`,
      );
    }

    lines.push(
      "╰───────────────────────────────────────────────",
    );

    const output = lines.join("\n");

    process.stdout.write(
      `${C.gray}${output}${C.reset}\n`,
    );

    try {
      ensureLogDirectory();

      fs.appendFileSync(
        LOG_FILE,
        `[${fileTimestamp()}] [INCOMING MESSAGE]\n${output}\n`,
        "utf8",
      );
    } catch {
      // Never allow persistent logging to crash the bot.
    }
  } catch {
    // Never allow message logging to crash the bot.
  }
}

// ============================================================
// EXPORTED LOGGER
// ============================================================

export const log = {
  info,
  success,
  warn,
  error,
  fatal,
  security,
  system,
  connect,
  group,
  action,
  command,
};

export const logger = log;

// ============================================================
// STARTUP DISPLAY
// ============================================================

export function startupBox(
  ...parts: unknown[]
): void {
  const message =
    formatMessage(parts);

  process.stdout.write("\n");

  process.stdout.write(
    `${C.brightPurple}╔══════════════════════════════════════════════════════════════╗${C.reset}\n`,
  );

  process.stdout.write(
    `${C.brightPurple}║${C.reset} ${C.brightCyan}${C.bold}🌑 DARK VORTEX${C.reset} ${C.gray}•${C.reset} ${C.brightBlue}WHATSAPP OWNER BOT${C.reset}` +
    `${" ".repeat(Math.max(0, 44 - message.length))}${C.brightPurple}║${C.reset}\n`,
  );

  process.stdout.write(
    `${C.brightPurple}║${C.reset} ${C.yellow}⚡ VORTEX TECH${C.reset} ${C.gray}•${C.reset} ${C.brightGreen}INITIALIZING${C.reset}` +
    `${" ".repeat(43)}${C.brightPurple}║${C.reset}\n`,
  );

  if (message) {
    process.stdout.write(
      `${C.brightPurple}║${C.reset} ${C.gray}${message.slice(0, 58)}${C.reset}` +
      `${" ".repeat(Math.max(0, 59 - Math.min(message.length, 58)))}${C.brightPurple}║${C.reset}\n`,
    );
  }
}

export function startupLine(
  ...parts: unknown[]
): void {
  const message =
    formatMessage(parts);

  if (!message) {
    return;
  }

  writeLog(
    "SYSTEM",
    message,
  );
}

export function endStartupBox(
  ...parts: unknown[]
): void {
  if (parts.length > 0) {
    writeLog(
      "SYSTEM",
      ...parts,
    );
  }

  process.stdout.write(
    `${C.brightPurple}╚══════════════════════════════════════════════════════════════╝${C.reset}\n`,
  );

  process.stdout.write("\n");
}

export function divider(
  ...parts: unknown[]
): void {
  if (parts.length > 0) {
    writeLog(
      "SYSTEM",
      ...parts,
    );
    return;
  }

  process.stdout.write(
    `${C.gray}──────────────────────────────────────────────────────────────${C.reset}\n`,
  );
}

// ============================================================
// OPTIONAL STATUS BLOCK
// ============================================================

export function printSystemInfo(): void {
  const memory =
    process.memoryUsage();

  const rss =
    (memory.rss / 1024 / 1024)
      .toFixed(1);

  const heap =
    (memory.heapUsed / 1024 / 1024)
      .toFixed(1);

  const totalMemory =
    (os.totalmem() / 1024 / 1024)
      .toFixed(0);

  process.stdout.write("\n");

  process.stdout.write(
    `${C.brightCyan}╭─ [ SYSTEM ] ───────────────────────────────────────────────╮${C.reset}\n`,
  );

  process.stdout.write(
    `${C.brightCyan}│${C.reset} Node.js       : ${C.brightGreen}${process.version}${C.reset}\n`,
  );

  process.stdout.write(
    `${C.brightCyan}│${C.reset} Platform      : ${C.white}${process.platform}${C.reset}\n`,
  );

  process.stdout.write(
    `${C.brightCyan}│${C.reset} Memory RSS    : ${C.white}${rss} MiB${C.reset}\n`,
  );

  process.stdout.write(
    `${C.brightCyan}│${C.reset} Heap Used     : ${C.white}${heap} MiB${C.reset}\n`,
  );

  process.stdout.write(
    `${C.brightCyan}│${C.reset} Host Memory   : ${C.white}${totalMemory} MiB${C.reset}\n`,
  );

  process.stdout.write(
    `${C.brightCyan}╰─────────────────────────────────────────────────────────────╯${C.reset}\n`,
  );

  process.stdout.write("\n");
}

// ============================================================
// LOG FILE API
// ============================================================

export function readLogs(): string {
  try {
    ensureLogDirectory();

    if (!fs.existsSync(LOG_FILE)) {
      return "";
    }

    return fs.readFileSync(
      LOG_FILE,
      "utf8",
    );
  } catch {
    return "";
  }
}

export function clearLogs(): void {
  try {
    ensureLogDirectory();

    fs.writeFileSync(
      LOG_FILE,
      "",
      "utf8",
    );
  } catch {
    // Ignore cleanup failures.
  }
}

export function getLogFilePath(): string {
  return LOG_FILE;
}
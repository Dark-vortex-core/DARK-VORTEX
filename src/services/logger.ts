import util from "node:util";

type LogLevel =
  | "INFO"
  | "SUCCESS"
  | "WARN"
  | "ERROR"
  | "DEBUG"
  | "COMMAND"
  | "CONNECT"
  | "GROUP"
  | "SECURITY"
  | "ACTION"
  | "SYSTEM"
  | "FATAL";

const ICONS: Record<LogLevel, string> = {
  INFO: "ℹ",
  SUCCESS: "✓",
  WARN: "⚠",
  ERROR: "✖",
  DEBUG: "◆",
  COMMAND: "⚡",
  CONNECT: "◉",
  GROUP: "👥",
  SECURITY: "🛡",
  ACTION: "→",
  SYSTEM: "⚙",
  FATAL: "☠",
};

function timestamp(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function stringify(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  return util.inspect(value, {
    depth: 4,
    colors: false,
    compact: true,
  });
}

function write(
  level: LogLevel,
  message: string,
  details?: unknown,
): void {
  const time = timestamp();
  const icon = ICONS[level];

  const prefix =
    `${time}  ${icon} ${level.padEnd(8)} `;

  if (details === undefined) {
    console.log(`${prefix}${message}`);
    return;
  }

  console.log(
    `${prefix}${message}\n` +
    `           ${stringify(details)}`,
  );
}

export const log = {
  info(message: string, details?: unknown) {
    write("INFO", message, details);
  },

  success(message: string, details?: unknown) {
    write("SUCCESS", message, details);
  },

  warn(message: string, details?: unknown) {
    write("WARN", message, details);
  },

  error(message: string, details?: unknown) {
    write("ERROR", message, details);
  },

  debug(message: string, details?: unknown) {
    if (process.env.DEBUG === "true") {
      write("DEBUG", message, details);
    }
  },

  command(message: string, details?: unknown) {
    write("COMMAND", message, details);
  },

  connect(message: string, details?: unknown) {
    write("CONNECT", message, details);
  },

  group(message: string, details?: unknown) {
    write("GROUP", message, details);
  },

  security(message: string, details?: unknown) {
    write("SECURITY", message, details);
  },

  action(message: string, details?: unknown) {
    write("ACTION", message, details);
  },

  system(message: string, details?: unknown) {
    write("SYSTEM", message, details);
  },

  fatal(message: string, details?: unknown) {
    write("FATAL", message, details);
  },
};

export function divider(): void {
  console.log(
    "────────────────────────────────────────────────────────",
  );
}

export function startupBox(
  botName: string,
  poweredBy: string,
): void {
  console.log("");
  console.log(
    "╭────────────────────────────────────────────────────────╮",
  );
  console.log(
    `│ ${botName.padEnd(54)} │`,
  );
  console.log(
    `│ ${poweredBy.padEnd(54)} │`,
  );
  console.log(
    "├────────────────────────────────────────────────────────┤",
  );
}

export function startupLine(
  label: string,
  value: string,
): void {
  console.log(
    `│ ${label.padEnd(13)} ${value.padEnd(39)} │`,
  );
}

export function endStartupBox(): void {
  console.log(
    "╰────────────────────────────────────────────────────────╯",
  );
  console.log("");
}
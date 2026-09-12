
import type { WASocket } from "@whiskeysockets/baileys";

export type RestMode =
  | "soft"
  | "connection";

interface RestState {
  active: boolean;
  mode: RestMode | null;
  startedAt: number | null;
  endsAt: number | null;

  automatic: boolean;

  activeRuntimeMs: number;
  activeStartedAt: number | null;

  automaticEnabled: boolean;
  automaticRuntimeMs: number;
  automaticRestMs: number;
  automaticMode: RestMode;
}

const state: RestState = {
  active: false,
  mode: null,
  startedAt: null,
  endsAt: null,

  automatic: false,

  activeRuntimeMs: 0,
  activeStartedAt: Date.now(),

  automaticEnabled: false,
  automaticRuntimeMs: 10 * 60 * 60 * 1000,
  automaticRestMs: 2 * 60 * 60 * 1000,
  automaticMode: "connection",
};

let restTimer: NodeJS.Timeout | null = null;
let automaticTimer: NodeJS.Timeout | null = null;

let socketCloser:
  | (() => Promise<void>)
  | null = null;

let socketRestarter:
  | (() => Promise<void>)
  | null = null;

let activeSocket:
  | WASocket
  | null = null;

function clearRestTimer(): void {
  if (restTimer) {
    clearTimeout(restTimer);
    restTimer = null;
  }
}

function clearAutomaticTimer(): void {
  if (automaticTimer) {
    clearTimeout(automaticTimer);
    automaticTimer = null;
  }
}

export function configureRestMode(options: {
  getSocket: () => WASocket | null;
  closeSocket: () => Promise<void>;
  restartSocket: () => Promise<void>;
}): void {
  socketCloser = options.closeSocket;
  socketRestarter = options.restartSocket;
  activeSocket = options.getSocket();

  scheduleAutomaticRestCheck();
}

export function updateRestSocket(
  socket: WASocket | null,
): void {
  activeSocket = socket;
}

export function isResting(): boolean {
  return state.active;
}

export function getRestMode(): RestMode | null {
  return state.mode;
}

export function getRestState(): Readonly<RestState> {
  return {
    ...state,
  };
}

function getActiveRuntimeMs(): number {
  if (
    state.activeStartedAt === null
  ) {
    return state.activeRuntimeMs;
  }

  if (state.active) {
    return state.activeRuntimeMs;
  }

  return (
    state.activeRuntimeMs +
    (Date.now() -
      state.activeStartedAt)
  );
}

function formatDuration(
  ms: number,
): string {
  const totalSeconds = Math.max(
    0,
    Math.floor(ms / 1000),
  );

  const days = Math.floor(
    totalSeconds / 86400,
  );

  const hours = Math.floor(
    (totalSeconds % 86400) /
      3600,
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) /
      60,
  );

  const seconds =
    totalSeconds % 60;

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

  if (
    seconds > 0 ||
    parts.length === 0
  ) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}

function parseDuration(
  input: string,
): number | null {
  const match =
    input
      .trim()
      .toLowerCase()
      .match(
        /^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/,
      );

  if (!match) {
    return null;
  }

  const value =
    Number(match[1]);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  const unit = match[2];

  if (
    unit === "s" ||
    unit === "sec" ||
    unit === "secs" ||
    unit === "second" ||
    unit === "seconds"
  ) {
    return value * 1000;
  }

  if (
    unit === "m" ||
    unit === "min" ||
    unit === "mins" ||
    unit === "minute" ||
    unit === "minutes"
  ) {
    return value * 60 * 1000;
  }

  if (
    unit === "h" ||
    unit === "hr" ||
    unit === "hrs" ||
    unit === "hour" ||
    unit === "hours"
  ) {
    return value * 60 * 60 * 1000;
  }

  return (
    value *
    24 *
    60 *
    60 *
    1000
  );
}

export function parseRestDuration(
  input: string,
): number | null {
  return parseDuration(input);
}

async function beginRest(
  mode: RestMode,
  durationMs: number,
  automatic: boolean,
): Promise<boolean> {
  if (state.active) {
    return false;
  }

  if (
    !socketCloser ||
    !socketRestarter
  ) {
    throw new Error(
      "Rest mode has not been connected to the bot lifecycle.",
    );
  }

  clearRestTimer();

  state.active = true;
  state.mode = mode;
  state.startedAt = Date.now();
  state.endsAt =
    Date.now() + durationMs;
  state.automatic = automatic;

  if (
    state.activeStartedAt !== null
  ) {
    state.activeRuntimeMs +=
      Date.now() -
      state.activeStartedAt;
  }

  state.activeStartedAt = null;

  if (mode === "connection") {
    await socketCloser();
  }

  restTimer = setTimeout(
    () => {
      restTimer = null;

      void endRest().catch(
        (error) => {
          console.error(
            "❌ Failed to end rest mode:",
            error,
          );
        },
      );
    },
    durationMs,
  );

  return true;
}

export async function startRest(
  mode: RestMode,
  durationMs: number,
): Promise<boolean> {
  return beginRest(
    mode,
    durationMs,
    false,
  );
}

export async function endRest(): Promise<void> {
  clearRestTimer();

  if (!state.active) {
    return;
  }

  const automatic =
    state.automatic;

  state.active = false;
  state.mode = null;
  state.startedAt = null;
  state.endsAt = null;
  state.automatic = false;

  state.activeStartedAt =
    Date.now();

  if (socketRestarter) {
    await socketRestarter();
  }

  if (automatic) {
    scheduleAutomaticRestCheck();
  }
}

export function enableAutomaticRest(
  runtimeMs: number,
  restMs: number,
  mode: RestMode,
): void {
  state.automaticEnabled = true;
  state.automaticRuntimeMs =
    runtimeMs;
  state.automaticRestMs =
    restMs;
  state.automaticMode = mode;

  state.activeRuntimeMs = 0;
  state.activeStartedAt =
    Date.now();

  scheduleAutomaticRestCheck();
}

export function disableAutomaticRest(): void {
  state.automaticEnabled = false;

  clearAutomaticTimer();

  state.activeRuntimeMs = 0;
  state.activeStartedAt =
    Date.now();
}

function scheduleAutomaticRestCheck(): void {
  clearAutomaticTimer();

  if (
    !state.automaticEnabled ||
    state.active
  ) {
    return;
  }

  const runtime =
    getActiveRuntimeMs();

  const remaining =
    state.automaticRuntimeMs -
    runtime;

  if (remaining <= 0) {
    void beginRest(
      state.automaticMode,
      state.automaticRestMs,
      true,
    ).catch((error) => {
      console.error(
        "❌ Automatic rest failed:",
        error,
      );
    });

    return;
  }

  automaticTimer =
    setTimeout(
      () => {
        automaticTimer = null;

        if (
          !state.automaticEnabled ||
          state.active
        ) {
          return;
        }

        void beginRest(
          state.automaticMode,
          state.automaticRestMs,
          true,
        ).catch((error) => {
          console.error(
            "❌ Automatic rest failed:",
            error,
          );
        });
      },
      remaining,
    );
}

export function formatRestStatus(): string {
  if (state.active) {
    const remaining =
      state.endsAt
        ? Math.max(
            0,
            state.endsAt -
              Date.now(),
          )
        : 0;

    return [
      "🌑 DARK VORTEX REST STATUS",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "💤 Status: RESTING",
      `🔌 Mode: ${state.mode === "connection" ? "CONNECTION REST" : "SOFT REST"}`,
      `🤖 Automatic: ${state.automatic ? "YES" : "NO"}`,
      "",
      `⏳ Remaining: ${formatDuration(
        remaining,
      )}`,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "⚡ Powered by Vortex Tech",
    ].join("\n");
  }

  const runtime =
    getActiveRuntimeMs();

  const automaticStatus =
    state.automaticEnabled
      ? [
          "🟢 Automatic rest: ENABLED",
          `⏱️ Runtime limit: ${formatDuration(
            state.automaticRuntimeMs,
          )}`,
          `💤 Rest duration: ${formatDuration(
            state.automaticRestMs,
          )}`,
          `🔌 Mode: ${
            state.automaticMode ===
            "connection"
              ? "CONNECTION"
              : "SOFT"
          }`,
        ]
      : [
          "⚪ Automatic rest: DISABLED",
        ];

  return [
    "🌑 DARK VORTEX REST STATUS",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "🟢 Status: ACTIVE",
    `⏱️ Active runtime: ${formatDuration(
      runtime,
    )}`,
    "",
    ...automaticStatus,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "⚡ Powered by Vortex Tech",
  ].join("\n");
}

export async function handleRestCommand(
  command: string,
  args: string[],
): Promise<{
  handled: boolean;
  response?: string;
}> {
  if (
    command === "rest"
  ) {
    if (!args.length) {
      return {
        handled: true,
        response: [
          "🌑 DARK VORTEX REST MODE",
          "",
          "━━━━━━━━━━━━━━━━━━━━",
          "",
          "Usage:",
          "",
          "/rest soft 1h",
          "/rest connection 1h",
          "",
          "/rest status",
          "/rest off",
          "",
          "Automatic:",
          "/restauto 10h 2h soft",
          "/restauto 10h 2h connection",
          "/restauto off",
          "",
          "━━━━━━━━━━━━━━━━━━━━",
          "",
          "⚡ Powered by Vortex Tech",
        ].join("\n"),
      };
    }

    const action =
      args[0].toLowerCase();

    if (
      action === "status"
    ) {
      return {
        handled: true,
        response:
          formatRestStatus(),
      };
    }

    if (
      action === "off"
    ) {
      if (!state.active) {
        return {
          handled: true,
          response: [
            "🌑 DARK VORTEX",
            "",
            "ℹ️ Bot is not currently resting.",
            "",
            "⚡ Powered by Vortex Tech",
          ].join("\n"),
        };
      }

      await endRest();

      return {
        handled: true,
        response: [
          "🌑 DARK VORTEX",
          "",
          "🟢 REST CANCELLED",
          "",
          "Dark Vortex is active again.",
          "",
          "⚡ Powered by Vortex Tech",
        ].join("\n"),
      };
    }

    const mode =
      action === "soft"
        ? "soft"
        : action === "connection"
          ? "connection"
          : null;

    if (!mode) {
      return {
        handled: true,
        response: [
          "🌑 DARK VORTEX REST",
          "",
          "❌ Invalid rest mode.",
          "",
          "Use:",
          "/rest soft 1h",
          "/rest connection 1h",
          "",
          "⚡ Powered by Vortex Tech",
        ].join("\n"),
      };
    }

    const duration =
      parseDuration(
        args[1] || "",
      );

    if (!duration) {
      return {
        handled: true,
        response: [
          "🌑 DARK VORTEX REST",
          "",
          "❌ Invalid duration.",
          "",
          "Examples:",
          "/rest soft 30m",
          "/rest soft 1h",
          "/rest connection 2h",
          "",
          "⚡ Powered by Vortex Tech",
        ].join("\n"),
      };
    }

    if (state.active) {
      return {
        handled: true,
        response: [
          "🌑 DARK VORTEX REST",
          "",
          "⚠️ Bot is already resting.",
          "",
          `Current mode: ${
            state.mode ===
            "connection"
              ? "CONNECTION"
              : "SOFT"
          }`,
          "",
          "Use /rest off to cancel it.",
          "",
          "⚡ Powered by Vortex Tech",
        ].join("\n"),
      };
    }

    await startRest(
      mode,
      duration,
    );

    return {
      handled: true,
      response: [
        "🌑 DARK VORTEX REST MODE",
        "",
        "💤 REST STARTED",
        "",
        `🔌 Mode: ${
          mode === "connection"
            ? "CONNECTION REST"
            : "SOFT REST"
        }`,
        `⏳ Duration: ${formatDuration(
          duration,
        )}`,
        "",
        mode === "soft"
          ? "🤫 Bot will remain connected but will not process bot activity."
          : "🔌 WhatsApp connection will remain disconnected until the rest ends.",
        "",
        "Settings, commands and authentication remain untouched.",
        "",
        "⚡ Powered by Vortex Tech",
      ].join("\n"),
    };
  }

  if (
    command === "restauto"
  ) {
    if (
      args[0]?.toLowerCase() ===
      "off"
    ) {
      disableAutomaticRest();

      return {
        handled: true,
        response: [
          "🌑 DARK VORTEX",
          "",
          "🛑 AUTOMATIC REST DISABLED",
          "",
          "Automatic runtime rest has been disabled.",
          "",
          "⚡ Powered by Vortex Tech",
        ].join("\n"),
      };
    }

    if (args.length < 3) {
      return {
        handled: true,
        response: [
          "🌑 DARK VORTEX AUTOMATIC REST",
          "",
          "Usage:",
          "",
          "/restauto 10h 2h soft",
          "/restauto 10h 2h connection",
          "",
          "10h = active runtime",
          "2h  = rest duration",
          "",
          "⚡ Powered by Vortex Tech",
        ].join("\n"),
      };
    }

    const runtime =
      parseDuration(args[0]);

    const restDuration =
      parseDuration(args[1]);

    const mode =
      args[2].toLowerCase();

    if (
      !runtime ||
      !restDuration ||
      !(
        mode === "soft" ||
        mode === "connection"
      )
    ) {
      return {
        handled: true,
        response: [
          "🌑 DARK VORTEX AUTOMATIC REST",
          "",
          "❌ Invalid configuration.",
          "",
          "Example:",
          "/restauto 10h 2h connection",
          "",
          "⚡ Powered by Vortex Tech",
        ].join("\n"),
      };
    }

    enableAutomaticRest(
      runtime,
      restDuration,
      mode,
    );

    return {
      handled: true,
      response: [
        "🌑 DARK VORTEX AUTOMATIC REST",
        "",
        "🟢 AUTOMATIC REST ENABLED",
        "",
        `⏱️ Active runtime: ${formatDuration(
          runtime,
        )}`,
        `💤 Rest duration: ${formatDuration(
          restDuration,
        )}`,
        `🔌 Mode: ${
          mode === "connection"
            ? "CONNECTION"
            : "SOFT"
        }`,
        "",
        "Dark Vortex will automatically rest",
        "after the configured active runtime.",
        "",
        "⚡ Powered by Vortex Tech",
      ].join("\n"),
    };
  }

  return {
    handled: false,
  };
}


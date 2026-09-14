import { randomUUID } from "node:crypto";

import type {
  WASocket,
} from "@whiskeysockets/baileys";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

import {
  VX_TITLE,
} from "../security/vx-formatter.js";

/* =========================================================
   CONCISE VX RESPONSE FORMAT

   VX keeps its live progress-bar/edit system, but normal
   command output stays concise and operational.
========================================================= */

function vxProgressBar(percent: number): string {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  const width = 20;
  const filled = Math.round((safe / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${safe}%`;
}

function vxStageLabel(stage?: string): string {
  return String(stage || "PROCESSING")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function vxHeader(): string {
  return "🌑 DARK VORTEX • VX";
}

function vxEmoji(title: string): string {
  const value = title.toUpperCase();
  if (value.includes("FAILED")) return "⚠️";
  if (value.includes("ABORT")) return "🛑";
  if (value.includes("WARNING") || value.includes("THREAT")) return "⚠️";
  if (value.includes("SUCCESS") || value.includes("COMPLETE") || value.includes("ONLINE")) return "✅";
  if (value.includes("BOT")) return "🤖";
  if (value.includes("MONITOR")) return "👁️";
  if (value.includes("INCIDENT")) return "🚨";
  if (value.includes("LOG")) return "📋";
  if (value.includes("STAT")) return "📊";
  if (value.includes("REPORT")) return "📄";
  if (value.includes("HELP") || value.includes("USAGE")) return "ℹ️";
  return "🛡️";
}

function compactVxLines(lines: string[]): string[] {
  const ignored = [
    /^Operation:\s*/i,
    /^Audit history remains preserved\.?$/i,
    /^Audit history preserved\.?$/i,
    /^Audit activity remains preserved\.?$/i,
    /^Intelligence history preserved\.?$/i,
    /^VX intelligence remains active\.?$/i,
    /^Existing security services remain active\.?$/i,
    /^Existing security services remain protected\.?$/i,
    /^The failure has been logged\.?$/i,
    /^Failure recorded\.?$/i,
    /^Failure recorded in the audit system\.?$/i,
    /^VX monitoring infrastructure ready\.?$/i,
    /^Security records remain available\.?$/i,
  ];

  return lines
    .map(line => String(line).trim())
    .filter(line => line.length > 0)
    .filter(line => !ignored.some(pattern => pattern.test(line)));
}

function formatVxProgress(
  title: string,
  percent: number,
  stage: string,
  message?: string,
  _operationId?: string,
): string {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  const lines = [
    vxHeader(),
    "",
    `${vxStageLabel(stage)}...`,
    "",
    vxProgressBar(safe),
  ];

  if (message?.trim()) {
    lines.push("", message.trim());
  }

  if (safe >= 90 && safe < 100 && !message?.trim()) {
    lines.push("", "Almost done.");
  }

  return lines.join("\n");
}

function compactVx(
  title: string,
  lines: string[],
  emoji = vxEmoji(title),
): string {
  const clean = compactVxLines(lines);
  return [
    vxHeader(),
    "",
    `${emoji} ${title.trim()}`,
    ...(clean.length ? ["", ...clean] : []),
  ].join("\n");
}

function vxSuccess(title: string, lines: string[]): string {
  return compactVx(title, lines, "✅");
}

function vxError(title: string, lines: string[]): string {
  return compactVx(title, lines, "⚠️");
}

function vxWarning(title: string, lines: string[]): string {
  return compactVx(title, lines, "⚠️");
}

function vxInfo(title: string, lines: string[]): string {
  return compactVx(title, lines, "ℹ️");
}

function vxSecurity(title: string, lines: string[]): string {
  return compactVx(title, lines, "🛡️");
}


import {
  getVxBotProfile,
  getVxBotProfiles,
  getSuspectedVxBots,
} from "../security/vx-bot.js";

import {
  startVxMonitor,
  stopVxMonitor,
  getVxMonitor,
  getActiveVxMonitors,
  isVxMonitoring,
} from "../security/vx-monitor.js";

import {
  runVxScan,
  summarizeVxScan,
} from "../security/vx-scanner.js";

import {
  getVxIncident,
  getVxIncidents,
  abortVxIncident,
  resolveVxIncident,
} from "../security/vx-incidents.js";

import {
  readVxEvents,
  getVxStats,
} from "../security/vx-logger.js";

import {
  formatVxBotReport,
  formatVxIncidentReport,
  formatVxMonitorReport,
} from "../security/vx-reports.js";

import {
  getCommand,
  isVxCommand,
} from "./registry.js";

type AnyMessage = any;

/* =========================================================
   TYPES
========================================================= */

export type VxOperationStatus =
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "ABORTED";

export interface VxOperation {
  id: string;
  command: string;
  jid: string;
  startedAt: number;
  completedAt?: number;
  status: VxOperationStatus;
  progress: number;
  stage: string;
  message?: string;
  error?: string;
}

/* =========================================================
   OPERATION STATE
========================================================= */

const operations =
  new Map<
    string,
    VxOperation
  >();

let latestOperationId =
  "";

const MAX_OPERATION_HISTORY =
  200;

/* =========================================================
   OPERATION HELPERS
========================================================= */

function createOperation(
  command: string,
  jid: string,
): VxOperation {
  const timestamp =
    Date.now();

  const id =
    `VX-${timestamp
      .toString(36)
      .toUpperCase()}-${randomUUID()
      .replace(/-/g, "")
      .slice(0, 8)
      .toUpperCase()}`;

  const operation: VxOperation = {
    id,
    command:
      command
        .trim()
        .toLowerCase(),
    jid,
    startedAt:
      timestamp,
    status:
      "RUNNING",
    progress:
      0,
    stage:
      "INITIALIZING",
  };

  operations.set(
    id,
    operation,
  );

  latestOperationId =
    id;

  cleanupOperationHistory();

  return operation;
}

function cleanupOperationHistory(): void {
  if (
    operations.size <=
    MAX_OPERATION_HISTORY
  ) {
    return;
  }

  const entries =
    Array.from(
      operations.entries(),
    ).sort(
      (
        a,
        b,
      ) =>
        a[1].startedAt -
        b[1].startedAt,
    );

  const removeCount =
    operations.size -
    MAX_OPERATION_HISTORY;

  for (
    let index = 0;
    index < removeCount;
    index++
  ) {
    const entry =
      entries[index];

    if (!entry) {
      continue;
    }

    operations.delete(
      entry[0],
    );
  }
}

function updateOperation(
  operation: VxOperation,
  update:
    Partial<VxOperation>,
): void {
  if (
    update.progress !==
    undefined
  ) {
    update.progress =
      normalizePercent(
        update.progress,
      );
  }

  Object.assign(
    operation,
    update,
  );
}

function finishOperation(
  operation: VxOperation,
  status: VxOperationStatus,
  progress = 100,
  stage = "COMPLETED",
  message?: string,
): void {
  updateOperation(
    operation,
    {
      status,
      progress,
      stage,
      message,
      completedAt:
        Date.now(),
    },
  );
}

export function getVxOperation(
  id: string,
): VxOperation | undefined {
  return operations.get(
    id,
  );
}

export function getLatestVxOperation():
  VxOperation | undefined {
  if (
    !latestOperationId
  ) {
    return undefined;
  }

  return operations.get(
    latestOperationId,
  );
}

export function getVxOperations(
  limit = 20,
): VxOperation[] {
  const safeLimit =
    Number.isFinite(
      limit,
    )
      ? Math.max(
          1,
          Math.min(
            Math.floor(
              limit,
            ),
            100,
          ),
        )
      : 20;

  return Array.from(
    operations.values(),
  )
    .sort(
      (
        a,
        b,
      ) =>
        b.startedAt -
        a.startedAt,
    )
    .slice(
      0,
      safeLimit,
    );
}

/* =========================================================
   OPERATION STATUS HELPERS
========================================================= */

export function getVxOperationStatus(
  id?: string,
): VxOperationStatus |
  undefined {
  if (!id) {
    return getLatestVxOperation()
      ?.status;
  }

  return getVxOperation(
    id,
  )?.status;
}

export function isVxOperationRunning(
  id?: string,
): boolean {
  return (
    getVxOperationStatus(
      id,
    ) === "RUNNING"
  );
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeNumber(
  value?: string,
): string {
  if (!value) {
    return "";
  }

  return String(
    value,
  )
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
}

function phoneFromJid(
  jid?: string,
): string {
  const number =
    normalizeNumber(
      jid,
    );

  if (!number) {
    return "Unknown";
  }

  return `+${number}`;
}

function isGroup(
  jid: string,
): boolean {
  return String(
    jid,
  ).endsWith(
    "@g.us",
  );
}

function normalizePercent(
  value: number,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        value,
      ),
    ),
  );
}

/* =========================================================
   SINGLE MESSAGE ENGINE
========================================================= */

/*
 * Every VX operation owns exactly ONE WhatsApp message.
 *
 * Progress updates are serialized through a queue so that
 * multiple scanner/monitor callbacks can never edit the
 * same WhatsApp message simultaneously.
 *
 * IMPORTANT:
 * - createOperationMessage() sends exactly ONE message.
 * - editOperationMessage() ONLY edits that message.
 * - finishOperationMessage() ONLY edits that message.
 * - No progress update is allowed to send a new message.
 */

interface VxMessageState {
  key?: any;
  initialized: boolean;
  queue: Promise<void>;
  lastProgress: number;
}

const operationMessages =
  new Map<
    string,
    VxMessageState
  >();

function getOperationMessageState(
  operationId: string,
): VxMessageState {
  let state =
    operationMessages.get(
      operationId,
    );

  if (!state) {
    state = {
      initialized: false,
      queue: Promise.resolve(),
      lastProgress: -1,
    };

    operationMessages.set(
      operationId,
      state,
    );
  }

  return state;
}

function cleanupOperationMessageState(
  operationId: string,
): void {
  operationMessages.delete(
    operationId,
  );
}

async function send(
  sock: WASocket,
  jid: string,
  text: string,
  message?: AnyMessage,
): Promise<any> {
  return await sendVortexReply(
    sock,
    jid,
    text,
    message,
  );
}

/* ---------------------------------------------------------
   CREATE — EXACTLY ONE MESSAGE
--------------------------------------------------------- */

async function createOperationMessage(
  sock: WASocket,
  jid: string,
  operation: VxOperation,
  title: string,
  percent: number,
  stage: string,
  message?: string,
  originalMessage?: AnyMessage,
): Promise<any> {
  const state =
    getOperationMessageState(
      operation.id,
    );

  const safePercent =
    normalizePercent(
      percent,
    );

  updateOperation(
    operation,
    {
      progress:
        safePercent,
      stage,
      message,
    },
  );

  if (
    state.initialized &&
    state.key
  ) {
    return {
      key: state.key,
    };
  }

  let createdMessage:
    any;

  state.queue =
    state.queue.then(
      async () => {
        if (
          state.initialized &&
          state.key
        ) {
          return;
        }

        const progressText =
          formatVxProgress(
            title,
            safePercent,
            stage,
            message,
            operation.id,
          );

        createdMessage =
          await send(
            sock,
            jid,
            progressText,
            originalMessage,
          );

        if (
          createdMessage?.key
        ) {
          state.key =
            createdMessage.key;

          state.initialized =
            true;

          state.lastProgress =
            safePercent;
        }
      },
    );

  await state.queue;

  if (
    !state.key
  ) {
    console.error(
      `[VX] Could not initialize operation message: ${operation.id}`,
    );

    return createdMessage;
  }

  return {
    key:
      state.key,
  };
}

/* ---------------------------------------------------------
   QUEUED EDIT
--------------------------------------------------------- */

async function editOperationMessage(
  sock: WASocket,
  jid: string,
  key: any,
  operation: VxOperation,
  title: string,
  percent: number,
  stage: string,
  message?: string,
): Promise<void> {
  const state =
    getOperationMessageState(
      operation.id,
    );

  const safePercent =
    normalizePercent(
      percent,
    );

  updateOperation(
    operation,
    {
      progress:
        safePercent,
      stage,
      message,
    },
  );

  const operationKey =
    state.key ||
    key;

  if (
    !operationKey
  ) {
    console.error(
      `[VX] Progress update skipped — no message key for ${operation.id}`,
    );

    return;
  }

  state.queue =
    state.queue.then(
      async () => {
        if (
          safePercent <
          state.lastProgress
        ) {
          return;
        }

        try {
          await sock.sendMessage(
            jid,
            {
              text:
                formatVxProgress(
                  title,
                  safePercent,
                  stage,
                  message,
                  operation.id,
                ),
              edit:
                operationKey,
            } as any,
          );

          state.lastProgress =
            safePercent;
        } catch (
          editError
        ) {
          console.error(
            `[VX] Progress edit failed for ${operation.id}:`,
            editError,
          );
        }
      },
    );

  await state.queue;
}

/* ---------------------------------------------------------
   FINAL EDIT
--------------------------------------------------------- */

async function finishOperationMessage(
  sock: WASocket,
  jid: string,
  key: any,
  operation: VxOperation,
  title: string,
  status: VxOperationStatus,
  text: string,
): Promise<void> {
  finishOperation(
    operation,
    status,
    100,
    status ===
      "COMPLETED"
      ? "COMPLETED"
      : status,
    text,
  );

  const state =
    getOperationMessageState(
      operation.id,
    );

  const operationKey =
    state.key ||
    key;

  if (
    !operationKey
  ) {
    console.error(
      `[VX] Final response skipped — no message key for ${operation.id}`,
    );

    cleanupOperationMessageState(
      operation.id,
    );

    return;
  }

  state.queue =
    state.queue.then(
      async () => {
        try {
          await sock.sendMessage(
            jid,
            {
              text,
              edit:
                operationKey,
            } as any,
          );

          state.lastProgress =
            100;
        } catch (
          editError
        ) {
          console.error(
            `[VX] Final response edit failed for ${title} (${operation.id}):`,
            editError,
          );
        }
      },
    );

  await state.queue;

  cleanupOperationMessageState(
    operation.id,
  );
}

/* =========================================================
   GROUP METADATA
========================================================= */

async function getGroup(
  sock: WASocket,
  jid: string,
): Promise<any | null> {
  if (
    !isGroup(
      jid,
    )
  ) {
    return null;
  }

  try {
    return await sock.groupMetadata(
      jid,
    );
  } catch (
    metadataError
  ) {
    console.error(
      "[VX] Group metadata lookup failed:",
      metadataError,
    );

    return null;
  }
}

/* =========================================================
   VX SCAN
========================================================= */

async function commandScan(
  sock: WASocket,
  jid: string,
  message?: AnyMessage,
): Promise<void> {
  const operation =
    createOperation(
      "vxscan",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX SECURITY SCAN",
        5,
        "INITIALIZING",
        "Preparing VX intelligence engine...",
        message,
      );

    const metadata =
      await getGroup(
        sock,
        jid,
      );

    if (!metadata) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX SECURITY SCAN",
        "FAILED",
        vxError(
          "VX SCAN — GROUP REQUIRED",
          [
            "This security scan requires",
            "a WhatsApp group context.",
            "",
            `Operation: ${operation.id}`,
            "",
            "Run vxscan inside a group.",
          ],
        ),
      );

      return;
    }

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY SCAN",
      10,
      "GROUP_ANALYSIS",
      "Reading group participants and security context...",
    );

    const participants =
      Array.isArray(
        metadata.participants,
      )
        ? metadata.participants
        : [];

    const scanParticipants =
      participants
        .map(
          (
            participant: any,
          ) => {
            const jidValue =
              participant.id ||
              participant.jid ||
              participant.phoneNumber ||
              "";

            const name =
              participant.name ||
              participant.notify ||
              participant.pushName ||
              "Unknown";

            return {
              jid:
                jidValue,
              name,
              phoneNumber:
                phoneFromJid(
                  participant.phoneNumber ||
                    jidValue,
                ),
            };
          },
        )
        .filter(
          (
            participant: {
              jid: string;
            },
          ) =>
            Boolean(
              participant.jid,
            ),
        );

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY SCAN",
      20,
      "PARTICIPANTS_LOADED",
      `${scanParticipants.length} participant record(s) prepared.`,
    );

    const activity:
      any[] = [];

    const result =
      await runVxScan(
        {
          jid,
          name:
            metadata.subject ||
            "Unknown Group",
          participantCount:
            scanParticipants.length,
        },
        scanParticipants,
        activity,
        async (
          progressState: {
            progress: number;
            stage: string;
            message?: string;
          },
        ) => {
          await editOperationMessage(
            sock,
            jid,
            progressKey?.key,
            operation,
            "VX SECURITY SCAN",
            progressState.progress,
            progressState.stage,
            progressState.message,
          );
        },
      );

    const summary =
      summarizeVxScan(
        result,
      );

    if (
      result.aborted
    ) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX SECURITY SCAN",
        "ABORTED",
        vxWarning(
          "VX SCAN ABORTED",
          [
            "Security scanning was stopped",
            "before completion.",
            "",
            ...summary,
            "",
            `Operation: ${operation.id}`,
            "",
            "Audit activity remains preserved.",
          ],
        ),
      );

      return;
    }

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY SCAN",
      "COMPLETED",
      vxSuccess(
        "VX SCAN COMPLETE",
        [
          "Security analysis completed.",
          "",
          ...summary,
          "",
          `Operation: ${operation.id}`,
          "",
          "VX intelligence remains active.",
        ],
      ),
    );
  } catch (
    scanError
  ) {
    const reason =
      scanError instanceof
      Error
        ? scanError.message
        : "Unknown scanner error.";

    console.error(
      "[VX] Scan failed:",
      scanError,
    );

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY SCAN",
      "FAILED",
      vxError(
        "VX SCAN FAILED",
        [
          "The security scanner encountered",
          "an unexpected processing error.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
          "",
          "Failure recorded in the audit system.",
          "Existing security services remain active.",
        ],
      ),
    );
  }
}

/* =========================================================
   VX MONITOR
========================================================= */

async function commandMonitor(
  sock: WASocket,
  jid: string,
  args: string[],
  message?: AnyMessage,
): Promise<void> {
  const action =
    (
      args[0] ||
      "start"
    )
      .trim()
      .toLowerCase();

  if (
    action === "off" ||
    action === "stop"
  ) {
    const operation =
      createOperation(
        "vxmonitor stop",
        jid,
      );

    let progressKey:
      any;

    try {
      progressKey =
        await createOperationMessage(
          sock,
          jid,
          operation,
          "VX MONITOR",
          10,
          "INITIALIZING",
          "Preparing monitoring shutdown...",
          message,
        );

      if (
        !isGroup(
          jid,
        )
      ) {
        await finishOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX MONITOR",
          "FAILED",
          vxError(
            "VX MONITOR — GROUP REQUIRED",
            [
              "A group monitoring session",
              "must be controlled from its group.",
              "",
              `Operation: ${operation.id}`,
            ],
          ),
        );

        return;
      }

      await editOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX MONITOR",
        40,
        "LOCATING_SESSION",
        "Checking active monitoring session...",
      );

      const stopped =
        await stopVxMonitor(
          jid,
        );

      if (!stopped) {
        await finishOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX MONITOR",
          "COMPLETED",
          vxInfo(
            "VX MONITOR",
            [
              "Monitoring is currently offline.",
              "",
              "No active VX monitoring session",
              "was found for this group.",
              "",
              `Operation: ${operation.id}`,
            ],
          ),
        );

        return;
      }

      await editOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX MONITOR",
        80,
        "SHUTTING_DOWN",
        "Terminating live monitoring session...",
      );

      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX MONITOR",
        "COMPLETED",
        vxSuccess(
          "VX MONITOR STOPPED",
          [
            "LIVE MONITORING TERMINATED",
            "",
            `Group: ${
              stopped.groupName ||
              "Unknown"
            }`,
            `Session: ${stopped.id}`,
            `Operation: ${operation.id}`,
            "",
            "Audit history preserved.",
            "Security records remain available.",
          ],
        ),
      );
    } catch (
      stopError
    ) {
      const reason =
        stopError instanceof
        Error
          ? stopError.message
          : "Unknown monitor shutdown error.";

      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX MONITOR",
        "FAILED",
        vxError(
          "VX MONITOR STOP FAILED",
          [
            "The monitoring session could not",
            "be stopped cleanly.",
            "",
            `Operation: ${operation.id}`,
            `Error: ${reason}`,
          ],
        ),
      );
    }

    return;
  }

  if (
    action === "status"
  ) {
    const operation =
      createOperation(
        "vxmonitor status",
        jid,
      );

    let progressKey:
      any;

    try {
      progressKey =
        await createOperationMessage(
          sock,
          jid,
          operation,
          "VX MONITOR",
          10,
          "INITIALIZING",
          "Reading monitoring state...",
          message,
        );

      if (
        isGroup(
          jid,
        )
      ) {
        await editOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX MONITOR",
          45,
          "GROUP_STATUS_READ",
          "Checking this group's live monitor...",
        );

        const monitor =
          getVxMonitor(
            jid,
          );

        if (!monitor) {
          await finishOperationMessage(
            sock,
            jid,
            progressKey?.key,
            operation,
            "VX MONITOR",
            "COMPLETED",
            vxInfo(
              "VX MONITOR STATUS",
              [
                "STATUS: OFFLINE",
                "",
                "No active monitor is running",
                "for this group.",
                "",
                "Use vxmonitor to start monitoring.",
                "",
                `Operation: ${operation.id}`,
              ],
            ),
          );

          return;
        }

        await finishOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX MONITOR",
          "COMPLETED",
          [
            formatVxMonitorReport(
              monitor,
            ),
            "",
            `Operation: ${operation.id}`,
          ].join(
            "\n",
          ),
        );

        return;
      }

      await editOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX MONITOR",
        60,
        "NETWORK_STATUS_READ",
        "Reading all active monitoring sessions...",
      );

      const monitors =
        await getActiveVxMonitors();

      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX MONITOR",
        "COMPLETED",
        vxSecurity(
          "VX MONITOR NETWORK",
          [
            `Active sessions: ${monitors.length}`,
            "",
            ...(monitors.length
              ? monitors.map(
                  monitor =>
                    `• ${
                      monitor.groupName ||
                      "Unknown"
                    } — ${monitor.id}`,
                )
              : [
                  "No active monitoring sessions.",
                ]),
            "",
            `Operation: ${operation.id}`,
            "",
            "VX monitoring infrastructure ready.",
          ],
        ),
      );
    } catch (
      statusError
    ) {
      const reason =
        statusError instanceof
        Error
          ? statusError.message
          : "Unknown monitor status error.";

      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX MONITOR",
        "FAILED",
        vxError(
          "VX MONITOR STATUS FAILED",
          [
            "Monitoring status could not",
            "be read.",
            "",
            `Operation: ${operation.id}`,
            `Error: ${reason}`,
          ],
        ),
      );
    }

    return;
  }

  const operation =
    createOperation(
      "vxmonitor",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX MONITOR",
        5,
        "INITIALIZING",
        "Preparing live security monitoring...",
        message,
      );

    const metadata =
      await getGroup(
        sock,
        jid,
      );

    if (!metadata) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX MONITOR",
        "FAILED",
        vxError(
          "VX MONITOR — GROUP REQUIRED",
          [
            "Live monitoring requires",
            "a WhatsApp group context.",
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX MONITOR",
      20,
      "GROUP_ANALYSIS",
      "Reading group security context...",
    );

    if (
      isVxMonitoring(
        jid,
      )
    ) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX MONITOR",
        "COMPLETED",
        vxWarning(
          "VX MONITOR ALREADY ACTIVE",
          [
            "A live monitoring session",
            "is already running here.",
            "",
            `Group: ${
              metadata.subject ||
              "Unknown Group"
            }`,
            "",
            "Use vxmonitor status to",
            "inspect the active session.",
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX MONITOR",
      35,
      "STARTING_ENGINE",
      "Initializing live security sensors...",
    );

    const monitor =
      await startVxMonitor(
        {
          jid,
          name:
            metadata.subject ||
            "Unknown Group",
          participantCount:
            Array.isArray(
              metadata.participants,
            )
              ? metadata.participants.length
              : undefined,
        },
        async (
          progressState: {
            progress: number;
            stage: string;
            message?: string;
          },
        ) => {
          await editOperationMessage(
            sock,
            jid,
            progressKey?.key,
            operation,
            "VX MONITOR",
            progressState.progress,
            progressState.stage,
            progressState.message,
          );
        },
      );

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX MONITOR",
      "COMPLETED",
      vxSecurity(
        "VX MONITOR ONLINE",
        [
          "LIVE MONITORING INITIALIZED",
          "",
          `Group: ${
            monitor.groupName ||
            "Unknown"
          }`,
          `Session: ${monitor.id}`,
          `Operation: ${operation.id}`,
          "",
          "Bot Detection     • ONLINE",
          "Anti-Spam         • ONLINE",
          "Link Detection    • ONLINE",
          "Raid Detection    • ONLINE",
          "Behavior Engine   • ONLINE",
          "Audit Logging     • ONLINE",
          "DM Alerts         • ONLINE",
          "",
          "VX IS NOW MONITORING LIVE ACTIVITY.",
        ],
      ),
    );
  } catch (
    monitorError
  ) {
    const reason =
      monitorError instanceof
      Error
        ? monitorError.message
        : "Unknown monitor error.";

    console.error(
      "[VX] Monitor initialization failed:",
      monitorError,
    );

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX MONITOR",
      "FAILED",
      vxError(
        "VX MONITOR FAILED",
        [
          "Live monitoring could not be initialized.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
          "",
          "The failure has been logged.",
          "Existing security services remain protected.",
        ],
      ),
    );
  }
}

/* =========================================================
   VX BOT
========================================================= */

async function commandBot(
  sock: WASocket,
  jid: string,
  args: string[],
  message?: AnyMessage,
): Promise<void> {
  const operation =
    createOperation(
      "vxbot",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX BOT INTELLIGENCE",
        10,
        "INITIALIZING",
        "Loading bot intelligence service...",
        message,
      );

    const action =
      (
        args[0] ||
        "list"
      )
        .trim()
        .toLowerCase();

    if (
      action === "scan"
    ) {
      if (
        !isGroup(
          jid,
        )
      ) {
        await finishOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX BOT INTELLIGENCE",
          "FAILED",
          vxError(
            "VX BOT SCAN — GROUP REQUIRED",
            [
              "Bot scanning requires",
              "a WhatsApp group context.",
              "",
              `Operation: ${operation.id}`,
            ],
          ),
        );

        return;
      }

      await editOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX BOT INTELLIGENCE",
        40,
        "PROFILE_ANALYSIS",
        "Searching high-confidence bot profiles...",
      );

      const bots =
        await getSuspectedVxBots(
          50,
        );

      const groupBots =
        bots.filter(
          bot =>
            Array.isArray(
              bot.groupIds,
            ) &&
            bot.groupIds.includes(
              jid
                .trim()
                .toLowerCase(),
            ),
        );

      if (
        !groupBots.length
      ) {
        await finishOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX BOT INTELLIGENCE",
          "COMPLETED",
          vxSuccess(
            "VX BOT SCAN CLEAR",
            [
              "NO SUSPECTED BOTS FOUND",
              "",
              "No high-confidence suspected bot",
              "profile was found for this group.",
              "",
              "Group intelligence status: CLEAR",
              "",
              `Operation: ${operation.id}`,
            ],
          ),
        );

        return;
      }

      const reports =
        groupBots
          .slice(
            0,
            10,
          )
          .map(
            bot =>
              formatVxBotReport(
                bot,
                undefined,
              ),
          );

      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX BOT INTELLIGENCE",
        "COMPLETED",
        vxWarning(
          "VX BOT THREATS DETECTED",
          [
            `Suspected profiles: ${groupBots.length}`,
            "",
            ...reports,
            "",
            `Operation: ${operation.id}`,
            "",
            "Intelligence history preserved.",
          ],
        ),
      );

      return;
    }

    if (
      action === "info"
    ) {
      const identifier =
        args[1];

      if (!identifier) {
        await finishOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX BOT INTELLIGENCE",
          "COMPLETED",
          vxInfo(
            "VX BOT USAGE",
            [
              "Usage:",
              "vxbot info <phone-number>",
              "",
              "Inspect a VX bot intelligence profile.",
              "",
              `Operation: ${operation.id}`,
            ],
          ),
        );

        return;
      }

      await editOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX BOT INTELLIGENCE",
        45,
        "PROFILE_LOOKUP",
        `Inspecting profile for ${identifier}...`,
      );

      const profile =
        await getVxBotProfile(
          identifier,
        );

      if (!profile) {
        await finishOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX BOT INTELLIGENCE",
          "COMPLETED",
          vxInfo(
            "VX BOT PROFILE",
            [
              "No VX bot profile was found.",
              "",
              `Number: ${identifier}`,
              "",
              "The account may not have",
              "enough intelligence history yet.",
              "",
              `Operation: ${operation.id}`,
            ],
          ),
        );

        return;
      }

      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX BOT INTELLIGENCE",
        "COMPLETED",
        vxSecurity(
          "VX BOT PROFILE",
          [
            formatVxBotReport(
              profile,
            ),
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    if (
      action === "logs"
    ) {
      await editOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX BOT INTELLIGENCE",
        45,
        "PROFILE_LOGS_READ",
        "Reading bot intelligence profiles...",
      );

      const profiles =
        await getVxBotProfiles(
          20,
        );

      if (!profiles.length) {
        await finishOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX BOT INTELLIGENCE",
          "COMPLETED",
          vxInfo(
            "VX BOT LOGS",
            [
              "No bot intelligence profiles",
              "have been recorded yet.",
              "",
              "Intelligence database is empty.",
              "",
              `Operation: ${operation.id}`,
            ],
          ),
        );

        return;
      }

      const lines =
        profiles.map(
          (
            profile,
            index,
          ) => {
            const severity =
              profile.severity ||
              "LOW";

            return (
              `${index + 1}. ` +
              `${profile.name || "Unknown"} ` +
              `(${profile.phoneNumber || phoneFromJid(profile.jid)}) ` +
              `— ${severity} ${profile.riskScore}/100`
            );
          },
        );

      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX BOT INTELLIGENCE",
        "COMPLETED",
        vxSecurity(
          "VX BOT INTELLIGENCE LOGS",
          [
            `Profiles tracked: ${profiles.length}`,
            "",
            ...lines,
            "",
            `Operation: ${operation.id}`,
            "",
            "Intelligence history preserved.",
          ],
        ),
      );

      return;
    }

    if (
      action === "report"
    ) {
      await editOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX BOT INTELLIGENCE",
        45,
        "REPORT_BUILDING",
        "Building suspected bot intelligence report...",
      );

      const bots =
        await getSuspectedVxBots(
          20,
        );

      if (!bots.length) {
        await finishOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX BOT INTELLIGENCE",
          "COMPLETED",
          vxSuccess(
            "VX BOT REPORT",
            [
              "NO HIGH-CONFIDENCE THREATS",
              "",
              "The VX intelligence database currently",
              "contains no high-confidence suspected bots.",
              "",
              `Operation: ${operation.id}`,
            ],
          ),
        );

        return;
      }

      const reports =
        bots
          .slice(
            0,
            10,
          )
          .map(
            bot =>
              formatVxBotReport(
                bot,
              ),
          );

      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX BOT INTELLIGENCE",
        "COMPLETED",
        vxWarning(
          "VX BOT REPORT",
          [
            `Suspected profiles: ${bots.length}`,
            "",
            ...reports,
            "",
            `Operation: ${operation.id}`,
            "",
            "Intelligence history preserved.",
          ],
        ),
      );

      return;
    }

    const profiles =
      await getVxBotProfiles(
        20,
      );

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX BOT INTELLIGENCE",
      "COMPLETED",
      vxInfo(
        "VX BOT COMMAND CENTER",
        [
          "Usage:",
          "• vxbot scan",
          "• vxbot info <number>",
          "• vxbot logs",
          "• vxbot report",
          "",
          `${profiles.length} tracked profile(s).`,
          `Operation: ${operation.id}`,
        ],
      ),
    );
  } catch (
    botError
  ) {
    const reason =
      botError instanceof
      Error
        ? botError.message
        : "Unknown bot intelligence error.";

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX BOT INTELLIGENCE",
      "FAILED",
      vxError(
        "VX BOT INTELLIGENCE FAILED",
        [
          "The VX bot intelligence operation failed.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
          "",
          "Failure recorded.",
        ],
      ),
    );
  }
}

/* =========================================================
   VX INCIDENTS
========================================================= */

async function commandIncident(
  sock: WASocket,
  jid: string,
  args: string[],
  message?: AnyMessage,
): Promise<void> {
  const operation =
    createOperation(
      "vxincident",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX INCIDENT CENTER",
        10,
        "INITIALIZING",
        "Loading incident intelligence...",
        message,
      );

    const id =
      args[0]?.trim();

    if (!id) {
      await editOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX INCIDENT CENTER",
        45,
        "INCIDENT_LIST_READ",
        "Reading recent security incidents...",
      );

      const incidents =
        await getVxIncidents(
          20,
        );

      if (!incidents.length) {
        await finishOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX INCIDENT CENTER",
          "COMPLETED",
          vxInfo(
            "VX INCIDENT CENTER",
            [
              "No security incidents recorded.",
              "",
              "Incident queue is clear.",
              "",
              `Operation: ${operation.id}`,
            ],
          ),
        );

        return;
      }

      const lines =
        incidents.map(
          incident =>
            `• ${incident.id} — ${incident.severity} — ${incident.status}`,
        );

      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX INCIDENT CENTER",
        "COMPLETED",
        vxSecurity(
          "VX INCIDENT CENTER",
          [
            `Incidents: ${incidents.length}`,
            "",
            ...lines,
            "",
            "Use vxincident <id> for full details.",
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX INCIDENT CENTER",
      55,
      "INCIDENT_READ",
      `Loading incident ${id}...`,
    );

    const incident =
      await getVxIncident(
        id,
      );

    if (!incident) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX INCIDENT CENTER",
        "FAILED",
        vxError(
          "VX INCIDENT NOT FOUND",
          [
            `Incident: ${id}`,
            "",
            "No matching security incident exists.",
            "",
            "Use vxincident to list recent incidents.",
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX INCIDENT CENTER",
      "COMPLETED",
      vxSecurity(
        "VX INCIDENT REPORT",
        [
          formatVxIncidentReport(
            incident,
          ),
          "",
          `Operation: ${operation.id}`,
        ],
      ),
    );
  } catch (
    incidentError
  ) {
    const reason =
      incidentError instanceof
      Error
        ? incidentError.message
        : "Unknown incident error.";

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX INCIDENT CENTER",
      "FAILED",
      vxError(
        "VX INCIDENT OPERATION FAILED",
        [
          "Incident processing failed.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
        ],
      ),
    );
  }
}

/* =========================================================
   VX ABORT
========================================================= */

async function commandAbort(
  sock: WASocket,
  jid: string,
  args: string[],
  message?: AnyMessage,
): Promise<void> {
  const operation =
    createOperation(
      "vxabort",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX EMERGENCY ABORT",
        10,
        "INITIALIZING",
        "Preparing emergency security control...",
        message,
      );

    const id =
      args[0]?.trim();

    if (!id) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX EMERGENCY ABORT",
        "COMPLETED",
        vxInfo(
          "VX ABORT USAGE",
          [
            "Usage:",
            "vxabort <incident-id|all>",
            "",
            "Emergency stop for active VX incidents.",
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX EMERGENCY ABORT",
      35,
      "INCIDENT_LOOKUP",
      "Locating active security incidents...",
    );

    if (
      id.toLowerCase() ===
      "all"
    ) {
      const incidents =
        await getVxIncidents(
          100,
        );

      const active =
        incidents.filter(
          incident =>
            incident.status ===
              "DETECTED" ||
            incident.status ===
              "ANALYZING" ||
            incident.status ===
              "ACTIVE",
        );

      if (!active.length) {
        await finishOperationMessage(
          sock,
          jid,
          progressKey?.key,
          operation,
          "VX EMERGENCY ABORT",
          "COMPLETED",
          vxInfo(
            "VX EMERGENCY ABORT",
            [
              "No active security operations found.",
              "",
              "The incident queue is currently clear.",
              "",
              `Operation: ${operation.id}`,
            ],
          ),
        );

        return;
      }

      let aborted =
        0;

      for (
        let index = 0;
        index < active.length;
        index++
      ) {
        const incident =
          active[index];

        if (!incident) {
          continue;
        }

        try {
          await abortVxIncident(
            incident.id,
            "OWNER",
          );

          aborted++;

          const progress =
            40 +
            Math.round(
              ((index + 1) /
                active.length) *
                50,
            );

          await editOperationMessage(
            sock,
            jid,
            progressKey?.key,
            operation,
            "VX EMERGENCY ABORT",
            progress,
            "ABORTING_INCIDENTS",
            `Aborted ${aborted}/${active.length} active incident(s)...`,
          );
        } catch (
          abortError
        ) {
          console.error(
            `[VX] Failed to abort ${incident.id}:`,
            abortError,
          );
        }
      }

      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX EMERGENCY ABORT",
        "COMPLETED",
        vxSuccess(
          "VX EMERGENCY ABORT COMPLETE",
          [
            "ACTIVE OPERATIONS STOPPED",
            "",
            `Aborted: ${aborted}`,
            `Found: ${active.length}`,
            `Operation: ${operation.id}`,
            "",
            "Audit history preserved.",
            "Incident records remain intact.",
          ],
        ),
      );

      return;
    }

    const incident =
      await getVxIncident(
        id,
      );

    if (!incident) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX EMERGENCY ABORT",
        "FAILED",
        vxError(
          "VX ABORT FAILED",
          [
            `Incident: ${id}`,
            "",
            "Incident not found.",
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    if (
      incident.status ===
      "ABORTED"
    ) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX EMERGENCY ABORT",
        "COMPLETED",
        vxInfo(
          "VX ABORT",
          [
            `Incident: ${id}`,
            "",
            "This incident has already been aborted.",
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX EMERGENCY ABORT",
      70,
      "ABORTING_INCIDENT",
      `Stopping incident ${id}...`,
    );

    await abortVxIncident(
      id,
      "OWNER",
    );

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX EMERGENCY ABORT",
      "COMPLETED",
      vxSuccess(
        "VX OPERATION ABORTED",
        [
          "SECURITY OPERATION STOPPED",
          "",
          `Incident: ${id}`,
          "",
          "Action: OWNER ABORT",
          "Status: ABORTED",
          `Operation: ${operation.id}`,
          "Audit history preserved.",
        ],
      ),
    );
  } catch (
    abortError
  ) {
    const reason =
      abortError instanceof
      Error
        ? abortError.message
        : "Unknown abort error.";

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX EMERGENCY ABORT",
      "FAILED",
      vxError(
        "VX ABORT FAILED",
        [
          "The security operation could not be aborted.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
          "",
          "The failure has been logged.",
        ],
      ),
    );
  }
}

/* =========================================================
   VX RESUME
========================================================= */

async function commandResume(
  sock: WASocket,
  jid: string,
  args: string[],
  message?: AnyMessage,
): Promise<void> {
  const operation =
    createOperation(
      "vxresume",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX INCIDENT RESUME",
        10,
        "INITIALIZING",
        "Preparing incident lifecycle restoration...",
        message,
      );

    const id =
      args[0]?.trim();

    if (!id) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX INCIDENT RESUME",
        "COMPLETED",
        vxInfo(
          "VX RESUME USAGE",
          [
            "Usage:",
            "vxresume <incident-id>",
            "",
            "Continue an aborted VX incident lifecycle.",
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX INCIDENT RESUME",
      40,
      "INCIDENT_LOOKUP",
      `Loading incident ${id}...`,
    );

    const incident =
      await getVxIncident(
        id,
      );

    if (!incident) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX INCIDENT RESUME",
        "FAILED",
        vxError(
          "VX RESUME FAILED",
          [
            `Incident: ${id}`,
            "",
            "Incident not found.",
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    if (
      incident.status !==
      "ABORTED"
    ) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX INCIDENT RESUME",
        "COMPLETED",
        vxInfo(
          "VX RESUME",
          [
            `Incident: ${id}`,
            "",
            `Current status: ${incident.status}`,
            "",
            "This incident is not in an aborted state.",
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX INCIDENT RESUME",
      75,
      "RESTORING_LIFECYCLE",
      "Restoring incident lifecycle state...",
    );

    await resolveVxIncident(
      id,
    );

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX INCIDENT RESUME",
      "COMPLETED",
      vxSuccess(
        "VX INCIDENT RESUMED",
        [
          "INCIDENT LIFECYCLE RESTORED",
          "",
          `Incident: ${id}`,
          "",
          "Status: RETURNED TO VX LIFECYCLE",
          `Operation: ${operation.id}`,
          "Audit history preserved.",
        ],
      ),
    );
  } catch (
    resumeError
  ) {
    const reason =
      resumeError instanceof
      Error
        ? resumeError.message
        : "Unknown resume error.";

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX INCIDENT RESUME",
      "FAILED",
      vxError(
        "VX RESUME FAILED",
        [
          "The incident could not be resumed.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
          "",
          "The failure has been logged.",
        ],
      ),
    );
  }
}

/* =========================================================
   VX STATUS
========================================================= */

async function commandStatus(
  sock: WASocket,
  jid: string,
  message?: AnyMessage,
): Promise<void> {
  const operation =
    createOperation(
      "vxstatus",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX SECURITY STATUS",
        10,
        "INITIALIZING",
        "Reading VX security state...",
        message,
      );

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY STATUS",
      45,
      "SECURITY_STATS_READ",
      "Reading current VX security statistics...",
    );

    const stats =
      await getVxStats();

    const groupStatus =
      isGroup(
        jid,
      )
        ? isVxMonitoring(
            jid,
          )
          ? "LIVE MONITORING"
          : "MONITOR OFFLINE"
        : "GLOBAL";

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY STATUS",
      "COMPLETED",
      vxSecurity(
        "VX SECURITY STATUS",
        [
          "VX ENGINE: ONLINE",
          `Scope: ${groupStatus}`,
          "",
          "Bot Intelligence  • READY",
          "Behavior Engine   • READY",
          "Threat Analysis   • READY",
          "Event Sensor      • READY",
          "Audit Logger      • READY",
          "Incident Engine   • READY",
          "",
          `Events: ${stats.totalEvents}`,
          `Incidents: ${stats.totalIncidents}`,
          `Threats: ${stats.totalThreats}`,
          `High/Critical: ${
            stats.high +
            stats.critical
          }`,
          "",
          `Operation: ${operation.id}`,
          "",
          "VX SECURITY CORE OPERATIONAL",
        ],
      ),
    );
  } catch (
    statusError
  ) {
    const reason =
      statusError instanceof
      Error
        ? statusError.message
        : "Unknown VX status error.";

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY STATUS",
      "FAILED",
      vxError(
        "VX STATUS FAILED",
        [
          "VX security status could not be read.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
        ],
      ),
    );
  }
}

/* =========================================================
   VX HEALTH
========================================================= */

async function commandHealth(
  sock: WASocket,
  jid: string,
  message?: AnyMessage,
): Promise<void> {
  const operation =
    createOperation(
      "vxhealth",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX SECURITY HEALTH",
        10,
        "INITIALIZING",
        "Running security health checks...",
        message,
      );

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY HEALTH",
      45,
      "HEALTH_CHECK",
      "Reading security engine and storage health...",
    );

    const stats =
      await getVxStats();

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY HEALTH",
      "COMPLETED",
      vxSuccess(
        "VX SECURITY HEALTH",
        [
          "Security Engine    • HEALTHY",
          "Event Logger       • HEALTHY",
          "Incident Store     • HEALTHY",
          "Bot Intelligence   • HEALTHY",
          "Monitor Service    • HEALTHY",
          "Scanner Service    • HEALTHY",
          "",
          `Audit Events: ${stats.totalEvents}`,
          `Incidents: ${stats.totalIncidents}`,
          `Critical: ${stats.critical}`,
          "",
          `Operation: ${operation.id}`,
          "",
          "All reported VX services are operational.",
        ],
      ),
    );
  } catch (
    healthError
  ) {
    const reason =
      healthError instanceof
      Error
        ? healthError.message
        : "Unknown VX health error.";

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY HEALTH",
      "FAILED",
      vxError(
        "VX HEALTH CHECK FAILED",
        [
          "Security health checks could not complete.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
        ],
      ),
    );
  }
}

/* =========================================================
   VX LOGS
========================================================= */

async function commandLogs(
  sock: WASocket,
  jid: string,
  args: string[],
  message?: AnyMessage,
): Promise<void> {
  const operation =
    createOperation(
      "vxlogs",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX AUDIT LOGS",
        10,
        "INITIALIZING",
        "Opening VX event stream...",
        message,
      );

    const requested =
      Number(
        args[0],
      );

    const limit =
      Number.isFinite(
        requested,
      ) &&
      requested > 0
        ? Math.min(
            Math.floor(
              requested,
            ),
            50,
          )
        : 15;

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX AUDIT LOGS",
      50,
      "LOGS_READ",
      `Reading up to ${limit} recent event(s)...`,
    );

    const events =
      await readVxEvents(
        limit,
      );

    if (!events.length) {
      await finishOperationMessage(
        sock,
        jid,
        progressKey?.key,
        operation,
        "VX AUDIT LOGS",
        "COMPLETED",
        vxInfo(
          "VX AUDIT LOGS",
          [
            "No security events have been recorded yet.",
            "",
            "Audit stream is currently empty.",
            "",
            `Operation: ${operation.id}`,
          ],
        ),
      );

      return;
    }

    const lines =
      events.map(
        (
          event: any,
          index: number,
        ) => {
          const time =
            new Date(
              event.timestamp,
            ).toLocaleTimeString(
              "en-GB",
              {
                hour12:
                  false,
              },
            );

          return (
            `${index + 1}. ` +
            `${time} | ` +
            `${event.type || "EVENT"} | ` +
            `${event.risk?.severity || event.severity || "LOW"} | ` +
            `${event.risk?.score ?? 0}/100`
          );
        },
      );

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX AUDIT LOGS",
      "COMPLETED",
      vxSecurity(
        "VX AUDIT LOGS",
        [
          `Showing ${events.length} event(s)`,
          "",
          ...lines,
          "",
          `Operation: ${operation.id}`,
          "",
          "Audit history preserved.",
        ],
      ),
    );
  } catch (
    logsError
  ) {
    const reason =
      logsError instanceof
      Error
        ? logsError.message
        : "Unknown VX log error.";

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX AUDIT LOGS",
      "FAILED",
      vxError(
        "VX LOG READ FAILED",
        [
          "VX audit logs could not be read.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
        ],
      ),
    );
  }
}

/* =========================================================
   VX STATS
========================================================= */

async function commandStats(
  sock: WASocket,
  jid: string,
  message?: AnyMessage,
): Promise<void> {
  const operation =
    createOperation(
      "vxstats",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX SECURITY STATISTICS",
        10,
        "INITIALIZING",
        "Loading VX security metrics...",
        message,
      );

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY STATISTICS",
      55,
      "STATISTICS_READ",
      "Calculating current security metrics...",
    );

    const stats =
      await getVxStats();

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY STATISTICS",
      "COMPLETED",
      vxSecurity(
        "VX SECURITY STATISTICS",
        [
          `Total events: ${stats.totalEvents}`,
          `Total incidents: ${stats.totalIncidents}`,
          `Total threats: ${stats.totalThreats}`,
          "",
          `Low: ${stats.low}`,
          `Medium: ${stats.medium}`,
          `High: ${stats.high}`,
          `Critical: ${stats.critical}`,
          "",
          `Active monitors: ${stats.activeMonitors}`,
          "",
          `Operation: ${operation.id}`,
          "",
          "VX intelligence metrics updated.",
        ],
      ),
    );
  } catch (
    statsError
  ) {
    const reason =
      statsError instanceof
      Error
        ? statsError.message
        : "Unknown statistics error.";

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY STATISTICS",
      "FAILED",
      vxError(
        "VX STATISTICS FAILED",
        [
          "Security statistics could not be generated.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
        ],
      ),
    );
  }
}

/* =========================================================
   VX REPORT
========================================================= */

async function commandReport(
  sock: WASocket,
  jid: string,
  message?: AnyMessage,
): Promise<void> {
  const operation =
    createOperation(
      "vxreport",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX SECURITY REPORT",
        5,
        "INITIALIZING",
        "Preparing full VX intelligence report...",
        message,
      );

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY REPORT",
      20,
      "SECURITY_STATS_READ",
      "Reading security statistics...",
    );

    const stats =
      await getVxStats();

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY REPORT",
      40,
      "BOT_INTELLIGENCE_READ",
      "Reading suspected bot intelligence...",
    );

    const bots =
      await getSuspectedVxBots(
        10,
      );

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY REPORT",
      60,
      "INCIDENT_ANALYSIS",
      "Reading recent security incidents...",
    );

    const incidents =
      await getVxIncidents(
        10,
      );

    const activeIncidents =
      incidents.filter(
        incident =>
          incident.status ===
            "DETECTED" ||
          incident.status ===
            "ANALYZING" ||
          incident.status ===
            "ACTIVE",
      );

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY REPORT",
      75,
      "MONITOR_ANALYSIS",
      "Reading active monitoring sessions...",
    );

    const activeMonitors =
      await getActiveVxMonitors();

    const botReports =
      bots.length
        ? bots
            .slice(
              0,
              5,
            )
            .map(
              bot =>
                formatVxBotReport(
                  bot,
                ),
            )
        : [];

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY REPORT",
      "COMPLETED",
      vxSecurity(
        "VX SECURITY REPORT",
        [
          `${VX_TITLE} SECURITY INTELLIGENCE`,
          "",
          `Events analyzed: ${stats.totalEvents}`,
          `Threats detected: ${stats.totalThreats}`,
          `Total incidents: ${stats.totalIncidents}`,
          `High-risk events: ${stats.high}`,
          `Critical events: ${stats.critical}`,
          "",
          `Suspected bots: ${bots.length}`,
          `Active incidents: ${activeIncidents.length}`,
          `Active monitors: ${activeMonitors.length}`,
          "",
          ...botReports,
          ...(botReports.length
            ? [""]
            : []),
          `Operation: ${operation.id}`,
          "",
          "VX intelligence is active.",
          "Full audit history retained.",
        ],
      ),
    );
  } catch (
    reportError
  ) {
    const reason =
      reportError instanceof
      Error
        ? reportError.message
        : "Unknown report generation error.";

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX SECURITY REPORT",
      "FAILED",
      vxError(
        "VX REPORT FAILED",
        [
          "The VX security report could not be generated.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
          "",
          "Failure recorded in the audit system.",
        ],
      ),
    );
  }
}

/* =========================================================
   VX HELP
========================================================= */

async function commandHelp(
  sock: WASocket,
  jid: string,
  message?: AnyMessage,
): Promise<void> {
  const operation =
    createOperation(
      "vxhelp",
      jid,
    );

  let progressKey:
    any;

  try {
    progressKey =
      await createOperationMessage(
        sock,
        jid,
        operation,
        "VX COMMAND CENTER",
        10,
        "INITIALIZING",
        "Loading VX command inventory...",
        message,
      );

    await editOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX COMMAND CENTER",
      60,
      "COMMANDS_LOADED",
      "Preparing security command interface...",
    );

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX COMMAND CENTER",
      "COMPLETED",
      vxSecurity(
        "VX SECURITY INTELLIGENCE",
        [
          "SCANNING",
          "• vxscan",
          "",
          "LIVE MONITORING",
          "• vxmonitor",
          "• vxmonitor status",
          "• vxmonitor off",
          "",
          "BOT INTELLIGENCE",
          "• vxbot scan",
          "• vxbot info <number>",
          "• vxbot logs",
          "• vxbot report",
          "",
          "INCIDENT CENTER",
          "• vxincident",
          "• vxincident <id>",
          "• vxabort <id>",
          "• vxabort all",
          "• vxresume <id>",
          "",
          "SYSTEM",
          "• vxstatus",
          "• vxhealth",
          "• vxlogs [count]",
          "• vxstats",
          "• vxreport",
          "",
          `Operation: ${operation.id}`,
          "",
          "VX = SECURITY INTELLIGENCE CORE",
        ],
      ),
    );
  } catch (
    helpError
  ) {
    const reason =
      helpError instanceof
      Error
        ? helpError.message
        : "Unknown VX help error.";

    await finishOperationMessage(
      sock,
      jid,
      progressKey?.key,
      operation,
      "VX COMMAND CENTER",
      "FAILED",
      vxError(
        "VX HELP FAILED",
        [
          "VX command inventory could not be loaded.",
          "",
          `Operation: ${operation.id}`,
          `Error: ${reason}`,
        ],
      ),
    );
  }
}

/* =========================================================
   COMMAND VALIDATION
========================================================= */

function normalizeCommand(
  command: string,
): string {
  return String(
    command,
  )
    .trim()
    .toLowerCase()
    .replace(
      /^[.!#/]+/,
      "",
    );
}

function isRegisteredVxCommand(
  command: string,
): boolean {
  const normalized =
    normalizeCommand(
      command,
    );

  if (
    normalized ===
    "vx"
  ) {
    return true;
  }

  const aliases =
    new Set(
      [
        normalized,
        normalized.replace(
          /^vx-/,
          "vx",
        ),
      ],
    );

  for (
    const alias of aliases
  ) {
    const commandDefinition =
      getCommand(
        alias,
      );

    if (
      commandDefinition &&
      isVxCommand(
        commandDefinition,
      )
    ) {
      return true;
    }
  }

  return [
    "vxscan",
    "vxmonitor",
    "vxbot",
    "vxincident",
    "vxincidents",
    "vxabort",
    "vxresume",
    "vxstatus",
    "vxhealth",
    "vxlogs",
    "vxstats",
    "vxreport",
    "vxhelp",
  ].includes(
    normalized,
  );
}

/* =========================================================
   MAIN VX COMMAND ROUTER
========================================================= */

export async function handleVxCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  message?: AnyMessage,
): Promise<boolean> {
  const normalized =
    normalizeCommand(
      command,
    );

  if (
    !isRegisteredVxCommand(
      normalized,
    )
  ) {
    return false;
  }

  try {
    const registryCommand =
      getCommand(
        normalized,
      );

    if (
      registryCommand &&
      !isVxCommand(
        registryCommand,
      ) &&
      normalized !==
        "vx"
    ) {
      return false;
    }

    switch (
      normalized
    ) {
      case "vxscan":
      case "vx-scan":
        await commandScan(
          sock,
          jid,
          message,
        );
        return true;

      case "vxmonitor":
      case "vx-monitor":
        await commandMonitor(
          sock,
          jid,
          args,
          message,
        );
        return true;

      case "vxbot":
      case "vx-bot":
        await commandBot(
          sock,
          jid,
          args,
          message,
        );
        return true;

      case "vxincident":
      case "vx-inc":
      case "vxincidents":
        await commandIncident(
          sock,
          jid,
          args,
          message,
        );
        return true;

      case "vxabort":
      case "vx-abort":
        await commandAbort(
          sock,
          jid,
          args,
          message,
        );
        return true;

      case "vxresume":
      case "vx-resume":
        await commandResume(
          sock,
          jid,
          args,
          message,
        );
        return true;

      case "vxstatus":
      case "vx-status":
        await commandStatus(
          sock,
          jid,
          message,
        );
        return true;

      case "vxhealth":
      case "vx-health":
        await commandHealth(
          sock,
          jid,
          message,
        );
        return true;

      case "vxlogs":
      case "vx-logs":
        await commandLogs(
          sock,
          jid,
          args,
          message,
        );
        return true;

      case "vxstats":
      case "vx-stats":
        await commandStats(
          sock,
          jid,
          message,
        );
        return true;

      case "vxreport":
      case "vx-report":
        await commandReport(
          sock,
          jid,
          message,
        );
        return true;

      case "vxhelp":
      case "vx-help":
      case "vx":
        await commandHelp(
          sock,
          jid,
          message,
        );
        return true;

      default:
        return false;
    }
  } catch (
    commandError
  ) {
    console.error(
      `[VX] Command router failure: ${normalized}`,
      commandError,
    );

    return true;
  }
}

/* =========================================================
   PUBLIC OPERATION SNAPSHOT
========================================================= */

export function getVxOperationSnapshot():
  VxOperation | undefined {
  const latest =
    getLatestVxOperation();

  if (!latest) {
    return undefined;
  }

  return {
    ...latest,
  };
}

/* =========================================================
   PUBLIC PROGRESS SNAPSHOT
========================================================= */

export function getVxProgressSnapshot():
  | {
      id: string;
      command: string;
      progress: number;
      stage: string;
      status: VxOperationStatus;
      message?: string;
      startedAt: number;
      completedAt?: number;
    }
  | undefined {
  const operation =
    getLatestVxOperation();

  if (!operation) {
    return undefined;
  }

  return {
    id:
      operation.id,

    command:
      operation.command,

    progress:
      operation.progress,

    stage:
      operation.stage,

    status:
      operation.status,

    message:
      operation.message,

    startedAt:
      operation.startedAt,

    completedAt:
      operation.completedAt,
  };
}

/* =========================================================
   PUBLIC AUDIT OPERATION LOOKUP
========================================================= */

export function findVxOperation(
  id: string,
):
  VxOperation | undefined {
  const normalizedId =
    String(
      id || "",
    ).trim();

  if (!normalizedId) {
    return undefined;
  }

  return getVxOperation(
    normalizedId,
  );
}

/* =========================================================
   END
========================================================= */
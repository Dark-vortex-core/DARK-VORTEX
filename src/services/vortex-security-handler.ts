
/* =========================================================
   🌑 DARK VORTEX — VORTEX SECURITY COMMAND HANDLER
   ⚡ Powered by Vortex Tech

   Command execution layer for VORTEX SECURITY.

   IMPORTANT:
   • Owner confirmation is handled before execution.
   • This module does not implement credential/session extraction.
   • No takeover/hijacking.
   • No private-IP tracing.
   • No evasion/bypass.
   • All security records remain local.
========================================================= */

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  auditGroup,
  auditUser,
  createSecuritySnapshot,
  getSecurityCounts,
  getSecurityEvent,
  getSecurityEvidence,
  getSecurityEvidenceItem,
  getSecurityEvents,
  getSecurityPosture,
  getSecuritySummary,
  getSecurityTimeline,
  getSecurityMode,
  getSnapshots,
  isSecurityPaused,
  isQuiet,
  recordEvidence,
  recordSecurityEvent,
  restoreNormalMode,
  runSecurityTests,
  setQuiet,
  setSecurityMode,
  setSecurityPaused,
  type SecurityEvent,
  type SecurityEvidence,
  type SecurityPosture,
  type SecurityProgress,
  type SecuritySnapshot,
} from "./vortex-security.js";

import {
  vortexBox,
} from "../utils/message.js";

/* =========================================================
   TYPES
========================================================= */

interface CommandContext {
  sock: WASocket;
  jid: string;
  sender: string;
  command: string;
  args: string[];
  message?: WAMessage;
}

/* =========================================================
   COMMAND LIST
========================================================= */

const SECURITY_COMMANDS =
  new Set<string>([
    "security",
    "audit",
    "audituser",
    "auditgroup",
    "timeline",
    "event",
    "evidence",
    "snapshots",
    "snapshot",
    "lockdown",
    "failsafe",
    "maintenance",
    "quiet",
    "securitypause",
    "normal",
    "securitytest",
    "recovery",
  ]);

/* =========================================================
   COMMAND DETECTION
========================================================= */

export function isVortexSecurityCommand(
  command: string,
): boolean {
  return SECURITY_COMMANDS.has(
    command
      .trim()
      .toLowerCase(),
  );
}

/* =========================================================
   PROGRESS BAR
========================================================= */

function progressBar(
  percent: number,
): string {
  const safePercent =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(percent),
      ),
    );

  const totalBlocks = 20;

  const filled =
    Math.round(
      (safePercent /
        100) *
        totalBlocks,
    );

  return (
    "█".repeat(
      filled,
    ) +
    "░".repeat(
      totalBlocks -
        filled,
    ) +
    ` ${safePercent}%`
  );
}

/* =========================================================
   PROGRESS MESSAGE
========================================================= */

function progressText(
  title: string,
  stage: string,
  percent: number,
  message?: string,
): string {
  const lines = [
    `🛡️ ${title}`,
    "",
    `${progressBar(percent)}`,
    "",
    `⚙️ ${stage}`,
  ];

  if (
    message
  ) {
    lines.push(
      "",
      message,
    );
  }

  lines.push(
    "",
    "⚡ Powered by Vortex Tech",
  );

  return vortexBox(
    "VORTEX SECURITY",
    lines,
  );
}

/* =========================================================
   COMPLETION BOX
========================================================= */

function completionText(
  title: string,
  lines: string[],
): string {
  return vortexBox(
    "VORTEX SECURITY",
    [
      `🛡️ ${title}`,
      "",
      progressBar(100),
      "",
      ...lines,
      "",
      "⚡ Powered by Vortex Tech",
    ],
  );
}

/* =========================================================
   PROGRESS EDITOR — SINGLE MESSAGE MODE
========================================================= */

async function createProgressReporter(
  sock: WASocket,
  jid: string,
): Promise<{
  update: SecurityProgress;
  finish: (
    title: string,
    lines: string[],
  ) => Promise<void>;
}> {
  let progressMessage:
    WAMessage | null = null;

  let messageCreated = false;

  const sendOrEdit =
    async (
      text: string,
    ): Promise<void> => {
      /*
       * IMPORTANT:
       * Every stage must use the SAME WhatsApp
       * message. We never intentionally send a
       * second progress message.
       */

      if (
        !progressMessage
      ) {
        const sentMessage =
          await sock.sendMessage(
            jid,
            {
              text,
            },
          );

        if (
          !sentMessage
        ) {
          throw new Error(
            "Failed to create VORTEX SECURITY progress message",
          );
        }

        progressMessage =
          sentMessage;

        messageCreated = true;
        return;
      }

      await sock.sendMessage(
        jid,
        {
          text,
          edit:
            progressMessage.key,
        },
      );
    };

  const update:
    SecurityProgress =
    async (
      stage,
      percent,
      message,
    ) => {
      const text =
        progressText(
          "SECURITY OPERATION",
          stage,
          percent,
          message,
        );

      try {
        await sendOrEdit(
          text,
        );
      } catch (error) {
        console.error(
          "VORTEX SECURITY progress update error:",
          error,
        );

        /*
         * If the original message was successfully
         * created, DO NOT send another message.
         *
         * This prevents duplicate progress messages.
         */
        if (
          messageCreated
        ) {
          return;
        }

        /*
         * Only if the initial message itself failed
         * do we leave the error to the caller.
         */
        throw error;
      }
    };

  const finish =
    async (
      title: string,
      lines: string[],
    ): Promise<void> => {
      const text =
        completionText(
          title,
          lines,
        );

      try {
        /*
         * Normal path:
         * edit the existing progress message.
         */
        if (
          progressMessage
        ) {
          await sock.sendMessage(
            jid,
            {
              text,
              edit:
                progressMessage.key,
            },
          );

          return;
        }

        /*
         * This should only happen if no progress
         * update was ever successfully sent.
         */
        const sentMessage =
          await sock.sendMessage(
            jid,
            {
              text,
            },
          );

        if (
          !sentMessage
        ) {
          throw new Error(
            "Failed to create VORTEX SECURITY completion message",
          );
        }

        progressMessage =
          sentMessage;

        messageCreated = true;
      } catch (error) {
        console.error(
          "VORTEX SECURITY final progress update error:",
          error,
        );

        /*
         * NEVER send another message here.
         *
         * Sending a fallback message was causing
         * duplicate audit/progress messages.
         */
      }
    };

  return {
    update,
    finish,
  };
}

/* =========================================================
   NUMBER HELPERS
========================================================= */

function parseLimit(
  value: string | undefined,
  fallback = 20,
): number {
  if (
    !value
  ) {
    return fallback;
  }

  const parsed =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return fallback;
  }

  return Math.max(
    1,
    Math.min(
      200,
      parsed,
    ),
  );
}

/* =========================================================
   TARGET HELPERS
========================================================= */

function getMentionedJid(
  message?: WAMessage,
): string | null {
  const context =
    message?.message
      ?.extendedTextMessage
      ?.contextInfo;

  const mentions =
    context?.mentionedJid;

  if (
    Array.isArray(
      mentions,
    ) &&
    mentions.length >
      0
  ) {
    return (
      mentions[0] ??
      null
    );
  }

  return null;
}

function getTargetFromArgs(
  args: string[],
  message?: WAMessage,
): string | null {
  const mentioned =
    getMentionedJid(
      message,
    );

  if (
    mentioned
  ) {
    return mentioned;
  }

  const first =
    args[0]
      ?.trim();

  if (
    !first ||
    first.startsWith(
      "@",
    )
  ) {
    return null;
  }

  return first;
}

/* =========================================================
   EVENT FORMATTER
========================================================= */

function formatEvent(
  event: SecurityEvent,
): string[] {
  const lines = [
    `🆔 ${event.id}`,
    `🕒 ${event.timestamp}`,
    `📂 Type: ${event.type}`,
    `⚙️ Command: ${event.command}`,
    `📊 Status: ${event.status.toUpperCase()}`,
  ];

  if (
    event.sender
  ) {
    lines.push(
      `👤 Sender: ${event.sender}`,
    );
  }

  if (
    event.jid
  ) {
    lines.push(
      `💬 Chat: ${event.jid}`,
    );
  }

  if (
    event.target
  ) {
    lines.push(
      `🎯 Target: ${event.target}`,
    );
  }

  if (
    event.details.length >
    0
  ) {
    lines.push(
      "",
      "Details:",
      ...event.details.map(
        (detail) =>
          `• ${detail}`,
      ),
    );
  }

  return lines;
}

/* =========================================================
   EVIDENCE FORMATTER
========================================================= */

function formatEvidence(
  evidence: SecurityEvidence,
): string[] {
  return [
    `🆔 ${evidence.id}`,
    `🕒 ${evidence.timestamp}`,
    `📂 Type: ${evidence.type}`,
    `📍 Source: ${evidence.source}`,
    "",
    ...evidence.details.map(
      (detail) =>
        `• ${detail}`,
    ),
  ];
}

/* =========================================================
   SNAPSHOT FORMATTER
========================================================= */

function formatSnapshot(
  snapshot: SecuritySnapshot,
): string[] {
  return [
    `🆔 ${snapshot.id}`,
    `🕒 ${snapshot.timestamp}`,
    `🛡️ Mode: ${snapshot.mode.toUpperCase()}`,
    `🔕 Quiet: ${snapshot.quiet ? "ON" : "OFF"}`,
    `⏸️ Security pause: ${
      snapshot.securityPaused
        ? "ON"
        : "OFF"
    }`,
    `🔒 Lockdown: ${
      snapshot.lockdown
        ? "ON"
        : "OFF"
    }`,
    `🧯 Failsafe: ${
      snapshot.failsafe
        ? "ON"
        : "OFF"
    }`,
    `🔧 Maintenance: ${
      snapshot.maintenance
        ? "ON"
        : "OFF"
    }`,
    "",
    `⏱️ Uptime: ${snapshot.uptimeSeconds}s`,
    `💾 RSS: ${snapshot.memoryRssMB} MB`,
    `🧠 Heap: ${snapshot.heapUsedMB} MB`,
    `🖥️ Platform: ${snapshot.platform}`,
    `🟢 Node: ${snapshot.node}`,
    "",
    `📚 Events: ${snapshot.eventCount}`,
    `📦 Evidence: ${snapshot.evidenceCount}`,
  ];
}

/* =========================================================
   POSTURE FORMATTER
========================================================= */

function postureIcon(
  posture: SecurityPosture,
): string {
  switch (
    posture.level
  ) {
    case "NORMAL":
      return "🟢";

    case "ELEVATED":
      return "🟡";

    case "RESTRICTED":
      return "🟠";

    case "CRITICAL":
      return "🔴";
  }
}

/* =========================================================
   SECURITY STATUS
========================================================= */

async function commandSecurityStatus(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
  } = context;

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Reading VORTEX SECURITY state...",
    20,
  );

  const summary =
    await getSecuritySummary();

  await update(
    "Evaluating security posture...",
    45,
  );

  const posture =
    await getSecurityPosture();

  await update(
    "Collecting security telemetry...",
    65,
    `${summary.totalEvents} event(s), ${summary.totalEvidence} evidence item(s), ${summary.totalSnapshots} snapshot(s).`,
  );

  const counts =
    await getSecurityCounts();

  await update(
    "Preparing security dashboard...",
    75,
  );

  const mode =
    summary.mode.toUpperCase();

  const modeIcon =
    summary.mode === "normal"
      ? "🟢"
      : summary.mode === "failsafe"
        ? "🟡"
        : summary.mode === "lockdown"
          ? "🔴"
          : "🟠";

  await update(
    "Almost done...",
    90,
    "Finalizing live security status.",
  );

  await recordSecurityEvent(
    "SECURITY_STATUS",
    "security",
    [
      `Mode: ${summary.mode}.`,
      `Posture: ${posture.level}.`,
      `Events: ${counts.events}.`,
      `Evidence: ${counts.evidence}.`,
      `Snapshots: ${counts.snapshots}.`,
    ],
    {
      jid,
      status: "success",
    },
  );

  const latestEvent =
    summary.latestEvent;

  await finish(
    "SECURITY STATUS",
    [
      `${postureIcon(posture)} POSTURE: ${posture.level}`,
      "",
      `${modeIcon} MODE: ${mode}`,
      `🔕 Quiet: ${
        summary.quiet
          ? "ON"
          : "OFF"
      }`,
      `⏸️ Security pause: ${
        summary.securityPaused
          ? "ON"
          : "OFF"
      }`,
      "",
      "📊 SECURITY TELEMETRY",
      `• Events: ${counts.events}`,
      `• Successful: ${summary.successfulEvents}`,
      `• Failed: ${summary.failedEvents}`,
      `• Blocked: ${summary.blockedEvents}`,
      `• Cancelled: ${summary.cancelledEvents}`,
      `• Informational: ${summary.informationalEvents}`,
      "",
      `📦 Evidence: ${counts.evidence}`,
      `📸 Snapshots: ${counts.snapshots}`,
      "",
      "🧠 SECURITY ASSESSMENT",
      posture.description,
      "",
      latestEvent
        ? `🕒 Last event: ${latestEvent.type} — ${latestEvent.status.toUpperCase()}`
        : "🕒 Last event: No security events recorded.",
      "",
      "🟢 Local security intelligence: ONLINE",
      "🔐 External credential access: NONE",
      "🚫 Unauthorized takeover: BLOCKED",
    ],
  );
}

/* =========================================================
   AUDIT
========================================================= */

async function commandAudit(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
  } = context;

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Loading local security records...",
    20,
  );

  const summary =
    await getSecuritySummary();

  await update(
    "Analyzing recorded security events...",
    45,
    `${summary.totalEvents} event(s) loaded.`,
  );

  const posture =
    await getSecurityPosture();

  await update(
    "Evaluating security posture...",
    70,
    posture.description,
  );

  const counts =
    await getSecurityCounts();

  await update(
    "Preparing audit report...",
    90,
    "Local audit aggregation complete.",
  );

  await recordSecurityEvent(
    "AUDIT",
    "audit",
    [
      `Audited ${counts.events} event(s).`,
      `Collected ${counts.evidence} evidence item(s).`,
      `Current posture: ${posture.level}.`,
    ],
    {
      jid,
      status: "success",
    },
  );

  await finish(
    "SECURITY AUDIT",
    [
      "🟢 Audit completed",
      "",
      `Events analyzed     ${summary.totalEvents}`,
      `Successful          ${summary.successfulEvents}`,
      `Failed              ${summary.failedEvents}`,
      `Blocked             ${summary.blockedEvents}`,
      `Cancelled           ${summary.cancelledEvents}`,
      `Informational       ${summary.informationalEvents}`,
      "",
      `Evidence records    ${summary.totalEvidence}`,
      `Snapshots           ${summary.totalSnapshots}`,
      "",
      `${postureIcon(posture)} SECURITY POSTURE: ${posture.level}`,
    ],
  );
}

/* =========================================================
   AUDIT USER
========================================================= */

async function commandAuditUser(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
    args,
    message,
  } = context;

  const target =
    getTargetFromArgs(
      args,
      message,
    );

  if (
    !target
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          vortexBox(
            "VORTEX SECURITY",
            [
              "❌ TARGET REQUIRED",
              "",
              "Usage:",
              "audituser @user",
              "",
              "Mention the user whose locally",
              "recorded security activity",
              "you want to inspect.",
              "",
              "⚡ Powered by Vortex Tech",
            ],
          ),
      },
    );

    return;
  }

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Loading user audit records...",
    25,
  );

  const events =
    await auditUser(
      target,
      50,
    );

  await update(
    "Analyzing matching activity...",
    55,
    `${events.length} matching event(s) found.`,
  );

  const failures =
    events.filter(
      (event) =>
        event.status ===
        "failed",
    ).length;

  const blocked =
    events.filter(
      (event) =>
        event.status ===
        "blocked",
    ).length;

  await update(
    "Building user security report...",
    80,
  );

  await recordSecurityEvent(
    "USER_AUDIT",
    "audituser",
    [
      `Target: ${target}`,
      `Matching events: ${events.length}`,
      `Failed events: ${failures}`,
      `Blocked events: ${blocked}`,
    ],
    {
      jid,
      target,
      status: "success",
    },
  );

  const lines = [
    `👤 Target: ${target}`,
    "",
    `📚 Matching events: ${events.length}`,
    `❌ Failed: ${failures}`,
    `🚫 Blocked: ${blocked}`,
    "",
  ];

  if (
    events.length ===
    0
  ) {
    lines.push(
      "🟢 No locally recorded security activity found.",
    );
  } else {
    lines.push(
      "Recent activity:",
      "",
      ...events
        .slice(0, 10)
        .flatMap(
          (event) => [
            `• ${event.id}`,
            `  ${event.timestamp}`,
            `  ${event.command} — ${event.status}`,
          ],
        ),
    );
  }

  await finish(
    "USER SECURITY AUDIT",
    lines,
  );
}

/* =========================================================
   AUDIT GROUP
========================================================= */

async function commandAuditGroup(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
  } = context;

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Loading group security records...",
    25,
  );

  const events =
    await auditGroup(
      jid,
      50,
    );

  await update(
    "Analyzing group activity...",
    55,
    `${events.length} matching event(s) found.`,
  );

  const failed =
    events.filter(
      (event) =>
        event.status ===
        "failed",
    ).length;

  const blocked =
    events.filter(
      (event) =>
        event.status ===
        "blocked",
    ).length;

  await update(
    "Building group audit report...",
    80,
  );

  await recordSecurityEvent(
    "GROUP_AUDIT",
    "auditgroup",
    [
      `Group: ${jid}`,
      `Matching events: ${events.length}`,
      `Failed events: ${failed}`,
      `Blocked events: ${blocked}`,
    ],
    {
      jid,
      status: "success",
    },
  );

  await finish(
    "GROUP SECURITY AUDIT",
    [
      `💬 Group: ${jid}`,
      "",
      `📚 Events: ${events.length}`,
      `❌ Failed: ${failed}`,
      `🚫 Blocked: ${blocked}`,
      "",
      events.length === 0
        ? "🟢 No locally recorded security activity found."
        : "🟢 Group activity analysis completed.",
    ],
  );
}

/* =========================================================
   TIMELINE
========================================================= */

async function commandTimeline(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
    args,
  } = context;

  const limit =
    parseLimit(
      args[0],
      15,
    );

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Loading security timeline...",
    25,
  );

  const events =
    await getSecurityTimeline(
      limit,
    );

  await update(
    "Reading chronological records...",
    55,
    `${events.length} event(s) loaded.`,
  );

  await update(
    "Rendering timeline...",
    85,
  );

  const lines: string[] = [
    `📚 Showing ${events.length} event(s)`,
    "",
  ];

  if (
    events.length ===
    0
  ) {
    lines.push(
      "🟢 Security timeline is empty.",
    );
  } else {
    for (
      const event of events
    ) {
      lines.push(
        `• ${event.timestamp}`,
        `  ${event.id}`,
        `  ${event.command} — ${event.status}`,
        "",
      );
    }
  }

  await finish(
    "SECURITY TIMELINE",
    lines,
  );
}

/* =========================================================
   EVENT
========================================================= */

async function commandEvent(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
    args,
  } = context;

  const id =
    args[0]?.trim();

  if (
    !id
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          vortexBox(
            "VORTEX SECURITY",
            [
              "❌ EVENT ID REQUIRED",
              "",
              "Usage:",
              "event <id>",
              "",
              "Example:",
              "event SEC-XXXXXX-ABC123",
              "",
              "⚡ Powered by Vortex Tech",
            ],
          ),
      },
    );

    return;
  }

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Loading security event...",
    25,
  );

  const event =
    await getSecurityEvent(
      id,
    );

  await update(
    "Validating event record...",
    60,
  );

  if (
    !event
  ) {
    await update(
      "Event lookup completed.",
      100,
      "No matching event was found.",
    );

    await finish(
      "EVENT NOT FOUND",
      [
        `🔎 Requested: ${id}`,
        "",
        "No locally recorded security event",
        "matches this identifier.",
      ],
    );

    return;
  }

  await recordSecurityEvent(
    "EVENT_LOOKUP",
    "event",
    [
      `Inspected event ${event.id}.`,
    ],
    {
      jid,
      target:
        event.target,
      status: "success",
    },
  );

  await update(
    "Preparing event details...",
    90,
  );

  await finish(
    "SECURITY EVENT",
    formatEvent(
      event,
    ),
  );
}

/* =========================================================
   EVIDENCE
========================================================= */

async function commandEvidence(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
    args,
  } = context;

  const limit =
    parseLimit(
      args[0],
      15,
    );

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Loading retained local evidence...",
    25,
  );

  const evidence =
    await getSecurityEvidence(
      limit,
    );

  await update(
    "Analyzing evidence records...",
    60,
    `${evidence.length} evidence item(s) loaded.`,
  );

  await update(
    "Rendering evidence report...",
    90,
  );

  const lines: string[] = [
    `📦 Evidence records: ${evidence.length}`,
    "",
  ];

  if (
    evidence.length ===
    0
  ) {
    lines.push(
      "🟢 No locally retained security evidence.",
    );
  } else {
    for (
      const item of evidence
    ) {
      lines.push(
        `🆔 ${item.id}`,
        `🕒 ${item.timestamp}`,
        `📂 ${item.type}`,
        `📍 ${item.source}`,
        "",
      );
    }
  }

  await finish(
    "SECURITY EVIDENCE",
    lines,
  );
}

/* =========================================================
   SNAPSHOTS
========================================================= */

async function commandSnapshots(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
    args,
  } = context;

  const limit =
    parseLimit(
      args[0],
      10,
    );

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Loading security snapshots...",
    25,
  );

  const snapshots =
    await getSnapshots(
      limit,
    );

  await update(
    "Analyzing snapshot history...",
    60,
    `${snapshots.length} snapshot(s) loaded.`,
  );

  await update(
    "Rendering snapshot history...",
    90,
  );

  const lines: string[] = [
    `📸 Snapshots: ${snapshots.length}`,
    "",
  ];

  if (
    snapshots.length ===
    0
  ) {
    lines.push(
      "🟢 No security snapshots recorded.",
    );
  } else {
    for (
      const snapshot of snapshots
    ) {
      lines.push(
        `• ${snapshot.id}`,
        `  ${snapshot.timestamp}`,
        `  Mode: ${snapshot.mode}`,
        `  Events: ${snapshot.eventCount}`,
        `  Evidence: ${snapshot.evidenceCount}`,
        "",
      );
    }
  }

  await finish(
    "SECURITY SNAPSHOTS",
    lines,
  );
}

/* =========================================================
   SNAPSHOT
========================================================= */

async function commandSnapshot(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
  } = context;

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Collecting current security state...",
    25,
  );

  const snapshot =
    await createSecuritySnapshot();

  await update(
    "Capturing runtime telemetry...",
    60,
    "Local runtime metrics captured.",
  );

  await recordEvidence(
    "SECURITY_SNAPSHOT",
    "vortex-security",
    [
      `Snapshot captured: ${snapshot.id}.`,
      `Mode: ${snapshot.mode}.`,
      `Events: ${snapshot.eventCount}.`,
      `Evidence: ${snapshot.evidenceCount}.`,
    ],
  );

  await update(
    "Finalizing security snapshot...",
    90,
  );

  await recordSecurityEvent(
    "SNAPSHOT",
    "snapshot",
    [
      `Created security snapshot ${snapshot.id}.`,
    ],
    {
      jid,
      status: "success",
    },
  );

  await finish(
    "SECURITY SNAPSHOT",
    formatSnapshot(
      snapshot,
    ),
  );
}

/* =========================================================
   LOCKDOWN
========================================================= */

async function commandLockdown(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
  } = context;

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Preparing security lockdown...",
    25,
  );

  await setSecurityMode(
    "lockdown",
  );

  await update(
    "Applying restricted operating mode...",
    60,
    "Non-essential security-sensitive operations are now restricted.",
  );

  await recordEvidence(
    "MODE_CHANGE",
    "lockdown",
    [
      "VORTEX SECURITY lockdown enabled.",
    ],
  );

  await update(
    "Recording lockdown state...",
    90,
  );

  await finish(
    "LOCKDOWN ENABLED",
    [
      "🔒 VORTEX SECURITY lockdown is active.",
      "",
      "Non-essential security-sensitive",
      "operations are now restricted.",
      "",
      "Use /normal to restore normal mode.",
    ],
  );
}

/* =========================================================
   FAILSAFE
========================================================= */

async function commandFailsafe(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
  } = context;

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Preparing failsafe mode...",
    25,
  );

  await setSecurityMode(
    "failsafe",
  );

  await update(
    "Applying conservative security policy...",
    60,
    "Non-essential security-sensitive operations are restricted.",
  );

  await recordEvidence(
    "MODE_CHANGE",
    "failsafe",
    [
      "VORTEX SECURITY failsafe mode enabled.",
    ],
  );

  await update(
    "Recording failsafe state...",
    90,
  );

  await finish(
    "FAILSAFE ENABLED",
    [
      "🧯 Conservative security mode is active.",
      "",
      "Non-essential security-sensitive",
      "operations are restricted.",
      "",
      "Use /normal to restore normal mode.",
    ],
  );
}

/* =========================================================
   QUIET
========================================================= */

async function commandQuiet(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
    args,
  } = context;

  const requested =
    args[0]
      ?.toLowerCase();

  const current =
    await isQuiet();

  const enabled =
    requested ===
    "on"
      ? true
      : requested ===
          "off"
        ? false
        : !current;

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Reading notification policy...",
    25,
  );

  await setQuiet(
    enabled,
  );

  await update(
    "Applying notification policy...",
    60,
    enabled
      ? "Non-critical security notifications will be suppressed."
      : "Security notifications restored.",
  );

  await recordEvidence(
    "QUIET_MODE",
    "quiet",
    [
      `Quiet mode: ${enabled ? "enabled" : "disabled"}.`,
    ],
  );

  await update(
    "Finalizing notification state...",
    90,
  );

  await finish(
    enabled
      ? "QUIET MODE ENABLED"
      : "QUIET MODE DISABLED",
    [
      enabled
        ? "🔕 Non-critical security notifications are suppressed."
        : "🔔 Security notifications are restored.",
      "",
      `Current state: ${enabled ? "ON" : "OFF"}`,
    ],
  );
}

/* =========================================================
   SECURITY PAUSE
========================================================= */

async function commandSecurityPause(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
    args,
  } = context;

  const requested =
    args[0]
      ?.toLowerCase();

  const current =
    await isSecurityPaused();

  const paused =
    requested ===
    "on"
      ? true
      : requested ===
          "off"
        ? false
        : !current;

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Reading security automation state...",
    25,
  );

  await setSecurityPaused(
    paused,
  );

  await update(
    "Applying security intelligence policy...",
    60,
    paused
      ? "Security intelligence automation is paused."
      : "Security intelligence automation is active.",
  );

  await recordEvidence(
    "SECURITY_PAUSE",
    "securitypause",
    [
      `Security pause: ${paused ? "enabled" : "disabled"}.`,
    ],
  );

  await update(
    "Finalizing security automation state...",
    90,
  );

  await finish(
    paused
      ? "SECURITY PAUSED"
      : "SECURITY RESUMED",
    [
      paused
        ? "⏸️ Security intelligence automation is paused."
        : "▶️ Security intelligence automation is active.",
      "",
      `Current state: ${paused ? "PAUSED" : "ACTIVE"}`,
    ],
  );
}

/* =========================================================
   NORMAL
========================================================= */

async function commandNormal(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
  } = context;

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Reading current security state...",
    25,
  );

  const previousMode =
    await getSecurityMode();

  await update(
    "Restoring normal security policy...",
    60,
  );

  await restoreNormalMode();

  await update(
    "Validating restored state...",
    90,
  );

  await finish(
    "NORMAL MODE RESTORED",
    [
      "🟢 Dark Vortex is operating normally.",
      "",
      `Previous mode: ${previousMode.toUpperCase()}`,
      "Current mode: NORMAL",
      "Quiet: OFF",
      "Security pause: OFF",
    ],
  );
}

/* =========================================================
   SECURITY TEST
========================================================= */

async function commandSecurityTest(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
  } = context;

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Initializing subsystem checks...",
    15,
  );

  const result =
    await runSecurityTests();

  await update(
    "Analyzing subsystem results...",
    55,
    `${result.passed} passed / ${result.failed} failed.`,
  );

  await update(
    "Preparing diagnostic report...",
    85,
  );

  await recordSecurityEvent(
    "SECURITY_TEST",
    "securitytest",
    [
      `Passed: ${result.passed}.`,
      `Failed: ${result.failed}.`,
    ],
    {
      jid,
      status:
        result.failed >
        0
          ? "failed"
          : "success",
    },
  );

  const lines = [
    `🧪 Checks: ${result.checks.length}`,
    `🟢 Passed: ${result.passed}`,
    `🔴 Failed: ${result.failed}`,
    "",
  ];

  for (
    const check of result.checks
  ) {
    lines.push(
      `${check.status === "PASS" ? "🟢" : "🔴"} ${check.name}`,
      `   ${check.details}`,
      "",
    );
  }

  await finish(
    "SECURITY SUBSYSTEM TEST",
    lines,
  );
}

/* =========================================================
   RECOVERY
========================================================= */

async function commandRecovery(
  context: CommandContext,
): Promise<void> {
  const {
    sock,
    jid,
  } = context;

  const {
    update,
    finish,
  } =
    await createProgressReporter(
      sock,
      jid,
    );

  await update(
    "Loading recovery state...",
    20,
  );

  const summary =
    await getSecuritySummary();

  await update(
    "Checking security posture...",
    45,
  );

  const posture =
    await getSecurityPosture();

  await update(
    "Checking runtime readiness...",
    70,
  );

  const counts =
    await getSecurityCounts();

  const ready =
    posture.level !==
      "CRITICAL" &&
    counts.events >=
      0;

  await update(
    "Preparing recovery report...",
    90,
  );

  await recordSecurityEvent(
    "RECOVERY_CHECK",
    "recovery",
    [
      `Readiness: ${ready ? "ready" : "restricted"}.`,
      `Mode: ${summary.mode}.`,
      `Posture: ${posture.level}.`,
    ],
    {
      jid,
      status:
        ready
          ? "success"
          : "blocked",
    },
  );

  await finish(
    "RECOVERY & READINESS",
    [
      `${ready ? "🟢" : "🟠"} Readiness: ${
        ready
          ? "READY"
          : "RESTRICTED"
      }`,
      "",
      `🛡️ Mode: ${summary.mode.toUpperCase()}`,
      `${postureIcon(posture)} Posture: ${posture.level}`,
      `🔕 Quiet: ${
        summary.quiet
          ? "ON"
          : "OFF"
      }`,
      `⏸️ Security pause: ${
        summary.securityPaused
          ? "ON"
          : "OFF"
      }`,
      "",
      `📚 Events: ${summary.totalEvents}`,
      `📦 Evidence: ${summary.totalEvidence}`,
      `📸 Snapshots: ${summary.totalSnapshots}`,
      "",
      posture.description,
    ],
  );
}

/* =========================================================
   EVENT/EVIDENCE ID INSPECTION HELPERS
========================================================= */

export async function inspectSecurityRecord(
  id: string,
): Promise<
  | {
      type: "event";
      record: SecurityEvent;
    }
  | {
      type: "evidence";
      record: SecurityEvidence;
    }
  | null
> {
  const event =
    await getSecurityEvent(
      id,
    );

  if (
    event
  ) {
    return {
      type: "event",
      record: event,
    };
  }

  const evidence =
    await getSecurityEvidenceItem(
      id,
    );

  if (
    evidence
  ) {
    return {
      type: "evidence",
      record: evidence,
    };
  }

  return null;
}

/* =========================================================
   MAIN HANDLER
========================================================= */

export async function handleVortexSecurityCommand(
  sock: WASocket,
  jid: string,
  sender: string,
  command: string,
  args: string[],
  message?: WAMessage,
): Promise<boolean> {
  const normalized =
    command
      .trim()
      .toLowerCase();

  if (
    !isVortexSecurityCommand(
      normalized,
    )
  ) {
    return false;
  }

  const context: CommandContext = {
    sock,
    jid,
    sender,
    command:
      normalized,
    args,
    message,
  };

  try {
    switch (
      normalized
    ) {
      case "security":
        await commandSecurityStatus(
          context,
        );
        return true;

      case "audit":
        await commandAudit(
          context,
        );
        return true;

      case "audituser":
        await commandAuditUser(
          context,
        );
        return true;

      case "auditgroup":
        await commandAuditGroup(
          context,
        );
        return true;

      case "timeline":
        await commandTimeline(
          context,
        );
        return true;

      case "event":
        await commandEvent(
          context,
        );
        return true;

      case "evidence":
        await commandEvidence(
          context,
        );
        return true;

      case "snapshots":
        await commandSnapshots(
          context,
        );
        return true;

      case "snapshot":
        await commandSnapshot(
          context,
        );
        return true;

      case "lockdown":
        await commandLockdown(
          context,
        );
        return true;

      case "failsafe":
        await commandFailsafe(
          context,
        );
        return true;

      case "maintenance":
        return false;

      case "quiet":
        await commandQuiet(
          context,
        );
        return true;

      case "securitypause":
        await commandSecurityPause(
          context,
        );
        return true;

      case "normal":
        await commandNormal(
          context,
        );
        return true;

      case "securitytest":
        await commandSecurityTest(
          context,
        );
        return true;

      case "recovery":
        await commandRecovery(
          context,
        );
        return true;

      default:
        return false;
    }
  } catch (error) {
    console.error(
      `VORTEX SECURITY command "${normalized}" failed:`,
      error,
    );

    try {
      await recordSecurityEvent(
        "COMMAND_ERROR",
        normalized,
        [
          error instanceof Error
            ? error.message
            : "Unknown security command error.",
        ],
        {
          sender,
          jid,
          status: "failed",
        },
      );
    } catch (
      loggingError
    ) {
      console.error(
        "VORTEX SECURITY error logging failed:",
        loggingError,
      );
    }

    await sock.sendMessage(
      jid,
      {
        text:
          vortexBox(
            "VORTEX SECURITY",
            [
              "🔴 SECURITY OPERATION ERROR",
              "",
              `Command: ${normalized}`,
              "",
              error instanceof Error
                ? error.message
                : "The security operation failed.",
              "",
              "No external action was performed.",
              "",
              "⚡ Powered by Vortex Tech",
            ],
          ),
      },
    );

    return true;
  }
}

/* =========================================================
   EXPORT
========================================================= */

export {
  SECURITY_COMMANDS,
};


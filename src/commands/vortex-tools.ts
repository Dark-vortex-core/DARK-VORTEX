/* =========================================================
   🌑 DARK VORTEX BOT — VORTEX SECURITY TOOLS
   ⚡ Powered by Vortex Tech

   IMPORTANT:
   - Additive command module
   - Does NOT replace botinfo
   - Does NOT modify moderation
   - Does NOT modify protection
   - Existing VX tools remain supported
   - VORTEX SECURITY uses a separate command layer
   - Owner-only confirmation is handled by the main handler
   - NORMAL COMMAND RESPONSES USE sendVortexReply()
========================================================= */

import os from "node:os";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  WAMessage,
  WASocket,
  MiscMessageGenerationOptions,
} from "@whiskeysockets/baileys";

import {
  generateUserDiagnostic,
} from "../generators/roast-generator.js";

import {
  vortexBox,
  error,
  info,
  security,
  system,
  success,
  warning,
  cleanUserNumber,
  userMention,
} from "../utils/message.js";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

import { getPrefix } from "../services/prefix.js";

/* =========================================================
   PATHS
========================================================= */

const DATA_DIR = path.resolve(
  process.cwd(),
  "src/data/vortex",
);

const REPORTS_FILE = path.join(
  DATA_DIR,
  "security-reports.json",
);

const AUDIT_FILE = path.join(
  DATA_DIR,
  "audit-records.json",
);

const DIAGNOSTICS_FILE = path.join(
  DATA_DIR,
  "diagnostic-history.json",
);

/* =========================================================
   TYPES
========================================================= */

type ReportStatus =
  | "pending"
  | "sent"
  | "aborted";

interface SecurityReport {
  id: string;
  type: string;
  createdAt: string;
  status: ReportStatus;
  destination: string | null;
  target: {
    jid: string;
    number: string;
    name?: string;
  };
  findings: string[];
  evidence: string[];
  risk:
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | "REVIEW";
}

interface AuditRecord {
  id: string;
  timestamp: string;
  type: string;
  command: string;
  target?: string;
  details: string[];
}

interface DiagnosticRecord {
  id: string;
  timestamp: string;
  type: string;
  details: Record<
    string,
    string | number
  >;
}

interface PendingFinalKey {
  reportId: string;
  ownerJid: string;
  expiresAt: number;
}

/* =========================================================
   VORTEX REPLY HELPER
========================================================= */

/*
 * Every normal response from this command module
 * goes through sendVortexReply().
 *
 * This provides:
 * • Native WhatsApp quoted reply
 * • Automatic Read More for long messages
 * • Consistent Dark Vortex reply behavior
 *
 * Media, broadcasts, report delivery, and intentional
 * progress edits remain direct sock.sendMessage() calls.
 */

type VortexReplyOptions = MiscMessageGenerationOptions & {
  mentions?: string[];
};

async function sendReply(
  sock: WASocket,
  jid: string,
  text: string,
  quotedMessage?: WAMessage,
  options?: VortexReplyOptions,
): Promise<WAMessage | undefined> {
  return await sendVortexReply(
    sock,
    jid,
    text,
    quotedMessage,
    options as MiscMessageGenerationOptions,
  );
}

/* =========================================================
   VORTEX SECURITY CONFIRMATION
========================================================= */

export interface PendingSecurityConfirmation {
  ownerJid: string;
  chatJid: string;
  command: string;
  args: string[];
  createdAt: number;
  expiresAt: number;
}

export interface ConfirmedSecurityExecution {
  ownerJid: string;
  chatJid: string;
  command: string;
  args: string[];
  confirmedAt: number;
}

let pendingSecurityConfirmation:
  PendingSecurityConfirmation | null =
  null;

let confirmedSecurityExecution:
  ConfirmedSecurityExecution | null =
  null;

const SECURITY_CONFIRMATION_TIMEOUT =
  30 * 1000;

/* =========================================================
   CREATE SECURITY CONFIRMATION
========================================================= */

export function createSecurityConfirmation(
  ownerJid: string,
  chatJid: string,
  command: string,
  args: string[],
): void {
  const now =
    Date.now();

  pendingSecurityConfirmation = {
    ownerJid,
    chatJid,
    command:
      command
        .trim()
        .toLowerCase(),
    args: [...args],
    createdAt: now,
    expiresAt:
      now +
      SECURITY_CONFIRMATION_TIMEOUT,
  };

  confirmedSecurityExecution =
    null;
}

/* =========================================================
   CLEAR SECURITY CONFIRMATION
========================================================= */

export function clearSecurityConfirmation(): void {
  pendingSecurityConfirmation =
    null;
}

/* =========================================================
   GET PENDING CONFIRMATION
========================================================= */

export function getSecurityConfirmation():
  PendingSecurityConfirmation | null {
  return pendingSecurityConfirmation;
}

/* =========================================================
   EXPIRATION CHECK
========================================================= */

export function isSecurityConfirmationExpired():
  boolean {
  if (
    !pendingSecurityConfirmation
  ) {
    return false;
  }

  return (
    Date.now() >
    pendingSecurityConfirmation.expiresAt
  );
}

/* =========================================================
   CONSUME CONFIRMED EXECUTION
========================================================= */

export function consumeConfirmedSecurityExecution():
  ConfirmedSecurityExecution | null {
  const execution =
    confirmedSecurityExecution;

  confirmedSecurityExecution =
    null;

  return execution;
}

/* =========================================================
   RUNTIME STATE
========================================================= */

let pendingFinalKey:
  PendingFinalKey | null =
  null;

const scanProgress = new Map<
  string,
  {
    command: string;
    target?: string;
    startedAt: number;
    progress: number;
    status:
      | "running"
      | "complete"
      | "failed";
  }
>();

/* =========================================================
   FILE HELPERS
========================================================= */

async function ensureDataFiles(): Promise<void> {
  await fs.mkdir(
    DATA_DIR,
    {
      recursive: true,
    },
  );

  const defaults: Array<
    [string, unknown[]]
  > = [
    [
      REPORTS_FILE,
      [],
    ],
    [
      AUDIT_FILE,
      [],
    ],
    [
      DIAGNOSTICS_FILE,
      [],
    ],
  ];

  for (
    const [file, fallback] of defaults
  ) {
    try {
      await fs.access(
        file,
      );
    } catch {
      await fs.writeFile(
        file,
        JSON.stringify(
          fallback,
          null,
          2,
        ),
        "utf8",
      );
    }
  }
}

async function readJson<T>(
  file: string,
  fallback: T,
): Promise<T> {
  await ensureDataFiles();

  try {
    const raw =
      await fs.readFile(
        file,
        "utf8",
      );

    return JSON.parse(
      raw,
    ) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(
  file: string,
  value: T,
): Promise<void> {
  await ensureDataFiles();

  await fs.writeFile(
    file,
    JSON.stringify(
      value,
      null,
      2,
    ),
    "utf8",
  );
}

/* =========================================================
   AUDIT
========================================================= */

async function addAudit(
  type: string,
  command: string,
  details: string[],
  target?: string,
): Promise<void> {
  const records =
    await readJson<AuditRecord[]>(
      AUDIT_FILE,
      [],
    );

  records.push({
    id: crypto.randomUUID(),
    timestamp:
      new Date().toISOString(),
    type,
    command,
    target,
    details,
  });

  if (
    records.length >
    500
  ) {
    records.splice(
      0,
      records.length - 500,
    );
  }

  await writeJson(
    AUDIT_FILE,
    records,
  );
}

/* =========================================================
   REPORT CREATION
========================================================= */

async function createReport(
  type: string,
  targetJid: string,
  findings: string[],
  evidence: string[],
  risk: SecurityReport["risk"],
): Promise<SecurityReport> {
  const reports =
    await readJson<
      SecurityReport[]
    >(
      REPORTS_FILE,
      [],
    );

  const report:
    SecurityReport = {
    id:
      `VX-${Date.now().toString(36).toUpperCase()}-${crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase()}`,

    type,

    createdAt:
      new Date().toISOString(),

    status:
      "pending",

    destination:
      process.env
        .VORTEX_REPORT_DESTINATION ||
      null,

    target: {
      jid: targetJid,
      number:
        cleanUserNumber(
          targetJid,
        ),
    },

    findings,

    evidence,

    risk,
  };

  reports.push(
    report,
  );

  if (
    reports.length >
    200
  ) {
    reports.splice(
      0,
      reports.length - 200,
    );
  }

  await writeJson(
    REPORTS_FILE,
    reports,
  );

  return report;
}

/* =========================================================
   GET REPORT
========================================================= */

async function getReport(
  reportId: string,
): Promise<SecurityReport | null> {
  const reports =
    await readJson<
      SecurityReport[]
    >(
      REPORTS_FILE,
      [],
    );

  return (
    reports.find(
      (
        report,
      ) =>
        report.id ===
        reportId,
    ) || null
  );
}

/* =========================================================
   UPDATE REPORT
========================================================= */

async function updateReport(
  reportId: string,
  changes:
    Partial<SecurityReport>,
): Promise<
  SecurityReport | null
> {
  const reports =
    await readJson<
      SecurityReport[]
    >(
      REPORTS_FILE,
      [],
    );

  const index =
    reports.findIndex(
      (
        report,
      ) =>
        report.id ===
        reportId,
    );

  if (
    index === -1
  ) {
    return null;
  }

  reports[index] = {
    ...reports[index],
    ...changes,
  };

  await writeJson(
    REPORTS_FILE,
    reports,
  );

  return reports[index];
}

/* =========================================================
   TARGET RESOLUTION
========================================================= */

function getTargetJid(
  message: WAMessage,
): string | null {
  const context =
    message.message
      ?.extendedTextMessage
      ?.contextInfo;

  const mentioned =
    context?.mentionedJid;

  if (
    mentioned &&
    mentioned.length >
      0
  ) {
    return (
      mentioned[0] ||
      null
    );
  }

  const participant =
    context?.participant;

  if (
    participant
  ) {
    return participant;
  }

  return null;
}

/* =========================================================
   TARGET DISPLAY NAME
========================================================= */

async function getTargetDisplayName(
  sock: WASocket,
  message: WAMessage,
  targetJid: string,
): Promise<string> {
  /*
   * --------------------------------------------------------
   * 1. If the target is the sender of this message,
   *    WhatsApp's pushName is the best available name.
   * --------------------------------------------------------
   */

  const senderJid =
    message.key.participant ||
    message.key.remoteJid ||
    "";

  if (
    senderJid === targetJid &&
    message.pushName?.trim()
  ) {
    return message.pushName.trim();
  }

  /*
   * --------------------------------------------------------
   * 2. In groups, resolve the target from group metadata.
   * --------------------------------------------------------
   */

  const chatJid =
    message.key.remoteJid;

  if (
    chatJid?.endsWith("@g.us")
  ) {
    try {
      const metadata =
        await sock.groupMetadata(
          chatJid,
        );

      const participant =
  metadata.participants.find(
    (member) => {
      const data =
        member as any;

      return (
        data.id === targetJid ||
        data.jid === targetJid ||
        data.lid === targetJid
      );
    },
  );

      if (participant) {
        const name =
          (
            participant as any
          ).notify ||
          (
            participant as any
          ).name ||
          (
            participant as any
          ).verifiedName;

        if (
          typeof name === "string" &&
          name.trim()
        ) {
          return name.trim();
        }
      }
    } catch (error) {
      console.error(
        "⚠️ [PRINTINSULT] Failed to resolve target name:",
        error,
      );
    }
  }

  /*
   * --------------------------------------------------------
   * 3. Safe fallback.
   * --------------------------------------------------------
   */

  return cleanUserNumber(
    targetJid,
  );
}

/* =========================================================
   TARGET HELP
========================================================= */

function targetHelp(
  command: string,
): string {
  return info(
    "TARGET REQUIRED",
    [
      `⚡ Command: ${getPrefix()}${command}`,
      "",
      "👤 Mention a user or reply",
      "to their message.",
      "",
      `📝 Example: ${getPrefix()}${command} @user`,
    ],
  );
}

/* =========================================================
   BOT INDICATOR ANALYSIS
========================================================= */

function analyzeObservableBotIndicators(
  message: WAMessage,
): {
  indicators: string[];
  findings: string[];
  risk:
    SecurityReport["risk"];
} {
  const indicators:
    string[] = [];

  const findings:
    string[] = [];

  const content =
    message.message;

  if (
    content?.botInvokeMessage
  ) {
    indicators.push(
      "WhatsApp bot-related message metadata observed.",
    );
  }

  if (
    content?.interactiveMessage
  ) {
    indicators.push(
      "Interactive automation-style message structure observed.",
    );
  }

  if (
    content?.buttonsMessage
  ) {
    indicators.push(
      "Legacy button-style message structure observed.",
    );
  }

  if (
    content?.listMessage
  ) {
    indicators.push(
      "List-style interactive message structure observed.",
    );
  }

  if (
    content?.templateMessage
  ) {
    indicators.push(
      "Template-style message structure observed.",
    );
  }

  if (
    indicators.length >
    0
  ) {
    findings.push(
      "Automation-related message structures were observed.",
    );

    return {
      indicators,
      findings,
      risk:
        "REVIEW",
    };
  }

  findings.push(
    "No strong automation-specific message structure was observed in the supplied message.",
  );

  return {
    indicators,
    findings,
    risk:
      "LOW",
  };
}

/* =========================================================
   CHECK BOT
========================================================= */

async function checkBot(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  targetJid: string,
): Promise<void> {
  const scanId =
    crypto.randomUUID();

  const startedAt =
    Date.now();

  scanProgress.set(
    scanId,
    {
      command: "checkbot",
      target: targetJid,
      startedAt,
      progress: 0,
      status: "running",
    },
  );

  /* -------------------------------------------------------
     INITIAL PROGRESS MESSAGE
  ------------------------------------------------------- */

  const progressMessage =
    await sendReply(
      sock,
      jid,
      vortexBox(
        "🛡️ BOT VERIFICATION",
        [
          `🎯 Target: ${userMention(targetJid)}`,
          "",
          "🔄 Initializing verification...",
          "",
          "▱▱▱▱▱▱▱▱▱▱ 0%",
          "",
          "🟡 Status: INITIALIZING",
        ],
      ),
      message,
      {
        mentions: [
          targetJid,
        ],
      },
    );

  /* -------------------------------------------------------
     SMALL DELAY HELPER
  ------------------------------------------------------- */

  const wait =
    async (
      ms: number,
    ): Promise<void> => {
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            ms,
          ),
      );
    };

  /* -------------------------------------------------------
     UPDATE PROGRESS
  ------------------------------------------------------- */

  const updateProgress =
    async (
      progress: number,
      status: string,
      lines: string[],
    ): Promise<void> => {
      scanProgress.set(
        scanId,
        {
          command: "checkbot",
          target: targetJid,
          startedAt,
          progress,
          status:
            progress >= 100
              ? "complete"
              : "running",
        },
      );

      const filled =
        Math.floor(
          progress / 10,
        );

      const bar =
        "▰".repeat(
          filled,
        ) +
        "▱".repeat(
          10 - filled,
        );

      await sock.sendMessage(
        jid,
        {
          text:
            vortexBox(
              "🛡️ BOT VERIFICATION",
              [
                `🎯 Target: ${userMention(targetJid)}`,
                "",
                ...lines,
                "",
                `${bar} ${progress}%`,
                "",
                `🟡 Status: ${status}`,
              ],
            ),
          ...(progressMessage?.key
            ? {
                edit:
                  progressMessage.key,
              }
            : {}),
          mentions: [
            targetJid,
          ],
        },
      );
    };

  try {
    await wait(700);

    await updateProgress(
      25,
      "READING OBSERVABLE DATA",
      [
        "📡 Reading observable message data...",
        "🔍 Preparing metadata analysis...",
      ],
    );

    await wait(700);

    await updateProgress(
      50,
      "ANALYZING MESSAGE STRUCTURE",
      [
        "📡 Analyzing message metadata...",
        "🤖 Checking automation indicators...",
      ],
    );

    const analysis =
      analyzeObservableBotIndicators(
        message,
      );

    await wait(700);

    await updateProgress(
      75,
      "VERIFYING SECURITY STATE",
      [
        "🔐 Checking observable authentication state...",
        "🛡️ Comparing detected indicators...",
      ],
    );

    await wait(700);

    await updateProgress(
      90,
      "ALMOST DONE",
      [
        "🔎 Finalizing security assessment...",
        "⚠️ Almost done...",
        "📋 Preparing verification report...",
      ],
    );

    const report =
      await createReport(
        "Bot Verification",
        targetJid,
        analysis.findings,
        analysis.indicators,
        analysis.risk,
      );

    await addAudit(
      "BOT_VERIFICATION",
      "checkbot",
      [
        `Report: ${report.id}`,
        `Risk: ${analysis.risk}`,
        `Indicators: ${analysis.indicators.length}`,
      ],
      targetJid,
    );

    await wait(700);

    scanProgress.set(
      scanId,
      {
        command: "checkbot",
        target: targetJid,
        startedAt,
        progress: 100,
        status: "complete",
      },
    );

    const finalBar =
      "▰".repeat(10);

    await sock.sendMessage(
      jid,
      {
        text:
          security(
            "BOT VERIFICATION COMPLETE",
            [
              `🎯 Target: ${userMention(targetJid)}`,
              "",
              `${finalBar} 100%`,
              "",
              "🟢 Status: COMPLETE",
              "",
              `🤖 Indicators: ${
                analysis.indicators
                  .length > 0
                  ? "DETECTED"
                  : "NOT OBSERVED"
              }`,
              "🔐 Authentication: UNVERIFIED",
              `⚠️ Risk: ${analysis.risk}`,
              "",
              "📋 Observable checks completed.",
              `📄 Report ID: ${report.id}`,
              "",
              "📤 Report: READY FOR OWNER REVIEW",
              "",
              "╰─── DARK VORTEX BOT APEX SECURITY ───╯",
            ],
          ),
        ...(progressMessage?.key
          ? {
              edit:
                progressMessage.key,
            }
          : {}),
        mentions: [
          targetJid,
        ],
      },
    );
  } catch (err) {
    console.error(
      "Dark Vortex checkbot error:",
      err,
    );

    scanProgress.set(
      scanId,
      {
        command: "checkbot",
        target: targetJid,
        startedAt,
        progress: 100,
        status: "failed",
      },
    );

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            error(
              "BOT VERIFICATION FAILED",
              [
                `🎯 Target: ${userMention(targetJid)}`,
                "",
                "❌ The verification could not be completed.",
                "",
                "🛡️ No security action was performed.",
              ],
            ),
          ...(progressMessage?.key
            ? {
                edit:
                  progressMessage.key,
              }
            : {}),
          mentions: [
            targetJid,
          ],
        },
      );
    } catch {
      // Ignore secondary edit failure.
    }
  }
}

/* =========================================================
   SCAN BOT
========================================================= */

async function scanBot(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  targetJid: string,
): Promise<void> {
  const scanId =
    crypto.randomUUID();

  const startedAt =
    Date.now();

  scanProgress.set(
    scanId,
    {
      command: "scanbot",
      target: targetJid,
      startedAt,
      progress: 0,
      status: "running",
    },
  );

  const progressMessage =
    await sendReply(
      sock,
      jid,
      vortexBox(
        "🛡️ BOT SECURITY SCAN",
        [
          `🎯 Target: ${userMention(targetJid)}`,
          "",
          "🔄 Initializing deep observable scan...",
          "",
          "▱▱▱▱▱▱▱▱▱▱ 0%",
          "",
          "🟡 Status: INITIALIZING",
        ],
      ),
      message,
      {
        mentions: [
          targetJid,
        ],
      },
    );

  const wait =
    async (
      ms: number,
    ): Promise<void> => {
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            ms,
          ),
      );
    };

  const updateProgress =
    async (
      progress: number,
      status: string,
      lines: string[],
    ): Promise<void> => {
      scanProgress.set(
        scanId,
        {
          command: "scanbot",
          target: targetJid,
          startedAt,
          progress,
          status:
            progress >= 100
              ? "complete"
              : "running",
        },
      );

      const filled =
        Math.floor(
          progress / 10,
        );

      const bar =
        "▰".repeat(
          filled,
        ) +
        "▱".repeat(
          10 - filled,
        );

      await sock.sendMessage(
        jid,
        {
          text:
            vortexBox(
              "🛡️ BOT SECURITY SCAN",
              [
                `🎯 Target: ${userMention(targetJid)}`,
                "",
                ...lines,
                "",
                `${bar} ${progress}%`,
                "",
                `🟡 Status: ${status}`,
              ],
            ),
          ...(progressMessage?.key
            ? {
                edit:
                  progressMessage.key,
              }
            : {}),
          mentions: [
            targetJid,
          ],
        },
      );
    };

  try {
    await wait(700);

    await updateProgress(
      25,
      "INITIAL SCAN",
      [
        "📡 Reading observable message data...",
        "🔍 Initializing security inspection...",
      ],
    );

    await wait(700);

    await updateProgress(
      50,
      "ANALYZING MESSAGE STRUCTURE",
      [
        "📡 Inspecting message structures...",
        "🤖 Checking automation indicators...",
        "🔎 Reviewing observable metadata...",
      ],
    );

    const analysis =
      analyzeObservableBotIndicators(
        message,
      );

    await wait(700);

    await updateProgress(
      75,
      "BUILDING SECURITY ASSESSMENT",
      [
        "🛡️ Correlating observable indicators...",
        "🔐 Reviewing authentication state...",
        "⚠️ Evaluating security evidence...",
      ],
    );

    const findings =
      [
        ...analysis.findings,

        "Authentication cannot be independently verified from normal WhatsApp message metadata.",

        "No unauthorized takeover or credential access was attempted.",
      ];

    const evidence =
      [
        ...analysis.indicators,

        "Observable message-level analysis completed.",
      ];

    await wait(700);

    await updateProgress(
      90,
      "ALMOST DONE",
      [
        "🔎 Finalizing security assessment...",
        "📋 Preparing detailed scan report...",
        "⚠️ Almost done...",
      ],
    );

    const report =
      await createReport(
        "Bot Security Scan",
        targetJid,
        findings,
        evidence,
        analysis.risk,
      );

    await addAudit(
      "BOT_SECURITY_SCAN",
      "scanbot",
      [
        `Report: ${report.id}`,
        `Risk: ${analysis.risk}`,
        `Evidence items: ${evidence.length}`,
      ],
      targetJid,
    );

    await wait(700);

    scanProgress.set(
      scanId,
      {
        command: "scanbot",
        target: targetJid,
        startedAt,
        progress: 100,
        status: "complete",
      },
    );

    await sock.sendMessage(
      jid,
      {
        text:
          security(
            "BOT SECURITY SCAN COMPLETE",
            [
              `🎯 Target: ${userMention(targetJid)}`,
              "",
              "▰▰▰▰▰▰▰▰▰▰ 100%",
              "",
              "🟢 Status: COMPLETE",
              "",
              "🔍 Verification: COMPLETE",
              `🤖 Bot indicators: ${
                analysis.indicators.length
                  ? "DETECTED"
                  : "NOT OBSERVED"
              }`,
              "🔐 Auth state: UNVERIFIED",
              "📡 Observable activity: ANALYZED",
              `🛡️ Risk assessment: ${analysis.risk}`,
              "",
              "🚫 Unauthorized takeover: BLOCKED",
              "",
              `📄 Report: ${report.id}`,
              "📋 Detailed report prepared.",
              "",
              "📤 Report: READY FOR OWNER REVIEW",
              "",
              "╰─── DARK VORTEX BOT APEX SECURITY ───╯",
            ],
          ),
        ...(progressMessage?.key
          ? {
              edit:
                progressMessage.key,
            }
          : {}),
        mentions: [
          targetJid,
        ],
      },
    );
  } catch (err) {
    console.error(
      "Dark Vortex scanbot error:",
      err,
    );

    scanProgress.set(
      scanId,
      {
        command: "scanbot",
        target: targetJid,
        startedAt,
        progress: 100,
        status: "failed",
      },
    );

    try {
      await sock.sendMessage(
        jid,
        {
          text:
            error(
              "BOT SECURITY SCAN FAILED",
              [
                `🎯 Target: ${userMention(targetJid)}`,
                "",
                "❌ The security scan could not be completed.",
                "",
                "🛡️ No unauthorized security action was performed.",
              ],
            ),
          ...(progressMessage?.key
            ? {
                edit:
                  progressMessage.key,
              }
            : {}),
          mentions: [
            targetJid,
          ],
        },
      );
    } catch {
      // Ignore secondary edit failure.
    }
  }
}

/* =========================================================
   PROGRESS
========================================================= */

async function showProgress(
  sock: WASocket,
  jid: string,
  args: string[],
  message?: WAMessage,
): Promise<void> {
  const requested =
    args[0];

  let entry:
    | {
        command: string;
        target?: string;
        startedAt: number;
        progress: number;
        status:
          | "running"
          | "complete"
          | "failed";
      }
    | undefined;

  if (
    requested
  ) {
    entry =
      scanProgress.get(
        requested,
      );
  } else {
    const values =
      [
        ...scanProgress.values(),
      ];

    entry =
      values.at(-1);
  }

  if (
    !entry
  ) {
    await sendReply(
      sock,
      jid,
      info(
        "SCAN PROGRESS",
        [
          "📡 No active or recent scan found.",
          "",
          `💡 Use ${getPrefix()}checkbot @user`,
          `💡 Use ${getPrefix()}scanbot @user`,
        ],
      ),
      message,
    );

    return;
  }

  const elapsed =
    Date.now() -
    entry.startedAt;

  await sendReply(
    sock,
    jid,
    system(
      "SCAN PROGRESS",
      [
        `⚡ Command: ${entry.command}`,

        entry.target
          ? `🎯 Target: ${userMention(entry.target)}`
          : "",

        `📊 Progress: ${entry.progress}%`,

        `🟢 Status: ${entry.status.toUpperCase()}`,

        `⏱️ Runtime: ${Math.max(
          0,
          Math.floor(
            elapsed /
              1000,
          ),
        )}s`,
      ].filter(
        Boolean,
      ),
    ),
    message,
    entry.target
      ? {
          mentions: [
            entry.target,
          ],
        }
      : undefined,
  );
}

/* =========================================================
   LEGACY AUDIT VIEW
========================================================= */

async function showAudit(
  sock: WASocket,
  jid: string,
  message?: WAMessage,
): Promise<void> {
  const records =
    await readJson<
      AuditRecord[]
    >(
      AUDIT_FILE,
      [],
    );

  const recent =
    records
      .slice(-8)
      .reverse();

  if (
    !recent.length
  ) {
    await sendReply(
      sock,
      jid,
      info(
        "SECURITY AUDIT",
        [
          "📋 No legacy audit records available.",
          "",
          "🟢 Audit database is clean.",
        ],
      ),
      message,
    );

    return;
  }

  const lines = [
    `📋 Records: ${records.length}`,
    "",
    ...recent.map(
      (
        record,
      ) =>
        `• ${record.command.toUpperCase()} — ${
          record.target
            ? cleanUserNumber(
                record.target,
              )
            : "SYSTEM"
        }`,
    ),
    "",
    "🛡️ Legacy VX Audit Logging: ACTIVE",
  ];

  await sendReply(
    sock,
    jid,
    security(
      "LEGACY SECURITY AUDIT",
      lines,
    ),
    message,
  );
}

/* =========================================================
   SYSTEM DIAGNOSTIC
========================================================= */

async function runSystemDiagnostic(
  sock: WASocket,
  jid: string,
  type = "SYSTEM",
  message?: WAMessage,
): Promise<void> {
  const memory =
    process.memoryUsage();

  const diagnostic:
    DiagnosticRecord = {
    id:
      crypto.randomUUID(),

    timestamp:
      new Date().toISOString(),

    type,

    details: {
      platform:
        process.platform,

      architecture:
        process.arch,

      node:
        process.version,

      pid:
        process.pid,

      uptimeSeconds:
        Math.floor(
          process.uptime(),
        ),

      rssMB:
        Number(
          (
            memory.rss /
            1024 /
            1024
          ).toFixed(
            1,
          ),
        ),

      heapUsedMB:
        Number(
          (
            memory.heapUsed /
            1024 /
            1024
          ).toFixed(
            1,
          ),
        ),

      cpus:
        os.cpus()
          .length,
    },
  };

  const history =
    await readJson<
      DiagnosticRecord[]
    >(
      DIAGNOSTICS_FILE,
      [],
    );

  history.push(
    diagnostic,
  );

  if (
    history.length >
    200
  ) {
    history.splice(
      0,
      history.length - 200,
    );
  }

  await writeJson(
    DIAGNOSTICS_FILE,
    history,
  );

  await addAudit(
    "SYSTEM_DIAGNOSTIC",
    type.toLowerCase(),
    [
      `Node: ${process.version}`,
      `Platform: ${process.platform}`,
      `RSS: ${diagnostic.details.rssMB} MB`,
    ],
  );

  await sendReply(
    sock,
    jid,
    system(
      "SYSTEM DIAGNOSTIC",
      [
        "🟢 Runtime: HEALTHY",
        `🧠 Node.js: ${process.version}`,
        `💻 Platform: ${process.platform}`,
        `⚙️ Architecture: ${process.arch}`,
        `🧵 CPU Cores: ${os.cpus().length}`,
        `💾 Memory RSS: ${diagnostic.details.rssMB} MB`,
        `🧠 Heap Used: ${diagnostic.details.heapUsedMB} MB`,
        `⏱️ Process Uptime: ${diagnostic.details.uptimeSeconds}s`,
        `🆔 PID: ${process.pid}`,
        "",
        "📡 Connection diagnostics executed.",
        "🛡️ Security services remain active.",
      ],
    ),
    message,
  );
}

/* =========================================================
   IP TRACE
========================================================= */

async function runIpTrace(
  sock: WASocket,
  jid: string,
  message?: WAMessage,
): Promise<void> {
  const report =
    await createReport(
      "Network Diagnostic",
      jid,
      [
        "Local runtime network diagnostics requested.",
        "No private IP address of another WhatsApp user was requested or exposed.",
      ],
      [
        `Hostname: ${os.hostname()}`,
        `Platform: ${process.platform}`,
        `Architecture: ${process.arch}`,
      ],
      "LOW",
    );

  await addAudit(
    "NETWORK_DIAGNOSTIC",
    "iptrace",
    [
      `Report: ${report.id}`,
      "Safe local diagnostic mode.",
    ],
  );

  await sendReply(
    sock,
    jid,
    info(
      "NETWORK DIAGNOSTIC",
      [
        "📡 Mode: SAFE DIAGNOSTIC",
        `💻 Host: ${os.hostname()}`,
        `🖥️ Platform: ${process.platform}`,
        `⚙️ Architecture: ${process.arch}`,
        "",
        "🔐 Privacy boundary:",
        "No WhatsApp user's private IP",
        "address was traced or exposed.",
        "",
        `📄 Diagnostic ID: ${report.id}`,
        "🟢 Status: COMPLETE",
      ],
    ),
    message,
  );
}

/* =========================================================
   S9 PROTOCOL
========================================================= */

async function runS9(
  sock: WASocket,
  jid: string,
  message?: WAMessage,
): Promise<void> {
  const memory =
    process.memoryUsage();

  await addAudit(
    "S9_PROTOCOL",
    "s9",
    [
      "Low-profile internal diagnostic mode.",
      "Detection checks remain active.",
      "No evasion or bypass performed.",
    ],
  );

  await sendReply(
    sock,
    jid,
    vortexBox(
      "⚡ S9 PROTOCOL",
      [
        "🔐 Initializing System 9...",
        "📡 Running in low-profile mode",
        "👁️ Detection checks: ACTIVE",
        "⚙️ Runtime: HEALTHY",
        "🛡️ Security: ACTIVE",
        `💾 Memory: ${(
          memory.rss /
          1024 /
          1024
        ).toFixed(
          1,
        )} MB`,
        "📡 Connection: ONLINE",
        "",
        "✅ Status: ACTIVE",
        "",
        "╰─── SECURE CHANNEL ───╯",
      ],
    ),
    message,
  );
}

/* =========================================================
   INSULT / ROAST
========================================================= */

const ROASTS = [
  "Even your shadow is trying to distance itself from you. 😂",
  "Your common sense is currently unavailable. Please try again later. 😂",
  "You bring premium confidence with free-trial decision making. 😂",
  "Your brain opened 47 tabs and forgot what it was looking for. 😂",
  "If confusion were a superpower, you would be unstoppable. 😂",
  "Your Wi-Fi signal has more direction than your plans. 😂",
  "Dark Vortex scanned the situation and requested technical support. 😂",
];

async function insultUser(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  targetJid: string,
): Promise<void> {
  const diagnostic =
    generateUserDiagnostic();

  const targetName =
    await getTargetDisplayName(
      sock,
      message,
      targetJid,
    );

  await addAudit(
    "PLAYFUL_ROAST",
    "insult",
    [
      `Roast level: ${diagnostic.roastLevel}%`,
    ],
    targetJid,
  );

  await sendReply(
    sock,
    jid,
    vortexBox(
      "👤 USER DIAGNOSTIC",
      [
        `🎯 Target: ${targetName}`,
        "",
        `🔍 Personality scan: ${diagnostic.personality}`,
        `🧠 Brain activity: ${diagnostic.brainActivity}%`,
        `⚡ Common sense: ${diagnostic.logic}`,
        `📡 Social signal: ${diagnostic.socialSignal}`,
        `😎 Confidence: ${diagnostic.confidence}%`,
        "",
        "💀 VORTEX ASSESSMENT",
        "",
        `“${diagnostic.roast}”`,
        "",
        `📊 Roast level: ${diagnostic.roastLevel}%`,
        "",
        `✅ Diagnosis: ${diagnostic.diagnosis}`,
      ],
    ),
    message,
    {
      mentions: [
        targetJid,
      ],
    },
  );
}

/* =========================================================
   FINAL KEY
========================================================= */

async function armFinalKey(
  sock: WASocket,
  jid: string,
  ownerJid: string,
  message?: WAMessage,
): Promise<void> {
  const reports =
    await readJson<
      SecurityReport[]
    >(
      REPORTS_FILE,
      [],
    );

  const pending =
    [
      ...reports,
    ]
      .reverse()
      .find(
        (
          report,
        ) =>
          report.status ===
          "pending",
      );

  if (
    !pending
  ) {
    await sendReply(
      sock,
      jid,
      warning(
        "NO PENDING REPORT",
        [
          "📋 There is no pending security report.",
          "",
          "Run a scan first:",
          `${getPrefix()}checkbot @user`,
          `${getPrefix()}scanbot @user`,
        ],
      ),
      message,
    );

    return;
  }

  const expiresAt =
    Date.now() +
    2 * 60 * 1000;

  pendingFinalKey = {
    reportId:
      pending.id,

    ownerJid,

    expiresAt,
  };

  await sendReply(
    sock,
    jid,
    warning(
      "FINAL REPORT KEY",
      [
        `📄 Report: ${pending.id}`,
        "",
        "📤 A security report is ready.",
        "",
        pending.destination
          ? `📍 Destination: ${pending.destination}`
          : "📍 Destination: NOT CONFIGURED",
        "",
        "Do you want to send the report?",
        "",
        "✅ CONFIRM",
        "🛑 ABORT REPORT",
        "",
        "⏱️ Confirmation expires in 2 minutes.",
      ],
    ),
    message,
  );
}

/* =========================================================
   SEND REPORT
========================================================= */

async function sendReport(
  sock: WASocket,
  jid: string,
  report: SecurityReport,
  message?: WAMessage,
): Promise<void> {
  const destination =
    report.destination;

  if (
    !destination
  ) {
    await sendReply(
      sock,
      jid,
      error(
        "REPORT DESTINATION MISSING",
        [
          "📤 No WhatsApp report destination is configured.",
          "",
          "Add this to your .env:",
          "VORTEX_REPORT_DESTINATION=234XXXXXXXXXX@s.whatsapp.net",
          "",
          "Then restart Dark Vortex.",
        ],
      ),
      message,
    );

    return;
  }

  const reportText =
    vortexBox(
      "🛡️ DARK VORTEX BOT APEX SECURITY REPORT",
      [
        `🔎 Report Type: ${report.type}`,
        `📄 Report ID: ${report.id}`,
        `🎯 Target: ${userMention(report.target.jid)}`,
        `🕐 Time: ${report.createdAt}`,
        "",
        `⚠️ Risk Assessment: ${report.risk}`,
        "",
        "📋 Findings:",
        ...report.findings.map(
          (
            item,
          ) =>
            `• ${item}`,
        ),
        "",
        "🔎 Evidence:",
        ...report.evidence.map(
          (
            item,
          ) =>
            `• ${item}`,
        ),
        "",
        "📤 Report Status: SENT",
        "",
        "╰─── DARK VORTEX BOT APEX SECURITY ───╯",
      ],
    );

  try {
    /*
     * This is intentionally NOT sendVortexReply().
     *
     * The report is being delivered to the configured
     * destination, not replying to the command message.
     */
    await sock.sendMessage(
      destination,
      {
        text:
          reportText,
        mentions: [
          report.target.jid,
        ],
      },
    );

    await updateReport(
      report.id,
      {
        status:
          "sent",
      },
    );

    await addAudit(
      "REPORT_SENT",
      "finalkey",
      [
        `Report: ${report.id}`,
        `Destination: ${destination}`,
      ],
    );

    await sendReply(
      sock,
      jid,
      success(
        "REPORT SENT",
        [
          `📄 Report: ${report.id}`,
          `📍 Destination: ${destination}`,
          "",
          "📤 Security report delivered to the configured WhatsApp destination.",
        ],
      ),
      message,
    );
  } catch (
    err
  ) {
    console.error(
      "Vortex report send error:",
      err,
    );

    await sendReply(
      sock,
      jid,
      error(
        "REPORT DELIVERY FAILED",
        [
          `📄 Report: ${report.id}`,
          "",
          "❌ WhatsApp delivery failed.",
          "🟡 The report remains pending.",
        ],
      ),
      message,
    );
  }
}

/* =========================================================
   CONFIRM FINAL KEY
========================================================= */

async function confirmFinalKey(
  sock: WASocket,
  jid: string,
  ownerJid: string,
  message?: WAMessage,
): Promise<void> {
  if (
    !pendingFinalKey ||
    pendingFinalKey.ownerJid !==
      ownerJid
  ) {
    return;
  }

  if (
    Date.now() >
    pendingFinalKey.expiresAt
  ) {
    pendingFinalKey =
      null;

    await sendReply(
      sock,
      jid,
      warning(
        "CONFIRMATION EXPIRED",
        [
          "⏱️ The final report key expired.",
          "",
          `Run ${getPrefix()}finalkey again to create a new confirmation request.`,
        ],
      ),
      message,
    );

    return;
  }

  const report =
    await getReport(
      pendingFinalKey.reportId,
    );

  if (
    !report
  ) {
    pendingFinalKey =
      null;

    await sendReply(
      sock,
      jid,
      error(
        "REPORT NOT FOUND",
        [
          "📄 The pending report could not be located.",
        ],
      ),
      message,
    );

    return;
  }

  pendingFinalKey =
    null;

  await sendReport(
    sock,
    jid,
    report,
    message,
  );
}

/* =========================================================
   ABORT FINAL KEY
========================================================= */

async function abortFinalKey(
  sock: WASocket,
  jid: string,
  ownerJid: string,
  message?: WAMessage,
): Promise<void> {
  if (
    !pendingFinalKey ||
    pendingFinalKey.ownerJid !==
      ownerJid
  ) {
    return;
  }

  const reportId =
    pendingFinalKey.reportId;

  pendingFinalKey =
    null;

  await updateReport(
    reportId,
    {
      status:
        "aborted",
    },
  );

  await addAudit(
    "REPORT_ABORTED",
    "abort report",
    [
      `Report: ${reportId}`,
    ],
  );

  await sendReply(
    sock,
    jid,
    warning(
      "REPORT ABORTED",
      [
        `📄 Report: ${reportId}`,
        "",
        "🛑 No report was sent.",
        "🟢 Pending report cleared.",
      ],
    ),
    message,
  );
}

/* =========================================================
   SYNC
========================================================= */

async function syncVortex(
  sock: WASocket,
  jid: string,
  message?: WAMessage,
): Promise<void> {
  const reports =
    await readJson<
      SecurityReport[]
    >(
      REPORTS_FILE,
      [],
    );

  const audits =
    await readJson<
      AuditRecord[]
    >(
      AUDIT_FILE,
      [],
    );

  const diagnostics =
    await readJson<
      DiagnosticRecord[]
    >(
      DIAGNOSTICS_FILE,
      [],
    );

  await addAudit(
    "SYNC",
    "sync",
    [
      `Reports: ${reports.length}`,
      `Audits: ${audits.length}`,
      `Diagnostics: ${diagnostics.length}`,
    ],
  );

  await sendReply(
    sock,
    jid,
    system(
      "VORTEX SYNC",
      [
        "🔄 Synchronization complete.",
        "",
        `📋 Security reports: ${reports.length}`,
        `🛡️ Audit records: ${audits.length}`,
        `⚙️ Diagnostic records: ${diagnostics.length}`,
        "",
        "🟢 Local security state synchronized.",
        "🟢 Persistent storage verified.",
      ],
    ),
    message,
  );
}

/* =========================================================
   SPECIAL CONFIRMATION HANDLER
========================================================= */

export async function handleVortexConfirmation(
  sock: WASocket,
  jid: string,
  sender: string,
  text: string,
  message?: WAMessage,
): Promise<boolean> {
  const normalized =
    text
      .trim()
      .toUpperCase();

  /* -------------------------------------------------------
     EXISTING FINAL REPORT CONFIRMATION
  ------------------------------------------------------- */

  if (
    normalized === "CONFIRM" ||
    normalized === "ABORT REPORT"
  ) {
    if (
      !pendingFinalKey ||
      pendingFinalKey.ownerJid !== sender
    ) {
      return false;
    }

    if (normalized === "CONFIRM") {
      await confirmFinalKey(
        sock,
        jid,
        sender,
        message,
      );
    } else {
      await abortFinalKey(
        sock,
        jid,
        sender,
        message,
      );
    }

    return true;
  }

  /* -------------------------------------------------------
     VORTEX SECURITY CONFIRMATION
  ------------------------------------------------------- */

  const confirmation =
    getSecurityConfirmation();

  if (!confirmation) {
    return false;
  }

  /* -------------------------------------------------------
     ONLY THE OWNER WHO CREATED THE CONFIRMATION
     CAN ANSWER IT
  ------------------------------------------------------- */

  if (
    confirmation.ownerJid !== sender
  ) {
    return false;
  }

  /* -------------------------------------------------------
     CONFIRMATION MUST BE ANSWERED IN THE SAME CHAT
  ------------------------------------------------------- */

  if (
    confirmation.chatJid !== jid
  ) {
    return false;
  }

  /* -------------------------------------------------------
     EXPIRATION
  ------------------------------------------------------- */

  if (
    isSecurityConfirmationExpired()
  ) {
    clearSecurityConfirmation();
    confirmedSecurityExecution = null;

    await sendReply(
      sock,
      jid,
      warning(
        "SECURITY CONFIRMATION EXPIRED",
        [
          "⏱️ The VORTEX SECURITY confirmation expired.",
          "",
          "🛑 No security operation was executed.",
          "",
          `Run ${getPrefix()}${confirmation.command} again if you still want to continue.`,
        ],
      ),
      message,
    );

    return true;
  }

  /* -------------------------------------------------------
     YES
  ------------------------------------------------------- */

  if (
    normalized === "YES"
  ) {
    const confirmedCommand =
      confirmation.command;

    const confirmedArgs =
      [
        ...confirmation.args,
      ];

    confirmedSecurityExecution = {
      ownerJid:
        confirmation.ownerJid,

      chatJid:
        confirmation.chatJid,

      command:
        confirmedCommand,

      args:
        confirmedArgs,

      confirmedAt:
        Date.now(),
    };

    clearSecurityConfirmation();

    await sendReply(
      sock,
      jid,
      vortexBox(
        "🛡️ VORTEX SECURITY",
        [
          "✅ OWNER CONFIRMATION ACCEPTED",
          "",
          `🔐 Operation: ${confirmedCommand.toUpperCase()}`,
          "",
          "⚙️ Executing authorized security operation...",
        ],
      ),
      message,
    );

    return true;
  }

  /* -------------------------------------------------------
     NO / CANCEL / ABORT
  ------------------------------------------------------- */

  if (
    normalized === "NO" ||
    normalized === "CANCEL" ||
    normalized === "ABORT"
  ) {
    const command =
      confirmation.command;

    clearSecurityConfirmation();
    confirmedSecurityExecution = null;

    await sendReply(
      sock,
      jid,
      warning(
        "SECURITY OPERATION CANCELLED",
        [
          `🔐 Operation: ${command.toUpperCase()}`,
          "",
          "🛑 No security operation was executed.",
          "🟢 Authorization state cleared.",
        ],
      ),
      message,
    );

    return true;
  }

  /* -------------------------------------------------------
     OTHER MESSAGE
     Do NOT consume or modify the confirmation.
  ------------------------------------------------------- */

  return false;
}

/* =========================================================
   SECURITY CONFIRMATION PROMPT
========================================================= */

export async function sendSecurityConfirmationPrompt(
  sock: WASocket,
  jid: string,
  command: string,
  message?: WAMessage,
): Promise<void> {
  await sendReply(
    sock,
    jid,
    vortexBox(
      "🌑 DARK VORTEX • BLACK GATE",
      [
        "╔══════════════════════╗",
        "      SECURITY LOCK",
        "╚══════════════════════╝",
        "",
        "⚠️ AN AUTHORIZED OPERATION",
        "   IS AWAITING YOUR DECISION.",
        "",
        `🎯 TARGET OPERATION`,
        `   ▸ ${command.toUpperCase()}`,
        "",
        "╭─「 VORTEX CONTROL 」",
        "│",
        "│ 👤 Authority   : OWNER",
        "│ 🛡️ Clearance   : VERIFIED",
        "│ 🔐 Security    : ARMED",
        "│ ⚡ Execution   : LOCKED",
        "│ ⏳ Window      : 30 SECONDS",
        "│",
        "╰──────────────────────",
        "",
        "╭─「 SYSTEM MESSAGE 」",
        "│",
        "│ The requested operation has been",
        "│ intercepted by the VORTEX SECURITY",
        "│ authorization layer.",
        "│",
        "│ No action has been executed.",
        "│ Awaiting final owner authorization.",
        "│",
        "╰──────────────────────",
        "",
        "🟢  YES",
        "    └─ AUTHORIZE EXECUTION",
        "",
        "🔴  NO",
        "    └─ DENY & CANCEL",
        "",
        "You may also reply with:",
        "CANCEL  •  ABORT",
        "",
        "⚠️ Failure to respond within 30 seconds",
        "   will automatically terminate the request.",
        "",
        "╰─── 🌑 VORTEX SECURITY CORE ───╯",
        "       ⚡ VORTEX TECH",
      ],
    ),
    message,
  );
}



/* =========================================================
   SECURITY COMMAND IDENTIFICATION
========================================================= */

export function isVortexSecurityCommand(
  command: string,
): boolean {
  const normalized =
    command
      .trim()
      .toLowerCase();

  return [
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
  ].includes(
    normalized,
  );
}

/* =========================================================
   MAIN VORTEX TOOLS COMMAND HANDLER
========================================================= */

export async function handleVortexToolsCommand(
  sock: WASocket,
  jid: string,
  sender: string,
  command: string,
  args: string[],
  message: WAMessage,
): Promise<boolean> {
  const normalized =
    command
      .trim()
      .toLowerCase();

  switch (
    normalized
  ) {
    /* -------------------------------------------------------
       BOT CHECK
    ------------------------------------------------------- */

    case "checkbot": {
      const target =
        getTargetJid(
          message,
        );

      if (
        !target
      ) {
        await sendReply(
          sock,
          jid,
          targetHelp(
            "checkbot",
          ),
          message,
        );

        return true;
      }

      await checkBot(
        sock,
        jid,
        message,
        target,
      );

      return true;
    }

    /* -------------------------------------------------------
       BOT SCAN
    ------------------------------------------------------- */

    case "scanbot": {
      const target =
        getTargetJid(
          message,
        );

      if (
        !target
      ) {
        await sendReply(
          sock,
          jid,
          targetHelp(
            "scanbot",
          ),
          message,
        );

        return true;
      }

      await scanBot(
        sock,
        jid,
        message,
        target,
      );

      return true;
    }

    /* -------------------------------------------------------
       PROGRESS
    ------------------------------------------------------- */

    case "progress":
      await showProgress(
        sock,
        jid,
        args,
        message,
      );

      return true;

    /* -------------------------------------------------------
       AUDIT
       Deliberately NOT handled here.
    ------------------------------------------------------- */

    case "audit":
      return false;

    /* -------------------------------------------------------
       SYSTEM DIAGNOSTIC
    ------------------------------------------------------- */

    case "sysdiag":
    case "systemdiagnostic":
      await runSystemDiagnostic(
        sock,
        jid,
        "SYSTEM",
        message,
      );

      return true;

    /* -------------------------------------------------------
       NETWORK DIAGNOSTIC
    ------------------------------------------------------- */

    case "iptrace":
      await runIpTrace(
        sock,
        jid,
        message,
      );

      return true;

    /* -------------------------------------------------------
       S9
    ------------------------------------------------------- */

    case "s9":
    case "s9protocol":
      await runS9(
        sock,
        jid,
        message,
      );

      return true;

    /* -------------------------------------------------------
       INSULT / PRINT INSULT
    ------------------------------------------------------- */

    case "insult":
    case "print":
    case "printinsult": {
      if (
        normalized ===
          "print" &&
        args[0]?.toLowerCase() !==
          "insult"
      ) {
        return false;
      }

      const target =
        getTargetJid(
          message,
        );

      if (
        !target
      ) {
        await sendReply(
          sock,
          jid,
          targetHelp(
            "insult",
          ),
          message,
        );

        return true;
      }

      await insultUser(
        sock,
        jid,
        message,
        target,
      );

      return true;
    }

    /* -------------------------------------------------------
       FINAL REPORT KEY
    ------------------------------------------------------- */

    case "finalkey":
      await armFinalKey(
        sock,
        jid,
        sender,
        message,
      );

      return true;

    /* -------------------------------------------------------
       SYNC
    ------------------------------------------------------- */

    case "sync":
      await syncVortex(
        sock,
        jid,
        message,
      );

      return true;

    /* -------------------------------------------------------
       DEFAULT
    ------------------------------------------------------- */

    default:
      return false;
  }
}

/* =========================================================
   EXPORTS FOR FUTURE MODULES
========================================================= */

export {
  addAudit,
  createReport,
  getReport,
  updateReport,
};
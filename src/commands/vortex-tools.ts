
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
  info,
  security,
  system,
  success,
  warning,
  error,
  cleanUserNumber,
} from "../utils/message.js";

import {
  resolveIdentity,
} from "../utils/identity.js";

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

type VortexReplyOptions =
  MiscMessageGenerationOptions & {
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
  const now = Date.now();

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

  confirmedSecurityExecution = null;
}

/* =========================================================
   CLEAR SECURITY CONFIRMATION
========================================================= */

export function clearSecurityConfirmation(): void {
  pendingSecurityConfirmation = null;
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
  if (!pendingSecurityConfirmation) {
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

  confirmedSecurityExecution = null;

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
    [REPORTS_FILE, []],
    [AUDIT_FILE, []],
    [DIAGNOSTICS_FILE, []],
  ];

  for (
    const [file, fallback] of defaults
  ) {
    try {
      await fs.access(file);
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

  if (records.length > 500) {
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
    await readJson<SecurityReport[]>(
      REPORTS_FILE,
      [],
    );

  const report: SecurityReport = {
    id:
      `VX-${Date.now().toString(36).toUpperCase()}-${crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase()}`,

    type,

    createdAt:
      new Date().toISOString(),

    status: "pending",

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

  reports.push(report);

  if (reports.length > 200) {
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
    await readJson<SecurityReport[]>(
      REPORTS_FILE,
      [],
    );

  return (
    reports.find(
      (report) =>
        report.id === reportId,
    ) || null
  );
}

/* =========================================================
   UPDATE REPORT
========================================================= */

async function updateReport(
  reportId: string,
  changes: Partial<SecurityReport>,
): Promise<SecurityReport | null> {
  const reports =
    await readJson<SecurityReport[]>(
      REPORTS_FILE,
      [],
    );

  const index =
    reports.findIndex(
      (report) =>
        report.id === reportId,
    );

  if (index === -1) {
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
    mentioned.length > 0
  ) {
    return mentioned[0] || null;
  }

  const participant =
    context?.participant;

  if (participant) {
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
  const chatJid =
    message.key.remoteJid ??
    undefined;

  const identity =
    await resolveIdentity(
      sock,
      targetJid,
      chatJid,
      message.key.participant ===
        targetJid
        ? message.pushName
        : undefined,
    );

  if (
    identity.name !==
    "Unknown User"
  ) {
    return identity.name;
  }

  return (
    cleanUserNumber(
      targetJid,
    ) ||
    "Unknown User"
  );
}

/* =========================================================
   TARGET MENTION RESOLUTION
========================================================= */

async function resolveTargetMention(
  sock: WASocket,
  message: WAMessage,
  targetJid: string,
): Promise<string> {
  const identity =
    await resolveIdentity(
      sock,
      targetJid,
      message.key.remoteJid ??
        undefined,
    );

  if (
    identity.name ===
    "Unknown User"
  ) {
    return "@Unknown User";
  }

  return `@${identity.name}`;
}

/* =========================================================
   TARGET HELP
========================================================= */

function targetHelp(
  command: string,
): string {
  return [
    "👤 Target required.",
    "",
    `Mention a user or reply to their message.`,
    "",
    `Example: ${getPrefix()}${command} @user`,
  ].join("\n");
}

/* =========================================================
   BOT INDICATOR ANALYSIS
========================================================= */

function analyzeObservableBotIndicators(
  message: WAMessage,
): {
  indicators: string[];
  findings: string[];
  risk: SecurityReport["risk"];
} {
  const indicators: string[] = [];
  const findings: string[] = [];

  const content =
    message.message;

  if (content?.botInvokeMessage) {
    indicators.push(
      "WhatsApp bot-related message metadata observed.",
    );
  }

  if (content?.interactiveMessage) {
    indicators.push(
      "Interactive automation-style message structure observed.",
    );
  }

  if (content?.buttonsMessage) {
    indicators.push(
      "Legacy button-style message structure observed.",
    );
  }

  if (content?.listMessage) {
    indicators.push(
      "List-style interactive message structure observed.",
    );
  }

  if (content?.templateMessage) {
    indicators.push(
      "Template-style message structure observed.",
    );
  }

  if (indicators.length > 0) {
    findings.push(
      "Automation-related message structures were observed.",
    );

    return {
      indicators,
      findings,
      risk: "REVIEW",
    };
  }

  findings.push(
    "No strong automation-specific message structure was observed in the supplied message.",
  );

  return {
    indicators,
    findings,
    risk: "LOW",
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
  const targetMention =
    await resolveTargetMention(
      sock,
      message,
      targetJid,
    );

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

  const progressMessage =
    await sendReply(
      sock,
      jid,
      [
        "🌑 DARK VORTEX • VX",
        "",
        `Scanning ${targetMention}...`,
        "",
        "▱▱▱▱▱▱▱▱▱▱ 0%",
        "",
        "Initializing...",
      ].join("\n"),
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
        "▰".repeat(filled) +
        "▱".repeat(
          10 - filled,
        );

      await sock.sendMessage(
        jid,
        {
          text: [
            "🌑 DARK VORTEX • VX",
            "",
            ...lines,
            "",
            `${bar} ${progress}%`,
            "",
            `Status: ${status}`,
          ].join("\n"),
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
      "READING DATA",
      [
        "Reading observable message data...",
      ],
    );

    await wait(700);

    await updateProgress(
      50,
      "ANALYZING",
      [
        "Analyzing message metadata...",
        "Checking automation indicators...",
      ],
    );

    const analysis =
      analyzeObservableBotIndicators(
        message,
      );

    await wait(700);

    await updateProgress(
      75,
      "VERIFYING",
      [
        "Reviewing observable security indicators...",
      ],
    );

    await wait(700);

    await updateProgress(
      90,
      "ALMOST DONE",
      [
        "Finalizing security assessment...",
        "⚠️ Almost done...",
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

    await sock.sendMessage(
      jid,
      {
        text: [
          "🌑 DARK VORTEX • VX",
          "",
          targetMention,
          "",
          "██████████████████ 100%",
          "",
          "Scan complete.",
          "",
          `Bot indicators: ${
            analysis.indicators.length > 0
              ? "DETECTED"
              : "NOT OBSERVED"
          }`,
          `Authentication: UNVERIFIED`,
          `Risk: ${analysis.risk}`,
          "",
          `Report: ${report.id}`,
        ].join("\n"),
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
          text: [
            "❌ VX scan failed.",
            "",
            "Unable to complete bot verification.",
            "No security action was performed.",
          ].join("\n"),
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
  const targetMention =
    await resolveTargetMention(
      sock,
      message,
      targetJid,
    );

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
      [
        "🌑 DARK VORTEX • VX",
        "",
        `Scanning ${targetMention}...`,
        "",
        "▱▱▱▱▱▱▱▱▱▱ 0%",
        "",
        "Initializing...",
      ].join("\n"),
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
        "▰".repeat(filled) +
        "▱".repeat(
          10 - filled,
        );

      await sock.sendMessage(
        jid,
        {
          text: [
            "🌑 DARK VORTEX • VX",
            "",
            ...lines,
            "",
            `${bar} ${progress}%`,
            "",
            `Status: ${status}`,
          ].join("\n"),
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
        "Reading observable message data...",
      ],
    );

    await wait(700);

    await updateProgress(
      50,
      "ANALYZING",
      [
        "Inspecting message structures...",
        "Checking automation indicators...",
      ],
    );

    const analysis =
      analyzeObservableBotIndicators(
        message,
      );

    await wait(700);

    await updateProgress(
      75,
      "ASSESSING",
      [
        "Correlating observable indicators...",
        "Reviewing security evidence...",
      ],
    );

    const findings = [
      ...analysis.findings,
      "Authentication cannot be independently verified from normal WhatsApp message metadata.",
      "No unauthorized takeover or credential access was attempted.",
    ];

    const evidence = [
      ...analysis.indicators,
      "Observable message-level analysis completed.",
    ];

    await wait(700);

    await updateProgress(
      90,
      "ALMOST DONE",
      [
        "Finalizing security assessment...",
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
        text: [
          "🌑 DARK VORTEX • VX",
          "",
          targetMention,
          "",
          "██████████████████ 100%",
          "",
          "Scan complete.",
          "",
          `Bot indicators: ${
            analysis.indicators.length
              ? "DETECTED"
              : "NOT OBSERVED"
          }`,
          "Authentication: UNVERIFIED",
          `Risk: ${analysis.risk}`,
          "",
          `Report: ${report.id}`,
        ].join("\n"),
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
          text: [
            "❌ VX scan failed.",
            "",
            "Unable to complete the security scan.",
            "No unauthorized action was performed.",
          ].join("\n"),
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

  if (requested) {
    entry =
      scanProgress.get(
        requested,
      );
  } else {
    const values =
      [...scanProgress.values()];

    entry =
      values.at(-1);
  }

  if (!entry) {
    await sendReply(
      sock,
      jid,
      [
        "📊 No scan found.",
        "",
        `Use ${getPrefix()}checkbot @user or ${getPrefix()}scanbot @user.`,
      ].join("\n"),
      message,
    );

    return;
  }

  const elapsed =
    Date.now() -
    entry.startedAt;

  const filled =
    Math.floor(
      entry.progress / 10,
    );

  const bar =
    "▰".repeat(filled) +
    "▱".repeat(
      10 - filled,
    );

  let targetMention:
    | string
    | undefined;

  if (entry.target) {
    const identity =
      await resolveIdentity(
        sock,
        entry.target,
        message?.key.remoteJid ??
          jid,
      );

    targetMention =
      identity.name ===
      "Unknown User"
        ? "@Unknown User"
        : `@${identity.name}`;
  }

  await sendReply(
    sock,
    jid,
    [
      "🌑 DARK VORTEX • VX",
      "",
      `Command: ${entry.command}`,
      entry.target
        ? `Target: ${
            targetMention ??
            "@Unknown User"
          }`
        : "",
      "",
      `${bar} ${entry.progress}%`,
      `Status: ${entry.status.toUpperCase()}`,
      `Runtime: ${Math.max(
        0,
        Math.floor(
          elapsed / 1000,
        ),
      )}s`,
    ]
      .filter(Boolean)
      .join("\n"),
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
    await readJson<AuditRecord[]>(
      AUDIT_FILE,
      [],
    );

  const recent =
    records
      .slice(-8)
      .reverse();

  if (!recent.length) {
    await sendReply(
      sock,
      jid,
      [
        "📋 Security audit",
        "",
        "No audit records available.",
      ].join("\n"),
      message,
    );

    return;
  }

  const lines = [
    "📋 Security audit",
    "",
    `Records: ${records.length}`,
    "",
    ...recent.map(
      (record) =>
        `• ${record.command.toUpperCase()} — ${
          record.target
            ? cleanUserNumber(
                record.target,
              )
            : "SYSTEM"
        }`,
    ),
  ];

  await sendReply(
    sock,
    jid,
    lines.join("\n"),
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
    id: crypto.randomUUID(),

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
          ).toFixed(1),
        ),

      heapUsedMB:
        Number(
          (
            memory.heapUsed /
            1024 /
            1024
          ).toFixed(1),
        ),

      cpus:
        os.cpus().length,
    },
  };

  const history =
    await readJson<DiagnosticRecord[]>(
      DIAGNOSTICS_FILE,
      [],
    );

  history.push(
    diagnostic,
  );

  if (history.length > 200) {
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
    [
      "🖥️ System diagnostic",
      "",
      "Status: HEALTHY",
      `Node.js: ${process.version}`,
      `Platform: ${process.platform}`,
      `Architecture: ${process.arch}`,
      `CPU cores: ${os.cpus().length}`,
      `Memory: ${diagnostic.details.rssMB} MB`,
      `Heap: ${diagnostic.details.heapUsedMB} MB`,
      `Uptime: ${diagnostic.details.uptimeSeconds}s`,
      `PID: ${process.pid}`,
      "",
      "Security services: ACTIVE",
    ].join("\n"),
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
    [
      "📡 Network diagnostic",
      "",
      "Mode: SAFE",
      `Host: ${os.hostname()}`,
      `Platform: ${process.platform}`,
      `Architecture: ${process.arch}`,
      "",
      "Privacy: No WhatsApp user's private IP was traced or exposed.",
      "",
      `Diagnostic ID: ${report.id}`,
      "Status: COMPLETE",
    ].join("\n"),
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
    [
      "⚡ S9 Protocol",
      "",
      "Status: ACTIVE",
      "Detection checks: ACTIVE",
      "Runtime: HEALTHY",
      "Security: ACTIVE",
      `Memory: ${(
        memory.rss /
        1024 /
        1024
      ).toFixed(1)} MB`,
      "Connection: ONLINE",
    ].join("\n"),
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
    [
      "😈 Dark Vortex roast",
      "",
      `Target: ${targetName}`,
      "",
      diagnostic.roast,
      "",
      `Roast level: ${diagnostic.roastLevel}%`,
    ].join("\n"),
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
    await readJson<SecurityReport[]>(
      REPORTS_FILE,
      [],
    );

  const pending =
    [...reports]
      .reverse()
      .find(
        (report) =>
          report.status ===
          "pending",
      );

  if (!pending) {
    await sendReply(
      sock,
      jid,
      [
        "⚠️ No pending report.",
        "",
        `Run ${getPrefix()}checkbot @user or ${getPrefix()}scanbot @user first.`,
      ].join("\n"),
      message,
    );

    return;
  }

  const expiresAt =
    Date.now() +
    2 * 60 * 1000;

  pendingFinalKey = {
    reportId: pending.id,
    ownerJid,
    expiresAt,
  };

  await sendReply(
    sock,
    jid,
    [
      "📄 Report ready",
      "",
      `Report: ${pending.id}`,
      pending.destination
        ? `Destination: ${pending.destination}`
        : "Destination: NOT CONFIGURED",
      "",
      "Send this report?",
      "Reply *CONFIRM* to send.",
      "Reply *ABORT REPORT* to cancel.",
      "",
      "Expires in 2 minutes.",
    ].join("\n"),
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

  if (!destination) {
    await sendReply(
      sock,
      jid,
      [
        "❌ Report destination missing.",
        "",
        "Add VORTEX_REPORT_DESTINATION to .env",
        "then restart Dark Vortex.",
      ].join("\n"),
      message,
    );

    return;
  }

  const reportText =
    [
      "🌑 DARK VORTEX • SECURITY REPORT",
      "",
      `Type: ${report.type}`,
      `Report: ${report.id}`,
      `Target: ${cleanUserNumber(
        report.target.jid,
      )}`,
      `Time: ${report.createdAt}`,
      "",
      `Risk: ${report.risk}`,
      "",
      "Findings:",
      ...report.findings.map(
        (item) =>
          `• ${item}`,
      ),
      "",
      "Evidence:",
      ...report.evidence.map(
        (item) =>
          `• ${item}`,
      ),
      "",
      "Status: SENT",
    ].join("\n");

  try {
    await sock.sendMessage(
      destination,
      {
        text: reportText,
        mentions: [
          report.target.jid,
        ],
      },
    );

    await updateReport(
      report.id,
      {
        status: "sent",
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
      [
        "✅ Report sent.",
        "",
        `Report: ${report.id}`,
        `Destination: ${destination}`,
      ].join("\n"),
      message,
    );
  } catch (err) {
    console.error(
      "Vortex report send error:",
      err,
    );

    await sendReply(
      sock,
      jid,
      [
        "❌ Report delivery failed.",
        "",
        `Report: ${report.id}`,
        "The report remains pending.",
      ].join("\n"),
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
    pendingFinalKey = null;

    await sendReply(
      sock,
      jid,
      [
        "⏱️ Confirmation expired.",
        "",
        `Run ${getPrefix()}finalkey again.`,
      ].join("\n"),
      message,
    );

    return;
  }

  const report =
    await getReport(
      pendingFinalKey.reportId,
    );

  if (!report) {
    pendingFinalKey = null;

    await sendReply(
      sock,
      jid,
      "❌ Pending report not found.",
      message,
    );

    return;
  }

  pendingFinalKey = null;

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

  pendingFinalKey = null;

  await updateReport(
    reportId,
    {
      status: "aborted",
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
    [
      "🛑 Report aborted.",
      "",
      `Report: ${reportId}`,
      "Nothing was sent.",
    ].join("\n"),
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
    await readJson<SecurityReport[]>(
      REPORTS_FILE,
      [],
    );

  const audits =
    await readJson<AuditRecord[]>(
      AUDIT_FILE,
      [],
    );

  const diagnostics =
    await readJson<DiagnosticRecord[]>(
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
    [
      "🔄 Vortex sync complete.",
      "",
      `Reports: ${reports.length}`,
      `Audit records: ${audits.length}`,
      `Diagnostics: ${diagnostics.length}`,
      "",
      "Storage: VERIFIED",
      "Security state: SYNCHRONIZED",
    ].join("\n"),
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
     FINAL REPORT CONFIRMATION
  ------------------------------------------------------- */

  if (
    normalized === "CONFIRM" ||
    normalized === "ABORT REPORT"
  ) {
    if (
      !pendingFinalKey ||
      pendingFinalKey.ownerJid !==
        sender
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

  const normalizeConfirmationJid = (
    value: string | undefined,
  ): string => {
    if (!value) {
      return "";
    }

    return value
      .trim()
      .replace(
        /:\d+(?=@)/,
        "",
      );
  };

  const sameJid =
    (
      left: string | undefined,
      right: string | undefined,
    ): boolean => {
      const normalizedLeft =
        normalizeConfirmationJid(
          left,
        );

      const normalizedRight =
        normalizeConfirmationJid(
          right,
        );

      return (
        normalizedLeft !== "" &&
        normalizedRight !== "" &&
        normalizedLeft ===
          normalizedRight
      );
    };

  if (
    !sameJid(
      confirmation.ownerJid,
      sender,
    )
  ) {
    return false;
  }

  if (
    !sameJid(
      confirmation.chatJid,
      jid,
    )
  ) {
    return false;
  }

  if (
    isSecurityConfirmationExpired()
  ) {
    clearSecurityConfirmation();
    confirmedSecurityExecution = null;

    await sendReply(
      sock,
      jid,
      [
        "⏱️ Confirmation expired.",
        "",
        "No security operation was executed.",
        "",
        `Run ${getPrefix()}${confirmation.command} again if needed.`,
      ].join("\n"),
      message,
    );

    return true;
  }

  /* -------------------------------------------------------
     YES
  ------------------------------------------------------- */

  if (normalized === "YES") {
    const confirmedCommand =
      confirmation.command;

    const confirmedArgs =
      [...confirmation.args];

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
      [
        "✅ Confirmed.",
        "",
        `Operation: ${confirmedCommand.toUpperCase()}`,
        "Executing...",
      ].join("\n"),
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
      [
        "🛑 Action cancelled.",
        "",
        `Operation: ${command.toUpperCase()}`,
      ].join("\n"),
      message,
    );

    return true;
  }

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
    [
      "⚠️ Confirm action",
      "",
      `Operation: ${command.toUpperCase()}`,
      "",
      "Reply *YES* to continue.",
      "Reply *NO* to cancel.",
      "",
      "Expires in 30 seconds.",
    ].join("\n"),
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

  switch (normalized) {
    /* -------------------------------------------------------
       BOT CHECK
    ------------------------------------------------------- */

    case "checkbot": {
      const target =
        getTargetJid(
          message,
        );

      if (!target) {
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

      if (!target) {
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
        normalized === "print" &&
        args[0]?.toLowerCase() !==
          "insult"
      ) {
        return false;
      }

      const target =
        getTargetJid(
          message,
        );

      if (!target) {
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


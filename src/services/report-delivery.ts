
/* =========================================================
   🌑 DARK VORTEX — MANAGEMENT REPORT DELIVERY
   ⚡ Powered by Vortex Tech

   Responsibilities:
   - Generate real VX management reports
   - Show report preview before delivery
   - Require explicit owner confirmation
   - Send confirmed report to WhatsApp Management
   - Support aborting pending reports
   - Preserve PENDING state when delivery fails

   Flow:

       /report
          ↓
       Generate
          ↓
       PENDING
          ↓
   /report confirm
          ↓
     WhatsApp Management

       /abortreport
          ↓
       ABORTED
========================================================= */

import type {
  WASocket,
} from "@whiskeysockets/baileys";

import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import { config } from "../config.js";

import {
  getVxIncidents,
  getVxIncidentStats,
} from "../security/vx-incidents.js";

import {
  formatVxIncidentReport,
} from "../security/vx-reports.js";

import type {
  VxIncident,
} from "../security/vx-types.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const FOOTER =
  "⚡ Powered by Vortex Tech";

function getManagementJid(): string {
  const owner = config.ownerNumber.trim();

  if (!owner) {
    return "";
  }

  if (owner.includes("@")) {
    return owner;
  }

  const normalized =
    owner.replace(/[^\d]/g, "");

  if (!normalized) {
    return "";
  }

  return `${normalized}@s.whatsapp.net`;
}

const DATA_DIR =
  path.resolve(
    process.cwd(),
    "src",
    "data",
    "reports",
  );

const REPORT_FILE =
  path.join(
    DATA_DIR,
    "latest-report.json",
  );

const TEMP_FILE =
  `${REPORT_FILE}.tmp`;


/* =========================================================
   TYPES
========================================================= */

type ReportStatus =
  | "PENDING"
  | "SENT"
  | "ABORTED";

interface PendingReport {
  id: string;
  createdAt: number;
  status: ReportStatus;
  text: string;
  incidentIds: string[];
}


/* =========================================================
   SAFE HELPERS
========================================================= */

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

  const text =
    String(value)
      .replace(/\r/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (!text) {
    return "";
  }

  if (
    text.length <= maxLength
  ) {
    return text;
  }

  return `${text.slice(
    0,
    maxLength - 1,
  )}…`;
}


function formatNumber(
  value: unknown,
): string {
  const number =
    typeof value === "number" &&
    Number.isFinite(value)
      ? Math.max(
          0,
          Math.round(value),
        )
      : 0;

  return number.toLocaleString(
    "en-US",
  );
}


function formatRisk(
  value: unknown,
): string {
  const number =
    typeof value === "number" &&
    Number.isFinite(value)
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(value),
          ),
        )
      : 0;

  return `${number}/100`;
}


function severityIcon(
  severity: string,
): string {
  switch (
    severity.toUpperCase()
  ) {
    case "CRITICAL":
      return "🔴";

    case "HIGH":
      return "🟠";

    case "MEDIUM":
      return "🟡";

    case "LOW":
      return "🟢";

    default:
      return "⚪";
  }
}


function formatDate(
  timestamp?: number,
): string {
  if (
    !timestamp ||
    !Number.isFinite(timestamp)
  ) {
    return "Unknown";
  }

  try {
    return new Date(
      timestamp,
    ).toLocaleString(
      "en-NG",
      {
        timeZone:
          "Africa/Lagos",
        dateStyle:
          "medium",
        timeStyle:
          "short",
      },
    );
  } catch {
    return "Unknown";
  }
}


/* =========================================================
   REPORT STORAGE
========================================================= */

async function loadPendingReport():
  Promise<PendingReport | undefined> {

  try {
    const raw =
      await readFile(
        REPORT_FILE,
        "utf8",
      );

    const parsed: unknown =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      return undefined;
    }

    const report =
      parsed as Partial<PendingReport>;

    if (
      typeof report.id !== "string" ||
      typeof report.createdAt !== "number" ||
      typeof report.status !== "string" ||
      typeof report.text !== "string" ||
      !Array.isArray(
        report.incidentIds,
      )
    ) {
      return undefined;
    }

    if (
      report.status !== "PENDING" &&
      report.status !== "SENT" &&
      report.status !== "ABORTED"
    ) {
      return undefined;
    }

    return {
      id:
        report.id,

      createdAt:
        report.createdAt,

      status:
        report.status,

      text:
        report.text,

      incidentIds:
        report.incidentIds.filter(
          item =>
            typeof item === "string",
        ),
    };

  } catch {
    return undefined;
  }
}


async function saveReport(
  report: PendingReport,
): Promise<void> {

  await mkdir(
    DATA_DIR,
    {
      recursive: true,
    },
  );

  await writeFile(
    TEMP_FILE,
    JSON.stringify(
      report,
      null,
      2,
    ),
    "utf8",
  );

  await rename(
    TEMP_FILE,
    REPORT_FILE,
  );
}


/* =========================================================
   BUILD REAL MANAGEMENT REPORT
========================================================= */

async function buildManagementReport():
  Promise<{
    text: string;
    incidents: VxIncident[];
  }> {

  /*
   * These values come directly from the persistent
   * VX incident manager.
   */
  const [
    incidents,
    stats,
  ] =
    await Promise.all([
      getVxIncidents(25),
      getVxIncidentStats(),
    ]);

  const latest =
    incidents.slice(
      0,
      10,
    );

  const generatedAt =
    formatDate(
      Date.now(),
    );

  const lines: string[] = [
    "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
    "┃",
    "┃ 🛡️ VX MANAGEMENT REPORT",
    "┃",
    `┃ Generated: ${generatedAt}`,
    "┃",
    "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "┃ 📊 SECURITY OVERVIEW",
    "┃",
    `┃ Total incidents: ${formatNumber(stats.total)}`,
    `┃ Detected: ${formatNumber(stats.detected)}`,
    `┃ Analyzing: ${formatNumber(stats.analyzing)}`,
    `┃ Active: ${formatNumber(stats.active)}`,
    `┃ Resolved: ${formatNumber(stats.resolved)}`,
    `┃ Aborted: ${formatNumber(stats.aborted)}`,
    "┃",
    "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "┃ 🚨 SEVERITY",
    "┃",
    `┃ ${severityIcon("CRITICAL")} Critical: ${formatNumber(stats.critical)}`,
    `┃ ${severityIcon("HIGH")} High: ${formatNumber(stats.high)}`,
    `┃ ${severityIcon("MEDIUM")} Medium: ${formatNumber(stats.medium)}`,
    `┃ ${severityIcon("LOW")} Low: ${formatNumber(stats.low)}`,
    "┃",
    "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "┃ 🔎 RECENT INCIDENTS",
    "┃",
  ];

  if (
    latest.length === 0
  ) {
    lines.push(
      "┃ No persistent VX incidents recorded.",
      "┃",
    );
  } else {
    for (
      const incident of latest
    ) {
      const group =
        cleanText(
          incident.group?.name,
          60,
        ) ||
        "Unknown Group";

      const actor =
        cleanText(
          incident.actor?.name,
          60,
        ) ||
        cleanText(
          incident.actor?.phoneNumber,
          40,
        ) ||
        "Unknown Actor";

      lines.push(
        `┃ ${severityIcon(incident.severity)} ${incident.id}`,
        `┃ Type: ${incident.type}`,
        `┃ Status: ${incident.status}`,
        `┃ Risk: ${formatRisk(incident.riskScore)}`,
        `┃ Confidence: ${formatRisk(incident.confidence)}`,
        `┃ Group: ${group}`,
        `┃ Actor: ${actor}`,
        `┃ Reason: ${
          cleanText(
            incident.reason,
            160,
          ) ||
          "No reason recorded"
        }`,
        "┃",
      );
    }
  }

  /*
   * Add the existing detailed formatter for the
   * newest incident only. This preserves your
   * established VX report appearance.
   */
  if (
    latest.length > 0
  ) {
    lines.push(
      "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "┃ 📌 LATEST INCIDENT DETAIL",
      "┃",
    );

    const detailed =
      formatVxIncidentReport(
        latest[0],
      );

    /*
     * Remove its footer because the management report
     * supplies one unified footer at the end.
     */
    const detailedLines =
      detailed
        .split("\n")
        .filter(
          line =>
            line.trim() !== FOOTER,
        );

    for (
      const line of detailedLines
    ) {
      lines.push(
        `┃ ${line}`,
      );
    }

    lines.push(
      "┃",
    );
  }

  lines.push(
    "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "┃ 📡 VX PIPELINE",
    "┃",
    "┃ Detector → Engine → Risk",
    "┃ → Incident → Logger",
    "┃",
    "┃ Detection and enforcement",
    "┃ remain separate.",
    "┃",
    "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "┃ 📬 DELIVERY",
    "┃",
    "┃ Destination: WhatsApp Management",
    "┃ Status: PENDING CONFIRMATION",
    "┃",
    "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
    "",
    FOOTER,
  );

  return {
    text:
      lines.join("\n"),

    incidents,
  };
}


/* =========================================================
   GENERATE REPORT
========================================================= */

export async function prepareManagementReport():
  Promise<{
    ok: boolean;
    message: string;
  }> {

  const existing =
    await loadPendingReport();

  /*
   * Never silently replace a report waiting for
   * owner confirmation.
   */
  if (
    existing?.status === "PENDING"
  ) {
    return {
      ok: false,

      message: [
        "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
        "┃",
        "┃ 📋 REPORT ALREADY PENDING",
        "┃",
        "┃ A report is already waiting",
        "┃ for final confirmation.",
        "┃",
        "┃ Send:",
        "┃ /report confirm",
        "┃",
        "┃ Or cancel:",
        "┃ /abortreport",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        FOOTER,
      ].join("\n"),
    };
  }

  try {
    const result =
      await buildManagementReport();

    const report: PendingReport = {
      id:
        `VX-REPORT-${Date.now()}`,

      createdAt:
        Date.now(),

      status:
        "PENDING",

      text:
        result.text,

      incidentIds:
        result.incidents.map(
          incident =>
            incident.id,
        ),
    };

    await saveReport(
      report,
    );

    return {
      ok: true,

      message: [
        result.text,
        "",
        "╭━━━〔 ⚠️ FINAL CONFIRMATION 〕━━━╮",
        "┃",
        "┃ Report generated successfully.",
        "┃",
        "┃ 📬 Destination:",
        "┃ WhatsApp Management",
        "┃",
        "┃ 🚫 Nothing has been sent yet.",
        "┃",
        "┃ To send:",
        "┃ /report confirm",
        "┃",
        "┃ To cancel:",
        "┃ /abortreport",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
      ].join("\n"),
    };

  } catch (error) {
    console.error(
      "[VX] Management report generation failed:",
      error,
    );

    return {
      ok: false,

      message: [
        "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
        "┃",
        "┃ ❌ REPORT GENERATION FAILED",
        "┃",
        "┃ The VX management report could",
        "┃ not be generated.",
        "┃",
        "┃ No message was sent.",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        FOOTER,
      ].join("\n"),
    };
  }
}


/* =========================================================
   CONFIRM + ACTUALLY SEND
========================================================= */

export async function confirmManagementReport(
  sock: WASocket,
): Promise<{
  ok: boolean;
  message: string;
}> {

  const pending =
    await loadPendingReport();

  if (
    !pending ||
    pending.status !== "PENDING"
  ) {
    return {
      ok: false,

      message: [
        "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
        "┃",
        "┃ ⚠️ NO PENDING REPORT",
        "┃",
        "┃ Generate one first:",
        "┃ /report",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        FOOTER,
      ].join("\n"),
    };
  }
  const managementJid =
    getManagementJid();

  if (!managementJid)
   {
    console.error(
      "[VX] WHATSAPP_MANAGEMENT_JID is not configured.",
    );

    return {
      ok: false,

      message: [
        "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
        "┃",
        "┃ ❌ MANAGEMENT DESTINATION",
        "┃    NOT CONFIGURED",
        "┃",
        "┃ BOT_OWNER_NUMBER",
        "┃ is missing from .env",
        "┃",
        "┃ Status: PENDING",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        FOOTER,
      ].join("\n"),
    };
  }

  try {
    /*
     * ACTUAL WHATSAPP DELIVERY.
     */
    await sock.sendMessage(
      managementJid,
      {
        text:
          pending.text,
      },
    );

    /*
     * Only mark SENT after sendMessage succeeds.
     */
    pending.status =
      "SENT";

    await saveReport(
      pending,
    );

    return {
      ok: true,

      message: [
        "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
        "┃",
        "┃ ✅ REPORT SENT",
        "┃",
        "┃ The VX management report was",
        "┃ successfully delivered.",
        "┃",
        "┃ 📬 Destination:",
        "┃ WhatsApp Management",
        "┃",
        "┃ 📦 Status: SENT",
        `┃ 🆔 ${pending.id}`,
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        FOOTER,
      ].join("\n"),
    };

  } catch (error) {
    /*
     * Keep PENDING so the owner can retry.
     */
    console.error(
      "[VX] Management report delivery failed:",
      error,
    );

    return {
      ok: false,

      message: [
        "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
        "┃",
        "┃ ❌ DELIVERY FAILED",
        "┃",
        "┃ WhatsApp Management did not",
        "┃ receive the report.",
        "┃",
        "┃ Status: PENDING",
        "┃",
        "┃ Retry:",
        "┃ /report confirm",
        "┃",
        "┃ Or cancel:",
        "┃ /abortreport",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        FOOTER,
      ].join("\n"),
    };
  }
}


/* =========================================================
   ABORT PENDING REPORT
========================================================= */

export async function cancelManagementReport():
  Promise<{
    ok: boolean;
    message: string;
  }> {

  const pending =
    await loadPendingReport();

  if (
    !pending ||
    pending.status !== "PENDING"
  ) {
    return {
      ok: false,

      message: [
        "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
        "┃",
        "┃ ⚠️ NO PENDING REPORT",
        "┃",
        "┃ There is no report waiting",
        "┃ for confirmation.",
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        FOOTER,
      ].join("\n"),
    };
  }

  pending.status =
    "ABORTED";

  await saveReport(
    pending,
  );

  return {
    ok: true,

    message: [
      "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
      "┃",
      "┃ 🛑 REPORT ABORTED",
      "┃",
      "┃ The pending VX management",
      "┃ report has been cancelled.",
      "┃",
      "┃ 🚫 Nothing was sent.",
      "┃",
      "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
      "",
      FOOTER,
    ].join("\n"),
  };
}


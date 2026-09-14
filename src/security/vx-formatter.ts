import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

/* =========================================================
   🌑 DARK VORTEX — CENTRAL VX FORMATTER

   Presentation authority for:
   • VX branding
   • Headers
   • Status
   • Progress bars
   • Operation messages
   • Security responses

   IMPORTANT:
   This file controls presentation only.
   VX detection, scanning, monitoring, incidents,
   logging and operation logic remain unchanged.
========================================================= */

export const VX_STYLE = {
  brand: "🌑 *DARK VORTEX*",
  footer: "╰─── ⚡ VORTEX TECH ───╯",
  divider: "━━━━━━━━━━━━━━━━━━━━",
  boxTop: "╭━━━━━━━━━━━━━━━━━━━━╮",
  boxBottom: "╰━━━━━━━━━━━━━━━━━━━━╯",
};

export const VX_TITLE =
  VX_STYLE.brand;

export const VX_FOOTER =
  VX_STYLE.footer;

export const VX_STATUS = {
  INITIALIZING: "INITIALIZING",
  SCANNING: "SCANNING",
  ANALYZING: "ANALYZING",
  MONITORING: "MONITORING",
  PROCESSING: "PROCESSING",
  COMPLETE: "COMPLETE",
  STOPPED: "STOPPED",
  ABORTED: "ABORTED",
  ERROR: "ERROR",
  READY: "READY",
};

export const VX_ICONS = {
  scan: "🔍",
  monitor: "👁️",
  bot: "🤖",
  incident: "🚨",
  logs: "📋",
  report: "📊",
  health: "💚",
  stats: "📈",
  status: "⚡",
  success: "✅",
  warning: "⚠️",
  danger: "🔴",
  critical: "🚨",
  abort: "🛑",
  target: "🎯",
  group: "👥",
  user: "👤",
  time: "⏱️",
  shield: "🛡️",
  engine: "⚙️",
  progress: "🔄",
};

/* =========================================================
   BASIC FORMATTER
========================================================= */

export function formatVxMessage(
  title: string,
  body: string,
  options?: {
    status?: string;
    footer?: boolean;
  },
): string {
  const lines: string[] = [
    VX_STYLE.brand,
    "",
    title,
    "",
  ];

  if (options?.status) {
    lines.push(
      `Status: ${options.status}`,
      "",
    );
  }

  if (body.trim()) {
    lines.push(body.trim());
  }

  if (options?.footer !== false) {
    lines.push(
      "",
      VX_STYLE.footer,
    );
  }

  return lines.join("\n");
}

/* =========================================================
   PROGRESS BAR
========================================================= */

export function normalizeVxPercent(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value),
    ),
  );
}

export function vxProgressBar(
  percent: number,
): string {
  const safePercent =
    normalizeVxPercent(percent);

  const total = 10;

  const filled =
    Math.min(
      total,
      Math.max(
        0,
        Math.round(
          safePercent / 10,
        ),
      ),
    );

  return (
    "█".repeat(filled) +
    "░".repeat(total - filled)
  );
}

/* =========================================================
   OPERATION PROGRESS MESSAGE
========================================================= */

export function formatVxProgress(
  title: string,
  percent: number,
  stage: string,
  message?: string,
  operationId?: string,
): string {
  const safePercent =
    normalizeVxPercent(percent);

  let status =
    VX_STATUS.PROCESSING;

  if (safePercent >= 100) {
    status = VX_STATUS.COMPLETE;
  } else if (safePercent >= 90) {
    status = "FINALIZING";
  } else if (safePercent >= 1) {
    status = "ACTIVE";
  }

  const lines: string[] = [
    VX_STYLE.brand,
    "",
    `⚡ ${title}`,
    "",
    `Status: ${status}`,
    "",
    `${vxProgressBar(safePercent)} ${safePercent}%`,
    `Stage: ${stage}`,
  ];

  if (safePercent >= 90 && safePercent < 100) {
    lines.push(
      "",
      "Almost done.",
    );
  }

  if (message?.trim()) {
    lines.push(
      "",
      message.trim(),
    );
  }

  if (operationId) {
    lines.push(
      "",
      `Operation: ${operationId}`,
    );
  }

  lines.push(
    "",
    VX_STYLE.footer,
  );

  return lines.join("\n");
}

/* =========================================================
   STATUS RESPONSES
========================================================= */

export function vxSuccess(
  title: string,
  lines: string[] = [],
): string {
  return formatVxMessage(
    `✅ ${title}`,
    lines.join("\n"),
    {
      status: VX_STATUS.COMPLETE,
    },
  );
}

export function vxError(
  title: string,
  lines: string[] = [],
): string {
  return formatVxMessage(
    `🔴 ${title}`,
    lines.join("\n"),
    {
      status: VX_STATUS.ERROR,
    },
  );
}

export function vxWarning(
  title: string,
  lines: string[] = [],
): string {
  return formatVxMessage(
    `⚠️ ${title}`,
    lines.join("\n"),
    {
      status: VX_STATUS.ANALYZING,
    },
  );
}

export function vxInfo(
  title: string,
  lines: string[] = [],
): string {
  return formatVxMessage(
    `ℹ️ ${title}`,
    lines.join("\n"),
    {
      status: VX_STATUS.READY,
    },
  );
}

export function vxSecurity(
  title: string,
  lines: string[] = [],
): string {
  return formatVxMessage(
    `🛡️ ${title}`,
    lines.join("\n"),
    {
      status: VX_STATUS.READY,
    },
  );
}

/* =========================================================
   REPLY
========================================================= */

export async function sendVxMessage(
  sock: WASocket,
  jid: string,
  title: string,
  body: string,
  quotedMessage?: WAMessage,
  options?: {
    status?: string;
    footer?: boolean;
  },
): Promise<WAMessage | undefined> {
  return await sendVortexReply(
    sock,
    jid,
    formatVxMessage(
      title,
      body,
      options,
    ),
    quotedMessage,
  );
}
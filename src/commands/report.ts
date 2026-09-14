/* =========================================================
   🌑 DARK VORTEX — REPORT COMMAND
   ⚡ Powered by Vortex Tech
========================================================= */

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

import {
  prepareManagementReport,
  confirmManagementReport,
  cancelManagementReport,
} from "../services/report-delivery.js";

export async function handleReportCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  message?: WAMessage,
): Promise<boolean> {

  const normalized =
    command
      .trim()
      .toLowerCase();

  if (
    normalized !== "report" &&
    normalized !== "abortreport"
  ) {
    return false;
  }

  const reply = async (
    text: string,
  ) => {
    return await sendVortexReply(
      sock,
      jid,
      text,
      message,
    );
  };

  /* =======================================================
     ABORT REPORT
  ======================================================= */

  if (
    normalized === "abortreport"
  ) {
    const result =
      await cancelManagementReport();

    await reply(
      result.message,
    );

    return true;
  }

  /* =======================================================
     CONFIRM REPORT
  ======================================================= */

  if (
    args[0]?.trim().toLowerCase() ===
    "confirm"
  ) {
    const result =
      await confirmManagementReport(
        sock,
      );

    await reply(
      result.message,
    );

    return true;
  }

  /* =======================================================
     GENERATE REPORT
  ======================================================= */

  const result =
    await prepareManagementReport();

  await reply(
    result.message,
  );

  return true;
}
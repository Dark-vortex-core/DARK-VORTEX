/* =========================================================
   🌑 DARK VORTEX — REPORT COMMAND
   ⚡ Powered by Vortex Tech
========================================================= */

import type {
  WASocket,
} from "@whiskeysockets/baileys";

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


  /* =======================================================
     ABORT REPORT
  ======================================================= */

  if (
    normalized === "abortreport"
  ) {
    const result =
      await cancelManagementReport();

    await sock.sendMessage(
      jid,
      {
        text:
          result.message,
      },
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

    await sock.sendMessage(
      jid,
      {
        text:
          result.message,
      },
    );

    return true;
  }


  /* =======================================================
     GENERATE REPORT
  ======================================================= */

  const result =
    await prepareManagementReport();

  await sock.sendMessage(
    jid,
    {
      text:
        result.message,
    },
  );

  return true;
}
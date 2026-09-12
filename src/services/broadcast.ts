import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  commandUsage,
  error,
  warning,
  success,
  broadcastResult,
} from "../utils/message.js";

export async function handleBroadcastCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  message: WAMessage
): Promise<boolean> {

  if (
    command !== "broadcast"
  ) {
    return false;
  }

  // ---------------------------------------------------------
  // USAGE
  // ---------------------------------------------------------

  if (
    args.length === 0
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          commandUsage(
            "broadcast",
            "/broadcast Your message here",
            [
              "📢 The message will be sent",
              "to every group Dark Vortex",
              "is currently in.",
            ].join("\n")
          ),
      }
    );

    return true;
  }

  const broadcastText =
    args
      .join(" ")
      .trim();

  if (
    !broadcastText
  ) {
    await sock.sendMessage(
      jid,
      {
        text:
          error(
            "MESSAGE REQUIRED",
            [
              "📢 Please provide a",
              "broadcast message.",
              "",
              "📝 Example:",
              "/broadcast Hello everyone!",
            ]
          ),
      }
    );

    return true;
  }

  // ---------------------------------------------------------
  // FETCH GROUPS
  // ---------------------------------------------------------

  try {
    const groups =
      await sock.groupFetchAllParticipating();

    const groupList =
      Object.values(
        groups
      ) as any[];

    if (
      groupList.length === 0
    ) {
      await sock.sendMessage(
        jid,
        {
          text:
            warning(
              "NO GROUPS FOUND",
              [
                "🌑 Dark Vortex is not",
                "currently in any groups.",
              ]
            ),
        }
      );

      return true;
    }

    // -------------------------------------------------------
    // BROADCAST MESSAGE
    // -------------------------------------------------------

    const text =
      success(
        "BROADCAST",
        [
          `📢 ${broadcastText}`,
        ]
      );

    let sent = 0;
    let failed = 0;

    // -------------------------------------------------------
    // SEND TO EVERY GROUP
    // -------------------------------------------------------

    for (
      const group of groupList
    ) {
      const groupJid =
        group.id;

      if (!groupJid) {
        continue;
      }

      try {
        await sock.sendMessage(
          groupJid,
          {
            text,
          }
        );

        sent++;

        // Small delay between groups
        // to reduce burst sending.
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              500
            )
        );

      } catch (err) {
        console.error(
          `Broadcast failed for ${groupJid}:`,
          err
        );

        failed++;
      }
    }

    // -------------------------------------------------------
    // RESULT
    // -------------------------------------------------------

    await sock.sendMessage(
      jid,
      {
        text:
          broadcastResult(
            sent,
            failed,
            groupList.length
          ),
      }
    );

    return true;

  } catch (err) {
    console.error(
      "Broadcast error:",
      err
    );

    await sock.sendMessage(
      jid,
      {
        text:
          error(
            "BROADCAST FAILED",
            [
              "Unable to retrieve the",
              "current group list.",
              "",
              "💡 Try again in a moment.",
            ]
          ),
      }
    );

    return true;
  }
}
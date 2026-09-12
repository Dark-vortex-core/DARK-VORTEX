
/* =========================================================
   🌑 DARK VORTEX — GET JID COMMAND
   ⚡ Powered by Vortex Tech

   Purpose:
   - Show the JID of the current chat/group
   - Useful for configuring management destinations
   - Does not modify existing moderation/security logic
========================================================= */

import type {
  WASocket,
} from "@whiskeysockets/baileys";

const FOOTER =
  "⚡ Powered by Vortex Tech";

export async function handleGetJidCommand(
  sock: WASocket,
  jid: string,
  command: string,
): Promise<boolean> {
  const normalized =
    command
      .trim()
      .toLowerCase();

  if (
    normalized !== "getjid"
  ) {
    return false;
  }

  // /getjid is intended for groups.
  if (
    !jid.endsWith("@g.us")
  ) {
    await sock.sendMessage(
      jid,
      {
        text: [
          "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
          "┃",
          "┃ ⚠️ GROUP ONLY",
          "┃",
          "┃ Use /getjid inside the",
          "┃ WhatsApp group whose JID",
          "┃ you want to retrieve.",
          "┃",
          "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
          "",
          FOOTER,
        ].join("\n"),
      },
    );

    return true;
  }

  await sock.sendMessage(
    jid,
    {
      text: [
        "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
        "┃",
        "┃ 📋 GROUP JID",
        "┃",
        "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "┃",
        `┃ ${jid}`,
        "┃",
        "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "┃ 💡 Add this to your .env",
        "┃",
        "┃ WHATSAPP_MANAGEMENT_JID=",
        `┃ ${jid}`,
        "┃",
        "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        FOOTER,
      ].join("\n"),
    },
  );

  return true;
}


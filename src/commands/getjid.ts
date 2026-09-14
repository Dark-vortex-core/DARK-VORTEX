/* =========================================================
   🌑 DARK VORTEX — GET JID COMMAND
   ⚡ Powered by Vortex Tech

   Purpose:
   - Show the JID of the current chat/group
   - Useful for configuring management destinations
   - Replies directly to the triggering message
========================================================= */

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

export async function handleGetJidCommand(
  sock: WASocket,
  jid: string,
  command: string,
  message?: WAMessage,
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

  // /getjid is intended for groups.
  if (
    !jid.endsWith("@g.us")
  ) {
    await reply(
      [
        "⚠️ Group only.",
        "",
        "Use /getjid inside the WhatsApp group whose JID you want to retrieve.",
      ].join("\n"),
    );

    return true;
  }

  await reply(
    [
      "📋 Group JID",
      "",
      jid,
      "",
      "Add to .env:",
      `WHATSAPP_MANAGEMENT_JID=${jid}`,
    ].join("\n"),
  );

  return true;
}
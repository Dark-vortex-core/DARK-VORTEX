import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

// =========================================================
// REPLIED MESSAGE
// =========================================================

function getQuotedKey(
  message: WAMessage,
): WAMessage["key"] | null {

  const context =
    message.message
      ?.extendedTextMessage
      ?.contextInfo ||
    message.message
      ?.imageMessage
      ?.contextInfo ||
    message.message
      ?.videoMessage
      ?.contextInfo ||
    message.message
      ?.documentMessage
      ?.contextInfo ||
    message.message
      ?.audioMessage
      ?.contextInfo ||
    message.message
      ?.stickerMessage
      ?.contextInfo;

  if (
    !context?.quotedMessage ||
    !context.stanzaId
  ) {
    return null;
  }

  return {
    remoteJid:
      message.key.remoteJid,

    fromMe:
      Boolean(
        context.participant ===
        message.key.remoteJid,
      ),

    id:
      context.stanzaId,

    participant:
      context.participant,
  };
}

// =========================================================
// DELETE MESSAGE
// =========================================================

async function deleteRepliedMessage(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {

  const quotedKey =
    getQuotedKey(message);

  if (!quotedKey) {
    await sendVortexReply(
      sock,
      jid,
      [
        "💬 Reply required.",
        "",
        "Reply to the message you want to delete.",
        "",
        "Example:",
        "Reply to a message → /clear",
      ].join("\n"),
      message,
    );

    return;
  }

  try {
    await sock.sendMessage(
      jid,
      {
        delete:
          quotedKey,
      },
    );

  } catch (err) {
    console.error(
      "Delete message error:",
      err,
    );

    await sendVortexReply(
      sock,
      jid,
      [
        "❌ Delete failed.",
        "",
        "I could not delete that message.",
        "",
        "Make sure Dark Vortex is a group administrator.",
      ].join("\n"),
      message,
    );
  }
}

// =========================================================
// COMMAND HANDLER
// =========================================================

export async function handleUtilityCommand(
  sock: WASocket,
  jid: string,
  command: string,
  _args: string[],
  message: WAMessage,
): Promise<boolean> {

  const utilityCommands =
    new Set([
      "clear",
      "del",
      "delete",
    ]);

  if (
    !utilityCommands.has(
      command,
    )
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

  // ---------------------------------------------------------
  // GROUP ONLY
  // ---------------------------------------------------------

  if (
    !jid.endsWith("@g.us")
  ) {
    await reply(
      [
        "❌ Group only.",
        "",
        "This command can only be used inside a WhatsApp group.",
      ].join("\n"),
    );

    return true;
  }

  // ---------------------------------------------------------
  // BOT ADMIN CHECK
  // ---------------------------------------------------------

  try {
    const metadata =
      await sock.groupMetadata(
        jid,
      );

    const botJid =
      sock.user?.id || "";

    const botLid =
      sock.user?.lid || "";

    const botParticipant =
      metadata.participants.find(
        (participant) =>
          participant.id === botJid ||
          participant.id === botLid,
      );

    const isAdmin =
      botParticipant?.admin === "admin" ||
      botParticipant?.admin === "superadmin";

    if (!isAdmin) {
      await reply(
        [
          "🛡️ Bot not admin.",
          "",
          "Dark Vortex needs administrator privileges to delete messages.",
          "",
          "Promote Dark Vortex to admin and try again.",
        ].join("\n"),
      );

      return true;
    }

  } catch (err) {
    console.error(
      "Group metadata error:",
      err,
    );

    await reply(
      [
        "❌ Admin check failed.",
        "",
        "I could not verify my administrator status.",
        "",
        "Try again in a moment.",
      ].join("\n"),
    );

    return true;
  }

  // ---------------------------------------------------------
  // DELETE REPLIED MESSAGE
  // ---------------------------------------------------------

  await deleteRepliedMessage(
    sock,
    jid,
    message,
  );

  return true;
}
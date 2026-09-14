/* =========================================================
   🌑 DARK VORTEX — VCF GROUP CONTACT EXPORT
   ⚡ Powered by Vortex Tech

   Usage:
   /vcf

   Generates a VCF contact file containing group participants
   and sends it to the current WhatsApp group.

   Does not modify moderation/protection logic.
========================================================= */

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

import {
  mkdir,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

function escapeVcf(
  value: string,
): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function jidToPhone(
  jid: string,
): string {
  return jid
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

export async function handleVcfCommand(
sock: WASocket, jid: string, command: string, args: string[], message: WAMessage,
): Promise<boolean> {

  if (
    command
      .trim()
      .toLowerCase() !== "vcf"
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

  if (
    !jid.endsWith("@g.us")
  ) {
    await reply(
      [
        "⚠️ Group only.",
        "",
        "Use /vcf inside a WhatsApp group to export its contacts.",
      ].join("\n"),
    );

    return true;
  }

  try {
    const metadata =
      await sock.groupMetadata(jid);

    const participants =
      metadata.participants ?? [];

    const contacts: string[] = [];

    for (
      const participant of participants
    ) {
      const participantJid =
        participant.id;

      const phone =
        jidToPhone(
          participantJid,
        );

      if (!phone) {
        continue;
      }

      const name =
        participantJid ===
        sock.user?.id
          ? "Dark Vortex Bot"
          : phone;

      contacts.push(
        [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `FN:${escapeVcf(name)}`,
          `TEL;TYPE=CELL:+${phone}`,
          "END:VCARD",
        ].join("\r\n"),
      );
    }

    if (
      contacts.length === 0
    ) {
      await reply(
        [
          "❌ No contacts found.",
          "",
          "No valid participant numbers were found in this group.",
        ].join("\n"),
      );

      return true;
    }

    const outputDir =
      path.resolve(
        process.cwd(),
        "src",
        "data",
        "vcf",
      );

    await mkdir(
      outputDir,
      {
        recursive: true,
      },
    );

    const safeGroupId =
      jid.replace(
        /[^a-zA-Z0-9_-]/g,
        "_",
      );

    const filePath =
      path.join(
        outputDir,
        `${safeGroupId}.vcf`,
      );

    const vcf =
      contacts.join("\r\n");

    await writeFile(
      filePath,
      vcf,
      "utf8",
    );

    await sock.sendMessage(
      jid,
      {
        document: {
          url: filePath,
        },
        mimetype:
          "text/vcard",
        fileName:
          "dark-vortex-group-contacts.vcf",
        caption: [
          "📇 Group contact export",
          "",
          `Contacts: ${contacts.length}`,
          "File: dark-vortex-group-contacts.vcf",
          "",
          "Import the VCF into your contacts application to save the group contacts.",
        ].join("\n"),
      },
      {
        quoted: message,
      },
    );

    return true;

  } catch (error) {
    console.error(
      "[VCF] Contact export failed:",
      error,
    );

    await reply(
      [
        "❌ VCF export failed.",
        "",
        "Could not generate the group contact file.",
      ].join("\n"),
    );

    return true;
  }
}

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
  WASocket,
} from "@whiskeysockets/baileys";

import {
  mkdir,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

const FOOTER =
  "⚡ Powered by Vortex Tech";

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
  sock: WASocket,
  jid: string,
  command: string,
): Promise<boolean> {
  if (
    command
      .trim()
      .toLowerCase() !== "vcf"
  ) {
    return false;
  }

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
          "┃ Use /vcf inside a WhatsApp",
          "┃ group to export its contacts.",
          "┃",
          "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
          "",
          FOOTER,
        ].join("\n"),
      },
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
      await sock.sendMessage(
        jid,
        {
          text: [
            "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
            "┃",
            "┃ ❌ NO CONTACTS FOUND",
            "┃",
            "┃ No valid participant numbers",
            "┃ were found in this group.",
            "┃",
            "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
            "",
            FOOTER,
          ].join("\n"),
        },
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
          "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
          "┃",
          "┃ 📇 GROUP CONTACT EXPORT",
          "┃",
          "┣━━━━━━━━━━━━━━━━━━━━━━━━━━",
          `┃ 👥 Contacts: ${contacts.length}`,
          `┃ 📁 File: dark-vortex-group-contacts.vcf`,
          "┃",
          "┃ Import the VCF into your",
          "┃ contacts application to save",
          "┃ the group contacts.",
          "┃",
          "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
          "",
          FOOTER,
        ].join("\n"),
      },
    );

    return true;
  } catch (error) {
    console.error(
      "[VCF] Contact export failed:",
      error,
    );

    await sock.sendMessage(
      jid,
      {
        text: [
          "╭━━━〔 🌑 DARK VORTEX 〕━━━╮",
          "┃",
          "┃ ❌ VCF EXPORT FAILED",
          "┃",
          "┃ Could not generate the group",
          "┃ contact file.",
          "┃",
          "╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯",
          "",
          FOOTER,
        ].join("\n"),
      },
    );

    return true;
  }
}


import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  error,
  commandUsage,
  success,
} from "../utils/message.js";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

// =========================================================
// 🌑 DARK VORTEX — ANNOUNCEMENT SYSTEM
// =========================================================

function isGroup(
  jid: string,
): boolean {
  return jid.endsWith("@g.us");
}

// =========================================================
// PARTICIPANT HELPERS
// =========================================================

function normalizeJid(
  jid: string | undefined | null,
): string {
  if (!jid) {
    return "";
  }

  return jid
    .trim()
    .toLowerCase();
}

function isAdmin(
  admin: string | undefined,
): boolean {
  return (
    admin === "admin" ||
    admin === "superadmin"
  );
}

function participantMatchesBot(
  participant: {
    id?: string;
    lid?: string;
    admin?: string | null;
  },
  botJid: string,
  botLid: string,
): boolean {
  const participantId =
    normalizeJid(participant.id);

  const participantLid =
    normalizeJid(participant.lid);

  return (
    participantId === botJid ||
    participantId === botLid ||
    participantLid === botJid ||
    participantLid === botLid
  );
}

// =========================================================
// ANNOUNCEMENT COMMAND
// =========================================================

export async function handleAnnouncementCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  quotedMessage?: WAMessage,
): Promise<boolean> {
  if (command !== "announce") {
    return false;
  }

  // ---------------------------------------------------------
  // LOCAL REPLY HELPER
  // ---------------------------------------------------------

  const reply = async (
    text: string,
  ) => {
    await sendVortexReply(
      sock,
      jid,
      text,
      quotedMessage,
    );
  };

  // ---------------------------------------------------------
  // GROUP ONLY
  // ---------------------------------------------------------

  if (!isGroup(jid)) {
    await reply(
      error(
        "GROUP ONLY",
        [
          "📢 Announcements can only",
          "be sent inside a WhatsApp group.",
        ],
      ),
    );

    return true;
  }

  // ---------------------------------------------------------
  // GROUP METADATA
  // ---------------------------------------------------------

  let metadata:
    Awaited<
      ReturnType<WASocket["groupMetadata"]>
    >;

  try {
    metadata =
      await sock.groupMetadata(jid);
  } catch (err) {
    console.error(
      "Announcement metadata error:",
      err,
    );

    await reply(
      error(
        "GROUP DATA ERROR",
        [
          "Unable to read group",
          "information.",
          "",
          "💡 Make sure Dark Vortex",
          "is still a group member.",
        ],
      ),
    );

    return true;
  }

  // ---------------------------------------------------------
  // BOT ADMIN CHECK
  // ---------------------------------------------------------

  const botJid =
    normalizeJid(
      sock.user?.id,
    );

  const botLid =
    normalizeJid(
      sock.user?.lid,
    );

  const botParticipant =
    metadata.participants.find(
      (participant) =>
        participantMatchesBot(
          participant,
          botJid,
          botLid,
        ),
    );

  const botIsAdmin =
    isAdmin(
      botParticipant?.admin
        ?? undefined,
    );

  if (!botIsAdmin) {
    await reply(
      error(
        "BOT NOT ADMIN",
        [
          "🛡️ Dark Vortex needs",
          "group administrator access",
          "to send announcements.",
          "",
          "💡 Promote Dark Vortex",
          "to admin and try again.",
        ],
      ),
    );

    return true;
  }

  // ---------------------------------------------------------
  // USAGE
  // ---------------------------------------------------------

  if (args.length === 0) {
    await reply(
      commandUsage(
        "announce",
        "/announce Your message",
        [
          "/announce @everyone Your message",
          "",
          "📢 The @everyone version",
          "creates real WhatsApp mentions.",
        ].join("\n"),
      ),
    );

    return true;
  }

  // ---------------------------------------------------------
  // EVERYONE MODE
  // ---------------------------------------------------------

  const firstArgument =
    args[0]
      ?.trim()
      .toLowerCase();

  const everyone =
    firstArgument === "@everyone" ||
    firstArgument === "everyone";

  const announcementText =
    everyone
      ? args
          .slice(1)
          .join(" ")
          .trim()
      : args
          .join(" ")
          .trim();

  // ---------------------------------------------------------
  // EMPTY MESSAGE
  // ---------------------------------------------------------

  if (!announcementText) {
    await reply(
      commandUsage(
        "announce",
        "/announce @everyone Meeting starts at 7 PM",
        "Please provide an announcement message.",
      ),
    );

    return true;
  }

  // ---------------------------------------------------------
  // NORMAL ANNOUNCEMENT
  // ---------------------------------------------------------

  if (!everyone) {
    const text =
      success(
        "ANNOUNCEMENT",
        [
          `📢 ${announcementText}`,
        ],
      );

    try {
      await sock.sendMessage(jid, {
        text,
      });

      return true;
    } catch (err) {
      console.error(
        "Announcement send error:",
        err,
      );

      await reply(
        error(
          "SEND FAILED",
          [
            "📢 The announcement could",
            "not be sent.",
            "",
            "💡 Please try again.",
          ],
        ),
      );

      return true;
    }
  }

  // ---------------------------------------------------------
  // BUILD REAL WHATSAPP MENTIONS
  // ---------------------------------------------------------

  const participants =
    metadata.participants
      .map(
        (participant) =>
          normalizeJid(
            participant.id,
          ),
      )
      .filter(
        (participant) =>
          Boolean(participant),
      );

  // Remove duplicates.
  const mentions =
    [...new Set(participants)];

  if (mentions.length === 0) {
    await reply(
      error(
        "MENTIONS UNAVAILABLE",
        [
          "📢 WhatsApp did not provide",
          "valid participant IDs.",
          "",
          "💡 Try the announcement",
          "again in a moment.",
        ],
      ),
    );

    return true;
  }

  // ---------------------------------------------------------
  // BUILD MENTION TEXT
  // ---------------------------------------------------------

  const mentionText =
    mentions
      .map(
        (participant) => {
          const atIndex =
            participant.indexOf("@");

          const identifier =
            atIndex > 0
              ? participant.slice(
                  0,
                  atIndex,
                )
              : participant;

          return `@${identifier}`;
        },
      )
      .join(" ");

  const text =
    success(
      "ANNOUNCEMENT",
      [
        mentionText,
        "",
        `📢 ${announcementText}`,
      ],
    );

  // ---------------------------------------------------------
  // SEND EVERYONE ANNOUNCEMENT
  // ---------------------------------------------------------

  try {
    await sock.sendMessage(jid, {
      text,
      mentions,
    });

    return true;
  } catch (err) {
    console.error(
      "Everyone announcement send error:",
      err,
    );

    await reply(
      error(
        "SEND FAILED",
        [
          "📢 The announcement could",
          "not be delivered.",
          "",
          "💡 Please try again.",
        ],
      ),
    );

    return true;
  }
}
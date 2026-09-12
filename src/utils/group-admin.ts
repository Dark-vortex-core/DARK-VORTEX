import type { WASocket } from "@whiskeysockets/baileys";

// =========================================================
// 🌑 DARK VORTEX — GROUP ADMIN HELPERS
// =========================================================

type GroupParticipantLike = {
  id?: string;
  lid?: string;
  admin?: string | null;
};

// =========================================================
// NORMALIZE WHATSAPP ID
// =========================================================

function normalizeJid(
  jid: string | undefined | null,
): string {
  if (!jid) {
    return "";
  }

  let value = jid
    .trim()
    .toLowerCase();

  value = value.replace(
    /^whatsapp:/,
    "",
  );

  // Remove device suffix:
  // 1234567890:12@s.whatsapp.net
  // becomes:
  // 1234567890@s.whatsapp.net
  const atIndex =
    value.indexOf("@");

  if (atIndex > 0) {
    const user =
      value.slice(0, atIndex);

    const server =
      value.slice(atIndex);

    value =
      `${user.split(":")[0]}${server}`;
  }

  return value;
}

// =========================================================
// ADMIN CHECK
// =========================================================

function isAdmin(
  admin: string | undefined | null,
): boolean {
  return (
    admin === "admin" ||
    admin === "superadmin"
  );
}

// =========================================================
// BOT ID CANDIDATES
// =========================================================

function getBotIds(
  sock: WASocket,
): string[] {
  const ids = new Set<string>();

  const botId =
    normalizeJid(
      sock.user?.id,
    );

  const botLid =
    normalizeJid(
      sock.user?.lid,
    );

  if (botId) {
    ids.add(botId);
  }

  if (botLid) {
    ids.add(botLid);
  }

  return [...ids];
}

// =========================================================
// PARTICIPANT MATCH
// =========================================================

function participantMatchesBot(
  participant: GroupParticipantLike,
  botIds: string[],
): boolean {
  const participantId =
    normalizeJid(
      participant.id,
    );

  const participantLid =
    normalizeJid(
      participant.lid,
    );

  return botIds.some(
    (botId) =>
      botId === participantId ||
      botId === participantLid,
  );
}

// =========================================================
// FIND BOT PARTICIPANT
// =========================================================

export async function getBotGroupParticipant(
  sock: WASocket,
  jid: string,
): Promise<
  GroupParticipantLike | null
> {
  if (!jid.endsWith("@g.us")) {
    return null;
  }

  const botIds =
    getBotIds(sock);

  if (botIds.length === 0) {
    return null;
  }

  try {
    const metadata =
      await sock.groupMetadata(jid);

    const participant =
      metadata.participants.find(
        (member) =>
          participantMatchesBot(
            member,
            botIds,
          ),
      );

    return participant ?? null;
  } catch (err) {
    console.error(
      "Dark Vortex bot participant lookup error:",
      err,
    );

    return null;
  }
}

// =========================================================
// CHECK IF BOT IS GROUP ADMIN
// =========================================================

export async function isBotGroupAdmin(
  sock: WASocket,
  jid: string,
): Promise<boolean> {
  const participant =
    await getBotGroupParticipant(
      sock,
      jid,
    );

  if (!participant) {
    return false;
  }

  return isAdmin(
    participant.admin,
  );
}
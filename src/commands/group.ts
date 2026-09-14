import type {
  WASocket,
  WAMessage,
  GroupMetadata,
  MiscMessageGenerationOptions,
} from "@whiskeysockets/baileys";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

const BRAND = "🌑 DARK VORTEX";

type ReplyOptions = MiscMessageGenerationOptions & {
  mentions?: string[];
};

/* =========================================================
   REPLY HELPER
========================================================= */

async function reply(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  text: string,
  options?: ReplyOptions,
): Promise<void> {
  await sendVortexReply(
    sock,
    jid,
    text,
    message,
    options,
  );
}

/* =========================================================
   HELPERS
========================================================= */

function isGroup(jid: string): boolean {
  return jid.endsWith("@g.us");
}

function normalizeJid(jid?: string | null): string {
  if (!jid) return "";

  return jid
    .trim()
    .replace(/:\d+@/, "@")
    .replace(/@c\.us$/, "@s.whatsapp.net");
}

function getJidNumber(jid?: string | null): string {
  if (!jid) return "";

  return jid
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

function sameUser(
  a?: string | null,
  b?: string | null,
): boolean {
  if (!a || !b) return false;

  const aj = normalizeJid(a);
  const bj = normalizeJid(b);

  if (aj === bj) return true;

  const an = getJidNumber(aj);
  const bn = getJidNumber(bj);

  return Boolean(
    an &&
      bn &&
      an === bn,
  );
}

function isAdminParticipant(
  participant: GroupMetadata["participants"][number],
): boolean {
  return (
    participant.admin === "admin" ||
    participant.admin === "superadmin"
  );
}

/* =========================================================
   GROUP FETCH
========================================================= */

async function getGroup(
  sock: WASocket,
  jid: string,
): Promise<GroupMetadata | null> {
  try {
    return await sock.groupMetadata(jid);
  } catch {
    return null;
  }
}

/* =========================================================
   BOT ADMIN CHECK
========================================================= */

async function isBotAdmin(
  sock: WASocket,
  jid: string,
): Promise<boolean> {
  try {
    const metadata = await sock.groupMetadata(jid);

    const botJid = sock.user?.id || "";
    const botLid = sock.user?.lid || "";
    const botNumber = getJidNumber(botJid);

    const participant = metadata.participants.find((p) => {
      if (sameUser(p.id, botJid)) return true;

      if (botLid && sameUser(p.id, botLid)) {
        return true;
      }

      const participantNumber =
        getJidNumber(p.id);

      return Boolean(
        botNumber &&
          participantNumber &&
          botNumber === participantNumber,
      );
    });

    return Boolean(
      participant &&
        isAdminParticipant(participant),
    );
  } catch {
    return false;
  }
}

/* =========================================================
   GROUP REQUIREMENT
========================================================= */

async function requireGroup(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<GroupMetadata | null> {
  if (!isGroup(jid)) {
    await reply(
      sock,
      jid,
      message,
      "📌 This command can only be used in a group.",
    );

    return null;
  }

  const metadata = await getGroup(
    sock,
    jid,
  );

  if (!metadata) {
    await reply(
      sock,
      jid,
      message,
      "❌ Group access failed.\n\nDark Vortex could not access this group's information.",
    );

    return null;
  }

  if (!(await isBotAdmin(sock, jid))) {
    await reply(
      sock,
      jid,
      message,
      "🛡️ Bot admin required.\n\nMake Dark Vortex a group administrator and try again.",
    );

    return null;
  }

  return metadata;
}

/* =========================================================
   FIND REPLIED USER
========================================================= */

function getRepliedUser(
  message?: WAMessage,
): string | null {
  if (!message) return null;

  const context =
    message.message?.extendedTextMessage
      ?.contextInfo ||
    message.message?.imageMessage
      ?.contextInfo ||
    message.message?.videoMessage
      ?.contextInfo ||
    message.message?.documentMessage
      ?.contextInfo ||
    message.message?.audioMessage
      ?.contextInfo ||
    message.message?.stickerMessage
      ?.contextInfo;

  if (!context?.quotedMessage) {
    return null;
  }

  return context.participant || null;
}

/* =========================================================
   REPLY TARGET
========================================================= */

async function getReplyTarget(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<string | null> {
  const target = getRepliedUser(message);

  if (!target) {
    await reply(
      sock,
      jid,
      message,
      "⚠️ Reply required.\n\nReply to the user's message first.\nExample: Reply → /kick",
    );

    return null;
  }

  return normalizeJid(target);
}

/* =========================================================
   PARTICIPANT HELPERS
========================================================= */

function findParticipant(
  metadata: GroupMetadata,
  target: string,
) {
  return metadata.participants.find((p) =>
    sameUser(p.id, target),
  );
}

function isProtectedTarget(
  sock: WASocket,
  target: string,
): boolean {
  const botJid = sock.user?.id || "";
  const botLid = sock.user?.lid || "";

  return (
    sameUser(target, botJid) ||
    (botLid
      ? sameUser(target, botLid)
      : false)
  );
}

/* =========================================================
   KICK
========================================================= */

async function kick(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const target = await getReplyTarget(
    sock,
    jid,
    message,
  );

  if (!target) return;

  if (isProtectedTarget(sock, target)) {
    await reply(
      sock,
      jid,
      message,
      "🛡️ Protected target.\n\nDark Vortex cannot remove itself.",
    );
    return;
  }

  const participant = findParticipant(
    metadata,
    target,
  );

  if (!participant) {
    await reply(
      sock,
      jid,
      message,
      "❌ User not found.\n\nThe replied user is no longer in this group.",
    );
    return;
  }

  if (isAdminParticipant(participant)) {
    await reply(
      sock,
      jid,
      message,
      `🛡️ Admin protected.\n\n@${getJidNumber(participant.id)} cannot be removed because they are an administrator.`,
      {
        mentions: [participant.id],
      },
    );
    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [participant.id],
      "remove",
    );

    await reply(
      sock,
      jid,
      message,
      `👢 Member removed.\n\n@${getJidNumber(participant.id)} was removed from the group.`,
      {
        mentions: [participant.id],
      },
    );
  } catch (error) {
    console.error("Kick error:", error);

    await reply(
      sock,
      jid,
      message,
      "❌ Kick failed.\n\nWhatsApp rejected the removal request.",
    );
  }
}

/* =========================================================
   KICK ALL
========================================================= */

async function kickAll(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const targets = metadata.participants
    .filter((p) => !isAdminParticipant(p))
    .filter(
      (p) => !isProtectedTarget(sock, p.id),
    )
    .map((p) => p.id);

  if (!targets.length) {
    await reply(
      sock,
      jid,
      message,
      "ℹ️ Nothing to remove.\n\nThere are no removable members.",
    );
    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      targets,
      "remove",
    );

    await reply(
      sock,
      jid,
      message,
      `👢 Members removed.\n\nRemoved: ${targets.length}\nAdministrators were protected.`,
    );
  } catch (error) {
    console.error(
      "Kickall error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Kick-all failed.\n\nWhatsApp rejected the operation.",
    );
  }
}

/* =========================================================
   ADD
========================================================= */

async function add(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  args: string[],
): Promise<void> {
  if (!args.length) {
    await reply(
      sock,
      jid,
      message,
      "⚠️ Number required.\n\nUsage: /add 234xxxxxxxxxx",
    );
    return;
  }

  const numbers = args
    .join(" ")
    .split(/[\s,]+/)
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);

  const targets = numbers.map(
    (number) =>
      `${number}@s.whatsapp.net`,
  );

  try {
    const result =
      await sock.groupParticipantsUpdate(
        jid,
        targets,
        "add",
      );

    const successful = result.filter(
      (r) =>
        r.status === "200" ||
        r.status === "207",
    );

    await reply(
      sock,
      jid,
      message,
      `➕ Add member.\n\nRequested: ${targets.length}\nSuccessful: ${successful.length}\nFailed: ${targets.length - successful.length}`,
    );
  } catch (error) {
    console.error("Add error:", error);

    await reply(
      sock,
      jid,
      message,
      "❌ Add failed.\n\nCould not add the requested number.",
    );
  }
}

/* =========================================================
   PROMOTE
========================================================= */

async function promote(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const target = await getReplyTarget(
    sock,
    jid,
    message,
  );

  if (!target) return;

  const participant = findParticipant(
    metadata,
    target,
  );

  if (!participant) {
    await reply(
      sock,
      jid,
      message,
      "❌ User not found.\n\nThe replied user is not in this group.",
    );
    return;
  }

  if (isAdminParticipant(participant)) {
    await reply(
      sock,
      jid,
      message,
      `ℹ️ Already admin.\n\n@${getJidNumber(participant.id)} is already an administrator.`,
      {
        mentions: [participant.id],
      },
    );
    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [participant.id],
      "promote",
    );

    await reply(
      sock,
      jid,
      message,
      `👑 Member promoted.\n\n@${getJidNumber(participant.id)} is now an administrator.`,
      {
        mentions: [participant.id],
      },
    );
  } catch (error) {
    console.error(
      "Promote error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Promote failed.\n\nWhatsApp rejected the promotion.",
    );
  }
}

/* =========================================================
   DEMOTE
========================================================= */

async function demote(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const target = await getReplyTarget(
    sock,
    jid,
    message,
  );

  if (!target) return;

  const participant = findParticipant(
    metadata,
    target,
  );

  if (!participant) {
    await reply(
      sock,
      jid,
      message,
      "❌ User not found.\n\nThe replied user is not in this group.",
    );
    return;
  }

  if (!isAdminParticipant(participant)) {
    await reply(
      sock,
      jid,
      message,
      `ℹ️ Not an admin.\n\n@${getJidNumber(participant.id)} is not a group administrator.`,
      {
        mentions: [participant.id],
      },
    );
    return;
  }

  if (
    isProtectedTarget(
      sock,
      participant.id,
    )
  ) {
    await reply(
      sock,
      jid,
      message,
      "🛡️ Protected target.\n\nDark Vortex cannot demote itself.",
    );
    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [participant.id],
      "demote",
    );

    await reply(
      sock,
      jid,
      message,
      `⬇️ Admin demoted.\n\n@${getJidNumber(participant.id)} is now a regular member.`,
      {
        mentions: [participant.id],
      },
    );
  } catch (error) {
    console.error(
      "Demote error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Demote failed.\n\nWhatsApp rejected the demotion.",
    );
  }
}

/* =========================================================
   PROMOTE ALL
========================================================= */

async function promoteAll(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const targets = metadata.participants
    .filter((p) => !isAdminParticipant(p))
    .filter(
      (p) => !isProtectedTarget(sock, p.id),
    )
    .map((p) => p.id);

  if (!targets.length) {
    await reply(
      sock,
      jid,
      message,
      "ℹ️ No changes needed.\n\nEveryone is already an administrator.",
    );
    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      targets,
      "promote",
    );

    await reply(
      sock,
      jid,
      message,
      `👑 Members promoted.\n\nPromoted: ${targets.length}`,
    );
  } catch (error) {
    console.error(
      "Promoteall error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Promote-all failed.\n\nWhatsApp rejected the operation.",
    );
  }
}

/* =========================================================
   DEMOTE ALL
========================================================= */

async function demoteAll(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const targets = metadata.participants
    .filter((p) => isAdminParticipant(p))
    .filter(
      (p) => !isProtectedTarget(sock, p.id),
    )
    .map((p) => p.id);

  if (!targets.length) {
    await reply(
      sock,
      jid,
      message,
      "ℹ️ No removable administrators.",
    );
    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      targets,
      "demote",
    );

    await reply(
      sock,
      jid,
      message,
      `⬇️ Administrators demoted.\n\nDemoted: ${targets.length}\nDark Vortex was protected.`,
    );
  } catch (error) {
    console.error(
      "Demoteall error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Demote-all failed.\n\nWhatsApp rejected the operation.",
    );
  }
}

/* =========================================================
   GROUP MODE
========================================================= */

async function mute(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "announcement",
    );

    await reply(
      sock,
      jid,
      message,
      "🔇 Group muted.\n\nOnly administrators can send messages now.",
    );
  } catch (error) {
    console.error("Mute error:", error);

    await reply(
      sock,
      jid,
      message,
      "❌ Mute failed.\n\nWhatsApp rejected the setting change.",
    );
  }
}

async function unmute(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "not_announcement",
    );

    await reply(
      sock,
      jid,
      message,
      "🔊 Group unmuted.\n\nAll members can send messages now.",
    );
  } catch (error) {
    console.error(
      "Unmute error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Unmute failed.\n\nWhatsApp rejected the setting change.",
    );
  }
}

async function onlyAdmins(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  await mute(sock, jid, message);
}

async function everyone(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  await unmute(sock, jid, message);
}

/* =========================================================
   GROUP INFORMATION SETTINGS
========================================================= */

async function lockGroup(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "locked",
    );

    await reply(
      sock,
      jid,
      message,
      "🔒 Group info locked.\n\nOnly administrators can edit the group subject and description.",
    );
  } catch (error) {
    console.error("Lock error:", error);

    await reply(
      sock,
      jid,
      message,
      "❌ Lock failed.\n\nWhatsApp rejected the group setting change.",
    );
  }
}

async function unlockGroup(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "unlocked",
    );

    await reply(
      sock,
      jid,
      message,
      "🔓 Group info unlocked.\n\nMembers can edit group information again.",
    );
  } catch (error) {
    console.error(
      "Unlock error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Unlock failed.\n\nWhatsApp rejected the group setting change.",
    );
  }
}

/* =========================================================
   GROUP CREATION TIME
========================================================= */

async function groupCreationTime(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  if (!metadata.creation) {
    await reply(
      sock,
      jid,
      message,
      "🕒 Creation time unavailable.\n\nWhatsApp did not provide the group creation timestamp.",
    );
    return;
  }

  const date = new Date(
    metadata.creation * 1000,
  );

  await reply(
    sock,
    jid,
    message,
    `🕒 Group created.\n\nDate: ${date.toLocaleDateString()}\nTime: ${date.toLocaleTimeString()}`,
  );
}

/* =========================================================
   JOIN APPROVAL
========================================================= */

async function joinApproval(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  args: string[],
): Promise<void> {
  const mode =
    args[0]?.toLowerCase();

  if (
    !mode ||
    !["on", "off"].includes(mode)
  ) {
    await reply(
      sock,
      jid,
      message,
      "⚠️ Invalid setting.\n\nUsage:\n/joinapproval on\n/joinapproval off",
    );
    return;
  }

  try {
    await sock.groupJoinApprovalMode(
      jid,
      mode === "on" ? "on" : "off",
    );

    await reply(
      sock,
      jid,
      message,
      `🛡️ Join approval ${mode === "on" ? "enabled" : "disabled"}.\n\nStatus: ${mode.toUpperCase()}`,
    );
  } catch (error) {
    console.error(
      "Join approval error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Join approval failed.\n\nWhatsApp rejected the setting change.",
    );
  }
}

/* =========================================================
   PENDING JOIN REQUESTS
========================================================= */

async function requests(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  try {
    const pending =
      await sock.groupRequestParticipantsList(
        jid,
      );

    if (!pending.length) {
      await reply(
        sock,
        jid,
        message,
        "📥 Join requests.\n\nNo pending requests.",
      );
      return;
    }

    const mentions = pending.map(
      (request) => request.jid,
    );

    const lines = pending.map(
      (request, index) =>
        `${index + 1}. @${getJidNumber(request.jid)}`,
    );

    await reply(
      sock,
      jid,
      message,
      `📥 Join requests.\n\nPending: ${pending.length}\n\n${lines.join("\n")}`,
      {
        mentions,
      },
    );
  } catch (error) {
    console.error(
      "Requests error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Could not retrieve pending join requests.",
    );
  }
}

/* =========================================================
   APPROVE JOIN REQUESTS
========================================================= */

async function approveRequests(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  args: string[],
): Promise<void> {
  try {
    const pending =
      await sock.groupRequestParticipantsList(
        jid,
      );

    if (!pending.length) {
      await reply(
        sock,
        jid,
        message,
        "📥 No pending join requests.",
      );
      return;
    }

    let targets = pending.map(
      (request) => request.jid,
    );

    if (args.length) {
      const requestedNumbers = args
        .join(" ")
        .split(/[\s,]+/)
        .map((value) =>
          value.replace(/\D/g, ""),
        )
        .filter(Boolean);

      targets = pending
        .filter((request) =>
          requestedNumbers.includes(
            getJidNumber(request.jid),
          ),
        )
        .map((request) => request.jid);

      if (!targets.length) {
        await reply(
          sock,
          jid,
          message,
          "❌ Request not found.\n\nThat number has no pending join request.",
        );
        return;
      }
    }

    await sock.groupRequestParticipantsUpdate(
      jid,
      targets,
      "approve",
    );

    await reply(
      sock,
      jid,
      message,
      `✅ Join requests approved.\n\nApproved: ${targets.length}`,
    );
  } catch (error) {
    console.error(
      "Approve request error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Approval failed.\n\nWhatsApp rejected the request.",
    );
  }
}

/* =========================================================
   REJECT JOIN REQUESTS
========================================================= */

async function rejectRequests(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  args: string[],
): Promise<void> {
  try {
    const pending =
      await sock.groupRequestParticipantsList(
        jid,
      );

    if (!pending.length) {
      await reply(
        sock,
        jid,
        message,
        "📥 No pending join requests.",
      );
      return;
    }

    let targets = pending.map(
      (request) => request.jid,
    );

    if (args.length) {
      const requestedNumbers = args
        .join(" ")
        .split(/[\s,]+/)
        .map((value) =>
          value.replace(/\D/g, ""),
        )
        .filter(Boolean);

      targets = pending
        .filter((request) =>
          requestedNumbers.includes(
            getJidNumber(request.jid),
          ),
        )
        .map((request) => request.jid);

      if (!targets.length) {
        await reply(
          sock,
          jid,
          message,
          "❌ Request not found.\n\nThat number has no pending join request.",
        );
        return;
      }
    }

    await sock.groupRequestParticipantsUpdate(
      jid,
      targets,
      "reject",
    );

    await reply(
      sock,
      jid,
      message,
      `🚫 Join requests rejected.\n\nRejected: ${targets.length}`,
    );
  } catch (error) {
    console.error(
      "Reject request error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Rejection failed.\n\nWhatsApp rejected the operation.",
    );
  }
}

/* =========================================================
   GROUP INFO
========================================================= */

async function groupInfo(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const adminCount =
    metadata.participants.filter(
      isAdminParticipant,
    ).length;

  await reply(
    sock,
    jid,
    message,
    `ℹ️ Group information.\n\nName: ${metadata.subject}\nMembers: ${metadata.participants.length}\nAdmins: ${adminCount}`,
  );
}

/* =========================================================
   ADMINS
========================================================= */

async function admins(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const list =
    metadata.participants.filter(
      isAdminParticipant,
    );

  if (!list.length) {
    await reply(
      sock,
      jid,
      message,
      "👑 Group admins.\n\nNo administrators found.",
    );
    return;
  }

  const text = list
    .map(
      (p, index) =>
        `${index + 1}. @${getJidNumber(p.id)}`,
    )
    .join("\n");

  await reply(
    sock,
    jid,
    message,
    `👑 Group admins.\n\n${text}`,
    {
      mentions: list.map((p) => p.id),
    },
  );
}

/* =========================================================
   MEMBERS
========================================================= */

async function members(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const list = metadata.participants;

  const text = list
    .map(
      (p, index) =>
        `${index + 1}. @${getJidNumber(p.id)}${isAdminParticipant(p) ? " 👑" : ""}`,
    )
    .join("\n");

  await reply(
    sock,
    jid,
    message,
    `👥 Group members.\n\nTotal: ${list.length}\n\n${text}`,
    {
      mentions: list.map((p) => p.id),
    },
  );
}

/* =========================================================
   NON-ADMINS
========================================================= */

async function nonAdmins(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const list =
    metadata.participants.filter(
      (p) => !isAdminParticipant(p),
    );

  if (!list.length) {
    await reply(
      sock,
      jid,
      message,
      "👥 Non-admins.\n\nThere are no non-admin members.",
    );
    return;
  }

  const text = list
    .map(
      (p, index) =>
        `${index + 1}. @${getJidNumber(p.id)}`,
    )
    .join("\n");

  await reply(
    sock,
    jid,
    message,
    `👥 Non-admins.\n\nTotal: ${list.length}\n\n${text}`,
    {
      mentions: list.map((p) => p.id),
    },
  );
}

/* =========================================================
   TAG ALL
========================================================= */

async function tagAll(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
): Promise<void> {
  const mentions =
    metadata.participants.map(
      (p) => p.id,
    );

  const text = mentions
    .map(
      (user, index) =>
        `${index + 1}. @${getJidNumber(user)}`,
    )
    .join("\n");

  await reply(
    sock,
    jid,
    message,
    `📢 Attention everyone!\n\n${text}`,
    {
      mentions,
    },
  );
}

/* =========================================================
   HIDETAG
========================================================= */

async function hideTag(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata,
  args: string[],
): Promise<void> {
  const text =
    args.length > 0
      ? args.join(" ")
      : "📢 Attention everyone!";

  const mentions =
    metadata.participants.map(
      (p) => p.id,
    );

  await reply(
    sock,
    jid,
    message,
    text,
    {
      mentions,
    },
  );
}

/* =========================================================
   GROUP LINK
========================================================= */

async function link(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  try {
    const code =
      await sock.groupInviteCode(jid);

    await reply(
      sock,
      jid,
      message,
      `🔗 Group link.\n\nhttps://chat.whatsapp.com/${code}`,
    );
  } catch (error) {
    console.error("Link error:", error);

    await reply(
      sock,
      jid,
      message,
      "❌ Could not retrieve the group invite link.",
    );
  }
}

/* =========================================================
   REVOKE LINK
========================================================= */

async function revoke(
  sock: WASocket,
  jid: string,
  message: WAMessage,
): Promise<void> {
  try {
    await sock.groupRevokeInvite(jid);

    await reply(
      sock,
      jid,
      message,
      "🔐 Group link revoked.\n\nThe previous invite link is no longer valid.",
    );
  } catch (error) {
    console.error(
      "Revoke error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Link revoke failed.\n\nWhatsApp rejected the operation.",
    );
  }
}

/* =========================================================
   SET NAME
========================================================= */

async function setName(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  args: string[],
): Promise<void> {
  const name = args
    .join(" ")
    .trim();

  if (!name) {
    await reply(
      sock,
      jid,
      message,
      "⚠️ Name required.\n\nUsage: /setname New Group Name",
    );
    return;
  }

  try {
    await sock.groupUpdateSubject(
      jid,
      name,
    );

    await reply(
      sock,
      jid,
      message,
      `✏️ Group name updated.\n\nNew name: ${name}`,
    );
  } catch (error) {
    console.error(
      "Setname error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Name update failed.\n\nWhatsApp rejected the group name change.",
    );
  }
}

/* =========================================================
   SET DESCRIPTION
========================================================= */

async function setDescription(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  args: string[],
): Promise<void> {
  const description = args
    .join(" ")
    .trim();

  if (!description) {
    await reply(
      sock,
      jid,
      message,
      "⚠️ Description required.\n\nUsage: /setdesc Your group description",
    );
    return;
  }

  try {
    await sock.groupUpdateDescription(
      jid,
      description,
    );

    await reply(
      sock,
      jid,
      message,
      "📝 Group description updated.",
    );
  } catch (error) {
    console.error(
      "Setdesc error:",
      error,
    );

    await reply(
      sock,
      jid,
      message,
      "❌ Description update failed.\n\nWhatsApp rejected the change.",
    );
  }
}

/* =========================================================
   MAIN GROUP COMMAND HANDLER
========================================================= */

export async function handleGroupCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  message: WAMessage,
): Promise<boolean> {
  const groupCommands = new Set([
    "kick",
    "kickall",
    "add",
    "promote",
    "demote",
    "promoteall",
    "demoteall",

    "mute",
    "unmute",
    "onlyadmins",
    "onlyadmin",
    "everyone",

    "lock",
    "unlock",
    "gctime",

    "joinapproval",
    "requests",
    "approve",
    "reject",

    "admins",
    "members",
    "nonadmins",
    "tagall",
    "hidetag",
    "groupinfo",

    "link",
    "getlink",
    "revoke",

    "setname",
    "setdesc",
    "setdescription",
  ]);

  if (!groupCommands.has(command)) {
    return false;
  }

  const metadata =
    await requireGroup(
      sock,
      jid,
      message,
    );

  if (!metadata) {
    return true;
  }

  switch (command) {
    /* =========================
       MEMBER MANAGEMENT
    ========================= */

    case "kick":
      await kick(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "kickall":
      await kickAll(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "add":
      await add(
        sock,
        jid,
        message,
        args,
      );
      return true;

    case "promote":
      await promote(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "demote":
      await demote(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "promoteall":
      await promoteAll(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "demoteall":
      await demoteAll(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    /* =========================
       GROUP MODE
    ========================= */

    case "mute":
      await mute(
        sock,
        jid,
        message,
      );
      return true;

    case "unmute":
      await unmute(
        sock,
        jid,
        message,
      );
      return true;

    case "onlyadmins":
    case "onlyadmin":
      await onlyAdmins(
        sock,
        jid,
        message,
      );
      return true;

    case "everyone":
      await everyone(
        sock,
        jid,
        message,
      );
      return true;

    /* =========================
       GROUP SETTINGS
    ========================= */

    case "lock":
      await lockGroup(
        sock,
        jid,
        message,
      );
      return true;

    case "unlock":
      await unlockGroup(
        sock,
        jid,
        message,
      );
      return true;

    case "gctime":
      await groupCreationTime(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "joinapproval":
      await joinApproval(
        sock,
        jid,
        message,
        args,
      );
      return true;

    case "requests":
      await requests(
        sock,
        jid,
        message,
      );
      return true;

    case "approve":
      await approveRequests(
        sock,
        jid,
        message,
        args,
      );
      return true;

    case "reject":
      await rejectRequests(
        sock,
        jid,
        message,
        args,
      );
      return true;

    /* =========================
       GROUP INFORMATION
    ========================= */

    case "groupinfo":
      await groupInfo(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "admins":
      await admins(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "members":
      await members(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "nonadmins":
      await nonAdmins(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    /* =========================
       TAGGING
    ========================= */

    case "tagall":
      await tagAll(
        sock,
        jid,
        message,
        metadata,
      );
      return true;

    case "hidetag":
      await hideTag(
        sock,
        jid,
        message,
        metadata,
        args,
      );
      return true;

    /* =========================
       LINKS
    ========================= */

    case "link":
    case "getlink":
      await link(
        sock,
        jid,
        message,
      );
      return true;

    case "revoke":
      await revoke(
        sock,
        jid,
        message,
      );
      return true;

    /* =========================
       GROUP NAME / DESCRIPTION
    ========================= */

    case "setname":
      await setName(
        sock,
        jid,
        message,
        args,
      );
      return true;

    case "setdesc":
    case "setdescription":
      await setDescription(
        sock,
        jid,
        message,
        args,
      );
      return true;

    default:
      return false;
  }
}
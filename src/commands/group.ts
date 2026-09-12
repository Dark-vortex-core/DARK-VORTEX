import {
  downloadMediaMessage,
  type WASocket,
  type WAMessage,
  type GroupMetadata,
} from "@whiskeysockets/baileys";

import {
  enableGroup,
  disableGroup,
  getRegisteredGroups,
} from "../services/groupRegistry.js";

import {
  vortexBox,
  success,
  error,
  warning,
  info,
  security,
  commandUsage,
  groupRequired,
  botAdminRequired,
  targetRequired,
  userMention,
} from "../utils/message.js";

/* =========================================================
   🌑 DARK VORTEX — GROUP COMMAND ENGINE
   ⚡ Premium Group Management Interface
   ⚡ Powered by Vortex Tech
========================================================= */

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
  b?: string | null
): boolean {
  if (!a || !b) return false;

  const aj = normalizeJid(a);
  const bj = normalizeJid(b);

  if (aj === bj) return true;

  const an = getJidNumber(aj);
  const bn = getJidNumber(bj);

  return Boolean(an && bn && an === bn);
}

function isAdminParticipant(
  participant: GroupMetadata["participants"][number]
): boolean {
  return (
    participant.admin === "admin" ||
    participant.admin === "superadmin"
  );
}

/* =========================================================
   ERROR FORMATTER
========================================================= */

function errorMessage(
  title: string,
  reason: string
): string {
  return error(title, [
    `❌ ${reason}`,
    "",
    "🛡️ Verify the bot has the",
    "required group permissions.",
    "",
    "⚡ Try the command again.",
  ]);
}

/* =========================================================
   GROUP FETCH
========================================================= */

async function getGroup(
  sock: WASocket,
  jid: string
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
  jid: string
): Promise<boolean> {
  try {
    const metadata = await sock.groupMetadata(jid);

    const botJid = sock.user?.id || "";
    const botLid = sock.user?.lid || "";

    const botNumber = getJidNumber(botJid);

    const participant = metadata.participants.find((p) => {
      if (sameUser(p.id, botJid)) {
        return true;
      }

      if (botLid && sameUser(p.id, botLid)) {
        return true;
      }

      const participantNumber = getJidNumber(p.id);

      return Boolean(
        botNumber &&
          participantNumber &&
          botNumber === participantNumber
      );
    });

    return Boolean(
      participant &&
        isAdminParticipant(participant)
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
  jid: string
): Promise<GroupMetadata | null> {
  if (!isGroup(jid)) {
    await sock.sendMessage(jid, {
      text: groupRequired("group command"),
    });

    return null;
  }

  const metadata = await getGroup(sock, jid);

  if (!metadata) {
    await sock.sendMessage(jid, {
      text: error(
        "GROUP ACCESS FAILED",
        [
          "🌑 Dark Vortex could not access",
          "this group's information.",
          "",
          "💡 Make sure the bot is still",
          "a member of this group.",
        ]
      ),
    });

    return null;
  }

  if (!(await isBotAdmin(sock, jid))) {
    await sock.sendMessage(jid, {
      text: botAdminRequired(),
    });

    return null;
  }

  return metadata;
}

/* =========================================================
   FIND REPLIED MESSAGE
========================================================= */

function getRepliedUser(
  message?: WAMessage
): string | null {
  if (!message) return null;

  const context =
    message.message?.extendedTextMessage?.contextInfo ||
    message.message?.imageMessage?.contextInfo ||
    message.message?.videoMessage?.contextInfo ||
    message.message?.documentMessage?.contextInfo ||
    message.message?.audioMessage?.contextInfo ||
    message.message?.stickerMessage?.contextInfo;

  if (!context?.quotedMessage) {
    return null;
  }

  return context.participant || null;
}

/* =========================================================
   TARGET FROM REPLY ONLY
========================================================= */

async function getReplyTarget(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  commandName: string
): Promise<string | null> {
  const target = getRepliedUser(message);

  if (!target) {
    await sock.sendMessage(jid, {
      text: targetRequired(commandName),
    });

    return null;
  }

  return normalizeJid(target);
}

/* =========================================================
   TARGET PARTICIPANT
========================================================= */

function findParticipant(
  metadata: GroupMetadata,
  target: string
) {
  return metadata.participants.find((p) =>
    sameUser(p.id, target)
  );
}

/* =========================================================
   PROTECTED BOT
========================================================= */

function isProtectedTarget(
  sock: WASocket,
  target: string
): boolean {
  const botJid = sock.user?.id || "";
  const botLid = sock.user?.lid || "";

  return (
    sameUser(target, botJid) ||
    (botLid ? sameUser(target, botLid) : false)
  );
}

/* =========================================================
   KICK
========================================================= */

async function kick(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata
): Promise<void> {
  const target = await getReplyTarget(
    sock,
    jid,
    message,
    "kick"
  );

  if (!target) return;

  if (isProtectedTarget(sock, target)) {
    await sock.sendMessage(jid, {
      text: security(
        "PROTECTED TARGET",
        [
          "🌑 Dark Vortex cannot remove",
          "itself from the group.",
          "",
          "🛡️ Bot protection remains active.",
        ]
      ),
    });

    return;
  }

  const participant = findParticipant(
    metadata,
    target
  );

  if (!participant) {
    await sock.sendMessage(jid, {
      text: error(
        "USER NOT FOUND",
        [
          "The replied user is no longer",
          "a member of this group.",
          "",
          "🔎 Target lookup failed.",
        ]
      ),
    });

    return;
  }

  if (isAdminParticipant(participant)) {
    await sock.sendMessage(jid, {
      text: security(
        "ADMIN PROTECTED",
        [
          `👤 Target: ${userMention(participant.id)}`,
          "",
          "Administrators cannot be removed",
          "by this command.",
          "",
          "🛡️ Group hierarchy protected.",
        ]
      ),
      mentions: [participant.id],
    });

    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [participant.id],
      "remove"
    );

    await sock.sendMessage(jid, {
      text: success(
        "MEMBER REMOVED",
        [
          `👤 Target: ${userMention(participant.id)}`,
          "",
          "⚡ Action: Remove member",
          "🟢 Status: Successfully completed",
          "🛡️ Group protection maintained",
        ]
      ),
      mentions: [participant.id],
    });
  } catch (err) {
    console.error("Kick error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "KICK FAILED",
        "WhatsApp rejected the removal request."
      ),
    });
  }
}

/* =========================================================
   KICK ALL
========================================================= */

async function kickAll(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata
): Promise<void> {
  const targets = metadata.participants
    .filter((p) => !isAdminParticipant(p))
    .filter((p) => !isProtectedTarget(sock, p.id))
    .map((p) => p.id);

  if (!targets.length) {
    await sock.sendMessage(jid, {
      text: info(
        "KICK ALL",
        [
          "There are no removable members.",
          "",
          "👑 Administrators are protected.",
          "🛡️ Dark Vortex remains protected.",
        ]
      ),
    });

    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      targets,
      "remove"
    );

    await sock.sendMessage(jid, {
      text: success(
        "KICK ALL COMPLETE",
        [
          `👥 Members removed: ${targets.length}`,
          "",
          "👑 Administrators protected",
          "🛡️ Bot protected",
          "🟢 Operation completed",
        ]
      ),
    });
  } catch (err) {
    console.error("Kickall error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "KICK ALL FAILED",
        "WhatsApp rejected the operation."
      ),
    });
  }
}

/* =========================================================
   ADD
========================================================= */

async function add(
  sock: WASocket,
  jid: string,
  args: string[]
): Promise<void> {
  if (!args.length) {
    await sock.sendMessage(jid, {
      text: commandUsage(
        "add",
        "/add 234xxxxxxxxxx",
        "Multiple numbers can be separated by spaces."
      ),
    });

    return;
  }

  const numbers = args
    .join(" ")
    .split(/[\s,]+/)
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);

  const targets = numbers.map(
    (number) => `${number}@s.whatsapp.net`
  );

  try {
    const result =
      await sock.groupParticipantsUpdate(
        jid,
        targets,
        "add"
      );

    const successful = result.filter(
      (r) =>
        r.status === "200" ||
        r.status === "207"
    );

    await sock.sendMessage(jid, {
      text: success(
        "MEMBER ADDITION",
        [
          `📱 Requested: ${targets.length}`,
          `✅ Successful: ${successful.length}`,
          `❌ Failed: ${targets.length - successful.length}`,
          "",
          successful.length === targets.length
            ? "🟢 All requested members were processed."
            : "🟡 Operation completed with some failures.",
        ]
      ),
    });
  } catch (err) {
    console.error("Add error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "ADD FAILED",
        "Could not add the requested number(s)."
      ),
    });
  }
}

/* =========================================================
   PROMOTE
========================================================= */

async function promote(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata
): Promise<void> {
  const target = await getReplyTarget(
    sock,
    jid,
    message,
    "promote"
  );

  if (!target) return;

  const participant = findParticipant(
    metadata,
    target
  );

  if (!participant) {
    await sock.sendMessage(jid, {
      text: error(
        "USER NOT FOUND",
        [
          "The replied user is not",
          "in this group.",
        ]
      ),
    });

    return;
  }

  if (isAdminParticipant(participant)) {
    await sock.sendMessage(jid, {
      text: info(
        "ALREADY ADMIN",
        [
          `👤 User: ${userMention(participant.id)}`,
          "",
          "That user already has",
          "administrator privileges.",
        ]
      ),
      mentions: [participant.id],
    });

    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [participant.id],
      "promote"
    );

    await sock.sendMessage(jid, {
      text: success(
        "ADMIN PROMOTED",
        [
          `👤 User: ${userMention(participant.id)}`,
          "",
          "👑 Role: Administrator",
          "🟢 Status: Promotion successful",
          "🛡️ Group hierarchy updated",
        ]
      ),
      mentions: [participant.id],
    });
  } catch (err) {
    console.error("Promote error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "PROMOTE FAILED",
        "WhatsApp rejected the promotion."
      ),
    });
  }
}

/* =========================================================
   DEMOTE
========================================================= */

async function demote(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  metadata: GroupMetadata
): Promise<void> {
  const target = await getReplyTarget(
    sock,
    jid,
    message,
    "demote"
  );

  if (!target) return;

  const participant = findParticipant(
    metadata,
    target
  );

  if (!participant) {
    await sock.sendMessage(jid, {
      text: error(
        "USER NOT FOUND",
        [
          "The replied user is not",
          "in this group.",
        ]
      ),
    });

    return;
  }

  if (!isAdminParticipant(participant)) {
    await sock.sendMessage(jid, {
      text: info(
        "NOT AN ADMIN",
        [
          `👤 User: ${userMention(participant.id)}`,
          "",
          "That user is already",
          "a regular member.",
        ]
      ),
      mentions: [participant.id],
    });

    return;
  }

  if (isProtectedTarget(sock, participant.id)) {
    await sock.sendMessage(jid, {
      text: security(
        "PROTECTED TARGET",
        [
          "🌑 Dark Vortex cannot demote",
          "itself from administrator.",
          "",
          "🛡️ Bot protection remains active.",
        ]
      ),
    });

    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [participant.id],
      "demote"
    );

    await sock.sendMessage(jid, {
      text: success(
        "ADMIN DEMOTED",
        [
          `👤 User: ${userMention(participant.id)}`,
          "",
          "👤 Role: Member",
          "🟢 Status: Demotion successful",
          "🛡️ Group hierarchy updated",
        ]
      ),
      mentions: [participant.id],
    });
  } catch (err) {
    console.error("Demote error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "DEMOTE FAILED",
        "WhatsApp rejected the demotion."
      ),
    });
  }
}

/* =========================================================
   PROMOTE ALL
========================================================= */

async function promoteAll(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata
): Promise<void> {
  const targets = metadata.participants
    .filter((p) => !isAdminParticipant(p))
    .filter((p) => !isProtectedTarget(sock, p.id))
    .map((p) => p.id);

  if (!targets.length) {
    await sock.sendMessage(jid, {
      text: info(
        "PROMOTE ALL",
        [
          "Everyone is already",
          "an administrator.",
          "",
          "🟢 No changes were required.",
        ]
      ),
    });

    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      targets,
      "promote"
    );

    await sock.sendMessage(jid, {
      text: success(
        "PROMOTE ALL COMPLETE",
        [
          `👥 Promoted: ${targets.length}`,
          "",
          "👑 Administrator privileges granted.",
          "🛡️ Dark Vortex remained protected.",
          "🟢 Operation completed.",
        ]
      ),
    });
  } catch (err) {
    console.error("Promoteall error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "PROMOTE ALL FAILED",
        "WhatsApp rejected the operation."
      ),
    });
  }
}

/* =========================================================
   DEMOTE ALL
========================================================= */

async function demoteAll(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata
): Promise<void> {
  const targets = metadata.participants
    .filter((p) => isAdminParticipant(p))
    .filter((p) => !isProtectedTarget(sock, p.id))
    .map((p) => p.id);

  if (!targets.length) {
    await sock.sendMessage(jid, {
      text: info(
        "DEMOTE ALL",
        [
          "There are no removable",
          "administrators.",
          "",
          "🛡️ Dark Vortex remains protected.",
        ]
      ),
    });

    return;
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      targets,
      "demote"
    );

    await sock.sendMessage(jid, {
      text: success(
        "DEMOTE ALL COMPLETE",
        [
          `👥 Demoted: ${targets.length}`,
          "",
          "👑 Administrator roles removed.",
          "🛡️ Dark Vortex remained protected.",
          "🟢 Operation completed.",
        ]
      ),
    });
  } catch (err) {
    console.error("Demoteall error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "DEMOTE ALL FAILED",
        "WhatsApp rejected the operation."
      ),
    });
  }
}

/* =========================================================
   MUTE
========================================================= */

async function mute(
  sock: WASocket,
  jid: string
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "announcement"
    );

    await sock.sendMessage(jid, {
      text: success(
        "GROUP MUTED",
        [
          "🔇 Mode: Administrators only",
          "",
          "Only administrators can",
          "send messages now.",
          "",
          "🛡️ Group mode enforced.",
        ]
      ),
    });
  } catch (err) {
    console.error("Mute error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "MUTE FAILED",
        "WhatsApp rejected the group setting change."
      ),
    });
  }
}

/* =========================================================
   UNMUTE
========================================================= */

async function unmute(
  sock: WASocket,
  jid: string
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "not_announcement"
    );

    await sock.sendMessage(jid, {
      text: success(
        "GROUP UNMUTED",
        [
          "🔊 Mode: Everyone",
          "",
          "All members can send",
          "messages again.",
          "",
          "🟢 Group mode restored.",
        ]
      ),
    });
  } catch (err) {
    console.error("Unmute error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "UNMUTE FAILED",
        "WhatsApp rejected the group setting change."
      ),
    });
  }
}

/* =========================================================
   OPEN GROUP
========================================================= */

async function openGroup(
  sock: WASocket,
  jid: string
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "not_announcement"
    );

    await sock.sendMessage(jid, {
      text: success(
        "GROUP OPENED",
        [
          "🔓 Group mode: Open",
          "",
          "Everyone can send messages",
          "in this group again.",
          "",
          "🟢 Status: Successfully opened.",
        ]
      ),
    });
  } catch (err) {
    console.error("Open group error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "OPEN FAILED",
        "WhatsApp rejected the group setting change."
      ),
    });
  }
}

/* =========================================================
   CLOSE GROUP
========================================================= */

async function closeGroup(
  sock: WASocket,
  jid: string
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "announcement"
    );

    await sock.sendMessage(jid, {
      text: success(
        "GROUP CLOSED",
        [
          "🔒 Group mode: Administrators only",
          "",
          "Only administrators can",
          "send messages now.",
          "",
          "🟢 Status: Successfully closed.",
        ]
      ),
    });
  } catch (err) {
    console.error("Close group error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "CLOSE FAILED",
        "WhatsApp rejected the group setting change."
      ),
    });
  }
}

/* =========================================================
   GET GROUP LINK
========================================================= */

async function getLink(
  sock: WASocket,
  jid: string
): Promise<void> {
  await link(sock, jid);
}

/* =========================================================
   GET IMAGE FROM MESSAGE
========================================================= */

function getImageMessage(
  message: WAMessage
): WAMessage | null {
  if (message.message?.imageMessage) {
    return message;
  }

  const context =
    message.message?.extendedTextMessage?.contextInfo ||
    message.message?.imageMessage?.contextInfo ||
    message.message?.videoMessage?.contextInfo ||
    message.message?.documentMessage?.contextInfo;

  if (!context?.quotedMessage?.imageMessage) {
    return null;
  }

  return {
    key: {
      remoteJid: message.key.remoteJid,
      fromMe: false,
      id: context.stanzaId || "",
      participant: context.participant,
    },
    message: {
      imageMessage:
        context.quotedMessage.imageMessage,
    },
  } as WAMessage;
}

/* =========================================================
   SET GROUP PROFILE PICTURE
========================================================= */

async function setProfilePicture(
  sock: WASocket,
  jid: string,
  message: WAMessage
): Promise<void> {
  const imageMessage = getImageMessage(message);

  if (!imageMessage) {
    await sock.sendMessage(jid, {
      text: commandUsage(
        "setpp",
        "/setpp",
        "Send or reply to an image with /setpp."
      ),
    });

    return;
  }

  try {
    const image = await downloadMediaMessage(
      imageMessage,
      "buffer",
      {}
    );

    await sock.updateProfilePicture(
      jid,
      image
    );

    await sock.sendMessage(jid, {
      text: success(
        "GROUP PICTURE UPDATED",
        [
          "🖼️ The group profile picture",
          "has been updated.",
          "",
          "🟢 Status: Successfully changed.",
          "✨ Visual identity refreshed.",
        ]
      ),
    });
  } catch (err) {
    console.error(
      "Set profile picture error:",
      err
    );

    await sock.sendMessage(jid, {
      text: errorMessage(
        "PROFILE PICTURE FAILED",
        "WhatsApp rejected the group picture update."
      ),
    });
  }
}

/* =========================================================
   ONLY ADMINS
========================================================= */

async function onlyAdmins(
  sock: WASocket,
  jid: string
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "announcement"
    );

    await sock.sendMessage(jid, {
      text: success(
        "ADMIN-ONLY MODE",
        [
          "🔒 Group mode: Restricted",
          "",
          "Only administrators can",
          "send messages.",
          "",
          "🛡️ Restriction is now active.",
        ]
      ),
    });
  } catch (err) {
    console.error("Onlyadmins error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "ADMIN-ONLY MODE FAILED",
        "WhatsApp rejected the group setting change."
      ),
    });
  }
}

/* =========================================================
   EVERYONE
========================================================= */

async function everyone(
  sock: WASocket,
  jid: string
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "not_announcement"
    );

    await sock.sendMessage(jid, {
      text: success(
        "EVERYONE MODE",
        [
          "🔓 Group mode: Open",
          "",
          "All members can send",
          "messages.",
          "",
          "🟢 Restriction removed.",
        ]
      ),
    });
  } catch (err) {
    console.error("Everyone error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "EVERYONE MODE FAILED",
        "WhatsApp rejected the group setting change."
      ),
    });
  }
}

/* =========================================================
   LOCK GROUP INFO
========================================================= */

async function lockGroup(
  sock: WASocket,
  jid: string
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "locked"
    );

    await sock.sendMessage(jid, {
      text: success(
        "GROUP INFORMATION LOCKED",
        [
          "🔒 Information mode: Restricted",
          "",
          "Only administrators can",
          "edit group information.",
          "",
          "🛡️ Group metadata protected.",
        ]
      ),
    });
  } catch (err) {
    console.error("Lock error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "LOCK FAILED",
        "WhatsApp rejected the group setting change."
      ),
    });
  }
}

/* =========================================================
   UNLOCK GROUP INFO
========================================================= */

async function unlockGroup(
  sock: WASocket,
  jid: string
): Promise<void> {
  try {
    await sock.groupSettingUpdate(
      jid,
      "unlocked"
    );

    await sock.sendMessage(jid, {
      text: success(
        "GROUP INFORMATION UNLOCKED",
        [
          "🔓 Information mode: Editable",
          "",
          "Members can edit group",
          "information again.",
          "",
          "🟢 Group metadata unlocked.",
        ]
      ),
    });
  } catch (err) {
    console.error("Unlock error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "UNLOCK FAILED",
        "WhatsApp rejected the group setting change."
      ),
    });
  }
}

/* =========================================================
   GROUP CREATION TIME
========================================================= */

async function groupCreationTime(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata
): Promise<void> {
  if (!metadata.creation) {
    await sock.sendMessage(jid, {
      text: info(
        "GROUP CREATION",
        [
          "WhatsApp did not provide",
          "the creation timestamp.",
          "",
          "ℹ️ No timestamp is available.",
        ]
      ),
    });

    return;
  }

  const date = new Date(
    metadata.creation * 1000
  );

  await sock.sendMessage(jid, {
    text: vortexBox(
      "🕒 GROUP CREATION",
      [
        `📅 Date: ${date.toLocaleDateString()}`,
        `⏰ Time: ${date.toLocaleTimeString()}`,
        `🌍 Timestamp: ${metadata.creation}`,
        "",
        "🟢 Timestamp retrieved successfully.",
      ]
    ),
  });
}

/* =========================================================
   JOIN APPROVAL
========================================================= */

async function joinApproval(
  sock: WASocket,
  jid: string,
  args: string[]
): Promise<void> {
  const mode = args[0]?.toLowerCase();

  if (!mode || !["on", "off"].includes(mode)) {
    await sock.sendMessage(jid, {
      text: commandUsage(
        "joinapproval",
        "/joinapproval on | off",
        "Controls manual approval for new members."
      ),
    });

    return;
  }

  try {
    await sock.groupJoinApprovalMode(
      jid,
      mode === "on" ? "on" : "off"
    );

    await sock.sendMessage(jid, {
      text: success(
        "JOIN APPROVAL UPDATED",
        [
          `🛡️ Status: ${mode === "on" ? "🟢 ON" : "🔴 OFF"}`,
          "",
          mode === "on"
            ? "New members must be approved"
            : "Members can join without manual approval.",
          "",
          "⚡ Group admission policy updated.",
        ]
      ),
    });
  } catch (err) {
    console.error(
      "Join approval error:",
      err
    );

    await sock.sendMessage(jid, {
      text: errorMessage(
        "JOIN APPROVAL FAILED",
        "WhatsApp rejected the setting change."
      ),
    });
  }
}

/* =========================================================
   PENDING JOIN REQUESTS
========================================================= */

async function requests(
  sock: WASocket,
  jid: string
): Promise<void> {
  try {
    const pending =
      await sock.groupRequestParticipantsList(jid);

    if (!pending.length) {
      await sock.sendMessage(jid, {
        text: info(
          "JOIN REQUESTS",
          [
            "There are no pending",
            "join requests.",
            "",
            "🟢 Request queue is clear.",
          ]
        ),
      });

      return;
    }

    const lines = pending.map(
      (request, index) =>
        `${index + 1}. @${getJidNumber(request.jid)}`
    );

    await sock.sendMessage(jid, {
      text: vortexBox(
        "📥 JOIN REQUESTS",
        [
          `⏳ Pending: ${pending.length}`,
          "",
          ...lines,
          "",
          "⚡ /approve — approve requests",
          "⚡ /reject — reject requests",
        ]
      ),
      mentions: pending.map(
        (request) => request.jid
      ),
    });
  } catch (err) {
    console.error("Requests error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "REQUESTS FAILED",
        "Could not retrieve pending join requests."
      ),
    });
  }
}

/* =========================================================
   APPROVE JOIN REQUESTS
========================================================= */

async function approveRequests(
  sock: WASocket,
  jid: string,
  args: string[]
): Promise<void> {
  try {
    const pending =
      await sock.groupRequestParticipantsList(jid);

    if (!pending.length) {
      await sock.sendMessage(jid, {
        text: info(
          "APPROVE REQUESTS",
          [
            "There are no pending",
            "join requests.",
            "",
            "🟢 Nothing to approve.",
          ]
        ),
      });

      return;
    }

    let targets = pending.map(
      (request) => request.jid
    );

    if (args.length) {
      const requestedNumbers = args
        .join(" ")
        .split(/[\s,]+/)
        .map((value) =>
          value.replace(/\D/g, "")
        )
        .filter(Boolean);

      targets = pending
        .filter((request) =>
          requestedNumbers.includes(
            getJidNumber(request.jid)
          )
        )
        .map((request) => request.jid);

      if (!targets.length) {
        await sock.sendMessage(jid, {
          text: error(
            "REQUEST NOT FOUND",
            [
              "That number does not have",
              "a pending join request.",
              "",
              "🔎 No matching request found.",
            ]
          ),
        });

        return;
      }
    }

    await sock.groupRequestParticipantsUpdate(
      jid,
      targets,
      "approve"
    );

    await sock.sendMessage(jid, {
      text: success(
        "REQUESTS APPROVED",
        [
          `👥 Approved: ${targets.length}`,
          "",
          "🟢 Operation completed successfully.",
          "🛡️ Group admission queue updated.",
        ]
      ),
    });
  } catch (err) {
    console.error(
      "Approve request error:",
      err
    );

    await sock.sendMessage(jid, {
      text: errorMessage(
        "APPROVAL FAILED",
        "WhatsApp rejected the approval request."
      ),
    });
  }
}

/* =========================================================
   REJECT JOIN REQUESTS
========================================================= */

async function rejectRequests(
  sock: WASocket,
  jid: string,
  args: string[]
): Promise<void> {
  try {
    const pending =
      await sock.groupRequestParticipantsList(jid);

    if (!pending.length) {
      await sock.sendMessage(jid, {
        text: info(
          "REJECT REQUESTS",
          [
            "There are no pending",
            "join requests.",
            "",
            "🟢 Nothing to reject.",
          ]
        ),
      });

      return;
    }

    let targets = pending.map(
      (request) => request.jid
    );

    if (args.length) {
      const requestedNumbers = args
        .join(" ")
        .split(/[\s,]+/)
        .map((value) =>
          value.replace(/\D/g, "")
        )
        .filter(Boolean);

      targets = pending
        .filter((request) =>
          requestedNumbers.includes(
            getJidNumber(request.jid)
          )
        )
        .map((request) => request.jid);

      if (!targets.length) {
        await sock.sendMessage(jid, {
          text: error(
            "REQUEST NOT FOUND",
            [
              "That number does not have",
              "a pending join request.",
              "",
              "🔎 No matching request found.",
            ]
          ),
        });

        return;
      }
    }

    await sock.groupRequestParticipantsUpdate(
      jid,
      targets,
      "reject"
    );

    await sock.sendMessage(jid, {
      text: success(
        "REQUESTS REJECTED",
        [
          `👥 Rejected: ${targets.length}`,
          "",
          "🟢 Operation completed successfully.",
          "🛡️ Group admission queue updated.",
        ]
      ),
    });
  } catch (err) {
    console.error(
      "Reject request error:",
      err
    );

    await sock.sendMessage(jid, {
      text: errorMessage(
        "REJECTION FAILED",
        "WhatsApp rejected the operation."
      ),
    });
  }
}

/* =========================================================
   GROUP INFO
========================================================= */

async function groupInfo(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata
): Promise<void> {
  const admins = metadata.participants.filter(
    isAdminParticipant
  );

  await sock.sendMessage(jid, {
    text: vortexBox(
      "ℹ️ GROUP INFORMATION",
      [
        `📛 Name: ${metadata.subject}`,
        `👥 Members: ${metadata.participants.length}`,
        `👑 Admins: ${admins.length}`,
        "",
        `🆔 ID: ${jid}`,
        "",
        "🟢 Group information retrieved.",
      ]
    ),
  });
}

/* =========================================================
   ADMINS
========================================================= */

async function admins(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata
): Promise<void> {
  const adminList =
    metadata.participants.filter(
      isAdminParticipant
    );

  const list = adminList.map(
    (p, index) =>
      `${index + 1}. @${getJidNumber(p.id)}`
  );

  await sock.sendMessage(jid, {
    text: vortexBox(
      "👑 GROUP ADMINS",
      [
        `👑 Total admins: ${adminList.length}`,
        "",
        ...list,
        "",
        "🛡️ Administrator directory.",
      ]
    ),
    mentions: adminList.map(
      (p) => p.id
    ),
  });
}

/* =========================================================
   MEMBERS
========================================================= */

async function members(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata
): Promise<void> {
  const list = metadata.participants.map(
    (p, index) =>
      `${index + 1}. @${getJidNumber(p.id)}${
        isAdminParticipant(p) ? " 👑" : ""
      }`
  );

  await sock.sendMessage(jid, {
    text: vortexBox(
      "👥 GROUP MEMBERS",
      [
        `👥 Total members: ${metadata.participants.length}`,
        "",
        ...list,
        "",
        "🟢 Member directory retrieved.",
      ]
    ),
    mentions: metadata.participants.map(
      (p) => p.id
    ),
  });
}

/* =========================================================
   NON-ADMINS
========================================================= */

async function nonAdmins(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata
): Promise<void> {
  const list = metadata.participants.filter(
    (p) => !isAdminParticipant(p)
  );

  if (!list.length) {
    await sock.sendMessage(jid, {
      text: info(
        "NON-ADMINS",
        [
          "There are no non-admin",
          "members in this group.",
          "",
          "👑 All members are administrators.",
        ]
      ),
    });

    return;
  }

  await sock.sendMessage(jid, {
    text: vortexBox(
      "👥 NON-ADMINS",
      [
        `👥 Total: ${list.length}`,
        "",
        ...list.map(
          (p, index) =>
            `${index + 1}. @${getJidNumber(p.id)}`
        ),
        "",
        "🟢 Member directory retrieved.",
      ]
    ),
    mentions: list.map(
      (p) => p.id
    ),
  });
}

/* =========================================================
   TAG ALL
========================================================= */

async function tagAll(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata
): Promise<void> {
  const mentions =
    metadata.participants.map(
      (p) => p.id
    );

  const text = vortexBox(
    "📢 TAG ALL",
    [
      "Attention everyone!",
      "",
      ...mentions.map(
        (user, index) =>
          `${index + 1}. @${getJidNumber(user)}`
      ),
      "",
      "📣 Group-wide mention completed.",
    ]
  );

  await sock.sendMessage(jid, {
    text,
    mentions,
  });
}

/* =========================================================
   HIDETAG
========================================================= */

async function hideTag(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata,
  args: string[]
): Promise<void> {
  const text =
    args.length > 0
      ? args.join(" ")
      : "📢 Attention everyone!";

  const mentions =
    metadata.participants.map(
      (p) => p.id
    );

  await sock.sendMessage(jid, {
    text,
    mentions,
  });
}

/* =========================================================
   GROUP LINK
========================================================= */

async function link(
  sock: WASocket,
  jid: string
): Promise<void> {
  try {
    const code =
      await sock.groupInviteCode(jid);

    const invite =
      `https://chat.whatsapp.com/${code}`;

    await sock.sendMessage(jid, {
      text: vortexBox(
        "🔗 GROUP INVITE LINK",
        [
          "🔐 Current group invite:",
          "",
          invite,
          "",
          "🟢 Link retrieved successfully.",
          "⚡ Share only with trusted users.",
        ]
      ),
    });
  } catch (err) {
    console.error("Link error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "LINK RETRIEVAL FAILED",
        "Could not retrieve the group invite link."
      ),
    });
  }
}

/* =========================================================
   REVOKE LINK
========================================================= */

async function revoke(
  sock: WASocket,
  jid: string
): Promise<void> {
  try {
    await sock.groupRevokeInvite(jid);

    await sock.sendMessage(jid, {
      text: success(
        "GROUP LINK REVOKED",
        [
          "🔐 The previous invite link",
          "is no longer valid.",
          "",
          "🟢 A new invite link is now available.",
          "⚡ Use /link to retrieve it.",
        ]
      ),
    });
  } catch (err) {
    console.error("Revoke error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "REVOKE FAILED",
        "WhatsApp rejected the link revocation."
      ),
    });
  }
}

/* =========================================================
   SET NAME
========================================================= */

async function setName(
  sock: WASocket,
  jid: string,
  args: string[]
): Promise<void> {
  const name = args.join(" ").trim();

  if (!name) {
    await sock.sendMessage(jid, {
      text: commandUsage(
        "setname",
        "/setname New Group Name",
        "Changes the group's display name."
      ),
    });

    return;
  }

  try {
    await sock.groupUpdateSubject(
      jid,
      name
    );

    await sock.sendMessage(jid, {
      text: success(
        "GROUP NAME UPDATED",
        [
          `📛 New name: ${name}`,
          "",
          "🟢 Status: Updated successfully.",
          "✨ Group identity refreshed.",
        ]
      ),
    });
  } catch (err) {
    console.error("Setname error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "NAME UPDATE FAILED",
        "WhatsApp rejected the group name change."
      ),
    });
  }
}

/* =========================================================
   SET DESCRIPTION
========================================================= */

async function setDescription(
  sock: WASocket,
  jid: string,
  args: string[]
): Promise<void> {
  const description =
    args.join(" ").trim();

  if (!description) {
    await sock.sendMessage(jid, {
      text: commandUsage(
        "setdesc",
        "/setdesc Your group description",
        "Updates the group's description."
      ),
    });

    return;
  }

  try {
    await sock.groupUpdateDescription(
      jid,
      description
    );

    await sock.sendMessage(jid, {
      text: success(
        "DESCRIPTION UPDATED",
        [
          "📝 Group description",
          "has been updated.",
          "",
          "🟢 Status: Updated successfully.",
          "✨ Group information refreshed.",
        ]
      ),
    });
  } catch (err) {
    console.error("Setdesc error:", err);

    await sock.sendMessage(jid, {
      text: errorMessage(
        "DESCRIPTION UPDATE FAILED",
        "WhatsApp rejected the description change."
      ),
    });
  }
}

/* =========================================================
   DARK VORTEX GROUP REGISTRY CONTROLS
========================================================= */

async function enableCurrentGroup(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata
): Promise<void> {
  const entry = await enableGroup(
    jid,
    metadata.subject
  );

  await sock.sendMessage(jid, {
    text: success(
      "GROUP ENABLED",
      [
        `📛 Group: ${entry.name}`,
        "",
        "🟢 Status: ENABLED",
        "",
        "Dark Vortex commands are now active",
        "in this group.",
        "",
        "⚡ Powered by Vortex Tech",
      ]
    ),
  });
}

async function disableCurrentGroup(
  sock: WASocket,
  jid: string,
  metadata: GroupMetadata
): Promise<void> {
  const entry = await disableGroup(
    jid,
    metadata.subject
  );

  await sock.sendMessage(jid, {
    text: warning(
      "GROUP DISABLED",
      [
        `📛 Group: ${entry.name}`,
        "",
        "🔴 Status: DISABLED",
        "",
        "Dark Vortex commands are now",
        "disabled in this group.",
        "",
        "Use /enable to reactivate the bot.",
        "",
        "⚡ Powered by Vortex Tech",
      ]
    ),
  });
}

async function listRegisteredGroups(
  sock: WASocket,
  jid: string
): Promise<void> {
  const groups =
    await getRegisteredGroups();

  if (!groups.length) {
    await sock.sendMessage(jid, {
      text: info(
        "GROUP REGISTRY",
        [
          "No groups have been registered yet.",
          "",
          "Groups are registered automatically",
          "when Dark Vortex interacts with them.",
        ]
      ),
    });

    return;
  }

  const lines = groups.map(
    (group, index) => {
      const status =
        group.status === "enabled"
          ? "🟢 ENABLED"
          : group.status === "disabled"
            ? "🔴 DISABLED"
            : "⚫ LEFT";

      return [
        `${index + 1}. ${group.name}`,
        `   ${status}`,
      ].join("\n");
    }
  );

  await sock.sendMessage(jid, {
    text: vortexBox(
      "🌑 DARK VORTEX GROUPS",
      [
        `📊 Registered: ${groups.length}`,
        "",
        ...lines,
        "",
        "🟢 ENABLED — commands active",
        "🔴 DISABLED — commands blocked",
        "⚫ LEFT — bot no longer present",
        "",
        "⚡ Powered by Vortex Tech",
      ]
    ),
  });
}

/* =========================================================
   MAIN GROUP COMMAND HANDLER
========================================================= */

export async function handleGroupCommand(
  sock: WASocket,
  jid: string,
  commandName: string,
  args: string[],
  message: WAMessage
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
    "open",
    "close",
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
    "setpp",
    "groups",
    "enable",
    "disable"
  ]);

  if (!groupCommands.has(commandName)) {
    return false;
  }

  const metadata =
    await requireGroup(sock, jid);

  if (!metadata) {
    return true;
  }

  switch (commandName) {
    /* =========================
       MEMBER MANAGEMENT
    ========================= */

    case "kick":
      await kick(
        sock,
        jid,
        message,
        metadata
      );
      return true;

    case "kickall":
      await kickAll(
        sock,
        jid,
        metadata
      );
      return true;

    case "add":
      await add(
        sock,
        jid,
        args
      );
      return true;

    case "promote":
      await promote(
        sock,
        jid,
        message,
        metadata
      );
      return true;

    case "demote":
      await demote(
        sock,
        jid,
        message,
        metadata
      );
      return true;

    case "promoteall":
      await promoteAll(
        sock,
        jid,
        metadata
      );
      return true;

    case "demoteall":
      await demoteAll(
        sock,
        jid,
        metadata
      );
      return true;

    /* =========================
   GROUP REGISTRY CONTROL
========================= */

    case "groups":
    await listRegisteredGroups(
      sock,
      jid
    );
    return true;

  case "enable":
    await enableCurrentGroup(
      sock,
      jid,
      metadata
    );
    return true;

  case "disable":
    await disableCurrentGroup(
      sock,
      jid,
      metadata
    );
    return true;

    /* =========================
       GROUP MODE
    ========================= */

    case "mute":
      await mute(sock, jid);
      return true;

    case "unmute":
      await unmute(sock, jid);
      return true;

    case "open":
      await openGroup(sock, jid);
      return true;

    case "close":
      await closeGroup(sock, jid);
      return true;

    case "onlyadmins":
    case "onlyadmin":
      await onlyAdmins(sock, jid);
      return true;

    case "everyone":
      await everyone(sock, jid);
      return true;

    /* =========================
       GROUP SETTINGS
    ========================= */

    case "lock":
      await lockGroup(sock, jid);
      return true;

    case "unlock":
      await unlockGroup(sock, jid);
      return true;

    case "gctime":
      await groupCreationTime(
        sock,
        jid,
        metadata
      );
      return true;

    case "joinapproval":
      await joinApproval(
        sock,
        jid,
        args
      );
      return true;

    case "requests":
      await requests(sock, jid);
      return true;

    case "approve":
      await approveRequests(
        sock,
        jid,
        args
      );
      return true;

    case "reject":
      await rejectRequests(
        sock,
        jid,
        args
      );
      return true;

    /* =========================
       GROUP INFORMATION
    ========================= */

    case "groupinfo":
      await groupInfo(
        sock,
        jid,
        metadata
      );
      return true;

    case "admins":
      await admins(
        sock,
        jid,
        metadata
      );
      return true;

    case "members":
      await members(
        sock,
        jid,
        metadata
      );
      return true;

    case "nonadmins":
      await nonAdmins(
        sock,
        jid,
        metadata
      );
      return true;

    /* =========================
       TAGGING
    ========================= */

    case "tagall":
      await tagAll(
        sock,
        jid,
        metadata
      );
      return true;

    case "hidetag":
      await hideTag(
        sock,
        jid,
        metadata,
        args
      );
      return true;

    /* =========================
       LINKS
    ========================= */

    case "link":
      await link(sock, jid);
      return true;

    case "getlink":
      await getLink(sock, jid);
      return true;

    case "revoke":
      await revoke(sock, jid);
      return true;

    /* =========================
       GROUP NAME / DESCRIPTION
    ========================= */

    case "setname":
      await setName(
        sock,
        jid,
        args
      );
      return true;

    case "setdesc":
    case "setdescription":
      await setDescription(
        sock,
        jid,
        args
      );
      return true;

    case "setpp":
      await setProfilePicture(
        sock,
        jid,
        message
      );
      return true;

    default:
      return false;
  }
}
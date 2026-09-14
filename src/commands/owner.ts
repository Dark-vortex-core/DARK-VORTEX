import os from "node:os";

import type { WAMessage } from "@whiskeysockets/baileys";

import { sendVortexReply } from "../utils/vortex-reply.js";

import { getPrefix } from "../services/prefix.js";

import {
  beginLifecycleAction,
  closeActiveSocket,
} from "../services/lifecycle.js";

import {
  getRegisteredGroups,
  registerGroup,
  enableGroup,
  disableGroup,
  markGroupLeft,
} from "../services/groupRegistry.js";


/* =========================================================
   🌑 DARK VORTEX — OWNER COMMAND ENGINE
   ⚡ Powered by Vortex Tech

   Presentation layer:
   • Concise Dark Vortex responses
   • Native WhatsApp quoted replies
   • Centralized through sendVortexReply()

   IMPORTANT:
   Existing command logic and behavior preserved.
========================================================= */


/* =========================================================
   GROUP JOIN REQUEST HELPERS
========================================================= */

async function getPendingJoinRequests(
  sock: any,
  jid: string,
): Promise<any[]> {

  if (
    typeof sock.groupRequestParticipantsList !==
    "function"
  ) {
    throw new Error(
      "WhatsApp join-request API is not available.",
    );
  }

  const requests =
    await sock.groupRequestParticipantsList(
      jid,
    );

  if (!Array.isArray(requests)) {
    return [];
  }

  return requests;
}


async function processJoinRequests(
  sock: any,
  jid: string,
  action: "approve" | "reject",
): Promise<{
  total: number;
  processed: number;
  failed: number;
}> {

  const requests =
    await getPendingJoinRequests(
      sock,
      jid,
    );

  const total =
    requests.length;

  if (total === 0) {
    return {
      total: 0,
      processed: 0,
      failed: 0,
    };
  }

  const participants =
    requests
      .map(
        (request) =>
          request?.jid,
      )
      .filter(
        (participant): participant is string =>
          typeof participant === "string" &&
          participant.length > 0,
      );

  if (
    participants.length === 0
  ) {
    return {
      total,
      processed: 0,
      failed: total,
    };
  }

  let processed = 0;
  let failed = 0;

  /*
   * Process requests in controlled batches.
   */
  const batchSize = 20;

  for (
    let i = 0;
    i < participants.length;
    i += batchSize
  ) {

    const batch =
      participants.slice(
        i,
        i + batchSize,
      );

    try {

      await sock.groupRequestParticipantsUpdate(
        jid,
        batch,
        action,
      );

      processed +=
        batch.length;

    } catch (err) {

      console.error(
        `Join request ${action} batch error:`,
        err,
      );

      /*
       * Fall back to individual processing.
       */
      for (
        const participant of batch
      ) {

        try {

          await sock.groupRequestParticipantsUpdate(
            jid,
            [participant],
            action,
          );

          processed++;

        } catch (individualError) {

          console.error(
            `Join request ${action} error:`,
            individualError,
          );

          failed++;
        }
      }
    }
  }

  return {
    total,
    processed,
    failed,
  };
}


/* =========================================================
   OWNER COMMANDS
========================================================= */

export async function handleOwnerCommand(
  sock: any,
  jid: string,
  command: string,
  args: string[] = [],
  quotedMessage?: WAMessage,
): Promise<boolean> {

  /*
   * 🌑 DARK VORTEX REPLY ENGINE
   *
   * Every owner-command response uses the centralized
   * native WhatsApp reply system.
   */
  const sendReply = async (
    text: string,
  ) => {
    return await sendVortexReply(
      sock,
      jid,
      text,
      quotedMessage,
    );
  };


  switch (command) {


    /* =====================================================
       👑 OWNER CONTROL PANEL
    ===================================================== */

    case "owner": {

      await sendReply(
        [
          "👑 Owner controls",
          "",
          "Status: Online",
          "Access: Owner only",
          "Security: Active",
          "",
          `System: ${getPrefix()}botinfo • ${getPrefix()}system • ${getPrefix()}runtime • ${getPrefix()}status`,
          `Groups: ${getPrefix()}groups • ${getPrefix()}enable • ${getPrefix()}disable • ${getPrefix()}leave`,
          `Broadcast: ${getPrefix()}broadcast`,
          `Requests: ${getPrefix()}approveall • ${getPrefix()}rejectall`,
          `Lifecycle: ${getPrefix()}restart • ${getPrefix()}shutdown`,
        ].join("\n"),
      );

      return true;
    }


    /* =====================================================
       🤖 BOT INFO
    ===================================================== */

    case "botinfo": {

      await sendReply(
        [
          "🤖 Bot information",
          "",
          "Status: Online",
          "Version: 1.0.0",
          `Prefix: ${getPrefix()}`,
          "Timezone: Africa/Lagos",
          `Runtime: ${formatUptime(process.uptime())}`,
          `Node: ${process.version}`,
          `Platform: ${process.platform}`,
          `Architecture: ${process.arch}`,
          "",
          "Security: Active",
          "Owner-only mode: Active",
          "Protection: Active",
          "Automation: Available",
          "Broadcast: Available",
        ].join("\n"),
      );

      return true;
    }


    /* =====================================================
       ⚙️ SYSTEM
    ===================================================== */

    case "system": {

      const totalMemory =
        os.totalmem();

      const freeMemory =
        os.freemem();

      const usedMemory =
        totalMemory -
        freeMemory;

      const cpuLoad =
        os.loadavg()[0];

      await sendReply(
        [
          "⚙️ System",
          "",
          "Status: Online",
          "Security: Active",
          "Engine: Vortex Core",
          "",
          `Uptime: ${formatUptime(process.uptime())}`,
          `Memory: ${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}`,
          `CPU: ${(cpuLoad * 100).toFixed(1)}%`,
          `OS: ${os.platform()}`,
          `Architecture: ${os.arch()}`,
          `Node: ${process.version}`,
        ].join("\n"),
      );

      return true;
    }


    /* =====================================================
       ⏱️ RUNTIME
    ===================================================== */

    case "runtime": {

      const memory =
        process.memoryUsage();

      await sendReply(
        [
          "⏱️ Runtime",
          "",
          "Status: Online",
          `Uptime: ${formatUptime(process.uptime())}`,
          "",
          `RSS: ${formatBytes(memory.rss)}`,
          `Heap used: ${formatBytes(memory.heapUsed)}`,
          `Heap total: ${formatBytes(memory.heapTotal)}`,
          "",
          `Node: ${process.version}`,
          `Platform: ${process.platform}`,
          `Architecture: ${process.arch}`,
        ].join("\n"),
      );

      return true;
    }


    /* =====================================================
       🟢 STATUS
    ===================================================== */

    case "status": {

      await sendReply(
        [
          "🟢 Dark Vortex status",
          "",
          "Bot: Online",
          "Security: Active",
          "Owner only: Active",
          "Engine: Vortex Core",
          `Prefix: ${getPrefix()}`,
          `Uptime: ${formatUptime(process.uptime())}`,
          "",
          "All core systems operational.",
        ].join("\n"),
      );

      return true;
    }


    /* =====================================================
       👥 GROUP LIST
    ===================================================== */

    case "groups": {

      try {

        const participatingGroups =
          await sock.groupFetchAllParticipating();

        const groups =
          Object.values(
            participatingGroups || {},
          ) as any[];

        if (groups.length === 0) {

          await sendReply(
            [
              "👥 Groups",
              "",
              "Total: 0",
              "No active group sessions found.",
            ].join("\n"),
          );

          return true;
        }

        /*
         * Load the local registry once.
         */
        const registeredGroups =
          await getRegisteredGroups();

        const registryMap =
          new Map(
            registeredGroups.map(
              (group) => [
                group.jid,
                group,
              ],
            ),
          );

        const lines = [
          "👥 Groups",
          "",
          `Total: ${groups.length}`,
          "",
        ];

        for (
          let index = 0;
          index < groups.length;
          index++
        ) {

          const group =
            groups[index];

          if (!group?.id) {
            continue;
          }

          const groupName =
            group.subject ||
            "Unknown Group";

          /*
           * Register newly discovered groups
           * while preserving existing state.
           */
          try {

            await registerGroup(
              group.id,
              groupName,
            );

          } catch (registryError) {

            console.error(
              `Failed to sync group ${group.id}:`,
              registryError,
            );
          }

          const registryEntry =
            registryMap.get(
              group.id,
            );

          const enabled =
            registryEntry?.enabled ??
            true;

          lines.push(
            `${index + 1}. ${groupName}`,
          );

          lines.push(
            `   Management: ${enabled ? "ON" : "OFF"}`,
          );

          lines.push("");
        }

        await sendReply(
          lines.join("\n").trim(),
        );

      } catch (err) {

        console.error(
          "Groups command error:",
          err,
        );

        await sendReply(
          [
            "❌ Group list failed.",
            "",
            "Group data could not be retrieved.",
            "Check the WhatsApp connection and try again.",
          ].join("\n"),
        );
      }

      return true;
    }


    /* =====================================================
       🟢 ENABLE GROUP
    ===================================================== */

    case "enable": {

      if (
        !jid.endsWith("@g.us")
      ) {

        await sendReply(
          [
            "❌ Group only.",
            "",
            "Use this command inside the target group.",
          ].join("\n"),
        );

        return true;
      }

      try {

        const metadata =
          await sock.groupMetadata(
            jid,
          );

        const group =
          await enableGroup(
            jid,
            metadata.subject ||
              "Unknown Group",
          );

        await sendReply(
          [
            "🛡️ Group enabled.",
            "",
            `Group: ${group.name}`,
            "Management: Active",
            "Configuration: Active",
          ].join("\n"),
        );

      } catch (err) {

        console.error(
          "Enable group error:",
          err,
        );

        await sendReply(
          [
            "❌ Enable failed.",
            "",
            "Dark Vortex could not be enabled for this group.",
            "Check the WhatsApp connection and try again.",
          ].join("\n"),
        );
      }

      return true;
    }


    /* =====================================================
       🔴 DISABLE GROUP
    ===================================================== */

    case "disable": {

      if (
        !jid.endsWith("@g.us")
      ) {

        await sendReply(
          [
            "❌ Group only.",
            "",
            "Use this command inside the target group.",
          ].join("\n"),
        );

        return true;
      }

      try {

        const metadata =
          await sock.groupMetadata(
            jid,
          );

        const group =
          await disableGroup(
            jid,
            metadata.subject ||
              "Unknown Group",
          );

        await sendReply(
          [
            "🔴 Group disabled.",
            "",
            `Group: ${group.name}`,
            "Management: Inactive",
          ].join("\n"),
        );

      } catch (err) {

        console.error(
          "Disable group error:",
          err,
        );

        await sendReply(
          [
            "❌ Disable failed.",
            "",
            "Dark Vortex could not be disabled for this group.",
            "Check the WhatsApp connection and try again.",
          ].join("\n"),
        );
      }

      return true;
    }


    /* =====================================================
       🚪 LEAVE GROUP
    ===================================================== */

    case "leave": {

      if (
        !jid.endsWith("@g.us")
      ) {

        await sendReply(
          [
            "❌ Group only.",
            "",
            "Use this command inside the target group.",
          ].join("\n"),
        );

        return true;
      }

      try {

        const metadata =
          await sock.groupMetadata(
            jid,
          );

        const groupName =
          metadata.subject ||
          "Unknown Group";

        await sendReply(
          [
            "🚪 Leaving group...",
            "",
            `Group: ${groupName}`,
            "Configuration: Preserved",
            "Connection: Closing",
          ].join("\n"),
        );

        /*
         * Allow confirmation message to be delivered.
         */
        setTimeout(
          async () => {

            try {

              await sock.groupLeave(
                jid,
              );

              await markGroupLeft(
                jid,
              );

            } catch (err) {

              console.error(
                "Leave group error:",
                err,
              );
            }

          },
          1000,
        );

      } catch (err) {

        console.error(
          "Leave command error:",
          err,
        );

        await sendReply(
          [
            "❌ Leave failed.",
            "",
            "Dark Vortex could not leave this group.",
            "Verify the WhatsApp connection and try again.",
          ].join("\n"),
        );
      }

      return true;
    }


    /* =====================================================
       📡 BROADCAST
    ===================================================== */

    case "broadcast": {

      /*
       * Broadcast remains DM-only.
       */
      if (
        jid.endsWith("@g.us")
      ) {

        await sendReply(
          [
            "❌ DM only.",
            "",
            "Broadcast is available from your private DM.",
            "",
            `Format: ${getPrefix()}broadcast Group Name | Message`,
          ].join("\n"),
        );

        return true;
      }


      const broadcastInput =
        args.join(" ").trim();

      if (
        !broadcastInput.includes("|")
      ) {

        await sendReply(
          [
            "❌ Invalid broadcast.",
            "",
            "A group name and message are required.",
            "",
            `Format: ${getPrefix()}broadcast Group Name | Message`,
            `Example: ${getPrefix()}broadcast My Group | Hello everyone!`,
          ].join("\n"),
        );

        return true;
      }


      const separatorIndex =
        broadcastInput.indexOf("|");

      const groupName =
        broadcastInput
          .slice(0, separatorIndex)
          .trim();

      const message =
        broadcastInput
          .slice(separatorIndex + 1)
          .trim();


      if (!groupName) {

        await sendReply(
          [
            "❌ Group required.",
            "",
            "Enter the exact WhatsApp group name before the | symbol.",
          ].join("\n"),
        );

        return true;
      }


      if (!message) {

        await sendReply(
          [
            "❌ Message required.",
            "",
            "Add your message after the | separator.",
          ].join("\n"),
        );

        return true;
      }


      try {

        const participatingGroups =
          await sock.groupFetchAllParticipating();

        const groups =
          Object.values(
            participatingGroups || {},
          ) as any[];


        /*
         * Case-insensitive exact group-name match.
         */
        const normalizedTarget =
          groupName
            .toLowerCase()
            .trim();

        const matches =
          groups.filter(
            (group) =>
              typeof group?.subject === "string" &&
              group.subject
                .toLowerCase()
                .trim() === normalizedTarget,
          );


        if (
          matches.length === 0
        ) {

          await sendReply(
            [
              "❌ Group not found.",
              "",
              `Target: ${groupName}`,
              "No participating group matched that exact name.",
              "",
              `Use ${getPrefix()}groups to view available groups.`,
            ].join("\n"),
          );

          return true;
        }


        /*
         * Never guess when duplicate group names exist.
         */
        if (
          matches.length > 1
        ) {

          await sendReply(
            [
              "⚠️ Multiple groups found.",
              "",
              `Name: ${groupName}`,
              `Matches: ${matches.length}`,
              "",
              "Rename one of the groups before broadcasting.",
            ].join("\n"),
          );

          return true;
        }


        const targetGroup =
          matches[0];

        const targetJid =
          targetGroup.id;

        const targetName =
          targetGroup.subject ||
          groupName;


        /*
         * IMPORTANT:
         * This is the actual broadcast delivery.
         * It intentionally remains a normal sendMessage().
         */
        await sock.sendMessage(
          targetJid,
          {
            text: message,
          },
        );


        /*
         * The owner's confirmation is a reply.
         */
        await sendReply(
          [
            "📡 Broadcast sent.",
            "",
            `Group: ${targetName}`,
            "Message delivered successfully.",
          ].join("\n"),
        );

      } catch (err) {

        console.error(
          "Broadcast error:",
          err,
        );

        await sendReply(
          [
            "❌ Broadcast failed.",
            "",
            "The message could not be sent.",
            "Verify that Dark Vortex is still connected to WhatsApp.",
          ].join("\n"),
        );
      }

      return true;
    }


    /* =====================================================
       ✅ APPROVE ALL
    ===================================================== */

    case "approveall": {

      if (
        !jid.endsWith("@g.us")
      ) {

        await sendReply(
          [
            "❌ Group only.",
            "",
            "Use this command inside the target group.",
          ].join("\n"),
        );

        return true;
      }


      try {

        const result =
          await processJoinRequests(
            sock,
            jid,
            "approve",
          );


        if (
          result.total === 0
        ) {

          await sendReply(
            [
              "👥 Join requests",
              "",
              "Pending: 0",
              "No pending join requests.",
            ].join("\n"),
          );

          return true;
        }


        await sendReply(
          [
            "✅ Join requests approved.",
            "",
            `Requests: ${result.total}`,
            `Approved: ${result.processed}`,
            `Failed: ${result.failed}`,
          ].join("\n"),
        );

      } catch (err) {

        console.error(
          "Approve all error:",
          err,
        );

        await sendReply(
          [
            "❌ Approval failed.",
            "",
            "Pending join requests could not be processed.",
            "Make sure Dark Vortex is a group administrator.",
          ].join("\n"),
        );
      }

      return true;
    }


    /* =====================================================
       ❌ REJECT ALL
    ===================================================== */

    case "rejectall": {

      if (
        !jid.endsWith("@g.us")
      ) {

        await sendReply(
          [
            "❌ Group only.",
            "",
            "Use this command inside the target group.",
          ].join("\n"),
        );

        return true;
      }


      try {

        const result =
          await processJoinRequests(
            sock,
            jid,
            "reject",
          );


        if (
          result.total === 0
        ) {

          await sendReply(
            [
              "👥 Join requests",
              "",
              "Pending: 0",
              "No pending join requests.",
            ].join("\n"),
          );

          return true;
        }


        await sendReply(
          [
            "❌ Join requests rejected.",
            "",
            `Requests: ${result.total}`,
            `Rejected: ${result.processed}`,
            `Failed: ${result.failed}`,
          ].join("\n"),
        );

      } catch (err) {

        console.error(
          "Reject all error:",
          err,
        );

        await sendReply(
          [
            "❌ Rejection failed.",
            "",
            "Pending join requests could not be processed.",
            "Make sure Dark Vortex is a group administrator.",
          ].join("\n"),
        );
      }

      return true;
    }


    /* =====================================================
       🔄 RESTART
    ===================================================== */

    case "restart": {

      const accepted =
        beginLifecycleAction(
          "restart",
        );


      if (!accepted) {

        await sendReply(
          [
            "⚠️ Lifecycle busy.",
            "",
            "A restart or shutdown operation is already running.",
            "Wait for it to finish first.",
          ].join("\n"),
        );

        return true;
      }


      await sendReply(
        [
          "🔄 Restarting Dark Vortex.",
          "",
          "WhatsApp session: Preserved",
          "Authentication: Preserved",
          "Connection: Closing...",
        ].join("\n"),
      );


      /*
       * Close the active socket after the
       * confirmation message is delivered.
       */
      setTimeout(
        () => {
          void closeActiveSocket();
        },
        500,
      );

      return true;
    }


    /* =====================================================
       🛑 SHUTDOWN
    ===================================================== */

    case "shutdown": {

      const accepted =
        beginLifecycleAction(
          "shutdown",
        );


      if (!accepted) {

        await sendReply(
          [
            "⚠️ Lifecycle busy.",
            "",
            "A restart or shutdown operation is already running.",
            "Wait for it to finish first.",
          ].join("\n"),
        );

        return true;
      }


      await sendReply(
        [
          "🛑 Shutting down Dark Vortex.",
          "",
          "WhatsApp session: Preserved",
          "Authentication: Preserved",
          "Connection: Closing...",
        ].join("\n"),
      );


      /*
       * index.ts handles final process shutdown
       * when the active connection closes.
       */
      setTimeout(
        () => {
          void closeActiveSocket();
        },
        500,
      );

      return true;
    }


    /* =====================================================
       DEFAULT
    ===================================================== */

    default:
      return false;
  }
}


/* =========================================================
   LOCAL FORMATTING HELPERS
========================================================= */

function formatUptime(
  seconds: number,
): string {

  const totalSeconds =
    Math.max(
      0,
      Math.floor(seconds),
    );

  const days =
    Math.floor(
      totalSeconds / 86400,
    );

  const hours =
    Math.floor(
      (totalSeconds % 86400) / 3600,
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60,
    );

  const secs =
    totalSeconds % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs}s`);
  }

  return parts.join(" ");
}


function formatBytes(
  bytes: number,
): string {

  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];

  let value = bytes;
  let unitIndex = 0;

  while (
    value >= 1024 &&
    unitIndex < units.length - 1
  ) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(
    unitIndex === 0 ? 0 : 1,
  )} ${units[unitIndex]}`;
}
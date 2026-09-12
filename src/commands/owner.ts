
import os from "node:os";

import {
  vortexBox,
  system,
  success,
  error,
  formatUptime,
  formatBytes,
} from "../utils/message.js";

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

   Presentation layer only.
   Existing command logic and behavior preserved.
========================================================= */


/* =========================================================
   GROUP JOIN REQUEST HELPERS
========================================================= */

async function getPendingJoinRequests(
  sock: any,
  jid: string
): Promise<any[]> {

  if (
    typeof sock.groupRequestParticipantsList !==
    "function"
  ) {
    throw new Error(
      "WhatsApp join-request API is not available."
    );
  }

  const requests =
    await sock.groupRequestParticipantsList(
      jid
    );

  if (!Array.isArray(requests)) {
    return [];
  }

  return requests;
}


async function processJoinRequests(
  sock: any,
  jid: string,
  action: "approve" | "reject"
): Promise<{
  total: number;
  processed: number;
  failed: number;
}> {

  const requests =
    await getPendingJoinRequests(
      sock,
      jid
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
          request?.jid
      )
      .filter(
        (participant): participant is string =>
          typeof participant === "string" &&
          participant.length > 0
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
        i + batchSize
      );

    try {

      await sock.groupRequestParticipantsUpdate(
        jid,
        batch,
        action
      );

      processed +=
        batch.length;

    } catch (err) {

      console.error(
        `Join request ${action} batch error:`,
        err
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
            action
          );

          processed++;

        } catch (individualError) {

          console.error(
            `Join request ${action} error:`,
            individualError
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
  args: string[] = []
): Promise<boolean> {

  switch (command) {


    /* =====================================================
       👑 OWNER CONTROL PANEL
    ===================================================== */

    case "owner": {

      await sock.sendMessage(
        jid,
        {
          text:
            vortexBox(
              "👑 OWNER CONTROL",
              [
                "🟢 Status: ONLINE",
                "👑 Access: OWNER ONLY",
                "🛡️ Security: ACTIVE",
                "",
                "┣━━〔 ⚙️ SYSTEM 〕",
                `┃ ${getPrefix()}owner`,
                `┃ ${getPrefix()}botinfo`,
                `┃ ${getPrefix()}system`,
                `┃ ${getPrefix()}runtime`,
                `┃ ${getPrefix()}status`,
                "",
                "┣━━〔 👥 GROUP CONTROL 〕",
                `┃ ${getPrefix()}groups`,
                `┃ ${getPrefix()}enable`,
                `┃ ${getPrefix()}disable`,
                `┃ ${getPrefix()}leave`,
                "",
                "┣━━〔 📡 BROADCAST 〕",
                `┃ ${getPrefix()}broadcast`,
                "",
                "┣━━〔 🚪 REQUEST CONTROL 〕",
                `┃ ${getPrefix()}approveall`,
                `┃ ${getPrefix()}rejectall`,
                "",
                "┣━━〔 ⚡ LIFECYCLE 〕",
                `┃ ${getPrefix()}restart`,
                `┃ ${getPrefix()}shutdown`,
              ]
            ),
        }
      );

      return true;
    }


    /* =====================================================
       🤖 BOT INFO
       IMPORTANT:
       Existing botinfo functionality preserved.
    ===================================================== */

    case "botinfo": {

      await sock.sendMessage(
        jid,
        {
          text:
            vortexBox(
              "🤖 BOT INFORMATION",
              [
                "🟢 Status: ONLINE",
                "📦 Version: 1.0.0",
                `🔣 Prefix: ${getPrefix()}`,
                "🌍 Timezone: Africa/Lagos",
                `⏱️ Runtime: ${formatUptime(
                  process.uptime()
                )}`,
                `🟦 Node: ${process.version}`,
                `💻 Platform: ${process.platform}`,
                `🧩 Architecture: ${process.arch}`,
                "",
                "┣━━〔 🛡️ SECURITY 〕",
                "┃ Owner-only mode: ACTIVE",
                "┃ Protection: ACTIVE",
                "┃ Automation: AVAILABLE",
                "┃ Broadcast: AVAILABLE",
              ]
            ),
        }
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

      await sock.sendMessage(
        jid,
        {
          text:
            system(
              "SYSTEM HEALTH",
              [
                "🟢 Core Status: ONLINE",
                "🛡️ Security: ACTIVE",
                "⚡ Engine: VORTEX CORE",
                "",
                `⏱️ Uptime: ${formatUptime(
                  process.uptime()
                )}`,
                `🧠 Memory: ${formatBytes(
                  usedMemory
                )} / ${formatBytes(
                  totalMemory
                )}`,
                `📊 CPU Load: ${(
                  cpuLoad * 100
                ).toFixed(1)}%`,
                `💻 OS: ${os.platform()}`,
                `🏗️ Architecture: ${os.arch()}`,
                `🟦 Node.js: ${process.version}`,
                "",
                "🟢 System operating normally.",
              ]
            ),
        }
      );

      return true;
    }


    /* =====================================================
       ⏱️ RUNTIME
    ===================================================== */

    case "runtime": {

      const memory =
        process.memoryUsage();

      await sock.sendMessage(
        jid,
        {
          text:
            system(
              "RUNTIME INFORMATION",
              [
                "🟢 Status: ONLINE",
                "",
                `⏱️ Uptime: ${formatUptime(
                  process.uptime()
                )}`,
                `💾 RSS: ${formatBytes(
                  memory.rss
                )}`,
                `🧠 Heap Used: ${formatBytes(
                  memory.heapUsed
                )}`,
                `📦 Heap Total: ${formatBytes(
                  memory.heapTotal
                )}`,
                "",
                `🟦 Node.js: ${process.version}`,
                `💻 Platform: ${process.platform}`,
                `🏗️ Architecture: ${process.arch}`,
                "",
                "⚡ Runtime engine is healthy.",
              ]
            ),
        }
      );

      return true;
    }


    /* =====================================================
       🟢 STATUS
    ===================================================== */

    case "status": {

      await sock.sendMessage(
        jid,
        {
          text:
            vortexBox(
              "🟢 DARK VORTEX STATUS",
              [
                "🟢 Bot: ONLINE",
                "🛡️ Security: ACTIVE",
                "👑 Owner Only: ACTIVE",
                "⚡ Engine: VORTEX CORE",
                `🔣 Prefix: ${getPrefix()}`,
                `⏱️ Uptime: ${formatUptime(
                  process.uptime()
                )}`,
                "",
                "🚀 All core systems operational.",
              ]
            ),
        }
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
            participatingGroups || {}
          ) as any[];

        if (groups.length === 0) {

          await sock.sendMessage(
            jid,
            {
              text:
                vortexBox(
                  "👥 GROUP DIRECTORY",
                  [
                    "📊 Total Groups: 0",
                    "",
                    "🟢 No active group sessions found.",
                    "",
                    "Dark Vortex is currently not",
                    "participating in any groups.",
                  ]
                ),
            }
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
              ]
            )
          );

        const lines = [
          `📊 Total Groups: ${groups.length}`,
          "",
          "┣━━〔 📋 GROUP DIRECTORY 〕",
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
              groupName
            );

          } catch (registryError) {

            console.error(
              `Failed to sync group ${group.id}:`,
              registryError
            );
          }

          const registryEntry =
            registryMap.get(
              group.id
            );

          const enabled =
            registryEntry?.enabled ??
            true;

          lines.push(
            `┃ ${index + 1}. ${groupName}`
          );

          lines.push(
            `┃    ${enabled ? "🟢 Management: ON" : "🔴 Management: OFF"}`
          );

          lines.push("");
        }

        await sock.sendMessage(
          jid,
          {
            text:
              vortexBox(
                "👥 GROUP DIRECTORY",
                lines
              ),
          }
        );

      } catch (err) {

        console.error(
          "Groups command error:",
          err
        );

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "GROUP LIST FAILED",
                [
                  "📡 Group data could not be retrieved.",
                  "",
                  "💡 Verify the WhatsApp connection",
                  "and try again.",
                ]
              ),
          }
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

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "GROUP ONLY",
                [
                  "👥 This command requires",
                  "a WhatsApp group.",
                  "",
                  `💡 Use ${getPrefix()}enable`,
                  "inside the target group.",
                ]
              ),
          }
        );

        return true;
      }

      try {

        const metadata =
          await sock.groupMetadata(
            jid
          );

        const group =
          await enableGroup(
            jid,
            metadata.subject ||
              "Unknown Group"
          );

        await sock.sendMessage(
          jid,
          {
            text:
              success(
                "GROUP ENABLED",
                [
                  `👥 Group: ${group.name}`,
                  "",
                  "🟢 Management: ENABLED",
                  "🛡️ Group configuration: ACTIVE",
                  "",
                  "⚡ Dark Vortex is now active",
                  "in this group.",
                ]
              ),
          }
        );

      } catch (err) {

        console.error(
          "Enable group error:",
          err
        );

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "ENABLE FAILED",
                [
                  "⚠️ Dark Vortex could not be",
                  "enabled for this group.",
                  "",
                  "💡 Check the WhatsApp connection",
                  "and try again.",
                ]
              ),
          }
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

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "GROUP ONLY",
                [
                  "👥 This command requires",
                  "a WhatsApp group.",
                  "",
                  `💡 Use ${getPrefix()}disable`,
                  "inside the target group.",
                ]
              ),
          }
        );

        return true;
      }

      try {

        const metadata =
          await sock.groupMetadata(
            jid
          );

        const group =
          await disableGroup(
            jid,
            metadata.subject ||
              "Unknown Group"
          );

        await sock.sendMessage(
          jid,
          {
            text:
              success(
                "GROUP DISABLED",
                [
                  `👥 Group: ${group.name}`,
                  "",
                  "🔴 Management: DISABLED",
                  "🛡️ Local management: INACTIVE",
                  "",
                  "⚠️ Dark Vortex will no longer",
                  "process group management here.",
                ]
              ),
          }
        );

      } catch (err) {

        console.error(
          "Disable group error:",
          err
        );

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "DISABLE FAILED",
                [
                  "⚠️ Dark Vortex could not be",
                  "disabled for this group.",
                  "",
                  "💡 Check the WhatsApp connection",
                  "and try again.",
                ]
              ),
          }
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

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "GROUP ONLY",
                [
                  "👥 This command requires",
                  "a WhatsApp group.",
                  "",
                  `💡 Use ${getPrefix()}leave`,
                  "inside the target group.",
                ]
              ),
          }
        );

        return true;
      }

      try {

        const metadata =
          await sock.groupMetadata(
            jid
          );

        const groupName =
          metadata.subject ||
          "Unknown Group";

        await sock.sendMessage(
          jid,
          {
            text:
              success(
                "LEAVE SEQUENCE",
                [
                  `👥 Group: ${groupName}`,
                  "",
                  "🚪 Leaving group...",
                  "🛡️ Group configuration will remain stored.",
                  "",
                  "⚡ Disconnecting from this group.",
                ]
              ),
          }
        );

        /*
         * Allow confirmation message to be delivered.
         */
        setTimeout(
          async () => {

            try {

              await sock.groupLeave(
                jid
              );

              await markGroupLeft(
                jid
              );

            } catch (err) {

              console.error(
                "Leave group error:",
                err
              );
            }

          },
          1000
        );

      } catch (err) {

        console.error(
          "Leave command error:",
          err
        );

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "LEAVE FAILED",
                [
                  "🚪 Dark Vortex could not leave",
                  "this WhatsApp group.",
                  "",
                  "💡 Verify the connection",
                  "and try again.",
                ]
              ),
          }
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

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "DM ONLY",
                [
                  "📡 Broadcast is available",
                  "from your private DM only.",
                  "",
                  "📝 FORMAT",
                  `${getPrefix()}broadcast Group Name | Message`,
                  "",
                  "💡 Example",
                  `${getPrefix()}broadcast My Group | Hello everyone!`,
                ]
              ),
          }
        );

        return true;
      }


      const broadcastInput =
        args.join(" ").trim();

      if (
        !broadcastInput.includes("|")
      ) {

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "INVALID BROADCAST",
                [
                  "📡 A group name and message",
                  "are required.",
                  "",
                  "📝 FORMAT",
                  `${getPrefix()}broadcast Group Name | Message`,
                  "",
                  "💡 Example",
                  `${getPrefix()}broadcast My Group | Hello everyone!`,
                ]
              ),
          }
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

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "GROUP REQUIRED",
                [
                  "👥 No target group was provided.",
                  "",
                  "💡 Enter the exact WhatsApp",
                  "group name before the | symbol.",
                ]
              ),
          }
        );

        return true;
      }


      if (!message) {

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "MESSAGE REQUIRED",
                [
                  "📝 No broadcast message was provided.",
                  "",
                  "💡 Add your message after",
                  "the | separator.",
                ]
              ),
          }
        );

        return true;
      }


      try {

        const participatingGroups =
          await sock.groupFetchAllParticipating();

        const groups =
          Object.values(
            participatingGroups || {}
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
                .trim() === normalizedTarget
          );


        if (
          matches.length === 0
        ) {

          await sock.sendMessage(
            jid,
            {
              text:
                error(
                  "GROUP NOT FOUND",
                  [
                    `👥 Target: ${groupName}`,
                    "",
                    "❌ No participating group",
                    "matched that exact name.",
                    "",
                    `💡 Use ${getPrefix()}groups`,
                    "to view available groups.",
                  ]
                ),
            }
          );

          return true;
        }


        /*
         * Never guess when duplicate group names exist.
         */
        if (
          matches.length > 1
        ) {

          await sock.sendMessage(
            jid,
            {
              text:
                error(
                  "MULTIPLE GROUPS FOUND",
                  [
                    `👥 Name: ${groupName}`,
                    "",
                    `⚠️ ${matches.length} groups share`,
                    "this exact name.",
                    "",
                    "Rename one of the groups",
                    "before broadcasting.",
                  ]
                ),
            }
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


        await sock.sendMessage(
          targetJid,
          {
            text: message,
          }
        );


        await sock.sendMessage(
          jid,
          {
            text:
              success(
                "BROADCAST SENT",
                [
                  `👥 Group: ${targetName}`,
                  "",
                  "📡 Message delivered successfully.",
                  "",
                  "🟢 Target matched by group name.",
                  "🛡️ No group JID was required.",
                ]
              ),
          }
        );

      } catch (err) {

        console.error(
          "Broadcast error:",
          err
        );

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "BROADCAST FAILED",
                [
                  "📡 The broadcast could not be sent.",
                  "",
                  "💡 Verify that Dark Vortex",
                  "is still connected to WhatsApp.",
                ]
              ),
          }
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

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "GROUP ONLY",
                [
                  "👥 This command requires",
                  "a WhatsApp group.",
                ]
              ),
          }
        );

        return true;
      }


      try {

        const result =
          await processJoinRequests(
            sock,
            jid,
            "approve"
          );


        if (
          result.total === 0
        ) {

          await sock.sendMessage(
            jid,
            {
              text:
                vortexBox(
                  "👥 JOIN REQUESTS",
                  [
                    "📊 Pending: 0",
                    "",
                    "🟢 No pending join requests.",
                    "",
                    "Nothing needs approval.",
                  ]
                ),
            }
          );

          return true;
        }


        await sock.sendMessage(
          jid,
          {
            text:
              success(
                "APPROVAL COMPLETE",
                [
                  `👥 Requests: ${result.total}`,
                  `✅ Approved: ${result.processed}`,
                  `❌ Failed: ${result.failed}`,
                  "",
                  result.failed === 0
                    ? "🟢 All pending requests approved."
                    : "🟡 Approval completed with some failures.",
                ]
              ),
          }
        );

      } catch (err) {

        console.error(
          "Approve all error:",
          err
        );

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "APPROVAL FAILED",
                [
                  "👥 Pending join requests",
                  "could not be processed.",
                  "",
                  "💡 Make sure Dark Vortex",
                  "is a group administrator.",
                ]
              ),
          }
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

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "GROUP ONLY",
                [
                  "👥 This command requires",
                  "a WhatsApp group.",
                ]
              ),
          }
        );

        return true;
      }


      try {

        const result =
          await processJoinRequests(
            sock,
            jid,
            "reject"
          );


        if (
          result.total === 0
        ) {

          await sock.sendMessage(
            jid,
            {
              text:
                vortexBox(
                  "👥 JOIN REQUESTS",
                  [
                    "📊 Pending: 0",
                    "",
                    "🟢 No pending join requests.",
                    "",
                    "Nothing needs rejection.",
                  ]
                ),
            }
          );

          return true;
        }


        await sock.sendMessage(
          jid,
          {
            text:
              success(
                "REJECTION COMPLETE",
                [
                  `👥 Requests: ${result.total}`,
                  `❌ Rejected: ${result.processed}`,
                  `⚠️ Failed: ${result.failed}`,
                  "",
                  result.failed === 0
                    ? "🟢 All pending requests rejected."
                    : "🟡 Rejection completed with some failures.",
                ]
              ),
          }
        );

      } catch (err) {

        console.error(
          "Reject all error:",
          err
        );

        await sock.sendMessage(
          jid,
          {
            text:
              error(
                "REJECTION FAILED",
                [
                  "👥 Pending join requests",
                  "could not be processed.",
                  "",
                  "💡 Make sure Dark Vortex",
                  "is a group administrator.",
                ]
              ),
          }
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
          "restart"
        );


      if (!accepted) {

        await sock.sendMessage(
          jid,
          {
            text:
              vortexBox(
                "⚠️ LIFECYCLE BUSY",
                [
                  "🔄 A restart or shutdown",
                  "operation is already running.",
                  "",
                  "🛡️ Existing lifecycle operation",
                  "must finish first.",
                ]
              ),
          }
        );

        return true;
      }


      await sock.sendMessage(
        jid,
        {
          text:
            success(
              "RESTART SEQUENCE",
              [
                "🔄 Dark Vortex is restarting.",
                "",
                "🛡️ WhatsApp session: PRESERVED",
                "💾 Authentication data: PRESERVED",
                "",
                "⚡ Closing WhatsApp connection...",
                "🚀 Restart signal prepared.",
              ]
            ),
        }
      );


      /*
       * Close the active socket after the
       * confirmation message is delivered.
       */
      setTimeout(
        () => {
          void closeActiveSocket();
        },
        500
      );

      return true;
    }


    /* =====================================================
       🛑 SHUTDOWN
    ===================================================== */

    case "shutdown": {

      const accepted =
        beginLifecycleAction(
          "shutdown"
        );


      if (!accepted) {

        await sock.sendMessage(
          jid,
          {
            text:
              vortexBox(
                "⚠️ LIFECYCLE BUSY",
                [
                  "🛑 A restart or shutdown",
                  "operation is already running.",
                  "",
                  "🛡️ Existing lifecycle operation",
                  "must finish first.",
                ]
              ),
          }
        );

        return true;
      }


      await sock.sendMessage(
        jid,
        {
          text:
            success(
              "SHUTDOWN SEQUENCE",
              [
                "🛑 Dark Vortex is shutting down.",
                "",
                "🛡️ WhatsApp session: PRESERVED",
                "💾 Authentication data: PRESERVED",
                "",
                "⚡ Closing WhatsApp connection...",
                "🔴 Process termination prepared.",
              ]
            ),
        }
      );


      /*
       * index.ts handles final process shutdown
       * when the active connection closes.
       */
      setTimeout(
        () => {
          void closeActiveSocket();
        },
        500
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


/* =========================================================
   🌑 DARK VORTEX — COMMAND REGISTRY

   ⚡ Powered by Vortex Tech

   Central command authority for:
   • Command metadata
   • Aliases
   • Categories
   • Access control
   • Chat scope
   • Confirmation requirements
   • Dangerous-operation flags
   • Enabled/disabled state
   • Automatic command discovery
   • Registry validation

   IMPORTANT:
   This file defines COMMAND AUTHORITY.
   It does not execute commands.

   Execution remains inside the command/service handlers.
========================================================= */


/* =========================================================
   COMMAND CATEGORIES
========================================================= */

export type CommandCategory =
  | "core"
  | "owner"
  | "group"
  | "groupTools"
  | "moderation"
  | "security"
  | "automation"
  | "away";


/* =========================================================
   COMMAND ACCESS
========================================================= */

export type CommandAccess =
  | "public"
  | "user"
  | "owner"
  | "vx"
  | "admin"
  | "group"
  | "groupAdmin"
  | "ownerGroup"
  | "ownerGroupAdmin";


/* =========================================================
   CHAT SCOPE
========================================================= */

export type CommandScope =
  | "any"
  | "private"
  | "group";


/* =========================================================
   COMMAND DEFINITION
========================================================= */

export interface CommandDefinition {
  name: string;

  description: string;

  category: CommandCategory;

  usage?: string;

  aliases?: string[];

  order?: number;

  hidden?: boolean;

  access?: CommandAccess;

  scope?: CommandScope;

  confirmation?: boolean;

  dangerous?: boolean;

  enabled?: boolean;
}


/* =========================================================
   CATEGORY DEFINITION
========================================================= */

export interface CategoryDefinition {
  id: CommandCategory;

  name: string;

  icon: string;

  description: string;

  order: number;
}


/* =========================================================
   CATEGORY REGISTRY
========================================================= */

const CATEGORIES: CategoryDefinition[] = [
  {
    id: "core",
    name: "SYSTEM",
    icon: "⚡",
    description:
      "Core Dark Vortex system commands.",
    order: 1,
  },

  {
    id: "owner",
    name: "OWNER CONTROLS",
    icon: "👑",
    description:
      "Owner-only bot and system controls.",
    order: 2,
  },

  {
    id: "group",
    name: "GROUP MANAGEMENT",
    icon: "👥",
    description:
      "Group administration and management.",
    order: 3,
  },

  {
    id: "groupTools",
    name: "GROUP TOOLS",
    icon: "🛠️",
    description:
      "Utilities for groups and members.",
    order: 4,
  },

  {
    id: "moderation",
    name: "MODERATION",
    icon: "⚔️",
    description:
      "Warnings, bans and moderation tools.",
    order: 5,
  },

  {
    id: "security",
    name: "SECURITY",
    icon: "🛡️",
    description:
      "Protection and security controls.",
    order: 6,
  },

  {
    id: "automation",
    name: "AUTOMATION",
    icon: "🤖",
    description:
      "Automation, triggers and scheduled actions.",
    order: 7,
  },

  {
    id: "away",
    name: "AWAY SYSTEM",
    icon: "🕐",
    description:
      "Away and inactivity management.",
    order: 8,
  },
];


/* =========================================================
   COMMAND REGISTRY
========================================================= */

const COMMANDS: CommandDefinition[] = [

  /* =======================================================
     ⚡ CORE
  ======================================================= */

  {
    name: "menu",
    description:
      "Open the Dark Vortex command center.",
    category: "core",
    usage: "menu",
    aliases: ["commands", "helpme"],
    order: 1,
    access: "public",
    scope: "any",
  },

  {
    name: "help",
    description:
      "Show detailed help for a command.",
    category: "core",
    usage: "help <command>",
    aliases: ["h", "?"],
    order: 2,
    access: "public",
    scope: "any",
  },

  {
    name: "ping",
    description:
      "Check bot response latency.",
    category: "core",
    usage: "ping",
    aliases: ["p"],
    order: 3,
    access: "public",
    scope: "any",
  },

  {
    name: "status",
    description:
      "Publish a WhatsApp text or image status.",
    category: "core",
    usage: "status <text>",
    aliases: ["setstatus"],
    order: 4,
    access: "owner",
    scope: "private",
  },

  {
    name: "botinfo",
    description:
      "Display Dark Vortex system information.",
    category: "core",
    usage: "botinfo",
    aliases: ["info"],
    order: 5,
    access: "public",
    scope: "any",
  },

  {
    name: "session",
    description:
      "Display the current WhatsApp session and connection state.",
    category: "core",
    usage: "session",
    aliases: ["sess"],
    order: 8,
    access: "owner",
    scope: "private",
  },

  {
    name: "system",
    description:
      "Display system and runtime information.",
    category: "core",
    usage: "system",
    aliases: ["sys"],
    order: 6,
    access: "owner",
    scope: "private",
  },

  {
    name: "runtime",
    description:
      "Display current bot runtime information.",
    category: "core",
    usage: "runtime",
    aliases: ["run"],
    order: 7,
    access: "owner",
    scope: "private",
  },

  {
    name: "rest",
    description:
      "Manage Dark Vortex rest mode.",
    category: "core",
    usage: "rest <on|off|status>",
    order: 8,
    access: "owner",
    scope: "private",
  },

  {
    name: "restauto",
    description:
      "Manage automatic rest mode.",
    category: "core",
    usage: "restauto <on|off|status>",
    order: 9,
    access: "owner",
    scope: "private",
  },

  {
    name: "cleanup",
    description:
      "Run safe bot memory cleanup.",
    category: "core",
    usage: "cleanup",
    aliases: ["clean"],
    order: 10,
    access: "owner",
    scope: "private",
    dangerous: false,
  },

  {
    name: "sysdiag",
    description:
      "Run system diagnostics.",
    category: "core",
    usage: "sysdiag",
    aliases: ["diagnostics", "diag"],
    order: 11,
    access: "owner",
    scope: "private",
  },

  {
    name: "insult",
    description:
      "Generate a randomized roast for a selected user.",
    category: "core",
    usage: "insult @user",
    aliases: ["roast"],
    order: 12,
    access: "public",
    scope: "any",
  },

  {
    name: "printinsult",
    description:
      "Generate a randomized roast.",
    category: "core",
    usage: "printinsult @user",
    aliases: ["print"],
    order: 13,
    access: "public",
    scope: "any",
  },


  /* =======================================================
     👑 OWNER
  ======================================================= */

  {
    name: "owner",
    description:
      "Display the configured bot owner.",
    category: "owner",
    usage: "owner",
    aliases: ["creator"],
    order: 1,
    access: "owner",
    scope: "private",
  },

  {
    name: "broadcast",
    description:
      "Send an owner-controlled broadcast.",
    category: "owner",
    usage: "broadcast <message>",
    aliases: ["bc"],
    order: 2,
    access: "owner",
    scope: "private",
    confirmation: true,
    dangerous: true,
  },

  {
    name: "maintenance",
    description:
      "Manage bot maintenance mode.",
    category: "owner",
    usage: "maintenance <on|off|status>",
    aliases: ["maint"],
    order: 3,
    access: "owner",
    scope: "private",
  },

  {
    name: "setprefix",
    description:
      "Change the bot command prefix.",
    category: "owner",
    usage: "setprefix <prefix>",
    aliases: ["prefix"],
    order: 4,
    access: "owner",
    scope: "private",
  },

  {
    name: "approveall",
    description:
      "Approve all pending group join requests.",
    category: "owner",
    usage: "approveall",
    order: 5,
    access: "owner",
    scope: "group",
    confirmation: true,
  },

  {
    name: "rejectall",
    description:
      "Reject all pending group join requests.",
    category: "owner",
    usage: "rejectall",
    order: 6,
    access: "owner",
    scope: "group",
    confirmation: true,
    dangerous: true,
  },

  {
    name: "restart",
    description:
      "Safely restart Dark Vortex.",
    category: "owner",
    usage: "restart",
    aliases: ["reboot"],
    order: 7,
    access: "owner",
    scope: "private",
    confirmation: true,
    dangerous: true,
  },

  {
    name: "shutdown",
    description:
      "Safely shut down Dark Vortex.",
    category: "owner",
    usage: "shutdown",
    aliases: ["stop"],
    order: 8,
    access: "owner",
    scope: "private",
    confirmation: true,
    dangerous: true,
  },

  {
    name: "finalkey",
    description:
      "Manage the protected Finalkey authority.",
    category: "owner",
    usage: "finalkey",
    aliases: ["key"],
    order: 9,
    access: "owner",
    scope: "private",
    hidden: true,
    dangerous: true,
  },

  {
    name: "sync",
    description:
      "Synchronize bot configuration and state.",
    category: "owner",
    usage: "sync",
    aliases: ["synchronize"],
    order: 10,
    access: "owner",
    scope: "private",
  },

  {
    name: "settings",
    description:
      "Display and manage Dark Vortex settings.",
    category: "owner",
    usage: "settings [section]",
    aliases: ["config", "configuration"],
    order: 11,
    access: "owner",
    scope: "private",
  },

  {
    name: "backup",
    description:
      "Create a protected backup of Dark Vortex configuration and settings.",
    category: "owner",
    usage: "backup",
    aliases: ["backupconfig", "savebackup"],
    order: 12,
    access: "owner",
    scope: "private",
    confirmation: true,
  },


  /* =======================================================
     👥 GROUP MANAGEMENT
  ======================================================= */

  {
    name: "groups",
    description:
      "List groups connected to Dark Vortex.",
    category: "owner",
    usage: "groups",
    aliases: ["group-list"],
    order: 1,
    access: "owner",
    scope: "private",
  },

  {
    name: "enable",
    description:
      "Enable Dark Vortex commands in a group.",
    category: "group",
    usage: "enable",
    aliases: ["enablegroup"],
    order: 2,
    access: "owner",
    scope: "group",
  },

  {
    name: "disable",
    description:
      "Disable normal commands in a group.",
    category: "group",
    usage: "disable",
    aliases: ["disablegroup"],
    order: 3,
    access: "owner",
    scope: "group",
  },

  {
    name: "kick",
    description:
      "Remove a selected member from the group.",
    category: "group",
    usage: "kick @user",
    aliases: ["remove"],
    order: 4,
    access: "owner",
    scope: "group",
    confirmation: true,
  },

  {
    name: "kickall",
    description:
      "Remove eligible members from the group.",
    category: "group",
    usage: "kickall",
    order: 5,
    access: "owner",
    scope: "group",
    confirmation: true,
    dangerous: true,
  },

  {
    name: "add",
    description:
      "Add a participant to the group.",
    category: "group",
    usage: "add <number>",
    aliases: ["invite"],
    order: 6,
    access: "owner",
    scope: "group",
  },

  {
    name: "promote",
    description:
      "Promote a member to group administrator.",
    category: "group",
    usage: "promote @user",
    order: 7,
    access: "owner",
    scope: "group",
  },

  {
    name: "promoteall",
    description:
      "Promote eligible members to administrators.",
    category: "group",
    usage: "promoteall",
    order: 8,
    access: "owner",
    scope: "group",
    confirmation: true,
  },

  {
    name: "demote",
    description:
      "Remove administrator privileges from a member.",
    category: "group",
    usage: "demote @user",
    order: 9,
    access: "owner",
    scope: "group",
  },

  {
    name: "demoteall",
    description:
      "Remove administrator privileges from eligible members.",
    category: "group",
    usage: "demoteall",
    order: 10,
    access: "owner",
    scope: "group",
    confirmation: true,
  },

  {
    name: "mute",
    description:
      "Restrict group messaging.",
    category: "group",
    usage: "mute",
    order: 11,
    access: "owner",
    scope: "group",
  },

  {
    name: "unmute",
    description:
      "Open the group for normal messaging.",
    category: "group",
    usage: "unmute",
    order: 12,
    access: "owner",
    scope: "group",
  },

  {
    name: "open",
    description:
      "Allow all members to send messages.",
    category: "group",
    usage: "open",
    order: 13,
    access: "owner",
    scope: "group",
  },

  {
    name: "close",
    description:
      "Restrict messaging to administrators.",
    category: "group",
    usage: "close",
    order: 14,
    access: "owner",
    scope: "group",
  },

  {
    name: "onlyadmins",
    description:
      "Set the group to administrator-only messaging.",
    category: "group",
    usage: "onlyadmins",
    aliases: ["adminonly"],
    order: 15,
    access: "owner",
    scope: "group",
  },

  {
    name: "gctime",
    description:
      "Display group creation information.",
    category: "group",
    usage: "gctime",
    order: 16,
    access: "owner",
    scope: "group",
  },

  {
    name: "lock",
    description:
      "Lock supported group settings.",
    category: "group",
    usage: "lock",
    order: 17,
    access: "owner",
    scope: "group",
  },

  {
    name: "unlock",
    description:
      "Unlock supported group settings.",
    category: "group",
    usage: "unlock",
    order: 18,
    access: "owner",
    scope: "group",
  },

  {
    name: "joinapproval",
    description:
      "Manage group join approval.",
    category: "group",
    usage: "joinapproval <on|off>",
    aliases: ["joinapprove"],
    order: 19,
    access: "owner",
    scope: "group",
  },

  {
    name: "requests",
    description:
      "List pending group join requests.",
    category: "group",
    usage: "requests",
    aliases: ["joinrequests"],
    order: 20,
    access: "owner",
    scope: "group",
  },

  {
    name: "approve",
    description:
      "Approve a group join request.",
    category: "group",
    usage: "approve <number>",
    order: 21,
    access: "owner",
    scope: "group",
  },

  {
    name: "reject",
    description:
      "Reject a group join request.",
    category: "group",
    usage: "reject <number>",
    order: 22,
    access: "owner",
    scope: "group",
  },


  /* =======================================================
     🛠️ GROUP TOOLS
  ======================================================= */

  {
    name: "groupinfo",
    description:
      "Display detailed group information.",
    category: "groupTools",
    usage: "groupinfo",
    aliases: ["ginfo"],
    order: 1,
    access: "owner",
    scope: "group",
  },

  {
    name: "admins",
    description:
      "List group administrators.",
    category: "groupTools",
    usage: "admins",
    aliases: ["adminlist"],
    order: 2,
    access: "owner",
    scope: "group",
  },

  {
    name: "members",
    description:
      "List group members.",
    category: "groupTools",
    usage: "members",
    aliases: ["memberlist"],
    order: 3,
    access: "owner",
    scope: "group",
  },

  {
    name: "whois",
    description:
      "Display detailed information about a selected group member.",
    category: "groupTools",
    usage: "whois @user",
    aliases: ["userinfo", "user"],
    order: 4,
    access: "owner",
    scope: "group",
  },

  {
    name: "deleteallfrom",
    description:
      "Delete eligible messages from a selected participant.",
    category: "groupTools",
    usage: "deleteallfrom @user",
    aliases: ["deletefrom"],
    order: 4,
    access: "owner",
    scope: "group",
    confirmation: true,
    dangerous: true,
  },

  {
    name: "nonadmins",
    description:
      "List group members who are not administrators.",
    category: "groupTools",
    usage: "nonadmins",
    order: 5,
    access: "owner",
    scope: "group",
  },

  {
    name: "tagall",
    description:
      "Mention eligible group members.",
    category: "groupTools",
    usage: "tagall <message>",
    aliases: ["everyone"],
    order: 6,
    access: "owner",
    scope: "group",
  },

  {
    name: "hidetag",
    description:
      "Send a message while mentioning group members.",
    category: "groupTools",
    usage: "hidetag <message>",
    aliases: ["silenttag"],
    order: 7,
    access: "owner",
    scope: "group",
  },

  {
    name: "link",
    description:
      "Generate a group invite link.",
    category: "groupTools",
    usage: "link",
    aliases: [""],
    order: 8,
    access: "owner",
    scope: "group",
  },

  {
    name: "getlink",
    description:
      "Get the current group invite link.",
    category: "groupTools",
    usage: "getlink",
    aliases: ["grouplink"],
    order: 9,
    access: "owner",
    scope: "group",
  },

  {
    name: "revoke",
    description:
      "Revoke the current group invite link.",
    category: "groupTools",
    usage: "revoke",
    aliases: ["revokelink"],
    order: 10,
    access: "owner",
    scope: "group",
    confirmation: true,
  },

  {
    name: "setpp",
    description:
      "Change the group profile picture.",
    category: "groupTools",
    usage: "setpp",
    aliases: ["setprofile"],
    order: 11,
    access: "owner",
    scope: "group",
  },

  {
    name: "setname",
    description:
      "Change the group subject.",
    category: "groupTools",
    usage: "setname <name>",
    aliases: ["groupname"],
    order: 12,
    access: "owner",
    scope: "group",
  },

  {
    name: "setdesc",
    description:
      "Change the group description.",
    category: "groupTools",
    usage: "setdesc <description>",
    aliases: ["groupdesc"],
    order: 13,
    access: "owner",
    scope: "group",
  },

  {
    name: "getjid",
    description:
      "Display the current chat JID.",
    category: "groupTools",
    usage: "getjid",
    aliases: ["jid"],
    order: 14,
    access: "owner",
    scope: "any",
  },

  {
    name: "vcf",
    description:
      "Export the current group's members as a VCF contact file.",
    category: "groupTools",
    usage: "vcf",
    aliases: ["contacts", "exportvcf"],
    order: 15,
    access: "owner",
    scope: "group",
  },


  /* =======================================================
     ⚔️ MODERATION
  ======================================================= */

  {
    name: "warn",
    description:
      "Warn a group member.",
    category: "moderation",
    usage: "warn @user <reason>",
    aliases: ["warning"],
    order: 1,
    access: "owner",
    scope: "group",
  },

  {
    name: "warnings",
    description:
      "Display warnings for a member.",
    category: "moderation",
    usage: "warnings @user",
    aliases: ["warns"],
    order: 2,
    access: "owner",
    scope: "group",
  },

  {
    name: "resetwarn",
    description:
      "Reset warnings for a member.",
    category: "moderation",
    usage: "resetwarn @user",
    aliases: ["resetwarnings"],
    order: 3,
    access: "owner",
    scope: "group",
  },

  {
    name: "clearwarn",
    description:
      "Clear warning records.",
    category: "moderation",
    usage: "clearwarn",
    aliases: ["clearwarnings"],
    order: 4,
    access: "owner",
    scope: "group",
    confirmation: true,
  },

  {
    name: "warnlimit",
    description:
      "Configure warning limits.",
    category: "moderation",
    usage: "warnlimit <number>",
    order: 5,
    access: "owner",
    scope: "private",
  },

  {
    name: "ban",
    description:
      "Ban a participant.",
    category: "moderation",
    usage: "ban @user",
    aliases: ["blockuser"],
    order: 6,
    access: "owner",
    scope: "group",
  },

  {
    name: "unban",
    description:
      "Remove a participant from the ban list.",
    category: "moderation",
    usage: "unban @user",
    aliases: ["unblockuser"],
    order: 7,
    access: "owner",
    scope: "group",
  },

  {
    name: "banned",
    description:
      "Display banned participants.",
    category: "moderation",
    usage: "banned",
    aliases: ["banlist"],
    order: 8,
    access: "owner",
    scope: "group",
  },

  {
    name: "clearbans",
    description:
      "Clear the ban list.",
    category: "moderation",
    usage: "clearbans",
    order: 9,
    access: "owner",
    scope: "group",
    confirmation: true,
    dangerous: true,
  },


  /* =======================================================
     🛡️ SECURITY
  ======================================================= */
  {
    name: "security",
    description:
      "Display the live VORTEX security status dashboard.",
    category: "security",
    usage: "security",
    aliases: ["secstatus", "securitystatus"],
    order: 1,
    access: "vx",
    scope: "any",
  },

  {
    name: "antilink",
    description:
      "Manage anti-link protection.",
    category: "security",
    usage: "antilink <on|off|status>",
    order: 2,
    access: "owner",
    scope: "group",
  },

  {
    name: "antigrouplink",
    description:
      "Manage anti-group-link protection.",
    category: "security",
    usage: "antigrouplink <on|off|status>",
    order: 3,
    access: "owner",
    scope: "group",
  },

  {
    name: "antistatus",
    description:
      "Manage anti-status protection.",
    category: "security",
    usage: "antistatus <on|off|status>",
    aliases: ["antistatusmention"],
    order: 3,
    access: "owner",
    scope: "group",
  },

  {
    name: "antispam",
    description:
      "Manage anti-spam protection.",
    category: "security",
    usage: "antispam <on|off|status>",
    order: 4,
    access: "owner",
    scope: "group",
  },

  {
    name: "antibot",
    description:
      "Manage automatic bot detection.",
    category: "security",
    usage: "antibot <on|off|status>",
    order: 5,
    access: "owner",
    scope: "group",
  },

  {
    name: "antimention",
    description:
      "Manage anti-mention protection.",
    category: "security",
    usage: "antimention <on|off|status>",
    order: 6,
    access: "owner",
    scope: "group",
  },

  {
    name: "antiflood",
    description:
      "Manage flood protection.",
    category: "security",
    usage: "antiflood <on|off|status>",
    order: 7,
    access: "owner",
    scope: "group",
  },

  {
    name: "antifake",
    description:
      "Manage suspicious-account protection.",
    category: "security",
    usage: "antifake <on|off|status>",
    order: 8,
    access: "owner",
    scope: "group",
  },

  {
    name: "antinsfw",
    description:
      "Manage NSFW media protection.",
    category: "security",
    usage: "antinsfw <on|off|status>",
    order: 9,
    access: "owner",
    scope: "group",
  },

  {
    name: "protection",
    description:
      "Manage the group protection system.",
    category: "security",
    usage: "protection <on|off|status>",
    aliases: ["protect"],
    order: 10,
    access: "owner",
    scope: "group",
  },

  {
    name: "panel",
    description:
      "Open the Dark Vortex security tools panel.",
    category: "security",
    usage: "panel",
    aliases: ["securitypanel"],
    order: 11,
    access: "owner",
    scope: "private",
  },

  {
    name: "ipinfo",
    description:
      "Display the bot server's local network information.",
    category: "security",
    usage: "ipinfo",
    order: 12,
    access: "owner",
    scope: "private",
  },

  {
    name: "jhost",
    description:
      "Display bot server hostname and network diagnostics.",
    category: "security",
    usage: "jhost",
    aliases: ["hostinfo"],
    order: 13,
    access: "owner",
    scope: "private",
  },

  {
    name: "dns",
    description:
      "Resolve a hostname using DNS.",
    category: "security",
    usage: "dns <domain>",
    order: 14,
    access: "owner",
    scope: "private",
  },

  {
    name: "uptime",
    description:
      "Display Dark Vortex and host uptime.",
    category: "security",
    usage: "uptime",
    order: 15,
    access: "owner",
    scope: "private",
  },

  {
    name: "health",
    description:
      "Display Dark Vortex system health.",
    category: "security",
    usage: "health",
    order: 16,
    access: "owner",
    scope: "private",
  },


  /* =======================================================
     🧠 VX INTELLIGENCE
  ======================================================= */

  {
    name: "vxscan",
    description:
      "Run a full VX security intelligence scan.",
    category: "security",
    usage: "vxscan",
    order: 20,
    access: "vx",
    scope: "group",
    confirmation: true,
  },

  {
    name: "vxmonitor",
    description:
      "Monitor a group for security activity.",
    category: "security",
    usage: "vxmonitor <on|off|status>",
    order: 21,
    access: "vx",
    scope: "group",
  },

  {
    name: "vxbot",
    description:
      "Analyze suspicious bot activity.",
    category: "security",
    usage: "vxbot",
    order: 22,
    access: "vx",
    scope: "group",
    confirmation: true,
  },

  {
    name: "vxincident",
    description:
      "Create or inspect a VX security incident.",
    category: "security",
    usage: "vxincident",
    order: 23,
    access: "vx",
    scope: "any",
  },

  {
    name: "vxincidents",
    description:
      "List recorded VX security incidents.",
    category: "security",
    usage: "vxincidents",
    order: 24,
    access: "vx",
    scope: "private",
  },

  {
    name: "vxabort",
    description:
      "Abort an active VX operation.",
    category: "security",
    usage: "vxabort",
    order: 25,
    access: "vx",
    scope: "any",
  },

  {
    name: "vxresume",
    description:
      "Resume a suspended VX operation.",
    category: "security",
    usage: "vxresume",
    order: 26,
    access: "vx",
    scope: "any",
  },

  {
    name: "vxstatus",
    description:
      "Display VX security status.",
    category: "security",
    usage: "vxstatus",
    order: 27,
    access: "vx",
    scope: "any",
  },

  {
    name: "vxhealth",
    description:
      "Display VX health information.",
    category: "security",
    usage: "vxhealth",
    order: 28,
    access: "vx",
    scope: "any",
  },

  {
    name: "vxlogs",
    description:
      "Display VX security logs.",
    category: "security",
    usage: "vxlogs",
    order: 29,
    access: "vx",
    scope: "private",
  },

  {
    name: "vxstats",
    description:
      "Display VX security statistics.",
    category: "security",
    usage: "vxstats",
    order: 30,
    access: "vx",
    scope: "any",
  },

  {
    name: "vxreport",
    description:
      "Generate a VX management report.",
    category: "security",
    usage: "vxreport",
    order: 31,
    access: "vx",
    scope: "private",
  },

  {
    name: "vxhelp",
    description:
      "Display VX command information.",
    category: "security",
    usage: "vxhelp",
    order: 32,
    access: "vx",
    scope: "private",
  },

  {
    name: "checkbot",
    description:
      "Check a selected account for bot indicators.",
    category: "security",
    usage: "checkbot @user",
    aliases: ["botcheck"],
    order: 33,
    access: "vx",
    scope: "group",
  },

  {
    name: "scanbot",
    description:
      "Scan a group for suspicious bot activity.",
    category: "security",
    usage: "scanbot",
    aliases: ["botscan"],
    order: 34,
    access: "vx",
    scope: "group",
    confirmation: true,
  },

  {
    name: "progress",
    description:
      "Display the active or latest VX operation.",
    category: "security",
    usage: "progress",
    aliases: ["vxprogress"],
    order: 35,
    access: "vx",
    scope: "any",
  },

  {
    name: "latency",
    description:
      "Measure Dark Vortex WhatsApp send-response latency.",
    category: "security",
    usage: "latency",
    aliases: ["lat"],
    order: 36,
    access: "vx",
    scope: "any",
  },

  {
    name: "audit",
    description:
      "Display an operation audit trail.",
    category: "security",
    usage: "audit [operation-id]",
    aliases: ["vxaudit"],
    order: 36,
    access: "vx",
    scope: "any",
  },

  {
    name: "iptrace",
    description:
      "Inspect supported IP-related intelligence.",
    category: "security",
    usage: "iptrace <target>",
    aliases: ["traceip"],
    order: 37,
    access: "vx",
    scope: "private",
    confirmation: true,
  },

  {
    name: "s9",
    description:
      "Run the protected VX S9 security operation.",
    category: "security",
    usage: "s9",
    order: 38,
    access: "vx",
    scope: "private",
    confirmation: true,
    dangerous: true,
  },

  {
    name: "audituser",
    description:
      "Audit activity associated with a user.",
    category: "security",
    usage: "audituser @user",
    order: 39,
    access: "vx",
    scope: "private",
  },

  {
    name: "auditgroup",
    description:
      "Audit security activity associated with a group.",
    category: "security",
    usage: "auditgroup",
    order: 40,
    access: "vx",
    scope: "group",
  },

  {
    name: "timeline",
    description:
      "Display the security event timeline.",
    category: "security",
    usage: "timeline",
    aliases: ["vxtimeline"],
    order: 41,
    access: "vx",
    scope: "any",
  },

  {
    name: "event",
    description:
      "Inspect security events.",
    category: "security",
    usage: "event [id]",
    aliases: ["events"],
    order: 42,
    access: "vx",
    scope: "any",
  },

  {
    name: "evidence",
    description:
      "Inspect collected security evidence.",
    category: "security",
    usage: "evidence [id]",
    aliases: ["vxevidence"],
    order: 43,
    access: "vx",
    scope: "any",
  },

  {
    name: "snapshots",
    description:
      "Display security snapshots.",
    category: "security",
    usage: "snapshots",
    order: 44,
    access: "vx",
    scope: "private",
  },

  {
    name: "snapshot",
    description:
      "Create or inspect a security snapshot.",
    category: "security",
    usage: "snapshot",
    order: 45,
    access: "vx",
    scope: "private",
  },

  {
    name: "lockdown",
    description:
      "Activate protected security lockdown.",
    category: "security",
    usage: "lockdown",
    order: 46,
    access: "vx",
    scope: "private",
    confirmation: true,
    dangerous: true,
  },

  {
    name: "failsafe",
    description:
      "Manage security failsafe protection.",
    category: "security",
    usage: "failsafe <on|off|status>",
    order: 47,
    access: "vx",
    scope: "private",
  },

  {
    name: "quiet",
    description:
      "Manage quiet security mode.",
    category: "security",
    usage: "quiet <on|off|status>",
    order: 48,
    access: "vx",
    scope: "private",
  },

  {
    name: "securitypause",
    description:
      "Pause active security enforcement.",
    category: "security",
    usage: "securitypause",
    order: 49,
    access: "vx",
    scope: "private",
    confirmation: true,
    dangerous: true,
  },

  {
    name: "normal",
    description:
      "Restore normal security operation.",
    category: "security",
    usage: "normal",
    order: 50,
    access: "vx",
    scope: "private",
  },

  {
    name: "securitytest",
    description:
      "Run the security system test suite.",
    category: "security",
    usage: "securitytest",
    aliases: ["sectest"],
    order: 51,
    access: "vx",
    scope: "private",
  },

  {
    name: "recovery",
    description:
      "Inspect or initiate safe recovery procedures.",
    category: "security",
    usage: "recovery",
    order: 52,
    access: "vx",
    scope: "private",
    confirmation: true,
  },


  /* =======================================================
     🤖 AUTOMATION
  ======================================================= */

  {
    name: "welcome",
    description:
      "Manage automatic welcome messages.",
    category: "automation",
    usage: "welcome <on|off|status>",
    order: 1,
    access: "owner",
    scope: "group",
  },

  {
    name: "goodbye",
    description:
      "Manage automatic goodbye messages.",
    category: "automation",
    usage: "goodbye <on|off|status>",
    order: 2,
    access: "owner",
    scope: "group",
  },

  {
    name: "setwelcome",
    description:
      "Configure the group welcome message.",
    category: "automation",
    usage: "setwelcome <message>",
    order: 3,
    access: "owner",
    scope: "group",
  },

  {
    name: "setgoodbye",
    description:
      "Configure the group goodbye message.",
    category: "automation",
    usage: "setgoodbye <message>",
    order: 4,
    access: "owner",
    scope: "group",
  },

  {
    name: "autoreply",
    description:
      "Manage automatic replies.",
    category: "automation",
    usage: "autoreply <on|off|status>",
    order: 5,
    access: "owner",
    scope: "any",
  },

  {
    name: "automation",
    description:
      "Manage automation settings.",
    category: "automation",
    usage: "automation <on|off|status>",
    aliases: ["auto"],
    order: 6,
    access: "owner",
    scope: "any",
  },

  {
    name: "trigger",
    description:
      "Manage message triggers.",
    category: "automation",
    usage: "trigger",
    aliases: ["triggers"],
    order: 7,
    access: "owner",
    scope: "any",
  },

  {
    name: "announce",
    description:
      "Send an announcement.",
    category: "automation",
    usage: "announce <message>",
    aliases: ["announcement"],
    order: 8,
    access: "owner",
    scope: "group",
  },

  {
    name: "slowmode",
    description:
      "Manage group slow mode.",
    category: "automation",
    usage: "slowmode <seconds>",
    order: 9,
    access: "owner",
    scope: "group",
  },

  {
    name: "report",
    description:
      "Prepare a Dark Vortex management report.",
    category: "automation",
    usage: "report",
    aliases: ["managementreport"],
    order: 10,
    access: "owner",
    scope: "private",
  },

  {
    name: "abortreport",
    description:
      "Abort a pending management report.",
    category: "automation",
    usage: "abortreport",
    aliases: ["cancelreport"],
    order: 11,
    access: "owner",
    scope: "private",
  },


  /* =======================================================
     🕐 AWAY
  ======================================================= */

  {
    name: "away",
    description:
      "Manage owner away mode.",
    category: "away",
    usage: "away <on|off|status>",
    order: 1,
    access: "owner",
    scope: "private",
  },

  {
    name: "setaway",
    description:
      "Set the private away message.",
    category: "away",
    usage: "setaway <message>",
    order: 2,
    access: "owner",
    scope: "private",
  },

  {
    name: "setgroupaway",
    description:
      "Set the group away message.",
    category: "away",
    usage: "setgroupaway <message>",
    order: 3,
    access: "owner",
    scope: "private",
  },
];


/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeCommandName(
  value: string,
): string {
  return String(value || "")
    .trim()
    .replace(/^[^\p{L}\p{N}_-]+/u, "")
    .toLowerCase();
}

/* =========================================================
   INTERNAL COMMAND INDEX
========================================================= */

const COMMAND_INDEX = new Map<
  string,
  CommandDefinition
>();


for (const command of COMMANDS) {
  COMMAND_INDEX.set(
    normalizeCommandName(command.name),
    command,
  );

  for (const alias of command.aliases ?? []) {
    COMMAND_INDEX.set(
      normalizeCommandName(alias),
      command,
    );
  }
}


/* =========================================================
   COMMAND LOOKUP
========================================================= */

export function getCommand(
  name: string,
): CommandDefinition | undefined {
  const normalized =
    normalizeCommandName(name);

  if (!normalized) {
    return undefined;
  }

  const direct =
    COMMAND_INDEX.get(normalized);

  if (direct) {
    return direct;
  }

  // Fallback: compare against every registered
  // command and alias using the same normalization.
  for (const command of COMMANDS) {
    if (
      normalizeCommandName(command.name) ===
      normalized
    ) {
      return command;
    }

    for (const alias of command.aliases ?? []) {
      if (
        normalizeCommandName(alias) ===
        normalized
      ) {
        return command;
      }
    }
  }

  return undefined;
}

/* =========================================================
   GET ALL COMMANDS
========================================================= */

export function getCommands(): CommandDefinition[] {
  return [...COMMANDS].sort(
    (a, b) => {
      const categoryA =
        getCategoryOrder(a.category);

      const categoryB =
        getCategoryOrder(b.category);

      if (categoryA !== categoryB) {
        return categoryA - categoryB;
      }

      return (
        (a.order ?? 9999) -
        (b.order ?? 9999)
      );
    },
  );
}


/* =========================================================
   GET CATEGORY COMMANDS
========================================================= */

export function getCommandsByCategory(
  category: CommandCategory,
): CommandDefinition[] {
  return COMMANDS
    .filter(
      command =>
        command.category === category,
    )
    .sort(
      (a, b) =>
        (a.order ?? 9999) -
        (b.order ?? 9999),
    );
}


/* =========================================================
   GET CATEGORY
========================================================= */

export function getCategory(
  category: CommandCategory,
): CategoryDefinition | undefined {
  return CATEGORIES.find(
    item =>
      item.id === category,
  );
}


/* =========================================================
   GET ALL CATEGORIES
========================================================= */

export function getCategories(): CategoryDefinition[] {
  return [...CATEGORIES].sort(
    (a, b) =>
      a.order - b.order,
  );
}


/* =========================================================
   CATEGORY ORDER
========================================================= */

function getCategoryOrder(
  category: CommandCategory,
): number {
  return (
    getCategory(category)?.order ??
    9999
  );
}


/* =========================================================
   ACCESS HELPERS
========================================================= */

export function isOwnerCommand(
  command: CommandDefinition,
): boolean {
  return command.access === "owner";
}


export function isVxCommand(
  command: CommandDefinition,
): boolean {
  return command.access === "vx";
}


export function isAdminCommand(
  command: CommandDefinition,
): boolean {
  return (
    command.access === "admin" ||
    command.access === "groupAdmin" ||
    command.access === "ownerGroupAdmin"
  );
}


export function isPublicCommand(
  command: CommandDefinition,
): boolean {
  return command.access === "public";
}


/* =========================================================
   USER ACCESS
========================================================= */

export function isUserCommand(
  command: CommandDefinition,
): boolean {
  return command.access === "user";
}


/* =========================================================
   GROUP ACCESS
========================================================= */

export function isGroupAccessCommand(
  command: CommandDefinition,
): boolean {
  return (
    command.access === "group" ||
    command.access === "groupAdmin" ||
    command.access === "ownerGroup" ||
    command.access === "ownerGroupAdmin"
  );
}


/* =========================================================
   COMMAND ACCESS RESOLVER
========================================================= */

export function getCommandAccess(
  command: CommandDefinition | string,
): CommandAccess {
  if (typeof command === "string") {
    return (
      getCommand(command)?.access ??
      "public"
    );
  }

  return command.access ?? "public";
}


/* =========================================================
   SCOPE HELPERS
========================================================= */

export function isGroupCommand(
  command: CommandDefinition,
): boolean {
  return command.scope === "group";
}


export function isPrivateCommand(
  command: CommandDefinition,
): boolean {
  return command.scope === "private";
}


export function isAnyScopeCommand(
  command: CommandDefinition,
): boolean {
  return (
    command.scope === undefined ||
    command.scope === "any"
  );
}


/* =========================================================
   COMMAND ENABLE STATE
========================================================= */

export function isCommandEnabled(
  command: CommandDefinition,
): boolean {
  return command.enabled !== false;
}


/* =========================================================
   COMMAND FLAGS
========================================================= */

export function requiresConfirmation(
  command: CommandDefinition,
): boolean {
  return command.confirmation === true;
}


export function isDangerousCommand(
  command: CommandDefinition,
): boolean {
  return command.dangerous === true;
}


export function isHiddenCommand(
  command: CommandDefinition,
): boolean {
  return command.hidden === true;
}


/* =========================================================
   VX COMMAND LIST
========================================================= */

export function getVxCommands(): CommandDefinition[] {
  return getCommands().filter(
    command =>
      isVxCommand(command),
  );
}


/* =========================================================
   OWNER COMMAND LIST
========================================================= */

export function getOwnerCommands(): CommandDefinition[] {
  return getCommands().filter(
    command =>
      isOwnerCommand(command),
  );
}


/* =========================================================
   PUBLIC COMMAND LIST
========================================================= */

export function getPublicCommands(): CommandDefinition[] {
  return getCommands().filter(
    command =>
      isPublicCommand(command),
  );
}


/* =========================================================
   USER COMMAND LIST
========================================================= */

export function getUserCommands(): CommandDefinition[] {
  return getCommands().filter(
    command =>
      isUserCommand(command),
  );
}


/* =========================================================
   ENABLED COMMAND LIST
========================================================= */

export function getEnabledCommands(): CommandDefinition[] {
  return getCommands().filter(
    command =>
      isCommandEnabled(command),
  );
}


/* =========================================================
   VISIBLE COMMAND LIST
========================================================= */

export function getVisibleCommands(): CommandDefinition[] {
  return getCommands().filter(
    command =>
      isCommandEnabled(command) &&
      !isHiddenCommand(command),
  );
}


/* =========================================================
   COMMAND IDENTIFIERS
========================================================= */

function collectCommandIdentifiers(
  command: CommandDefinition,
): string[] {
  return [
    command.name,
    ...(command.aliases ?? []),
  ]
    .map(normalizeCommandName)
    .filter(Boolean);
}


/* =========================================================
   REGISTRY VALIDATION
========================================================= */

export function validateCommandRegistry(): void {
  const seen =
    new Map<string, string>();

  for (const command of COMMANDS) {
    const name =
      normalizeCommandName(
        command.name,
      );

    if (!name) {
      throw new Error(
        "Command registry contains a command with an empty name.",
      );
    }

    if (!command.description.trim()) {
      throw new Error(
        `Command "${command.name}" has no description.`,
      );
    }

    if (
      !CATEGORIES.some(
        category =>
          category.id ===
          command.category,
      )
    ) {
      throw new Error(
        `Command "${command.name}" uses an invalid category "${command.category}".`,
      );
    }

    const identifiers =
      collectCommandIdentifiers(
        command,
      );

    for (const identifier of identifiers) {
      const existing =
        seen.get(identifier);

      if (existing) {
        throw new Error(
          `Duplicate command/alias "${identifier}" found in "${existing}" and "${command.name}".`,
        );
      }

      seen.set(
        identifier,
        command.name,
      );
    }

    if (
      command.confirmation &&
      command.access === "public"
    ) {
      throw new Error(
        `Public command "${command.name}" cannot require protected confirmation.`,
      );
    }

    if (
      command.dangerous &&
      command.access === "public"
    ) {
      throw new Error(
        `Public command "${command.name}" cannot be marked dangerous.`,
      );
    }

    if (
      command.scope === "private" &&
      command.category === "group"
    ) {
      throw new Error(
        `Group command "${command.name}" cannot use private scope.`,
      );
    }

    if (
      command.scope === "group" &&
      command.access === "public"
    ) {
      throw new Error(
        `Public command "${command.name}" cannot directly require group-only scope.`,
      );
    }
  }
}


/* =========================================================
   STARTUP VALIDATION
========================================================= */

validateCommandRegistry();


/* =========================================================
   IMMUTABLE REGISTRY
========================================================= */

export const commandRegistry =
  Object.freeze(
    getCommands().map(
      command =>
        Object.freeze({
          ...command,

          aliases:
            command.aliases
              ? Object.freeze([
                  ...command.aliases,
                ])
              : undefined,
        }),
    ),
  );


/* =========================================================
   REGISTRY STATS
========================================================= */

export interface CommandRegistryStats {
  total: number;
  enabled: number;
  visible: number;
  hidden: number;
  public: number;
  user: number;
  owner: number;
  vx: number;
  admin: number;
  group: number;
  private: number;
}


export function getCommandRegistryStats(): CommandRegistryStats {
  const commands =
    getCommands();

  return {
    total: commands.length,

    enabled:
      commands.filter(
        isCommandEnabled,
      ).length,

    visible:
      commands.filter(
        command =>
          isCommandEnabled(command) &&
          !isHiddenCommand(command),
      ).length,

    hidden:
      commands.filter(
        isHiddenCommand,
      ).length,

    public:
      commands.filter(
        command =>
          command.access === "public",
      ).length,

    user:
      commands.filter(
        command =>
          command.access === "user",
      ).length,

    owner:
      commands.filter(
        command =>
          command.access === "owner",
      ).length,

    vx:
      commands.filter(
        command =>
          command.access === "vx",
      ).length,

    admin:
      commands.filter(
        command =>
          isAdminCommand(command),
      ).length,

    group:
      commands.filter(
        command =>
          command.scope === "group",
      ).length,

    private:
      commands.filter(
        command =>
          command.scope === "private",
      ).length,
  };
}


/* =========================================================
   🌑 DARK VORTEX
   ⚡ Powered by Vortex Tech
========================================================= */
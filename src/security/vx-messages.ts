import {
  VX_ICONS,
  VX_STATUS,
  formatVxMessage,
} from "../security/vx-formatter.js";

export const VX_MESSAGES = {
  scan: {
    starting: (group: string) =>
      formatVxMessage(
        `${VX_ICONS.scan} SECURITY SCAN`,
        [
          `${VX_ICONS.target} *Target:* ${group}`,
          "",
          `${VX_ICONS.engine} VX security engine initialized.`,
          `${VX_ICONS.scan} Scanning group activity...`,
          "",
          `Please wait while VX analyzes the target.`,
        ].join("\n"),
        {
          status: VX_STATUS.SCANNING,
        },
      ),

    progress: (
      group: string,
      percent: number,
    ) =>
      formatVxMessage(
        `${VX_ICONS.scan} SECURITY SCAN`,
        [
          `${VX_ICONS.target} *Target:* ${group}`,
          "",
          `${VX_ICONS.scan} Scan in progress`,
          `📊 *Progress:* ${percent}%`,
        ].join("\n"),
        {
          status: VX_STATUS.SCANNING,
        },
      ),

    almostDone: (group: string) =>
      formatVxMessage(
        `${VX_ICONS.scan} SECURITY SCAN`,
        [
          `${VX_ICONS.target} *Target:* ${group}`,
          "",
          `${VX_ICONS.scan} Final security analysis running...`,
          `📊 *Progress:* 90%`,
          "",
          `⚡ Almost done...`,
        ].join("\n"),
        {
          status: VX_STATUS.ANALYZING,
        },
      ),

    complete: (
      group: string,
      result: string,
    ) =>
      formatVxMessage(
        `${VX_ICONS.success} SECURITY SCAN COMPLETE`,
        [
          `${VX_ICONS.target} *Target:* ${group}`,
          "",
          result,
        ].join("\n"),
        {
          status: VX_STATUS.COMPLETE,
        },
      ),
  },

  monitor: {
    starting: (group: string) =>
      formatVxMessage(
        `${VX_ICONS.monitor} VX MONITOR`,
        [
          `${VX_ICONS.target} *Target:* ${group}`,
          "",
          `${VX_ICONS.monitor} Monitoring initialized.`,
          `${VX_ICONS.shield} VX protection engine active.`,
        ].join("\n"),
        {
          status: VX_STATUS.MONITORING,
        },
      ),

    progress: (
      group: string,
      percent: number,
    ) =>
      formatVxMessage(
        `${VX_ICONS.monitor} VX MONITOR`,
        [
          `${VX_ICONS.target} *Target:* ${group}`,
          "",
          `${VX_ICONS.monitor} Initializing monitoring...`,
          `📊 *Progress:* ${percent}%`,
        ].join("\n"),
        {
          status: VX_STATUS.MONITORING,
        },
      ),

    stopped: (group: string) =>
      formatVxMessage(
        `${VX_ICONS.monitor} VX MONITOR`,
        [
          `${VX_ICONS.target} *Target:* ${group}`,
          "",
          `${VX_ICONS.abort} Monitoring stopped.`,
        ].join("\n"),
        {
          status: VX_STATUS.STOPPED,
        },
      ),
  },

  bot: {
    starting: (target: string) =>
      formatVxMessage(
        `${VX_ICONS.bot} BOT ANALYSIS`,
        [
          `${VX_ICONS.target} *Target:* ${target}`,
          "",
          `${VX_ICONS.bot} Analyzing target...`,
          `${VX_ICONS.engine} VX intelligence engine active.`,
        ].join("\n"),
        {
          status: VX_STATUS.ANALYZING,
        },
      ),

    detected: (
      target: string,
      details: string,
    ) =>
      formatVxMessage(
        `${VX_ICONS.bot} BOT DETECTION`,
        [
          `${VX_ICONS.target} *Target:* ${target}`,
          "",
          details,
        ].join("\n"),
        {
          status: VX_STATUS.COMPLETE,
        },
      ),
  },

  incident: {
    created: (
      incidentId: string,
      details: string,
    ) =>
      formatVxMessage(
        `${VX_ICONS.incident} SECURITY INCIDENT`,
        [
          `🆔 *Incident:* ${incidentId}`,
          "",
          details,
        ].join("\n"),
        {
          status: VX_STATUS.READY,
        },
      ),
  },

  logs: {
    header: (details: string) =>
      formatVxMessage(
        `${VX_ICONS.logs} VX LOGS`,
        details,
        {
          status: VX_STATUS.READY,
        },
      ),
  },

  report: {
    starting: () =>
      formatVxMessage(
        `${VX_ICONS.report} VX REPORT`,
        "Generating security report...",
        {
          status: VX_STATUS.PROCESSING,
        },
      ),

    complete: (details: string) =>
      formatVxMessage(
        `${VX_ICONS.report} VX REPORT COMPLETE`,
        details,
        {
          status: VX_STATUS.COMPLETE,
        },
      ),
  },

  health: {
    ready: (details: string) =>
      formatVxMessage(
        `${VX_ICONS.health} VX HEALTH`,
        details,
        {
          status: VX_STATUS.READY,
        },
      ),
  },

  stats: {
    ready: (details: string) =>
      formatVxMessage(
        `${VX_ICONS.stats} VX STATISTICS`,
        details,
        {
          status: VX_STATUS.READY,
        },
      ),
  },

  system: {
    error: (details: string) =>
      formatVxMessage(
        `${VX_ICONS.danger} VX SYSTEM ERROR`,
        details,
        {
          status: VX_STATUS.ERROR,
        },
      ),

    aborted: (details: string) =>
      formatVxMessage(
        `${VX_ICONS.abort} VX OPERATION ABORTED`,
        details,
        {
          status: VX_STATUS.ABORTED,
        },
      ),

    stopped: (details: string) =>
      formatVxMessage(
        `${VX_ICONS.abort} VX OPERATION STOPPED`,
        details,
        {
          status: VX_STATUS.STOPPED,
        },
      ),
  },
};
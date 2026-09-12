
/* =========================================================
   🌑 DARK VORTEX — VX SECURITY TYPES
   ⚡ Powered by Vortex Tech

   Central type definitions for:
   - Events
   - Actors / identities
   - Bot intelligence
   - Behavioral analysis
   - Risk analysis
   - Incidents
   - Monitoring
   - Scanning
   - Security configuration
   - Reports
   - Security statistics

   IMPORTANT:
   This file contains TYPES ONLY.
   No runtime logic belongs here.
========================================================= */


/* =========================================================
   SEVERITY
========================================================= */

export type VxSeverity =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";


/* =========================================================
   EVENT TYPES
========================================================= */

export type VxEventType =
  | "MESSAGE"
  | "COMMAND"
  | "PARTICIPANT_JOIN"
  | "PARTICIPANT_LEAVE"
  | "PARTICIPANT_PROMOTE"
  | "PARTICIPANT_DEMOTE"
  | "LINK"
  | "SPAM"
  | "FLOOD"
  | "BOT"
  | "RAID"
  | "MENTION"
  | "THREAT"
  | "SECURITY"
  | "SCAN"
  | "MONITOR"
  | "INCIDENT"
  | "SYSTEM";


/* =========================================================
   INCIDENT STATUS
========================================================= */

export type VxIncidentStatus =
  | "DETECTED"
  | "ANALYZING"
  | "ACTIVE"
  | "RESOLVED"
  | "ABORTED";


/* =========================================================
   SECURITY ACTIONS
========================================================= */

export type VxAction =
  | "LOG"
  | "ALERT"
  | "WARN"
  | "DELETE"
  | "KICK"
  | "BAN"
  | "BLOCK"
  | "NONE";


/* =========================================================
   DETECTION STATUS
========================================================= */

export type VxDetectionStatus =
  | "SUSPICIOUS"
  | "LIKELY"
  | "HIGH_CONFIDENCE"
  | "CONFIRMED";


/* =========================================================
   ACTOR STATUS
========================================================= */

export type VxActorStatus =
  | "UNKNOWN"
  | "NORMAL"
  | "SUSPICIOUS"
  | "HIGH_RISK"
  | "BLOCKED";


/* =========================================================
   BOT CLASSIFICATION
========================================================= */

export type VxBotClassification =
  | "UNKNOWN"
  | "NOT_A_BOT"
  | "SUSPICIOUS"
  | "LIKELY_BOT"
  | "HIGH_CONFIDENCE_BOT";


/* =========================================================
   THREAT TYPES
========================================================= */

export type VxThreatType =
  | "BOT"
  | "SPAM"
  | "FLOOD"
  | "RAID"
  | "LINK"
  | "MENTION"
  | "COMMAND_ABUSE"
  | "COORDINATED_ACTIVITY"
  | "SUSPICIOUS_BEHAVIOR"
  | "UNKNOWN";


/* =========================================================
   SCAN STATUS
========================================================= */

export type VxScanStatus =
  | "IDLE"
  | "INITIALIZING"
  | "SCANNING"
  | "ANALYZING"
  | "FINALIZING"
  | "COMPLETED"
  | "ABORTED"
  | "FAILED";


/* =========================================================
   MONITOR STATUS
========================================================= */

export type VxMonitorStatus =
  | "STARTING"
  | "ACTIVE"
  | "STOPPING"
  | "STOPPED"
  | "FAILED";


/* =========================================================
   REPORT STATUS
========================================================= */

export type VxReportStatus =
  | "GENERATING"
  | "COMPLETED"
  | "ABORTED"
  | "FAILED";


/* =========================================================
   RISK FACTOR
========================================================= */

export interface VxRiskFactor {
  name: string;
  score: number;
  reason: string;

  /*
   * Optional category allows the risk engine
   * to group related evidence.
   */
  category?: string;

  /*
   * Optional confidence for this individual factor.
   */
  confidence?: number;
}


/* =========================================================
   RISK RESULT
========================================================= */

export interface VxRiskResult {
  /*
   * Overall risk score.
   * Expected range: 0–100.
   */
  score: number;

  severity: VxSeverity;

  /*
   * Confidence in the classification.
   * Expected range: 0–100.
   */
  confidence: number;

  factors: VxRiskFactor[];

  /*
   * Optional threat classification.
   */
  threatType?: VxThreatType;

  /*
   * Optional human-readable explanation.
   */
  summary?: string;
}


/* =========================================================
   ACTOR
========================================================= */

export interface VxActor {
  /*
   * Internal WhatsApp identity.
   * Keep JID internally even when reports display
   * only the phone number.
   */
  jid?: string;

  /*
   * Human-readable phone number.
   */
  phoneNumber?: string;

  /*
   * Resolved WhatsApp/contact name.
   */
  name?: string;

  /*
   * WhatsApp/admin state.
   */
  isAdmin?: boolean;

  /*
   * Bot classification.
   */
  isBot?: boolean;

  /*
   * More detailed classification.
   */
  botClassification?: VxBotClassification;

  /*
   * Current security state.
   */
  status?: VxActorStatus;

  /*
   * Optional risk information.
   */
  riskScore?: number;
  confidence?: number;
}


/* =========================================================
   GROUP CONTEXT
========================================================= */

export interface VxGroupContext {
  jid: string;
  name?: string;
  participantCount?: number;

  /*
   * Whether VX currently has administrator-level
   * capability in the group.
   */
  botIsAdmin?: boolean;

  /*
   * Optional group metadata timestamp.
   */
  metadataUpdatedAt?: number;
}


/* =========================================================
   BOT SIGNAL
========================================================= */

export interface VxBotSignal {
  /*
   * Unique signal identifier.
   */
  id?: string;

  /*
   * Signal name.
   */
  type: string;

  /*
   * Human-readable explanation.
   */
  reason: string;

  /*
   * Signal strength, 0–100.
   */
  score: number;

  /*
   * Confidence in this signal, 0–100.
   */
  confidence?: number;

  /*
   * Timestamp when the signal was observed.
   */
  timestamp?: number;

  /*
   * Optional evidence references.
   */
  evidenceIds?: string[];

  /*
   * Additional detector information.
   */
  metadata?: Record<string, unknown>;
}


/* =========================================================
   BOT PROFILE
========================================================= */

export interface VxBotProfile {
  /*
   * Stable internal profile ID.
   */
  id: string;

  /*
   * WhatsApp identity.
   */
  jid: string;
  phoneNumber?: string;
  name?: string;

  /*
   * First/last observation.
   */
  firstSeen: number;
  lastSeen: number;

  /*
   * Current bot analysis.
   */
  classification: VxBotClassification;
  riskScore: number;
  confidence: number;

  /*
   * Evidence collected over time.
   */
  signals: VxBotSignal[];

  /*
   * Activity counters.
   */
  messageCount: number;
  commandCount: number;
  linkCount: number;
  mentionCount?: number;
  duplicateCount?: number;

  /*
   * Current state.
   */
  status?: VxActorStatus;

  /*
   * Optional group associations.
   */
  groupIds?: string[];

  /*
   * Additional intelligence.
   */
  metadata?: Record<string, unknown>;
}


/* =========================================================
   THREAT PROFILE
========================================================= */

export interface VxThreatProfile {
  id: string;

  type: VxThreatType;

  severity: VxSeverity;

  /*
   * Overall threat score.
   */
  score: number;

  /*
   * Confidence in the threat classification.
   */
  confidence: number;

  /*
   * Actors involved.
   */
  actorIds?: string[];

  /*
   * Evidence supporting the threat.
   */
  evidenceIds?: string[];

  /*
   * Detection explanation.
   */
  reason: string;

  createdAt: number;
  updatedAt: number;

  metadata?: Record<string, unknown>;
}


/* =========================================================
   DETECTION EVIDENCE
========================================================= */

export interface VxDetectionEvidence {
  /*
   * Stable evidence identifier.
   */
  id: string;

  /*
   * Evidence category.
   */
  type: string;

  /*
   * Human-readable description.
   */
  description: string;

  /*
   * Optional actor/group association.
   */
  actor?: VxActor;
  group?: VxGroupContext;

  /*
   * Timestamp of observation.
   */
  timestamp: number;

  /*
   * Numeric strength, 0–100.
   */
  score?: number;

  /*
   * Whether this evidence has already been correlated.
   */
  correlated?: boolean;

  /*
   * Original event reference.
   */
  eventId?: string;

  metadata?: Record<string, unknown>;
}


/* =========================================================
   BEHAVIOR WINDOW
========================================================= */

export interface VxBehaviorWindow {
  /*
   * Window duration in milliseconds.
   */
  windowMs: number;

  startedAt: number;
  endedAt: number;

  /*
   * Activity counters.
   */
  messages: number;
  commands: number;
  links: number;
  mentions: number;
  duplicates: number;

  /*
   * Participant activity.
   */
  joins?: number;
  leaves?: number;

  /*
   * Derived indicators.
   */
  messageRate?: number;
  commandRate?: number;
  linkRate?: number;

  metadata?: Record<string, unknown>;
}


/* =========================================================
   BEHAVIOR PROFILE
========================================================= */

export interface VxBehaviorProfile {
  actor: VxActor;

  /*
   * Rolling analysis windows.
   */
  windows: VxBehaviorWindow[];

  /*
   * Aggregate activity.
   */
  totalMessages: number;
  totalCommands: number;
  totalLinks: number;
  totalMentions: number;
  totalDuplicates: number;

  /*
   * Derived behavior scores.
   */
  automationScore: number;
  spamScore: number;
  floodScore: number;
  coordinationScore: number;

  /*
   * Overall behavior confidence.
   */
  confidence: number;

  updatedAt: number;

  metadata?: Record<string, unknown>;
}


/* =========================================================
   GROUP SECURITY CONFIGURATION
========================================================= */

export interface VxGroupSecurityConfig {
  /*
   * Master switch.
   */
  enabled: boolean;

  /*
   * Detection modules.
   */
  monitoring: boolean;
  botDetection: boolean;
  spamDetection: boolean;
  raidDetection: boolean;
  floodDetection: boolean;
  linkDetection: boolean;
  mentionDetection: boolean;

  /*
   * Enforcement.
   *
   * When false, VX detects/logs/alerts but does not
   * automatically perform destructive actions.
   */
  autoActions: boolean;

  /*
   * Minimum severity required for owner alerts.
   */
  alertLevel: VxSeverity;

  /*
   * Optional per-action configuration.
   */
  allowedActions?: VxAction[];

  /*
   * Configuration timestamps.
   */
  createdAt?: number;
  updatedAt?: number;

  metadata?: Record<string, unknown>;
}


/* =========================================================
   SECURITY SNAPSHOT
========================================================= */

export interface VxSecuritySnapshot {
  /*
   * Snapshot timestamp.
   */
  timestamp: number;

  /*
   * Group context.
   */
  group?: VxGroupContext;

  /*
   * Current counters.
   */
  events: number;
  threats: number;
  incidents: number;

  /*
   * Severity distribution.
   */
  critical: number;
  high: number;
  medium: number;
  low: number;

  /*
   * Intelligence counters.
   */
  suspiciousActors?: number;
  suspectedBots?: number;
  activeThreats?: number;

  /*
   * Current highest risk.
   */
  highestRisk?: number;

  metadata?: Record<string, unknown>;
}


/* =========================================================
   SECURITY EVENT
========================================================= */

export interface VxEvent {
  /*
   * Stable event identity.
   */
  id: string;

  /*
   * Event creation timestamp.
   */
  timestamp: number;

  /*
   * Security event classification.
   */
  type: VxEventType;

  /*
   * Optional group context.
   */
  group?: VxGroupContext;

  /*
   * Optional actor responsible for the event.
   */
  actor?: VxActor;

  /*
   * Original message text when legitimately available.
   */
  text?: string;

  /*
   * Command associated with the event.
   */
  command?: string;

  /*
   * Calculated risk information.
   */
  risk?: VxRiskResult;

  /*
   * Human-readable detection reason.
   */
  reason?: string;

  /*
   * Indicators supporting the detection.
   */
  indicators?: string[];

  /*
   * Structured evidence.
   */
  evidence?: VxDetectionEvidence[];

  /*
   * Detection classification.
   */
  detectionStatus?: VxDetectionStatus;

  /*
   * Action selected by the security engine.
   */
  action?: VxAction;

  /*
   * Result of an action when one was actually performed.
   */
  actionResult?: string;

  /*
   * Related incident.
   */
  incidentId?: string;

  /*
   * Related scan.
   */
  scanId?: string;

  /*
   * Related monitor session.
   */
  monitorId?: string;

  /*
   * Additional structured information.
   */
  metadata?: Record<string, unknown>;
}


/* =========================================================
   SECURITY INCIDENT
========================================================= */

export interface VxIncident {
  /*
   * Stable incident identity.
   */
  id: string;

  /*
   * Lifecycle timestamps.
   */
  createdAt: number;
  updatedAt: number;

  /*
   * Current incident lifecycle state.
   */
  status: VxIncidentStatus;

  /*
   * Highest/primary severity.
   */
  severity: VxSeverity;

  /*
   * Risk and confidence are percentage-style values
   * from 0 to 100.
   */
  riskScore: number;
  confidence: number;

  /*
   * Event category responsible for the incident.
   */
  type: VxEventType;

  /*
   * Optional threat classification.
   */
  threatType?: VxThreatType;

  /*
   * Optional context.
   */
  group?: VxGroupContext;
  actor?: VxActor;

  /*
   * Human-readable incident information.
   */
  title: string;
  reason: string;

  /*
   * Evidence supporting the incident.
   */
  indicators: string[];

  /*
   * Structured evidence references.
   */
  evidenceIds?: string[];

  /*
   * Actions associated with the incident.
   *
   * Detection and enforcement remain separate:
   * creating an incident does NOT automatically
   * perform an enforcement action.
   */
  actions: VxAction[];

  /*
   * Related security event IDs.
   */
  eventIds: string[];

  /*
   * Lifecycle metadata.
   */
  abortedBy?: string;
  resolvedAt?: number;
  resolvedBy?: string;

  /*
   * Escalation history.
   */
  previousSeverity?: VxSeverity;
  escalationCount?: number;

  /*
   * Additional structured information.
   */
  metadata?: Record<string, unknown>;
}


/* =========================================================
   MONITOR SESSION
========================================================= */

export interface VxMonitorSession {
  /*
   * Stable monitor session ID.
   */
  id: string;

  /*
   * Group being monitored.
   */
  groupId: string;
  groupName?: string;

  /*
   * Lifecycle timestamps.
   */
  startedAt: number;
  stoppedAt?: number;

  /*
   * Current lifecycle state.
   */
  status?: VxMonitorStatus;

  /*
   * Whether the monitor is currently active.
   *
   * Kept for compatibility with existing code.
   */
  active: boolean;

  /*
   * Runtime telemetry.
   */
  eventsProcessed: number;
  threatsDetected: number;
  incidentsCreated: number;

  /*
   * Additional telemetry.
   */
  lastEventAt?: number;
  lastThreatAt?: number;
  runtimeMs?: number;

  /*
   * Additional monitor metadata.
   */
  metadata?: Record<string, unknown>;
}


/* =========================================================
   SCAN RESULT
========================================================= */

export interface VxScanResult {
  /*
   * Stable scan ID.
   */
  id: string;

  /*
   * Group that was scanned.
   */
  group: VxGroupContext;

  /*
   * Scan lifecycle timestamps.
   */
  startedAt: number;
  completedAt?: number;

  /*
   * Real scan progress/state.
   */
  progress: number;
  stage: string;

  /*
   * Explicit lifecycle status.
   */
  status?: VxScanStatus;

  /*
   * Lifecycle flags.
   *
   * Kept for compatibility with existing scanner code.
   */
  completed: boolean;
  aborted: boolean;

  /*
   * Scan telemetry.
   */
  participantsScanned: number;
  eventsAnalyzed: number;
  threatsDetected: number;
  incidentsCreated: number;

  /*
   * Intelligence counters.
   */
  botsDetected?: number;
  suspiciousActors?: number;

  /*
   * Highest risk discovered during the scan.
   */
  highestRisk: number;

  /*
   * Findings generated by the scanner.
   */
  findings: VxEvent[];

  /*
   * Structured evidence.
   */
  evidence?: VxDetectionEvidence[];

  /*
   * Abort information.
   */
  abortedBy?: string;
  abortReason?: string;

  metadata?: Record<string, unknown>;
}


/* =========================================================
   SECURITY REPORT
========================================================= */

export interface VxSecurityReport {
  /*
   * Stable report ID.
   */
  id: string;

  /*
   * Report lifecycle.
   */
  status: VxReportStatus;

  /*
   * Creation timestamps.
   */
  createdAt: number;
  completedAt?: number;

  /*
   * Scope.
   */
  group?: VxGroupContext;

  /*
   * Summary counters.
   */
  totalEvents: number;
  totalThreats: number;
  totalIncidents: number;

  /*
   * Severity distribution.
   */
  critical: number;
  high: number;
  medium: number;
  low: number;

  /*
   * Intelligence summary.
   */
  botsDetected?: number;
  suspiciousActors?: number;

  /*
   * Highest-risk information.
   */
  highestRisk?: number;
  highestRiskActor?: VxActor;

  /*
   * Top findings.
   */
  findings?: VxEvent[];

  /*
   * Related incidents.
   */
  incidentIds?: string[];

  /*
   * Abort information.
   */
  abortedBy?: string;
  abortReason?: string;

  metadata?: Record<string, unknown>;
}


/* =========================================================
   SECURITY STATISTICS
========================================================= */

export interface VxSecurityStats {
  /*
   * Total observed security events.
   */
  totalEvents: number;

  /*
   * Total detected threats.
   *
   * `totalThreats` is the canonical field name.
   */
  totalThreats: number;

  /*
   * Total incidents created.
   */
  totalIncidents: number;

  /*
   * Severity distribution.
   */
  critical: number;
  high: number;
  medium: number;
  low: number;

  /*
   * Active monitor count.
   */
  activeMonitors: number;

  /*
   * Intelligence counters.
   */
  botsDetected?: number;
  suspiciousActors?: number;
  activeThreats?: number;

  /*
   * Highest risk currently observed.
   */
  highestRisk?: number;

  /*
   * Recent activity timestamps.
   */
  lastEventAt?: number;
  lastThreatAt?: number;
  lastIncidentAt?: number;
}


/* =========================================================
   TYPE GUARDS / COMPATIBILITY
========================================================= */

/**
 * Compatibility helper for code that previously used
 * `totalThreats`.
 *
 * This is a type-level compatibility alias only and
 * does not create a second runtime field.
 */
export type VxSecurityStatsLegacy = VxSecurityStats & {
  totalThreats?: number;
};


/* =========================================================
   UTILITY TYPES
========================================================= */

/**
 * Generic metadata container.
 */
export type VxMetadata = Record<string, unknown>;


/**
 * Numeric percentage value expected to be 0–100.
 *
 * This is a documentation/type alias only.
 * Runtime validation belongs in the relevant engine.
 */
export type VxPercentage = number;


/**
 * Security IDs are strings so the implementation can
 * choose UUIDs, timestamps, or VX-prefixed identifiers.
 */
export type VxId = string;


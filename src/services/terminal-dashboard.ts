// ============================================================
// DARK VORTEX — TERMINAL DASHBOARD COMPATIBILITY LAYER
// ============================================================
//
// The old full-screen dashboard has intentionally been disabled.
//
// Dark Vortex now uses the static WolfBot-style terminal logger
// from ./logger.ts instead.
//
// These functions remain exported so existing bot code does not
// need to be rewritten all at once.
// ============================================================

let running = false;

// ============================================================
// DASHBOARD STATE
// ============================================================

export interface DashboardEvent {
  timestamp?: number;
  level?: string;
  source?: string;
  message?: string;
  [key: string]: unknown;
}

export interface DashboardConnectionState {
  status?: string;
  [key: string]: unknown;
}

export interface DashboardSecurityState {
  [key: string]: unknown;
}

export interface DashboardMemoryCleanupState {
  [key: string]: unknown;
}

export interface DashboardSignalCleanupState {
  [key: string]: unknown;
}

// ============================================================
// START / STOP
// ============================================================

export function startTerminalDashboard(): void {
  /*
   * Intentionally disabled.
   *
   * Dark Vortex now uses normal terminal output.
   */
  running = false;
}

export function shutdownTerminalDashboard(): void {
  running = false;
}

export function isTerminalDashboardRunning(): boolean {
  return false;
}

// ============================================================
// EVENT COMPATIBILITY
// ============================================================

export function addDashboardEvent(
  ..._args: unknown[]
): void {
  // Disabled intentionally.
}

// ============================================================
// CONNECTION
// ============================================================

export function setDashboardConnection(
  ..._args: unknown[]
): void {
  // Disabled intentionally.
}

// ============================================================
// LATENCY
// ============================================================

export function setDashboardLatency(
  ..._args: unknown[]
): void {
  // Disabled intentionally.
}

// ============================================================
// GROUPS
// ============================================================

export function setDashboardGroups(
  ..._args: unknown[]
): void {
  // Disabled intentionally.
}

// ============================================================
// SECURITY
// ============================================================

export function setDashboardSecurity(
  ..._args: unknown[]
): void {
  // Disabled intentionally.
}

// ============================================================
// MEMORY CLEANUP
// ============================================================

export function setDashboardMemoryCleanup(
  ..._args: unknown[]
): void {
  // Disabled intentionally.
}

// ============================================================
// SIGNAL CLEANUP
// ============================================================

export function setDashboardSignalCleanup(
  ..._args: unknown[]
): void {
  // Disabled intentionally.
}

// ============================================================
// MESSAGE COUNTER
// ============================================================

export function incrementDashboardMessages(): void {
  // Disabled intentionally.
}

// ============================================================
// COMMAND COUNTER
// ============================================================

export function incrementDashboardCommands(): void {
  // Disabled intentionally.
}

// ============================================================
// GENERIC COMPATIBILITY EXPORTS
// ============================================================

export function updateTerminalDashboard(
  ..._args: unknown[]
): void {
  // Disabled intentionally.
}

export function renderEvents(
  ..._args: unknown[]
): void {
  // Disabled intentionally.
}

export function setDashboardState(
  ..._args: unknown[]
): void {
  // Disabled intentionally.
}

export function clearDashboardEvents(): void {
  // Disabled intentionally.
}

export function destroyTerminalDashboard(): void {
  running = false;
}
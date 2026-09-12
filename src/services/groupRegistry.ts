import fs from "node:fs/promises";
import path from "node:path";

/* =========================================================
   DARK VORTEX GROUP REGISTRY

   Stores Dark Vortex's LOCAL group state.

   This does NOT replace:
   - groups.json
   - automation.json
   - slowmode.json
   - moderation files
   - protection files

   It only tracks Dark Vortex's relationship with a group.
========================================================= */

const DATA_DIR = path.join(
  process.cwd(),
  "src",
  "data"
);

const REGISTRY_FILE = path.join(
  DATA_DIR,
  "group-registry.json"
);

/* =========================================================
   TYPES
========================================================= */

export type GroupStatus =
  | "enabled"
  | "disabled"
  | "left";

export interface GroupRegistryEntry {
  jid: string;
  enabled: boolean;
  status: GroupStatus;
  name: string;
  firstSeen: string;
  lastSeen: string;
  leftAt?: string;
}

export type GroupRegistry =
  Record<string, GroupRegistryEntry>;

/* =========================================================
   DEFAULTS
========================================================= */

const DEFAULT_ENABLED = true;

/* =========================================================
   FILE HELPERS
========================================================= */

async function ensureDataDirectory(): Promise<void> {
  await fs.mkdir(
    DATA_DIR,
    {
      recursive: true,
    }
  );
}

async function readRegistry(): Promise<GroupRegistry> {

  await ensureDataDirectory();

  try {

    const raw =
      await fs.readFile(
        REGISTRY_FILE,
        "utf8"
      );

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed as GroupRegistry;

  } catch (err: any) {

    if (
      err?.code === "ENOENT"
    ) {
      return {};
    }

    console.error(
      "Failed to read group registry:",
      err
    );

    return {};
  }
}

async function writeRegistry(
  registry: GroupRegistry
): Promise<void> {

  await ensureDataDirectory();

  await fs.writeFile(
    REGISTRY_FILE,
    JSON.stringify(
      registry,
      null,
      2
    ),
    "utf8"
  );
}

/* =========================================================
   REGISTER / UPDATE GROUP
========================================================= */

export async function registerGroup(
  jid: string,
  name = ""
): Promise<GroupRegistryEntry> {

  if (
    !jid ||
    !jid.endsWith("@g.us")
  ) {
    throw new Error(
      "Invalid WhatsApp group JID."
    );
  }

  const registry =
    await readRegistry();

  const now =
    new Date().toISOString();

  const existing =
    registry[jid];

  /*
   * If a group was previously marked LEFT
   * and WhatsApp now reports it again,
   * the bot has rejoined it.
   */
  const wasLeft =
    existing?.status === "left";

  const entry: GroupRegistryEntry = {
    jid,
    enabled:
      wasLeft
        ? DEFAULT_ENABLED
        : existing?.enabled ??
          DEFAULT_ENABLED,
    status:
      wasLeft
        ? "enabled"
        : existing?.status ??
          "enabled",
    name:
      name.trim() ||
      existing?.name ||
      "Unknown Group",
    firstSeen:
      existing?.firstSeen ||
      now,
    lastSeen: now,
  };

  /*
   * A previously left group is active again.
   */
  if (wasLeft) {
    delete entry.leftAt;
  }

  registry[jid] =
    entry;

  await writeRegistry(
    registry
  );

  return entry;
}

/* =========================================================
   ENABLE GROUP
========================================================= */

export async function enableGroup(
  jid: string,
  name = ""
): Promise<GroupRegistryEntry> {

  const entry =
    await registerGroup(
      jid,
      name
    );

  entry.enabled = true;
  entry.status = "enabled";
  entry.lastSeen =
    new Date().toISOString();

  delete entry.leftAt;

  const registry =
    await readRegistry();

  registry[jid] =
    entry;

  await writeRegistry(
    registry
  );

  return entry;
}

/* =========================================================
   DISABLE GROUP
========================================================= */

export async function disableGroup(
  jid: string,
  name = ""
): Promise<GroupRegistryEntry> {

  const entry =
    await registerGroup(
      jid,
      name
    );

  entry.enabled = false;
  entry.status = "disabled";
  entry.lastSeen =
    new Date().toISOString();

  delete entry.leftAt;

  const registry =
    await readRegistry();

  registry[jid] =
    entry;

  await writeRegistry(
    registry
  );

  return entry;
}

/* =========================================================
   MARK GROUP AS LEFT
========================================================= */

export async function markGroupLeft(
  jid: string
): Promise<GroupRegistryEntry | null> {

  const registry =
    await readRegistry();

  const existing =
    registry[jid];

  if (!existing) {
    return null;
  }

  const now =
    new Date().toISOString();

  existing.enabled = false;
  existing.status = "left";
  existing.lastSeen = now;
  existing.leftAt = now;

  registry[jid] =
    existing;

  await writeRegistry(
    registry
  );

  return existing;
}

/* =========================================================
   GET GROUP
========================================================= */

export async function getGroupRegistry(
  jid: string
): Promise<GroupRegistryEntry | null> {

  const registry =
    await readRegistry();

  return registry[jid] || null;
}

/* =========================================================
   CHECK IF ENABLED
========================================================= */

export async function isGroupEnabled(
  jid: string
): Promise<boolean> {

  const entry =
    await getGroupRegistry(
      jid
    );

  /*
   * Groups that have never been registered
   * remain enabled to preserve existing
   * Dark Vortex behaviour.
   */
  if (!entry) {
    return true;
  }

  return (
    entry.status === "enabled" &&
    entry.enabled === true
  );
}

/* =========================================================
   GET ALL REGISTERED GROUPS
========================================================= */

export async function getRegisteredGroups(): Promise<
  GroupRegistryEntry[]
> {

  const registry =
    await readRegistry();

  return Object.values(
    registry
  );
}

/* =========================================================
   GET ACTIVE GROUPS
========================================================= */

export async function getActiveGroups(): Promise<
  GroupRegistryEntry[]
> {

  const groups =
    await getRegisteredGroups();

  return groups.filter(
    (group) =>
      group.status !== "left"
  );
}

/* =========================================================
   REMOVE GROUP FROM REGISTRY
========================================================= */

export async function unregisterGroup(
  jid: string
): Promise<void> {

  const registry =
    await readRegistry();

  if (
    !registry[jid]
  ) {
    return;
  }

  delete registry[jid];

  await writeRegistry(
    registry
  );
}

/* =========================================================
   REFRESH GROUP ACTIVITY
========================================================= */

export async function touchGroup(
  jid: string,
  name = ""
): Promise<GroupRegistryEntry> {

  return registerGroup(
    jid,
    name
  );
}
/* =========================================================
🌑 DARK VORTEX — VX BOT INTELLIGENCE
⚡ Persistent Behavioral Bot Profiles
⚡ Powered by Vortex Tech

Responsibilities:

* Maintain persistent behavioral profiles
* Aggregate long-term activity
* Track cross-group behavior
* Build bot-specific evidence
* Feed evidence into VX Engine
* Avoid independent incident/risk pipelines
* Preserve stable public exports used by VX commands
  ========================================================= */

import {
mkdir,
readFile,
rename,
unlink,
writeFile,
} from "node:fs/promises";

import path from "node:path";

import type {
VxActor,
VxGroupContext,
VxRiskFactor,
VxSeverity,
} from "./vx-types.js";

import {
analyzeVxEvent,
} from "./vx-engine.js";

import {
createRiskFactor,
} from "./vx-risk.js";

/* =========================================================
STORAGE
========================================================= */

const DATA_DIR = path.resolve(
process.cwd(),
"src",
"data",
"vx",
);

const PROFILE_FILE = path.join(
DATA_DIR,
"bot-profiles.json",
);

const PROFILE_TEMP_FILE =
`${PROFILE_FILE}.tmp`;

const MAX_PROFILES = 10_000;
const MAX_HISTORY = 100;
const MAX_GROUP_IDS = 1_000;
const MAX_INDICATORS = 50;

const MIN_MESSAGES_FOR_SUSPICION = 10;

const MAX_SINGLE_INCREMENT = 1_000_000;

/* =========================================================
TYPES
========================================================= */

export interface VxBotProfile {
key: string;

jid: string;
phoneNumber?: string;
name?: string;

firstSeen: number;
lastSeen: number;

messageCount: number;
commandCount: number;
linkCount: number;

repeatedMessageCount: number;

groupsSeen: number;

averageMessagesPerMinute: number;

riskScore: number;
confidence: number;

severity: VxSeverity;

indicators: string[];

groupIds?: string[];

history: Array<{
timestamp: number;
type: string;
score: number;
reason: string;
}>;
}

export interface VxBotAnalysis {
profile: VxBotProfile;

suspectedBot: boolean;

riskScore: number;
confidence: number;
severity: VxSeverity;

factors: VxRiskFactor[];
indicators: string[];

incidentId?: string;
}

interface AnalyzeBotOptions {
group: VxGroupContext;
actor: VxActor;

messages?: number;
commands?: number;
links?: number;
repeatedMessages?: number;

messagesPerMinute?: number;

reason?: string;

createIncident?: boolean;
}

/* =========================================================
MEMORY
========================================================= */

let profiles =
new Map<string, VxBotProfile>();

let loaded = false;

let loadingPromise:
Promise<void> | undefined;

let persistenceQueue:
Promise<void> =
Promise.resolve();

/* =========================================================
HELPERS
========================================================= */

function clamp(
value: number,
min = 0,
max = 100,
): number {
if (!Number.isFinite(value)) {
return min;
}

return Math.max(
min,
Math.min(
max,
value,
),
);
}

function safeNumber(
value: unknown,
fallback = 0,
): number {
const parsed =
Number(value);

return Number.isFinite(parsed)
? parsed
: fallback;
}

function safeCounter(
value: unknown,
): number {
const parsed =
safeNumber(
value,
0,
);

if (parsed <= 0) {
return 0;
}

return Math.min(
MAX_SINGLE_INCREMENT,
Math.floor(parsed),
);
}

function safeTimestamp(
value: unknown,
fallback: number,
): number {
const parsed =
safeNumber(
value,
fallback,
);

return Math.max(
0,
Math.floor(parsed),
);
}

function unique(
values: string[],
): string[] {
return Array.from(
new Set(
values
.map(
value =>
String(value)
.trim(),
)
.filter(Boolean),
),
);
}

function boundedUnique(
values: string[],
limit: number,
): string[] {
return unique(values)
.slice(
0,
Math.max(
1,
limit,
),
);
}

/* =========================================================
IDENTITY NORMALIZATION
========================================================= */

function normalizeJid(
jid: string,
): string {
return String(jid || "")
.trim()
.toLowerCase()
.split(":")[0]
.slice(0, 300);
}

function normalizePhone(
phone?: string,
): string {
if (!phone) {
return "";
}

return String(phone)
.trim()
.replace(/@.*$/, "")
.replace(/:\d+$/, "")
.replace(/\D/g, "")
.slice(0, 30);
}

function displayPhone(
phone?: string,
jid?: string,
): string {
const normalized =
normalizePhone(
phone,
) ||
normalizePhone(
jid,
);

return normalized
? `+${normalized}`
: "";
}

function profileKey(
actor: VxActor,
): string {
const jid =
normalizeJid(
actor.jid || "",
);

if (jid) {
return jid;
}

const phone =
normalizePhone(
actor.phoneNumber,
);

if (phone) {
return `phone:${phone}`;
}

const name =
String(
actor.name || "unknown",
)
.trim()
.toLowerCase()
.slice(0, 100);

return `actor:${name || "unknown"}`;
}

/* =========================================================
VALIDATION
========================================================= */

function isObject(
value: unknown,
): value is Record<string, unknown> {
return (
typeof value === "object" &&
value !== null
);
}

function isSeverity(
value: unknown,
): value is VxSeverity {
return (
value === "LOW" ||
value === "MEDIUM" ||
value === "HIGH" ||
value === "CRITICAL"
);
}

/* =========================================================
STORAGE INITIALIZATION
========================================================= */

async function ensureLoaded(): Promise<void> {
if (loaded) {
return;
}

if (loadingPromise) {
return loadingPromise;
}

loadingPromise =
(async () => {
await mkdir(
DATA_DIR,
{
recursive: true,
},
);

  try {
    const raw =
      await readFile(
        PROFILE_FILE,
        "utf8",
      );

    const parsed =
      JSON.parse(raw);

    if (
      Array.isArray(
        parsed,
      )
    ) {
      const next =
        new Map<
          string,
          VxBotProfile
        >();

      for (
        const item of parsed
      ) {
        if (
          !isObject(item) ||
          typeof item.key !==
            "string"
        ) {
          continue;
        }

        const profile =
          normalizeStoredProfile(
            item as Partial<VxBotProfile> & {
              key: string;
            },
          );

        if (
          !profile.key.trim()
        ) {
          continue;
        }

        next.set(
          profile.key,
          profile,
        );

        if (
          next.size >=
          MAX_PROFILES
        ) {
          break;
        }
      }

      profiles =
        next;
    }
  } catch {
    profiles =
      new Map();
  }

  enforceProfileLimit();

  loaded = true;
})();

try {
await loadingPromise;
} finally {
loadingPromise =
undefined;
}
}

/* =========================================================
STORED PROFILE NORMALIZATION
========================================================= */

function normalizeStoredProfile(
input: Partial<VxBotProfile> & {
key: string;
},
): VxBotProfile {
const now =
Date.now();

const firstSeen =
safeTimestamp(
input.firstSeen,
now,
);

const lastSeen =
Math.max(
firstSeen,
safeTimestamp(
input.lastSeen,
now,
),
);

const history =
Array.isArray(
input.history,
)
? input.history
.filter(
item =>
isObject(item),
)
.slice(
-MAX_HISTORY,
)
.map(
item => ({
timestamp:
safeTimestamp(
item.timestamp,
now,
),


          type:
            String(
              item.type ||
                "UNKNOWN",
            )
              .trim()
              .slice(
                0,
                100,
              ),

          score:
            Math.round(
              clamp(
                safeNumber(
                  item.score,
                ),
              ),
            ),

          reason:
            String(
              item.reason ||
                "",
            )
              .slice(
                0,
                500,
              ),
        }),
      )
  : [];

const groupIds =
Array.isArray(
input.groupIds,
)
? boundedUnique(
input.groupIds
.map(
value =>
normalizeJid(
String(value),
),
)
.filter(Boolean),
MAX_GROUP_IDS,
)
: [];

const normalizedPhone =
normalizePhone(
input.phoneNumber,
);

return {
key:
String(
input.key,
)
.trim()
.slice(
0,
300,
),


jid:
  normalizeJid(
    String(
      input.jid || "",
    ),
  ),

phoneNumber:
  normalizedPhone
    ? displayPhone(
        normalizedPhone,
      )
    : undefined,

name:
  input.name
    ? String(
        input.name,
      ).slice(
        0,
        200,
      )
    : undefined,

firstSeen,
lastSeen,

messageCount:
  Math.max(
    0,
    Math.floor(
      safeNumber(
        input.messageCount,
      ),
    ),
  ),

commandCount:
  Math.max(
    0,
    Math.floor(
      safeNumber(
        input.commandCount,
      ),
    ),
  ),

linkCount:
  Math.max(
    0,
    Math.floor(
      safeNumber(
        input.linkCount,
      ),
    ),
  ),

repeatedMessageCount:
  Math.max(
    0,
    Math.floor(
      safeNumber(
        input.repeatedMessageCount,
      ),
    ),
  ),

groupsSeen:
  groupIds.length,

averageMessagesPerMinute:
  Math.max(
    0,
    safeNumber(
      input.averageMessagesPerMinute,
    ),
  ),

riskScore:
  clamp(
    safeNumber(
      input.riskScore,
    ),
  ),

confidence:
  clamp(
    safeNumber(
      input.confidence,
    ),
  ),

severity:
  isSeverity(
    input.severity,
  )
    ? input.severity
    : "LOW",

indicators:
  Array.isArray(
    input.indicators,
  )
    ? boundedUnique(
        input.indicators.map(
          String,
        ),
        MAX_INDICATORS,
      )
    : [],

groupIds,

history,

};
}

/* =========================================================
PERSISTENCE
========================================================= */

async function persist(): Promise<void> {
await ensureLoaded();

const snapshot =
JSON.stringify(
Array.from(
profiles.values(),
),
null,
2,
);

persistenceQueue =
persistenceQueue
.catch(
() => undefined,
)
.then(
async () => {
await mkdir(
DATA_DIR,
{
recursive: true,
},
);


      await writeFile(
        PROFILE_TEMP_FILE,
        snapshot,
        "utf8",
      );

      try {
        await rename(
          PROFILE_TEMP_FILE,
          PROFILE_FILE,
        );
      } catch {
        try {
          await unlink(
            PROFILE_FILE,
          );
        } catch {
          // Destination may not exist.
        }

        await rename(
          PROFILE_TEMP_FILE,
          PROFILE_FILE,
        );
      }
    },
  );

await persistenceQueue;
}

/* =========================================================
PROFILE MEMORY MANAGEMENT
========================================================= */

function enforceProfileLimit(): void {
if (
profiles.size <=
MAX_PROFILES
) {
return;
}

const entries =
Array.from(
profiles.entries(),
).sort(
(
[, a],
[, b],
) =>
a.lastSeen -
b.lastSeen,
);

const removeCount =
profiles.size -
MAX_PROFILES;

for (
let i = 0;
i < removeCount;
i++
) {
const entry =
entries[i];

if (entry) {
  profiles.delete(
    entry[0],
  );
}

}
}

/* =========================================================
PROFILE MANAGEMENT
========================================================= */

function getOrCreateProfile(
actor: VxActor,
): VxBotProfile {
const key =
profileKey(actor);

const existing =
profiles.get(key);

if (existing) {
existing.lastSeen =
Date.now();


if (
  actor.jid
) {
  existing.jid =
    normalizeJid(
      actor.jid,
    );
}

if (
  actor.name
) {
  existing.name =
    String(
      actor.name,
    ).slice(
      0,
      200,
    );
}

const phone =
  normalizePhone(
    actor.phoneNumber,
  );

if (phone) {
  existing.phoneNumber =
    displayPhone(
      phone,
    );
}

if (
  !existing.groupIds
) {
  existing.groupIds =
    [];
}

if (
  !existing.history
) {
  existing.history =
    [];
}

existing.indicators =
  boundedUnique(
    existing.indicators || [],
    MAX_INDICATORS,
  );

return existing;

}

const now =
Date.now();

const phone =
normalizePhone(
actor.phoneNumber,
);

const profile:
VxBotProfile = {
key,


jid:
  normalizeJid(
    actor.jid || "",
  ),

phoneNumber:
  phone
    ? displayPhone(
        phone,
      )
    : undefined,

name:
  actor.name
    ? String(
        actor.name,
      ).slice(
        0,
        200,
      )
    : undefined,

firstSeen:
  now,

lastSeen:
  now,

messageCount:
  0,

commandCount:
  0,

linkCount:
  0,

repeatedMessageCount:
  0,

groupsSeen:
  0,

averageMessagesPerMinute:
  0,

riskScore:
  0,

confidence:
  0,

severity:
  "LOW",

indicators:
  [],

groupIds:
  [],

history:
  [],

};

profiles.set(
key,
profile,
);

enforceProfileLimit();

return profile;
}

/* =========================================================
GROUP TRACKING
========================================================= */

function recordGroup(
profile: VxBotProfile,
group: VxGroupContext,
): void {
if (
!profile.groupIds
) {
profile.groupIds =
[];
}

const groupId =
normalizeJid(
group?.jid || "",
);

if (!groupId) {
return;
}

if (
!profile.groupIds.includes(
groupId,
)
) {
profile.groupIds.push(
groupId,
);


if (
  profile.groupIds.length >
  MAX_GROUP_IDS
) {
  profile.groupIds =
    profile.groupIds.slice(
      -MAX_GROUP_IDS,
    );
}


}

profile.groupsSeen =
profile.groupIds.length;
}

/* =========================================================
FACTOR BUILDING
========================================================= */

function buildFactors(
profile: VxBotProfile,
): VxRiskFactor[] {
const factors:
VxRiskFactor[] = [];

if (
profile.averageMessagesPerMinute >=
30
) {
factors.push(
createRiskFactor(
"sustained_high_frequency",
35,
`Long-term activity profile averages ${profile.averageMessagesPerMinute.toFixed(1)} messages per minute.`,
),
);
} else if (
profile.averageMessagesPerMinute >=
15
) {
factors.push(
createRiskFactor(
"sustained_activity",
20,
`Long-term activity profile averages ${profile.averageMessagesPerMinute.toFixed(1)} messages per minute.`,
),
);
}

if (
profile.commandCount >=
50
) {
factors.push(
createRiskFactor(
"command_automation",
35,
`${profile.commandCount} command-like events have been observed.`,
),
);
} else if (
profile.commandCount >=
20
) {
factors.push(
createRiskFactor(
"high_command_activity",
20,
`${profile.commandCount} command-like events have been observed.`,
),
);
}

if (
profile.repeatedMessageCount >=
20
) {
factors.push(
createRiskFactor(
"repeated_messages",
30,
`${profile.repeatedMessageCount} repeated-message events have been observed.`,
),
);
} else if (
profile.repeatedMessageCount >=
8
) {
factors.push(
createRiskFactor(
"message_repetition",
18,
`${profile.repeatedMessageCount} repeated-message events have been observed.`,
),
);
}

if (
profile.linkCount >=
20
) {
factors.push(
createRiskFactor(
"link_distribution",
30,
`${profile.linkCount} link events have been observed.`,
),
);
} else if (
profile.linkCount >=
8
) {
factors.push(
createRiskFactor(
"repeated_links",
18,
`${profile.linkCount} link events have been observed.`,
),
);
}

if (
profile.groupsSeen >=
10
) {
factors.push(
createRiskFactor(
"multi_group_activity",
20,
`Activity has been observed across ${profile.groupsSeen} groups.`,
),
);
} else if (
profile.groupsSeen >=
5
) {
factors.push(
createRiskFactor(
"cross_group_activity",
10,
`Activity has been observed across ${profile.groupsSeen} groups.`,
),
);
}

return factors;
}

/* =========================================================
CONFIDENCE
========================================================= */

function calculateBotConfidence(
profile: VxBotProfile,
factors: VxRiskFactor[],
): number {
let confidence =
20;

confidence +=
Math.min(
30,
factors.length * 8,
);

if (
profile.commandCount >=
20
) {
confidence +=
12;
}

if (
profile.repeatedMessageCount >=
8
) {
confidence +=
12;
}

if (
profile.linkCount >=
8
) {
confidence +=
8;
}

if (
profile.groupsSeen >=
5
) {
confidence +=
8;
}

if (
profile.messageCount >=
50
) {
confidence +=
5;
}

if (
profile.messageCount >=
100
) {
confidence +=
5;
}

return Math.round(
clamp(
confidence,
),
);
}

/* =========================================================
ACTIVITY RATE
========================================================= */

function updateActivityRate(
profile: VxBotProfile,
messagesPerMinute:
| number
| undefined,
): void {
if (
messagesPerMinute ===
undefined ||
!Number.isFinite(
messagesPerMinute,
) ||
messagesPerMinute < 0
) {
return;
}

const current =
Math.min(
10_000,
Math.max(
0,
messagesPerMinute,
),
);

if (
profile.averageMessagesPerMinute <=
0
) {
profile.averageMessagesPerMinute =
current;

return;

}

profile.averageMessagesPerMinute =
(
profile.averageMessagesPerMinute *
0.8
) +
(
current *
0.2
);

profile.averageMessagesPerMinute =
Math.max(
0,
Math.min(
10_000,
profile.averageMessagesPerMinute,
),
);
}

/* =========================================================
HISTORY
========================================================= */

function addHistory(
profile: VxBotProfile,
type: string,
score: number,
reason: string,
): void {
if (
!profile.history
) {
profile.history =
[];
}

profile.history.push({
timestamp:
Date.now(),


type:
  String(
    type || "UNKNOWN",
  ).slice(
    0,
    100,
  ),

score:
  Math.round(
    clamp(
      safeNumber(
        score,
      ),
    ),
  ),

reason:
  String(
    reason || "",
  ).slice(
    0,
    500,
  ),

});

if (
profile.history.length >
MAX_HISTORY
) {
profile.history =
profile.history.slice(
-MAX_HISTORY,
);
}
}

/* =========================================================
PROFILE RISK
========================================================= */

function calculateProfileRisk(
factors: VxRiskFactor[],
): number {
let risk =
0;

for (
const factor of factors
) {
const factorScore =
clamp(
safeNumber(
factor.score,
),
);

if (
  factorScore <= 0
) {
  continue;
}

const remaining =
  Math.max(
    0,
    1 -
      risk /
        140,
  );

risk +=
  factorScore *
  remaining;

if (
  risk >= 100
) {
  return 100;
}

}

return Math.round(
clamp(
risk,
),
);
}

/* =========================================================
PROFILE SEVERITY
========================================================= */

function getProfileSeverity(
riskScore: number,
confidence: number,
): VxSeverity {
if (
riskScore >= 80 &&
confidence >= 75
) {
return "CRITICAL";
}

if (
riskScore >= 60 &&
confidence >= 60
) {
return "HIGH";
}

if (
riskScore >= 30
) {
return "MEDIUM";
}

return "LOW";
}

/* =========================================================
BOT ANALYSIS
========================================================= */

export async function analyzeVxBot(
options: AnalyzeBotOptions,
): Promise<VxBotAnalysis> {
await ensureLoaded();

const profile =
getOrCreateProfile(
options.actor,
);

const now =
Date.now();

profile.lastSeen =
now;

profile.messageCount =
Math.min(
Number.MAX_SAFE_INTEGER,
profile.messageCount +
safeCounter(
options.messages,
),
);

profile.commandCount =
Math.min(
Number.MAX_SAFE_INTEGER,
profile.commandCount +
safeCounter(
options.commands,
),
);

profile.linkCount =
Math.min(
Number.MAX_SAFE_INTEGER,
profile.linkCount +
safeCounter(
options.links,
),
);

profile.repeatedMessageCount =
Math.min(
Number.MAX_SAFE_INTEGER,
profile.repeatedMessageCount +
safeCounter(
options.repeatedMessages,
),
);

recordGroup(
profile,
options.group,
);

updateActivityRate(
profile,
options.messagesPerMinute,
);

const factors =
buildFactors(
profile,
);

const confidence =
calculateBotConfidence(
profile,
factors,
);

const profileRisk =
calculateProfileRisk(
factors,
);

profile.riskScore =
profileRisk;

profile.confidence =
confidence;

profile.severity =
getProfileSeverity(
profileRisk,
confidence,
);

profile.indicators =
boundedUnique(
factors.map(
factor =>
factor.name,
),
MAX_INDICATORS,
);

if (
options.reason
) {
addHistory(
profile,
"ANALYSIS",
profileRisk,
options.reason,
);
}

const enoughEvidence =
profile.messageCount >=
MIN_MESSAGES_FOR_SUSPICION;

const suspectedBot =
enoughEvidence &&
profileRisk >= 60 &&
confidence >= 60;

let incidentId:
| string
| undefined;

/*

* Persist profile state even when the engine
* does not create an incident.
  */
  await persist();

if (
factors.length > 0 &&
(
suspectedBot ||
Math.max(
...factors.map(
factor =>
factor.score,
),
) >= 20
)
) {
const event =
await analyzeVxEvent({
type:
"BOT",


    group:
      options.group,

    actor:
      {
        ...options.actor,
        isBot:
          suspectedBot,
      },

    reason:
      options.reason ||
      (
        suspectedBot
          ? "VX behavioral intelligence identified a participant with multiple automation-like indicators."
          : "VX behavioral intelligence identified suspicious bot-like behavioral indicators."
      ),

    indicators:
      boundedUnique(
        factors.map(
          factor =>
            factor.name,
        ),
        MAX_INDICATORS,
      ),

    factors,

    confidence,

    /*
     * Explicit false remains false.
     * Undefined preserves the existing default:
     * suspected bots may create incidents.
     */
    createIncident:
      options.createIncident ??
      suspectedBot,

    metadata: {
      profileKey:
        profile.key,

      profileRiskScore:
        profileRisk,

      profileConfidence:
        confidence,

      messageCount:
        profile.messageCount,

      commandCount:
        profile.commandCount,

      linkCount:
        profile.linkCount,

      repeatedMessageCount:
        profile.repeatedMessageCount,

      groupsSeen:
        profile.groupsSeen,

      averageMessagesPerMinute:
        profile.averageMessagesPerMinute,

      intelligenceLayer:
        "VX-BOT",

      classification:
        suspectedBot
          ? "SUSPECTED_AUTOMATION"
          : "SUSPICIOUS_BEHAVIOR",
    },
  });

incidentId =
  event.incidentId;

if (
  event.incidentId
) {
  addHistory(
    profile,
    "INCIDENT",
    event.risk?.score ??
      profileRisk,
    `VX Engine created incident ${event.incidentId}.`,
  );

  await persist();
}

}

return {
profile,


suspectedBot,

riskScore:
  profileRisk,

confidence,

severity:
  profile.severity,

factors,

indicators:
  profile.indicators,

incidentId,


};
}

/* =========================================================
GET SINGLE PROFILE
========================================================= */

export async function getVxBotProfile(
  identifier: string,
): Promise<VxBotProfile | undefined> {
  await ensureLoaded();

  const raw = String(identifier || "")
    .trim()
    .toLowerCase();

  if (!raw) {
    return undefined;
  }

  const normalized = normalizeJid(raw);

  const direct = profiles.get(normalized);

  if (direct) {
    return direct;
  }

  const phone = normalizePhone(raw);

  if (phone) {
    const phoneMatch = Array.from(profiles.values()).find(
      (profile) =>
        normalizePhone(profile.phoneNumber) === phone ||
        normalizePhone(profile.jid) === phone,
    );

    if (phoneMatch) {
      return phoneMatch;
    }
  }

  return Array.from(profiles.values()).find(
    (profile) =>
      normalizeJid(profile.jid) === normalized ||
      normalizePhone(profile.phoneNumber) === phone ||
      profile.key === raw,
  );
}

/* =========================================================
GET PROFILES
========================================================= */

export async function getVxBotProfiles(
limit = 100,
): Promise<VxBotProfile[]> {
await ensureLoaded();

const safeLimit =
Math.max(
1,
Math.min(
1000,
Math.floor(
safeNumber(
limit,
100,
),
),
),
);

return Array.from(
profiles.values(),
)
.sort(
(
a,
b,
) =>
b.riskScore -
a.riskScore ||
b.confidence -
a.confidence ||
b.lastSeen -
a.lastSeen,
)
.slice(
0,
safeLimit,
);
}

/* =========================================================
SUSPECTED BOTS
========================================================= */

export async function getSuspectedVxBots(
limit = 50,
): Promise<VxBotProfile[]> {
const safeLimit =
Math.max(
1,
Math.min(
500,
Math.floor(
safeNumber(
limit,
50,
),
),
),
);

const all =
await getVxBotProfiles(
1000,
);

return all
.filter(
profile =>
profile.messageCount >=
MIN_MESSAGES_FOR_SUSPICION &&
profile.riskScore >= 60 &&
profile.confidence >= 60,
)
.slice(
0,
safeLimit,
);
}

/* =========================================================
CLEAR PROFILE
========================================================= */

export async function clearVxBotProfile(
identifier: string,
): Promise<boolean> {
await ensureLoaded();

const profile =
await getVxBotProfile(
identifier,
);

if (!profile) {
return false;
}

profiles.delete(
profile.key,
);

await persist();

return true;
}

/* =========================================================
CLEAR ALL PROFILES
========================================================= */

export async function clearVxBotProfiles(): Promise<void> {
await ensureLoaded();

profiles.clear();

await persist();
}

/* =========================================================
PROFILE STATISTICS
========================================================= */

export async function getVxBotProfileStats(): Promise<{
totalProfiles: number;
suspectedBots: number;
highRiskProfiles: number;
criticalProfiles: number;
totalMessages: number;
totalCommands: number;
totalLinks: number;
}> {
await ensureLoaded();

let suspectedBots =
0;

let highRiskProfiles =
0;

let criticalProfiles =
0;

let totalMessages =
0;

let totalCommands =
0;

let totalLinks =
0;

for (
const profile of
profiles.values()
) {
totalMessages =
Math.min(
Number.MAX_SAFE_INTEGER,
totalMessages +
Math.max(
0,
profile.messageCount,
),
);


totalCommands =
  Math.min(
    Number.MAX_SAFE_INTEGER,
    totalCommands +
      Math.max(
        0,
        profile.commandCount,
      ),
  );

totalLinks =
  Math.min(
    Number.MAX_SAFE_INTEGER,
    totalLinks +
      Math.max(
        0,
        profile.linkCount,
      ),
  );

if (
  profile.messageCount >=
    MIN_MESSAGES_FOR_SUSPICION &&
  profile.riskScore >= 60 &&
  profile.confidence >= 60
) {
  suspectedBots++;
}

if (
  profile.severity ===
  "HIGH"
) {
  highRiskProfiles++;
}

if (
  profile.severity ===
  "CRITICAL"
) {
  criticalProfiles++;
}


}

return {
totalProfiles:
profiles.size,


suspectedBots,

highRiskProfiles,

criticalProfiles,

totalMessages,

totalCommands,

totalLinks,

};
}

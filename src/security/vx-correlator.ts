import type {
VxGroupContext,
VxRiskFactor,
} from "./vx-types.js";

import {
createRiskFactor,
} from "./vx-risk.js";

interface CorrelationEvent {
actorJid: string;
timestamp: number;
text?: string;
normalizedText?: string;
url?: string;
command?: string;
suspicious?: boolean;
}

interface GroupCorrelationState {
events: CorrelationEvent[];
actors: Set<string>;
lastUpdated: number;
}

export interface VxCorrelationResult {
coordinated: boolean;
score: number;
confidence: number;
actors: string[];
indicators: string[];
factors: VxRiskFactor[];
evidence: {
sharedMessages: number;
sharedUrls: number;
synchronizedActors: number;
commandClusters: number;
};
}

const WINDOW_MS = 90_000;
const MAX_EVENTS = 300;
const MAX_ACTORS = 100;
const MAX_TEXT_LENGTH = 2_000;
const MAX_COMMAND_LENGTH = 200;
const MAX_INDICATORS = 20;
const MAX_FACTORS = 20;

const groups = new Map<string, GroupCorrelationState>();

function normalizeText(text?: string): string {
if (!text) {
return "";
}

return text
.slice(0, MAX_TEXT_LENGTH)
.toLowerCase()
.replace(/\s+/g, " ")
.trim();
}

function normalizeActor(actorJid?: string): string {
const value = (actorJid || "").trim();

if (!value) {
return "unknown";
}

return value.slice(0, 200);
}

function normalizeGroupId(groupId?: string): string {
const value = (groupId || "").trim();

if (!value) {
return "unknown-group";
}

return value.slice(0, 300);
}

function normalizeCommand(command?: string): string | undefined {
const value = (command || "").trim();

if (!value) {
return undefined;
}

return value.slice(0, MAX_COMMAND_LENGTH).toLowerCase();
}

function safeTimestamp(timestamp?: number): number {
if (!Number.isFinite(timestamp)) {
return Date.now();
}

return Math.max(0, Math.floor(timestamp ?? Date.now()));
}

function extractUrls(text?: string): string[] {
if (!text) {
return [];
}

const matches =
text.match(
/https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+/gi,
) || [];

const urls = new Set<string>();

for (const value of matches) {
const normalized = value
.replace(/[),.!?;:'"]+$/g, "")
.trim()
.toLowerCase();


if (!normalized) {
  continue;
}

urls.add(normalized.slice(0, 500));

if (urls.size >= 50) {
  break;
}


}

return Array.from(urls);
}

function getState(groupId: string): GroupCorrelationState {
let state = groups.get(groupId);

if (!state) {
state = {
events: [],
actors: new Set<string>(),
lastUpdated: Date.now(),
};


groups.set(groupId, state);


}

return state;
}

function cleanup(
state: GroupCorrelationState,
now: number,
): void {
const cutoff = now - WINDOW_MS;

state.events = state.events
.filter(
event =>
Number.isFinite(event.timestamp) &&
event.timestamp >= cutoff &&
event.timestamp <= now + 10_000,
)
.sort(
(a, b) =>
a.timestamp - b.timestamp,
);

if (state.events.length > MAX_EVENTS) {
state.events = state.events.slice(-MAX_EVENTS);
}

state.actors.clear();

for (const event of state.events) {
if (state.actors.size >= MAX_ACTORS) {
break;
}


state.actors.add(event.actorJid);


}

state.lastUpdated = now;
}

function countSharedMessages(
events: CorrelationEvent[],
): number {
const byMessage =
new Map<string, Set<string>>();

for (const event of events) {
const text = event.normalizedText || "";


if (text.length < 4) {
  continue;
}

let actors = byMessage.get(text);

if (!actors) {
  actors = new Set<string>();
  byMessage.set(text, actors);
}

actors.add(event.actorJid);

}

let count = 0;

for (const actors of byMessage.values()) {
if (actors.size >= 2) {
count++;
}
}

return count;
}

function countSharedUrls(
events: CorrelationEvent[],
): number {
const byUrl =
new Map<string, Set<string>>();

for (const event of events) {
const urls = extractUrls(event.text);


for (const url of urls) {
  let actors = byUrl.get(url);

  if (!actors) {
    actors = new Set<string>();
    byUrl.set(url, actors);
  }

  actors.add(event.actorJid);
}


}

let count = 0;

for (const actors of byUrl.values()) {
if (actors.size >= 2) {
count++;
}
}

return count;
}

function countSynchronizedActors(
events: CorrelationEvent[],
): number {
let synchronizedPairs = 0;

for (
let i = 0;
i < events.length;
i++
) {
const first = events[i];


if (!first) {
  continue;
}

for (
  let j = i + 1;
  j < events.length;
  j++
) {
  const second = events[j];

  if (!second) {
    continue;
  }

  if (
    first.actorJid ===
    second.actorJid
  ) {
    continue;
  }

  const difference =
    Math.abs(
      first.timestamp -
        second.timestamp,
    );

  if (difference > 5_000) {
    if (
      second.timestamp >
      first.timestamp
    ) {
      break;
    }

    continue;
  }

  synchronizedPairs++;
}

}

return synchronizedPairs;
}

function countCommandClusters(
events: CorrelationEvent[],
): number {
const commandEvents =
events.filter(
event =>
Boolean(event.command),
);

if (commandEvents.length < 2) {
return 0;
}

let clusters = 0;

for (
let i = 0;
i < commandEvents.length;
i++
) {
const first = commandEvents[i];

if (!first) {
  continue;
}

for (
  let j = i + 1;
  j < commandEvents.length;
  j++
) {
  const second =
    commandEvents[j];

  if (!second) {
    continue;
  }

  if (
    first.actorJid ===
    second.actorJid
  ) {
    continue;
  }

  const difference =
    Math.abs(
      first.timestamp -
        second.timestamp,
    );

  if (difference > 5_000) {
    if (
      second.timestamp >
      first.timestamp
    ) {
      break;
    }

    continue;
  }

  clusters++;
}

}

return clusters;
}

function pushIndicator(
indicators: string[],
value: string,
): void {
const normalized =
value.trim();

if (!normalized) {
return;
}

if (
indicators.includes(normalized)
) {
return;
}

if (
indicators.length >=
MAX_INDICATORS
) {
return;
}

indicators.push(normalized);
}

function pushFactor(
factors: VxRiskFactor[],
factor: VxRiskFactor,
): void {
if (
factors.length >=
MAX_FACTORS
) {
return;
}

if (
factors.some(
existing =>
existing.name === factor.name,
)
) {
return;
}

factors.push(factor);
}

function calculateConfidence(
actors: number,
factors: number,
sharedUrls: number,
synchronizedActors: number,
suspiciousEvents: number,
): number {
let confidence = 20;

confidence += Math.min(
30,
factors * 8,
);

if (actors >= 3) {
confidence += 15;
}

if (sharedUrls > 0) {
confidence += 15;
}

if (synchronizedActors >= 3) {
confidence += 15;
}

if (suspiciousEvents >= 3) {
confidence += 10;
}

return Math.max(
0,
Math.min(
100,
confidence,
),
);
}

export function correlateVxGroupActivity(
group: VxGroupContext,
input: {
actorJid?: string;
text?: string;
command?: string;
suspicious?: boolean;
},
): VxCorrelationResult {
const groupId =
normalizeGroupId(
group?.jid,
);

const actorJid =
normalizeActor(
input.actorJid,
);

const now =
Date.now();

const state =
getState(groupId);

cleanup(
state,
now,
);

state.events.push({
actorJid,
timestamp: now,
text:
input.text
?.slice(
0,
MAX_TEXT_LENGTH,
),
normalizedText:
normalizeText(
input.text,
),
command:
normalizeCommand(
input.command,
),
suspicious:
Boolean(
input.suspicious,
),
});

cleanup(
state,
now,
);

const sharedMessages =
countSharedMessages(
state.events,
);

const sharedUrls =
countSharedUrls(
state.events,
);

const synchronizedActors =
countSynchronizedActors(
state.events,
);

const commandClusters =
countCommandClusters(
state.events,
);

const factors:
VxRiskFactor[] = [];

const indicators:
string[] = [];

if (sharedMessages >= 3) {
pushFactor(
factors,
createRiskFactor(
"coordinated_message_pattern",
30,
`${sharedMessages} repeated message patterns were observed across multiple accounts.`,
),
);


pushIndicator(
  indicators,
  "Multiple accounts sharing identical message patterns",
);


} else if (sharedMessages >= 1) {
pushFactor(
factors,
createRiskFactor(
"shared_message_pattern",
15,
`${sharedMessages} message pattern(s) were shared by multiple accounts.`,
),
);


pushIndicator(
  indicators,
  "Shared message pattern between accounts",
);


}

if (sharedUrls >= 3) {
pushFactor(
factors,
createRiskFactor(
"coordinated_link_activity",
35,
`${sharedUrls} URLs were observed across multiple accounts.`,
),
);


pushIndicator(
  indicators,
  "Multiple accounts distributing shared links",
);


} else if (sharedUrls >= 1) {
pushFactor(
factors,
createRiskFactor(
"shared_link_activity",
20,
`${sharedUrls} URL pattern(s) were shared by multiple accounts.`,
),
);


pushIndicator(
  indicators,
  "Shared URL activity between accounts",
);


}

if (synchronizedActors >= 6) {
pushFactor(
factors,
createRiskFactor(
"synchronized_activity",
35,
`${synchronizedActors} cross-account activity pairs occurred within five seconds.`,
),
);
pushIndicator(
  indicators,
  "Highly synchronized multi-account activity",
);


} else if (synchronizedActors >= 3) {
pushFactor(
factors,
createRiskFactor(
"synchronized_activity",
20,
`${synchronizedActors} cross-account activity pairs occurred within five seconds.`,
),
);


pushIndicator(
  indicators,
  "Synchronized multi-account activity",
);


}

if (commandClusters >= 5) {
pushFactor(
factors,
createRiskFactor(
"coordinated_commands",
30,
`${commandClusters} cross-account command clusters were detected.`,
),
);


pushIndicator(
  indicators,
  "Coordinated command activity",
);


} else if (commandClusters >= 2) {
pushFactor(
factors,
createRiskFactor(
"command_cluster",
15,
`${commandClusters} cross-account command clusters were detected.`,
),
);

pushIndicator(
  indicators,
  "Cross-account command synchronization",
);


}

const suspiciousEvents =
state.events.filter(
event =>
event.suspicious === true,
).length;

if (
suspiciousEvents >= 3 &&
state.actors.size >= 2
) {
pushFactor(
factors,
createRiskFactor(
"multi_actor_suspicion",
25,
`${suspiciousEvents} suspicious events were associated with multiple accounts.`,
),
);


pushIndicator(
  indicators,
  "Multiple suspicious actors detected",
);


}

const score =
Math.min(
100,
factors.reduce(
(
total,
factor,
) =>
total +
Math.max(
0,
Math.min(
100,
factor.score,
),
),
0,
),
);

const confidence =
calculateConfidence(
state.actors.size,
factors.length,
sharedUrls,
synchronizedActors,
suspiciousEvents,
);

const coordinated =
state.actors.size >= 2 &&
score >= 30;

return {
coordinated,
score,
confidence,
actors:
Array.from(
state.actors,
).slice(
0,
MAX_ACTORS,
),
indicators,
factors,
evidence: {
sharedMessages,
sharedUrls,
synchronizedActors,
commandClusters,
},
};
}

export function clearVxCorrelation(
groupId?: string,
): void {
if (groupId) {
groups.delete(
normalizeGroupId(
groupId,
),
);

return;


}

groups.clear();
}

export function cleanupVxCorrelation(): void {
const now =
Date.now();

for (
const [
groupId,
state,
] of groups
) {
cleanup(
state,
now,
);


if (
  state.events.length === 0
) {
  groups.delete(
    groupId,
  );
}

}
}

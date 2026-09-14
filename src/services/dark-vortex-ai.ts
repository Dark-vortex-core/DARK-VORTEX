import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  getCategories,
  getEnabledCommands,
} from "../commands/registry.js";

import {
  sendVortexReply,
} from "../utils/vortex-reply.js";

/* =========================================================
   🌑 DARK VORTEX AI
   ⚡ Powered by Vortex Tech

   Responsibilities:
   • Dark Vortex informational AI
   • Dark Vortex knowledge / identity
   • Founder / project history knowledge
   • Gemini → Groq → OpenRouter fallback
   • AI-assisted behavioral bot analysis
   • Safe structured AI responses
   • No command execution
   • No secret exposure
========================================================= */


/* =========================================================
   AI CONFIGURATION
========================================================= */

function getAIConfig() {
  return {
    enabled:
      (process.env.DARK_VORTEX_AI_ENABLED || "true")
        .trim()
        .toLowerCase() === "true",

    geminiApiKey:
      process.env.DARK_VORTEX_AI_GEMINI_API_KEY?.trim() || "",

    geminiModel:
      process.env.DARK_VORTEX_AI_GEMINI_MODEL?.trim() ||
      "gemini-2.5-flash",

    groqApiKey:
      process.env.DARK_VORTEX_AI_GROQ_API_KEY?.trim() || "",

    groqModel:
      process.env.DARK_VORTEX_AI_GROQ_MODEL?.trim() ||
      "openai/gpt-oss-120b",

    openRouterApiKey:
      process.env.DARK_VORTEX_AI_API_KEY?.trim() || "",

    openRouterModel:
      process.env.DARK_VORTEX_AI_MODEL?.trim() ||
      "qwen/qwen3-30b-a3b:free",

    openRouterApiUrl:
      process.env.DARK_VORTEX_AI_API_URL?.trim() ||
      "https://openrouter.ai/api/v1/chat/completions",
  };
}


/* =========================================================
   LIMITS
========================================================= */

const MAX_INPUT_LENGTH = 4000;
const MAX_OUTPUT_TOKENS = 700;

const CHAT_COOLDOWN_MS = 4000;

const BOT_AI_COOLDOWN_MS = 60_000;

const chatCooldowns =
  new Map<string, number>();

const botAICooldowns =
  new Map<string, number>();


/* =========================================================
   🌑 DARK VORTEX PROJECT IDENTITY
========================================================= */

const DARK_VORTEX_PROJECT_HISTORY = `
PROJECT IDENTITY
----------------
Name:
🌑 DARK VORTEX

Brand:
Vortex Tech

Powered by:
⚡ VORTEX TECH

Creator:
Brian

Founder:
Brian is the founder of Vortex Tech and the creator/founder
of the Dark Vortex project.

Development:
Dark Vortex was developed during September 2026 as a Vortex Tech
WhatsApp bot project.

Development status:
Dark Vortex is an actively developed project. Its systems,
features, commands, security layers, automation, moderation,
group-management tools, AI intelligence, and VX security systems
have been developed and expanded over time.

IMPORTANT HISTORY RULE:
The AI may state that Brian is the founder of Vortex Tech and
the creator/founder of Dark Vortex.

The AI must NOT invent:
• An exact launch date that has not been provided
• Additional founders
• Employees or developers who have not been confirmed
• Investors
• Companies or partnerships that have not been confirmed
• Fake development milestones
• Fake version history
• Fake awards
• Fake user statistics

If asked for an exact historical date that is not known,
say that the project was developed during September 2026 but
that an exact date is not currently confirmed.

PROJECT PURPOSE
---------------
Dark Vortex is a WhatsApp owner-control and security bot
developed under Vortex Tech.

Its architecture includes:

• Owner control
• Group management
• Moderation
• Protection systems
• Automation
• Triggers
• Announcements
• Away mode
• Rest mode
• Maintenance controls
• System diagnostics
• VX security intelligence
• Behavioral bot detection
• AI-assisted analysis
• Security monitoring
• Security incidents
• Security reports
• Audit systems
• QR connection
• Pairing-code connection
• Command registry
• Lifecycle management

Dark Vortex is designed to provide centralized control,
security, automation, moderation, and intelligence for
WhatsApp environments.

The project is owned and controlled through the bot's
configured owner system.

The command registry is the authoritative source for
actual commands and their current metadata.
`;


/* =========================================================
   🌑 DARK VORTEX KNOWLEDGE ENGINE
========================================================= */

export function buildDarkVortexKnowledge(): string {
  const categories =
    getCategories();

  const commands =
    getEnabledCommands();

  const categoryKnowledge =
    categories
      .sort(
        (a, b) =>
          a.order - b.order,
      )
      .map(
        category =>
          `• ${category.icon} ${category.name} (${category.id}) — ${category.description}`,
      )
      .join("\n");

  const commandKnowledge =
    commands
      .filter(
        command =>
          !command.hidden,
      )
      .map(command => {
        const aliases =
          command.aliases?.filter(
            Boolean,
          );

        const aliasText =
          aliases &&
          aliases.length > 0
            ? ` | Aliases: ${aliases.join(", ")}`
            : "";

        const access =
          command.access ||
          "public";

        const scope =
          command.scope ||
          "any";

        const confirmation =
          command.confirmation
            ? " | Confirmation required"
            : "";

        const dangerous =
          command.dangerous
            ? " | Dangerous operation"
            : "";

        return [
          `• ${command.name}`,
          `Description: ${command.description}`,
          `Usage: ${command.usage || command.name}`,
          `Category: ${command.category}`,
          `Access: ${access}`,
          `Scope: ${scope}`,
          aliasText,
          confirmation,
          dangerous,
        ]
          .filter(Boolean)
          .join(" | ");
      })
      .join("\n");

  return `
${DARK_VORTEX_PROJECT_HISTORY}

==================================================
REGISTERED COMMAND KNOWLEDGE
==================================================

The following information is generated directly from the
actual Dark Vortex command registry.

CATEGORIES
----------
${categoryKnowledge}

REGISTERED COMMANDS
-------------------
${commandKnowledge}

==================================================
SECURITY CAPABILITIES
==================================================

Dark Vortex contains configurable protection systems
including:

• Anti-link protection
• Anti-group-link protection
• Anti-status protection
• Anti-spam protection
• Automatic bot detection
• AI-assisted bot behavior analysis
• Anti-mention protection
• Flood protection
• Suspicious-account protection
• NSFW media protection
• Group protection
• Anti-edit message detection
• Moderation
• Warning systems
• Ban systems
• Group administration

==================================================
VX INTELLIGENCE
==================================================

VX is Dark Vortex's security-intelligence layer.

Registered VX capabilities include:

• VX security scans
• VX group monitoring
• Suspicious bot analysis
• AI-assisted behavioral analysis
• Security incidents
• Incident history
• VX operation abort/resume
• Security status
• VX health
• Security logs
• Security statistics
• Management reports
• Bot checking
• Group bot scanning
• Operation progress
• Latency monitoring
• Audit trails
• User auditing
• Group auditing
• Security timelines
• Security events
• Security evidence
• Security snapshots
• Protected lockdown
• Failsafe protection
• Quiet security mode
• Security pause
• Security recovery
• Security testing

==================================================
GROUP MANAGEMENT
==================================================

Dark Vortex supports registered group-management
capabilities such as:

• Group enable/disable
• Member removal
• Member addition
• Promotion
• Demotion
• Mute/unmute
• Open/close
• Administrator-only messaging
• Group information
• Group administrators
• Group members
• Member inspection
• Member tagging
• Invite links
• Group profile picture
• Group name
• Group description
• Join approval
• Join requests
• Approving requests
• Rejecting requests
• VCF contact export

==================================================
AUTOMATION
==================================================

Dark Vortex supports:

• Welcome automation
• Goodbye automation
• Custom welcome messages
• Custom goodbye messages
• Automatic replies
• Automation controls
• Message triggers
• Announcements
• Slow mode
• Management reports

==================================================
OWNER AND SYSTEM CONTROL
==================================================

Dark Vortex contains owner/system capabilities including:

• Bot status
• Runtime information
• System diagnostics
• Memory cleanup
• Rest mode
• Automatic rest mode
• Maintenance mode
• Prefix management
• Synchronization
• Settings
• Configuration backup
• Restart
• Shutdown
• Broadcast
• Owner information
• Away mode

==================================================
CONNECTION
==================================================

Dark Vortex supports its existing WhatsApp connection
infrastructure through:

• QR connection
• Pairing-code connection

Authentication credentials, session information,
pairing secrets and private configuration must never
be exposed through the AI.

==================================================
AI INTELLIGENCE
==================================================

Dark Vortex contains an AI intelligence layer.

The AI has two major informational roles:

1. Dark Vortex knowledge assistant
2. AI-assisted behavioral bot analysis

The informational assistant explains the actual Dark Vortex
system and its registered capabilities.

The behavioral AI analyzes observable message patterns
when enough evidence exists.

The AI does NOT independently kick, ban, delete, warn,
mute, or otherwise enforce protection.

Actual enforcement remains under the existing Dark Vortex
security and protection systems.

==================================================
AUTHORITY
==================================================

The command registry is authoritative for:

• Command existence
• Command names
• Aliases
• Access levels
• Scope
• Confirmation requirements
• Dangerous-operation metadata
• Categories

The AI must never invent a command or claim an unregistered
feature exists.

==================================================
BEHAVIOR RULES
==================================================

The AI must:

1. Never invent commands.
2. Never invent features.
3. Never claim an action was executed.
4. Never execute commands.
5. Respect command permissions.
6. Respect command scope.
7. Never reveal secrets.
8. Never reveal API keys.
9. Never reveal session data.
10. Never reveal pairing secrets.
11. Never reveal private owner configuration.
12. Never fabricate live system information.
13. Never fabricate logs.
14. Never fabricate incidents.
15. Never fabricate security statistics.
16. Never fabricate group state.
17. Never fabricate connection state.
18. Explain commands rather than executing them.
19. Use the command registry as the source of truth.
20. Keep responses concise unless detail is requested.
21. Use the Dark Vortex identity naturally.
22. Use emojis sparingly.
23. Remain technically accurate.
24. If historical information is unknown, say so clearly.
25. Never invent additional information about Brian or Vortex Tech.
`;
}


/* =========================================================
   🌑 DARK VORTEX INTENT DETECTION
========================================================= */

function normalizeText(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


export function isDarkVortexRelated(
  text: string,
): boolean {
  const normalized =
    normalizeText(text);

  if (!normalized) {
    return false;
  }

  const directTerms = [
    "dark vortex",
    "darkvortex",
    "vortex",
    "vortex tech",
    "vx security",
    "vx intelligence",
    "vx bot",
    "vx monitor",
    "vx scan",
    "vx report",
  ];

  if (
    directTerms.some(
      term =>
        normalized.includes(term),
    ) ||
    /\bvx\b/i.test(normalized)
  ) {
    return true;
  }

  const featureTerms = [
    "anti edit",
    "antiedit",
    "anti-delete",
    "antidelete",
    "anti link",
    "antilink",
    "anti spam",
    "antispam",
    "anti bot",
    "antibot",
    "anti flood",
    "antiflood",
    "anti mention",
    "antimention",
    "group protection",
    "security system",
    "protection system",
    "bot detection",
    "ai bot detection",
    "ai bot detector",
    "group management",
    "rest mode",
    "pairing code",
    "qr code",
    "owner commands",
    "owner control",
    "bot commands",
    "bot features",
    "bot capabilities",
    "your commands",
    "your features",
    "your capabilities",
    "founder",
    "creator",
    "who created you",
    "who made you",
    "who built you",
    "who developed you",
    "when were you developed",
    "when was dark vortex created",
    "when was dark vortex developed",
    "who is brian",
    "brian",
  ];

  if (
    featureTerms.some(
      term =>
        normalized.includes(term),
    )
  ) {
    return true;
  }

  const identityQuestions = [
    "who are you",
    "what are you",
    "what can you do",
    "what do you do",
    "what is your purpose",
    "how do you work",
    "tell me about yourself",
    "tell me about the bot",
    "what is this bot",
    "what bot is this",
  ];

  return identityQuestions.some(
    pattern =>
      normalized.includes(pattern),
  );
}


/* =========================================================
   COOLDOWN
========================================================= */

function isOnCooldown(
  jid: string,
): boolean {
  const last =
    chatCooldowns.get(jid);

  if (!last) {
    return false;
  }

  return (
    Date.now() - last <
    CHAT_COOLDOWN_MS
  );
}


function markCooldown(
  jid: string,
): void {
  chatCooldowns.set(
    jid,
    Date.now(),
  );

  if (
    chatCooldowns.size > 1000
  ) {
    const oldest =
      chatCooldowns.keys()
        .next().value;

    if (oldest) {
      chatCooldowns.delete(
        oldest,
      );
    }
  }
}


function isBotAICooldown(
  jid: string,
): boolean {
  const last =
    botAICooldowns.get(jid);

  if (!last) {
    return false;
  }

  return (
    Date.now() - last <
    BOT_AI_COOLDOWN_MS
  );
}


function markBotAICooldown(
  jid: string,
): void {
  botAICooldowns.set(
    jid,
    Date.now(),
  );

  if (
    botAICooldowns.size > 1000
  ) {
    const oldest =
      botAICooldowns.keys()
        .next().value;

    if (oldest) {
      botAICooldowns.delete(
        oldest,
      );
    }
  }
}


/* =========================================================
   🌑 NORMAL DARK VORTEX AI PROMPT
========================================================= */

function buildSystemPrompt(): string {
  return `
You are the built-in AI intelligence of 🌑 DARK VORTEX.

You are not a generic chatbot.

Your purpose is to understand, explain, and provide useful
information about Dark Vortex and its actual systems.

${DARK_VORTEX_PROJECT_HISTORY}

==================================================
CORE RULES
==================================================

• Never invent commands.
• Never invent features.
• Never claim an action was executed.
• Never expose secrets.
• Never expose API keys.
• Never expose authentication information.
• Never expose session information.
• Never expose pairing secrets.
• Never reveal private owner configuration.
• Never bypass permissions.
• Never execute commands through conversation.
• Explain commands instead of executing them.
• Never fabricate live system information.
• Never fabricate logs or statistics.
• Never fabricate group state.
• Never fabricate connection state.
• Never fabricate project history.
• Do not invent additional information about Brian.
• Do not invent additional information about Vortex Tech.
• Use the actual command registry as authoritative.

==================================================
WHATSAPP RESPONSE STYLE
==================================================

Keep responses clean and native to WhatsApp.

Do not use:

• Markdown tables
• Markdown code fences
• Excessive decoration
• Excessive emojis
• Long decorative borders

Single backticks may be used for command names when useful.

Normal commands should be explained naturally.

Structured information may use:

╭─「 TITLE 」
│ Information
│ Information
╰──────────────

Do not put every response inside a box.

==================================================
IDENTITY
==================================================

When appropriate identify yourself as:

🌑 DARK VORTEX

Powered by:

⚡ VORTEX TECH

If asked who created you:

Brian is the founder of Vortex Tech and the creator/founder
of the Dark Vortex project.

If asked when Dark Vortex was developed:

Dark Vortex was developed during September 2026.

Do not invent an exact date unless one is explicitly known.

==================================================
PROJECT KNOWLEDGE
==================================================

${buildDarkVortexKnowledge()}

==================================================
FINAL RULE
==================================================

Accuracy is more important than pretending to know something.

If information is unavailable or not confirmed, say so clearly.

You are Dark Vortex's intelligence layer.

You explain the system.

You do not secretly control the system.

You do not invent the system.

You do not expose protected information.
`;
}


/* =========================================================
   GENERIC OPENAI-COMPATIBLE REQUEST
========================================================= */

async function requestOpenAICompatible(
  apiUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userText: string,
  maxTokens: number,
  temperature: number,
): Promise<string | null> {
  if (
    !apiKey ||
    !apiUrl ||
    !model
  ) {
    return null;
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      30000,
    );

  try {
    const response =
      await fetch(
        apiUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${apiKey}`,

            "HTTP-Referer":
              "https://dark-vortex.local",

            "X-Title":
              "Dark Vortex",
          },

          body:
            JSON.stringify({
              model,

              messages: [
                {
                  role: "system",
                  content:
                    systemPrompt,
                },

                {
                  role: "user",
                  content:
                    userText.slice(
                      0,
                      MAX_INPUT_LENGTH,
                    ),
                },
              ],

              max_tokens:
                maxTokens,

              temperature,
            }),

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json() as any;

    const answer =
      data?.choices?.[0]
        ?.message?.content;

    if (
      typeof answer !==
        "string" ||
      !answer.trim()
    ) {
      return null;
    }

    return answer.trim();

  } catch (error) {
    console.error(
      "[DARK VORTEX AI] Provider request failed:",
      error,
    );

    return null;

  } finally {
    clearTimeout(timeout);
  }
}


/* =========================================================
   GEMINI REQUEST
========================================================= */

async function requestGemini(
  systemPrompt: string,
  userText: string,
  maxTokens: number,
  temperature: number,
): Promise<string | null> {
  const config =
    getAIConfig();

  if (
    !config.enabled ||
    !config.geminiApiKey
  ) {
    return null;
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      config.geminiModel,
    )}:generateContent?key=${encodeURIComponent(
      config.geminiApiKey,
    )}`;

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      30000,
    );

  try {
    const response =
      await fetch(
        url,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              systemInstruction: {
                parts: [
                  {
                    text:
                      systemPrompt,
                  },
                ],
              },

              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text:
                        userText.slice(
                          0,
                          MAX_INPUT_LENGTH,
                        ),
                    },
                  ],
                },
              ],

              generationConfig: {
                maxOutputTokens:
                  maxTokens,

                temperature,
              },
            }),

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json() as any;

    const answer =
      data?.candidates?.[0]
        ?.content?.parts
        ?.map(
          (part: any) =>
            part?.text || "",
        )
        .join("")
        .trim();

    if (!answer) {
      return null;
    }

    return answer;

  } catch (error) {
    console.error(
      "[DARK VORTEX AI] Gemini request failed:",
      error,
    );

    return null;

  } finally {
    clearTimeout(timeout);
  }
}


/* =========================================================
   GROQ REQUEST
========================================================= */

async function requestGroq(
  systemPrompt: string,
  userText: string,
  maxTokens: number,
  temperature: number,
): Promise<string | null> {
  const config =
    getAIConfig();

  return requestOpenAICompatible(
    "https://api.groq.com/openai/v1/chat/completions",
    config.groqApiKey,
    config.groqModel,
    systemPrompt,
    userText,
    maxTokens,
    temperature,
  );
}


/* =========================================================
   OPENROUTER REQUEST
========================================================= */

async function requestOpenRouter(
  systemPrompt: string,
  userText: string,
  maxTokens: number,
  temperature: number,
): Promise<string | null> {
  const config =
    getAIConfig();

  return requestOpenAICompatible(
    config.openRouterApiUrl,
    config.openRouterApiKey,
    config.openRouterModel,
    systemPrompt,
    userText,
    maxTokens,
    temperature,
  );
}


/* =========================================================
   NORMAL AI PROVIDER FALLBACK
========================================================= */

async function requestAI(
  userText: string,
): Promise<string | null> {
  const config =
    getAIConfig();

  if (!config.enabled) {
    return null;
  }

  const systemPrompt =
    buildSystemPrompt();

  /*
   * Provider priority:
   *
   * 1. Gemini
   * 2. Groq
   * 3. OpenRouter
   */

  if (config.geminiApiKey) {
    const result =
      await requestGemini(
        systemPrompt,
        userText,
        MAX_OUTPUT_TOKENS,
        0.35,
      );

    if (result) {
      return result;
    }
  }

  if (config.groqApiKey) {
    const result =
      await requestGroq(
        systemPrompt,
        userText,
        MAX_OUTPUT_TOKENS,
        0.35,
      );

    if (result) {
      return result;
    }
  }

  if (config.openRouterApiKey) {
    const result =
      await requestOpenRouter(
        systemPrompt,
        userText,
        MAX_OUTPUT_TOKENS,
        0.35,
      );

    if (result) {
      return result;
    }
  }

  return null;
}


/* =========================================================
   🤖 AI BOT-BEHAVIOR TYPES
========================================================= */

export interface BotBehaviorAIInput {
  totalMessages: number;

  repeatedMessages: number;

  burstEvents: number;

  automationSignals: number;

  commandLikeMessages: number;

  interactiveMessages: number;

  averageIntervalMs: number;

  behavioralConfidence: number;

  behavioralRisk:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  recentMessages: string[];

  recentIntervals: number[];
}


export interface BotBehaviorAIResult {
  botProbability: number;

  confidence: number;

  risk:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  automated: boolean;

  reason: string;

  signals: string[];
}


/* =========================================================
   🤖 BOT ANALYSIS PROMPT
========================================================= */

function buildBotAnalysisPrompt(
  input: BotBehaviorAIInput,
): string {
  const messages =
    input.recentMessages
      .slice(-12)
      .map(
        (message, index) =>
          `${index + 1}. ${message.slice(0, 300)}`,
      )
      .join("\n");

  const intervals =
    input.recentIntervals
      .slice(-12)
      .map(
        value =>
          `${Math.round(value)}ms`,
      )
      .join(", ");

  return `
You are the behavioral bot-analysis engine inside
🌑 DARK VORTEX.

Your job is to assess whether an account's observable
messaging behavior appears automated or bot-like.

You are NOT identifying a person's identity.

You are NOT judging language, nationality, personality,
writing quality, intelligence, or opinions.

You must only evaluate observable automation patterns.

Consider:

• Repeated messages
• Rapid bursts
• Highly regular timing
• Sustained rapid activity
• Interactive-message activity
• Automation signals
• Repeated content
• Unusually machine-like behavior
• Consistency across multiple observations

Do NOT treat these alone as proof of automation:

• Using commands
• Sending links
• Being active
• Writing short messages
• Writing formally
• Writing quickly once
• Using emojis
• Using unusual words
• Speaking in a particular language

Existing behavioral detection data:

Total messages:
${input.totalMessages}

Repeated messages:
${input.repeatedMessages}

Burst events:
${input.burstEvents}

Automation signals:
${input.automationSignals}

Command-like messages:
${input.commandLikeMessages}

Interactive messages:
${input.interactiveMessages}

Average interval:
${Math.round(input.averageIntervalMs)}ms

Existing behavioral confidence:
${input.behavioralConfidence}

Existing behavioral risk:
${input.behavioralRisk}

Recent intervals:
${intervals || "None"}

Recent message samples:
${messages || "None"}

Return ONLY valid JSON.

Required format:

{
  "botProbability": 0,
  "confidence": 0,
  "risk": "LOW",
  "automated": false,
  "reason": "short explanation",
  "signals": [
    "observable signal"
  ]
}

Rules:

botProbability must be 0-100.

confidence must be 0-100.

risk must be exactly LOW, MEDIUM, or HIGH.

automated must be true only when the evidence supports
likely automation.

Use conservative judgment.

Do not claim certainty from insufficient evidence.

The AI result is advisory intelligence only.
Dark Vortex's existing protection system remains the
enforcement authority.
`;
}


/* =========================================================
   🤖 SAFE JSON PARSER
========================================================= */

function parseBotAnalysis(
  raw: string,
): BotBehaviorAIResult | null {
  try {
    let cleaned =
      raw.trim();

    if (
      cleaned.startsWith("```")
    ) {
      cleaned =
        cleaned
          .replace(
            /^```(?:json)?/i,
            "",
          )
          .replace(
            /```$/i,
            "",
          )
          .trim();
    }

    const firstBrace =
      cleaned.indexOf("{");

    const lastBrace =
      cleaned.lastIndexOf("}");

    if (
      firstBrace < 0 ||
      lastBrace <= firstBrace
    ) {
      return null;
    }

    cleaned =
      cleaned.slice(
        firstBrace,
        lastBrace + 1,
      );

    const parsed =
      JSON.parse(cleaned);

    const probability =
      Number(
        parsed?.botProbability,
      );

    const confidence =
      Number(
        parsed?.confidence,
      );

    const risk =
      String(
        parsed?.risk || "LOW",
      ).toUpperCase();

    const automated =
      parsed?.automated === true;

    const reason =
      typeof parsed?.reason ===
      "string"
        ? parsed.reason
            .trim()
            .slice(0, 500)
        : "";

    const signals =
      Array.isArray(
        parsed?.signals,
      )
        ? parsed.signals
            .filter(
              (signal: unknown) =>
                typeof signal ===
                "string",
            )
            .map(
              (signal: string) =>
                signal
                  .trim()
                  .slice(0, 160),
            )
            .filter(Boolean)
            .slice(0, 6)
        : [];

    if (
      !Number.isFinite(
        probability,
      ) ||
      !Number.isFinite(
        confidence,
      ) ||
      !reason
    ) {
      return null;
    }

    const safeProbability =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(
            probability,
          ),
        ),
      );

    const safeConfidence =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(
            confidence,
          ),
        ),
      );

    const safeRisk =
      risk === "HIGH" ||
      risk === "MEDIUM"
        ? risk
        : "LOW";

    return {
      botProbability:
        safeProbability,

      confidence:
        safeConfidence,

      risk:
        safeRisk,

      automated,

      reason,

      signals,
    };

  } catch (error) {
    console.error(
      "[DARK VORTEX AI] Invalid bot-analysis response:",
      error,
    );

    return null;
  }
}


/* =========================================================
   🤖 AI BOT-BEHAVIOR ANALYSIS
========================================================= */

export async function analyzeBotBehaviorWithAI(
  input: BotBehaviorAIInput,
  jid?: string,
): Promise<BotBehaviorAIResult | null> {
  const config =
    getAIConfig();

  if (!config.enabled) {
    return null;
  }

  /*
   * Prevent excessive AI requests for the same participant.
   */

  if (
    jid &&
    isBotAICooldown(jid)
  ) {
    return null;
  }

  /*
   * AI should only be used after enough local evidence
   * exists. This keeps API usage low and reduces false
   * positives.
   */

  if (
    input.totalMessages < 8
  ) {
    return null;
  }

  const enoughEvidence =
    input.behavioralConfidence >= 30 ||
    (
      input.repeatedMessages >= 2 &&
      input.burstEvents >= 2
    ) ||
    input.automationSignals >= 3;

  if (!enoughEvidence) {
    return null;
  }

  if (jid) {
    markBotAICooldown(jid);
  }

  const systemPrompt = `
You are the AI security-analysis component of
🌑 DARK VORTEX, a WhatsApp security and moderation bot
created by Brian under Vortex Tech.

You are an advisory behavioral-analysis engine.

You do not execute commands.

You do not kick users.

You do not ban users.

You do not delete messages.

You do not make enforcement decisions.

You only analyze observable messaging behavior supplied
by the existing Dark Vortex behavioral detector.

Never identify or infer sensitive personal attributes.

Never judge a person based on language, writing style,
nationality, personality, opinions, or identity.

Use observable automation evidence only.

Return valid JSON matching the requested schema.

Be conservative.
`;

  const prompt =
    buildBotAnalysisPrompt(
      input,
    );

  let raw:
    string | null = null;

  /*
   * Use the same Dark Vortex provider stack.
   *
   * Gemini → Groq → OpenRouter
   */

  if (config.geminiApiKey) {
    raw =
      await requestGemini(
        systemPrompt,
        prompt,
        450,
        0.1,
      );
  }

  if (
    !raw &&
    config.groqApiKey
  ) {
    raw =
      await requestGroq(
        systemPrompt,
        prompt,
        450,
        0.1,
      );
  }

  if (
    !raw &&
    config.openRouterApiKey
  ) {
    raw =
      await requestOpenRouter(
        systemPrompt,
        prompt,
        450,
        0.1,
      );
  }

  if (!raw) {
    return null;
  }

  return parseBotAnalysis(
    raw,
  );
}


/* =========================================================
   MAIN DARK VORTEX AI PROCESSOR
========================================================= */

export async function processDarkVortexAI(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  text: string,
): Promise<boolean> {
  const config =
    getAIConfig();

  if (
    !config.enabled
  ) {
    return false;
  }

  /*
   * Never allow the bot to analyze/respond to its own
   * outgoing AI messages.
   */

  if (
    message.key.fromMe
  ) {
    return false;
  }

  const normalized =
    text.trim();

  if (!normalized) {
    return false;
  }

  if (
    !isDarkVortexRelated(
      normalized,
    )
  ) {
    return false;
  }

  if (
    isOnCooldown(jid)
  ) {
    return false;
  }

  markCooldown(jid);

  const answer =
    await requestAI(
      normalized,
    );

  if (!answer) {
    return false;
  }

  try {
    await sendVortexReply(
      sock,
      jid,
      answer,
      message,
    );

    return true;

  } catch (error) {
    console.error(
      "[DARK VORTEX AI] Reply failed:",
      error,
    );

    return false;
  }
}
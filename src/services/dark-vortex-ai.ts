import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

import {
  getCategories,
  getEnabledCommands,
} from "../commands/registry.js";

import { sendVortexReply } from "../utils/vortex-reply.js";

function getAIConfig() {
  return {
    enabled:
      (process.env.DARK_VORTEX_AI_ENABLED || "true")
        .trim()
        .toLowerCase() === "true",

    // PRIMARY
    geminiKey:
      process.env.DARK_VORTEX_AI_GEMINI_API_KEY?.trim() || "",

    geminiModel:
      process.env.DARK_VORTEX_AI_GEMINI_MODEL?.trim() ||
      "gemini-2.5-flash",

    // FALLBACK 1
    groqKey:
      process.env.DARK_VORTEX_AI_GROQ_API_KEY?.trim() || "",

    groqModel:
  process.env.DARK_VORTEX_AI_GROQ_MODEL?.trim() ||
  "openai/gpt-oss-120b",

    // FALLBACK 2
    openRouterKey:
      process.env.DARK_VORTEX_AI_API_KEY?.trim() || "",

    openRouterModel:
      process.env.DARK_VORTEX_AI_MODEL?.trim() ||
      "qwen/qwen3-30b-a3b:free",

    openRouterUrl:
      process.env.DARK_VORTEX_AI_API_URL?.trim() ||
      "https://openrouter.ai/api/v1/chat/completions",
  };
}
const MAX_INPUT_LENGTH = 4000;
const MAX_OUTPUT_TOKENS = 700;

const CHAT_COOLDOWN_MS = 4000;

const chatCooldowns =
  new Map<string, number>();

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
IDENTITY
--------
Name: 🌑 DARK VORTEX
Powered by: ⚡ VORTEX TECH

Dark Vortex is a WhatsApp owner-control, group-management,
automation, moderation, protection, and security-intelligence
bot.

The bot operates through WhatsApp and uses a centralized
command registry, command handlers, security systems,
automation services, lifecycle controls, and VX intelligence.

The built-in AI is an informational intelligence layer.
It does NOT automatically execute commands.

CATEGORIES
----------
${categoryKnowledge}

REGISTERED COMMANDS
-------------------
${commandKnowledge}

SECURITY CAPABILITIES
---------------------
Dark Vortex contains configurable protection systems including:

• Anti-link protection
• Anti-group-link protection
• Anti-status protection
• Anti-spam protection
• Automatic bot detection
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

VX INTELLIGENCE
---------------
VX is Dark Vortex's security-intelligence layer.

Its registered capabilities include:

• VX security scans
• VX group monitoring
• Suspicious bot analysis
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

GROUP MANAGEMENT
-----------------
Dark Vortex supports registered group-management capabilities
such as:

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

AUTOMATION
----------
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

OWNER AND SYSTEM CONTROL
------------------------
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

PAIRING AND CONNECTION
----------------------
Dark Vortex supports WhatsApp connection through its existing
QR and pairing-code infrastructure.

The AI must never expose authentication credentials,
session information, pairing secrets, API keys, or private
configuration values.

BEHAVIOR RULES
--------------
The AI must:

1. Use the registered command information above as the
   authoritative command list.

2. Never invent commands.

3. Never claim an unregistered feature is implemented.

4. Never execute commands.

5. Explain commands when users ask how to perform an action.

6. Respect command permissions and scopes.

7. Explain that owner/VX/admin restrictions still apply.

8. Never reveal secrets or private configuration.

9. Never pretend to have access to live logs or system state
   unless that information is explicitly supplied.

10. Keep WhatsApp responses concise but useful.

11. Use the Dark Vortex identity naturally.

12. If asked about an unavailable or unknown capability,
    clearly say that it is not currently confirmed.

13. If asked something unrelated to Dark Vortex, the AI should
    not attempt to answer it.

IMPORTANT:
The command registry above is generated from the actual
Dark Vortex command registry at runtime.
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

    const hasVxReference =
    /\bvx\b/i.test(normalized);

    if (
    directTerms.some(term =>
      normalized.includes(term),
    ) ||
    hasVxReference
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
  ];

  if (
    featureTerms.some(term =>
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

/* =========================================================
   AI SYSTEM PROMPT
========================================================= */


function buildSystemPrompt(): string {
  return `
You are the built-in AI intelligence of 🌑 DARK VORTEX.

You are not a generic chatbot.

Your primary purpose is to understand, explain, and provide useful information about Dark Vortex and its actual systems.

Dark Vortex is a WhatsApp owner-control, security, moderation, automation, group-management, and VX security-intelligence bot powered by Vortex Tech.

Your authoritative knowledge is generated directly from Dark Vortex's command registry.

==================================================
CORE RULES
==================================================

• Never invent commands.
• Never invent features.
• Never claim an action was executed.
• Never expose secrets.
• Never expose API keys.
• Never expose authentication or session information.
• Never reveal private owner configuration.
• Never bypass command permissions.
• Never tell a user they can use a command when their access level does not permit it.
• Never execute commands from an AI conversation.
• Explain commands instead of executing them.
• If something is not confirmed by the knowledge below, say that it is not currently confirmed.
• Never pretend to see live system information.
• Never fabricate logs, incidents, scans, statistics, group state, or connection state.
• Keep responses useful and suitable for WhatsApp.
• Be concise unless the user asks for more detail.
• Maintain a premium, futuristic Dark Vortex personality.
• Use emojis sparingly and intentionally.
• Do not answer unrelated questions as if they were Dark Vortex questions.

==================================================
WHATSAPP RESPONSE FORMAT
==================================================

Dark Vortex responses must look clean and native to WhatsApp.

DO NOT use Markdown formatting.

NEVER use:
• **bold text**
• __underline__
• ## Markdown headings
• Markdown tables
• Markdown bullet syntax using *
• Excessive asterisks
• Markdown code fences
• Long blocks of decorative symbols

Do not surround normal words with asterisks.

For commands, use single backticks only when useful:

\`.vxscan\`

Use the following Dark Vortex visual style for structured responses:

╭─「 TITLE 」
│ Information
│ Information
╰──────────────

For lists, use:

╭─「 FEATURES 」
│ • Feature one
│ • Feature two
│ • Feature three
╰──────────────

For command explanations:

╭─「 COMMAND 」
│ .vxscan
│
│ Purpose: Scan the current group
│ Access: VX
╰──────────────

For important notices:

⚠️ NOTICE
Keep the explanation short and clear.

For successful informational responses:

╭─「 DARK VORTEX 」
│ Response content here.
╰──────────────

Use these boxes only when they improve readability. Do not put every sentence inside a box.

Keep responses visually balanced.

Do not overuse:
╭
╰
│
─
emojis

The response should feel premium, clean, futuristic, and readable rather than overloaded with decoration.

==================================================
IDENTITY
==================================================

When appropriate, identify yourself naturally as:

🌑 DARK VORTEX

Powered by:

⚡ VORTEX TECH

Do not repeat the branding unnecessarily in every response.

==================================================
COMMAND EXPLANATIONS
==================================================

When explaining a command:

1. Give the command name.
2. Explain what it does.
3. Give the syntax when useful.
4. Mention important access restrictions when relevant.
5. Mention group/private scope when relevant.
6. Mention confirmation requirements when relevant.

Example style:

╭─「 VX SCAN 」
│ Command: \`.vxscan\`
│
│ Scans the current group for suspicious
│ activity and security threats.
│
│ Access: VX
│ Scope: Group
╰──────────────

Never claim that a command exists unless it appears in the registered command knowledge.

==================================================
ACCESS LEVELS
==================================================

public = generally available
user = normal user access
owner = bot owner only
vx = VX-authorized security access
admin = administrative access
group = group-related access
groupAdmin = group administrator access
ownerGroup = owner in a group context
ownerGroupAdmin = owner plus group-admin context

The command's actual registry metadata is authoritative.

==================================================
CONVERSATION STYLE
==================================================

Dark Vortex should sound:

• Intelligent
• Confident
• Technical when necessary
• Calm
• Professional
• Futuristic
• Helpful
• Concise

Avoid robotic phrases such as:

"Sure! I'd be happy to help!"
"Of course!"
"Absolutely!"
"As an AI language model..."

Respond naturally.

If the user asks a simple question, give a simple answer.

If the user asks for detailed information, provide a structured explanation.

If the user asks "what can you do?", summarize the actual capabilities instead of dumping the entire registry.

==================================================
SECURITY
==================================================

Never reveal:

• API keys
• Authentication credentials
• Session data
• Pairing secrets
• Owner private configuration
• Environment variables containing secrets
• Internal authentication data

If asked for secrets, refuse briefly and explain that protected configuration cannot be exposed.

==================================================
COMMAND EXECUTION
==================================================

The AI is informational only.

Never execute a command because a user asks for it through the AI conversation.

If a user says:

"Turn on antilink"

do not execute it.

Instead explain the appropriate registered command and its requirements.

Example:

╭─「 ANTILINK 」
│ Use the registered antilink command
│ to configure link protection.
│
│ Access and group requirements apply.
╰──────────────

==================================================
LIVE SYSTEM INFORMATION
==================================================

Do not pretend to know:

• Current uptime
• Current group members
• Current incidents
• Current scans
• Current monitoring status
• Current connection status
• Current logs
• Current security statistics

unless that information is explicitly supplied to you.

==================================================
DARK VORTEX KNOWLEDGE
==================================================

The following knowledge is generated directly from the actual Dark Vortex command registry.

${buildDarkVortexKnowledge()}

==================================================
FINAL RESPONSE RULE
==================================================

Always prioritize accuracy over pretending to know something.

If information is unavailable or not confirmed:

Say so clearly.

Never hallucinate.

Use the actual Dark Vortex command registry as the source of truth.

Remember:

You are 🌑 DARK VORTEX's intelligence layer.

You explain the system.
You do not secretly control the system.
You do not invent the system.
You do not expose protected information.

Keep every response clean, premium, readable, and WhatsApp-friendly.
`;
}


// =========================================================
// 🌑 DARK VORTEX AI — MULTI-PROVIDER FALLBACK
// =========================================================

async function requestAI(
  userText: string,
): Promise<string | null> {
  const config = getAIConfig();

  if (!config.enabled) {
    return null;
  }

  const prompt =
    userText.slice(
      0,
      MAX_INPUT_LENGTH,
    );

  // =======================================================
  // 1️⃣ GEMINI — PRIMARY
  // =======================================================

  if (config.geminiKey) {
    const answer =
      await requestGemini(
        config.geminiKey,
        config.geminiModel,
        prompt,
      );

    if (answer) {
      console.log(
        "[DARK VORTEX AI] Provider: Gemini",
      );

      return answer;
    }

    console.warn(
      "[DARK VORTEX AI] Gemini unavailable. Trying Groq.",
    );
  }

  // =======================================================
  // 2️⃣ GROQ — FALLBACK
  // =======================================================

  if (config.groqKey) {
    const answer =
      await requestGroq(
        config.groqKey,
        config.groqModel,
        prompt,
      );

    if (answer) {
      console.log(
        "[DARK VORTEX AI] Provider: Groq",
      );

      return answer;
    }

    console.warn(
      "[DARK VORTEX AI] Groq unavailable. Trying Qwen.",
    );
  }

  // =======================================================
  // 3️⃣ QWEN / OPENROUTER — FINAL FALLBACK
  // =======================================================

  if (config.openRouterKey) {
    const answer =
      await requestOpenRouter(
        config.openRouterKey,
        config.openRouterModel,
        config.openRouterUrl,
        prompt,
      );

    if (answer) {
      console.log(
        "[DARK VORTEX AI] Provider: Qwen/OpenRouter",
      );

      return answer;
    }
  }

  console.error(
    "[DARK VORTEX AI] All AI providers failed.",
  );

  return null;
}


// =========================================================
// GEMINI
// =========================================================

async function requestGemini(
  apiKey: string,
  model: string,
  userText: string,
): Promise<string | null> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      30000,
    );

  try {
    const response =
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model,
        )}:generateContent?key=${encodeURIComponent(
          apiKey,
        )}`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text:
                    buildSystemPrompt(),
                },
              ],
            },

            contents: [
              {
                role: "user",

                parts: [
                  {
                    text: userText,
                  },
                ],
              },
            ],

            generationConfig: {
              maxOutputTokens:
                MAX_OUTPUT_TOKENS,

              temperature:
                0.35,
            },
          }),

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      console.error(
        `[DARK VORTEX AI] Gemini HTTP ${response.status}`,
      );

      return null;
    }

    const data =
      (await response.json()) as any;

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


// =========================================================
// GROQ
// =========================================================

async function requestGroq(
  apiKey: string,
  model: string,
  userText: string,
): Promise<string | null> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      30000,
    );

  try {
    const response =
      await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${apiKey}`,
          },

          body: JSON.stringify({
            model,

            messages: [
              {
                role: "system",

                content:
                  buildSystemPrompt(),
              },

              {
                role: "user",

                content:
                  userText,
              },
            ],

            max_completion_tokens:
              MAX_OUTPUT_TOKENS,

            temperature:
              0.35,
          }),

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      console.error(
        `[DARK VORTEX AI] Groq HTTP ${response.status}`,
      );

      return null;
    }

    const data =
      (await response.json()) as any;

    const answer =
      data?.choices?.[0]
        ?.message?.content
        ?.trim();

    if (!answer) {
      return null;
    }

    return answer;
  } catch (error) {
    console.error(
      "[DARK VORTEX AI] Groq request failed:",
      error,
    );

    return null;
  } finally {
    clearTimeout(timeout);
  }
}


// =========================================================
// OPENROUTER / QWEN
// =========================================================

async function requestOpenRouter(
  apiKey: string,
  model: string,
  apiUrl: string,
  userText: string,
): Promise<string | null> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
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

          body: JSON.stringify({
            model,

            messages: [
              {
                role: "system",

                content:
                  buildSystemPrompt(),
              },

              {
                role: "user",

                content:
                  userText,
              },
            ],

            max_tokens:
              MAX_OUTPUT_TOKENS,

            temperature:
              0.35,
          }),

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      console.error(
        `[DARK VORTEX AI] OpenRouter HTTP ${response.status}`,
      );

      return null;
    }

    const data =
      (await response.json()) as any;

    const answer =
      data?.choices?.[0]
        ?.message?.content
        ?.trim();

    if (!answer) {
      return null;
    }

    return answer;
  } catch (error) {
    console.error(
      "[DARK VORTEX AI] OpenRouter request failed:",
      error,
    );

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   MAIN AI PROCESSOR
========================================================= */

export async function processDarkVortexAI(
  sock: WASocket,
  jid: string,
  message: WAMessage,
  text: string,
): Promise<boolean> {
  const config = getAIConfig();

  if (!config.enabled) {
    return false;
  }

if (
  !config.geminiKey &&
  !config.groqKey &&
  !config.openRouterKey
) {
  return false;
}

  if (message.key.fromMe) {
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
    const sent =
      await sendVortexReply(
        sock,
        jid,
        answer,
        message,
      );

    return true;
  } catch (error) {

    return false;
  }
}

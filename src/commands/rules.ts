import fs from "node:fs";
import path from "node:path";

import type {
  WAMessage,
  WASocket,
} from "@whiskeysockets/baileys";

const BRAND = "🌑 DARK VORTEX";
const POWERED_BY = "⚡ Powered by Vortex Tech";

const DATA_DIR = path.resolve("./src/data");
const RULES_FILE = path.join(DATA_DIR, "rules.json");

type RulesDatabase = Record<string, string>;

// ============================================================
// MESSAGE BOX
// ============================================================

function vortexBox(
  title: string,
  lines: string[]
): string {
  return [
    `╭━━━〔 ${BRAND} 〕━━━╮`,
    `┃`,
    `┃ ${title}`,
    `┃`,
    ...lines.map((line) => `┃ ${line}`),
    `┃`,
    `╰━━━━━━━━━━━━━━━━━━━━━━╯`,
    `      ${POWERED_BY}`,
  ].join("\n");
}

// ============================================================
// DATABASE
// ============================================================

function ensureDatabase(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true,
    });
  }

  if (!fs.existsSync(RULES_FILE)) {
    fs.writeFileSync(
      RULES_FILE,
      JSON.stringify({}, null, 2),
      "utf8"
    );
  }
}

function loadDatabase(): RulesDatabase {
  ensureDatabase();

  try {
    return JSON.parse(
      fs.readFileSync(
        RULES_FILE,
        "utf8"
      )
    ) as RulesDatabase;
  } catch {
    return {};
  }
}

function saveDatabase(
  database: RulesDatabase
): void {
  ensureDatabase();

  fs.writeFileSync(
    RULES_FILE,
    JSON.stringify(
      database,
      null,
      2
    ),
    "utf8"
  );
}

// ============================================================
// GET RULES
// ============================================================

function getRules(
  jid: string
): string {
  const database =
    loadDatabase();

  return database[jid] || "";
}

// ============================================================
// SET RULES
// ============================================================

function setRules(
  jid: string,
  rules: string
): void {
  const database =
    loadDatabase();

  database[jid] = rules.trim();

  saveDatabase(database);
}

// ============================================================
// CLEAR RULES
// ============================================================

function clearRules(
  jid: string
): void {
  const database =
    loadDatabase();

  delete database[jid];

  saveDatabase(database);
}

// ============================================================
// GROUP CHECK
// ============================================================

function isGroup(
  jid: string
): boolean {
  return jid.endsWith("@g.us");
}

// ============================================================
// COMMAND HANDLER
// ============================================================

export async function handleRulesCommand(
  sock: WASocket,
  jid: string,
  command: string,
  args: string[],
  _message: WAMessage
): Promise<boolean> {

  const supportedCommands = [
    "rules",
    "setrules",
    "clearrules",
  ];

  if (
    !supportedCommands.includes(
      command
    )
  ) {
    return false;
  }

  // ----------------------------------------------------------
  // GROUP ONLY
  // ----------------------------------------------------------

  if (!isGroup(jid)) {

    await sock.sendMessage(
      jid,
      {
        text: vortexBox(
          "❌ GROUP ONLY",
          [
            "Rules commands can only be used inside groups.",
          ]
        ),
      }
    );

    return true;
  }

  // ----------------------------------------------------------
  // SHOW RULES
  // ----------------------------------------------------------

  if (command === "rules") {

    const rules =
      getRules(jid);

    if (!rules) {

      await sock.sendMessage(
        jid,
        {
          text: vortexBox(
            "📜 GROUP RULES",
            [
              "⚠️ No rules have been configured yet.",
              "",
              "👑 Owner can create them with:",
              "/setrules Your group rules here",
            ]
          ),
        }
      );

      return true;
    }

    const ruleLines =
      rules
        .split("\n")
        .map(
          (line, index) =>
            `${index + 1}. ${line}`
        );

    await sock.sendMessage(
      jid,
      {
        text: vortexBox(
          "📜 GROUP RULES",
          ruleLines
        ),
      }
    );

    return true;
  }

  // ----------------------------------------------------------
  // SET RULES
  // ----------------------------------------------------------

  if (command === "setrules") {

    const rules =
      args.join(" ").trim();

    if (!rules) {

      await sock.sendMessage(
        jid,
        {
          text: vortexBox(
            "❌ MISSING RULES",
            [
              "Usage:",
              "/setrules Be respectful",
              "",
              "You can also use multiple rules separated by |",
            ]
          ),
        }
      );

      return true;
    }

    const formattedRules =
      rules
        .split("|")
        .map(
          (rule) =>
            rule.trim()
        )
        .filter(Boolean)
        .join("\n");

    setRules(
      jid,
      formattedRules
    );

    await sock.sendMessage(
      jid,
      {
        text: vortexBox(
          "✅ RULES UPDATED",
          [
            "📜 New group rules:",
            "",
            ...formattedRules
              .split("\n")
              .map(
                (rule, index) =>
                  `${index + 1}. ${rule}`
              ),
          ]
        ),
      }
    );

    return true;
  }

  // ----------------------------------------------------------
  // CLEAR RULES
  // ----------------------------------------------------------

  if (
    command === "clearrules"
  ) {

    clearRules(jid);

    await sock.sendMessage(
      jid,
      {
        text: vortexBox(
          "🗑️ RULES CLEARED",
          [
            "The group's saved rules have been removed.",
          ]
        ),
      }
    );

    return true;
  }

  return false;
}
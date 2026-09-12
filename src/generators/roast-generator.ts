/* =========================================================
   🌑 DARK VORTEX — RANDOM USER DIAGNOSTIC GENERATOR
========================================================= */

const OPENERS = [
  "Dark Vortex completed a full diagnostic and",
  "After running a highly unnecessary analysis,",
  "The Vortex intelligence system has determined that",
  "Our technicians reviewed the situation and discovered that",
  "Dark Vortex has finished scanning the target and",
  "The Vortex scanner has officially reported that",
  "After several seconds of deep investigation,",
  "The system has analyzed the evidence and concluded that",
  "Vortex AI has entered diagnostic mode and found that",
  "The results are finally in:",
  "Our highly advanced system has detected that",
  "Dark Vortex has reviewed your performance and",
  "The laboratory has completed its experiment and confirmed that",
  "Vortex security has classified this situation as",
  "The diagnostic department has issued a report stating that",
];

const OBSERVATIONS = [
  "your common sense is still loading",
  "your brain is running on battery saver",
  "your confidence is significantly ahead of your ability",
  "your logic appears to be taking the day off",
  "your brain has opened too many tabs",
  "your decision-making system needs a restart",
  "your thoughts are currently buffering",
  "your intelligence signal is surprisingly weak",
  "your plans have no stable connection to reality",
  "your brain appears to be using trial software",
  "your common sense has gone missing",
  "your confidence deserves an award for creativity",
  "your ideas are arriving without quality control",
  "your brain is operating in power-saving mode",
  "your logic has entered maintenance mode",
  "your decision-making process needs technical support",
  "your thoughts are travelling without a destination",
  "your brain has apparently lost its instruction manual",
  "your reasoning department is currently closed",
  "your mental Wi-Fi has one bar",
  "your ideas need several security updates",
  "your brain is still negotiating with reality",
  "your common sense missed the meeting",
  "your logic has been temporarily suspended",
  "your brain is doing unpaid overtime and still producing nothing",
  "your thoughts have excellent confidence and terrible navigation",
  "your intelligence appears to be on airplane mode",
  "your brain has requested a software update",
  "your reasoning skills are currently under investigation",
];

const PUNCHLINES = [
  "even your shadow needs some personal space",
  "your Wi-Fi disconnects just to avoid the conversation",
  "Google would need a new search engine to explain that",
  "even autocorrect has stopped trying to help you",
  "your calculator would probably ask for a second opinion",
  "your phone has more sense than the entire operation",
  "even a loading screen has accomplished more today",
  "your alarm clock probably wakes up disappointed",
  "your mirror deserves hazard pay",
  "even your keyboard is tired of correcting you",
  "your browser history probably needs emotional support",
  "your own notifications are starting to ignore you",
  "even your battery percentage has more direction",
  "your GPS would simply say good luck",
  "your calculator has officially resigned",
  "even your search bar cannot find the logic",
  "your keyboard is typing prayers at this point",
  "your phone probably considers you a stress test",
  "even your shadow is considering a career change",
  "your internet provider cannot fix this level of confusion",
  "your operating system needs to reboot before continuing",
  "your brain deserves an error message",
  "even a random number generator makes better decisions",
  "your plans have more plot holes than a bad movie",
  "your logic needs a subscription upgrade",
  "even the loading icon is moving faster than your reasoning",
  "your common sense has apparently blocked your number",
  "your brain needs customer support",
  "even the recycle bin has rejected your ideas",
  "your decision-making belongs in beta testing",
];

const PERSONALITY_RESULTS = [
  "QUESTIONABLE",
  "UNSTABLE",
  "UNSERIOUS",
  "CHAOTIC",
  "HIGHLY SUSPECT",
  "UNDER REVIEW",
  "NEEDS CALIBRATION",
  "CONFIDENTLY CONFUSED",
  "MILDLY CONCERNING",
  "ABSOLUTELY CHAOTIC",
];

const LOGIC_RESULTS = [
  "NOT FOUND",
  "OFFLINE",
  "BUFFERING",
  "LOW SIGNAL",
  "UNDER MAINTENANCE",
  "REQUIRES UPDATE",
  "TEMPORARILY UNAVAILABLE",
  "RUNNING IN SAFE MODE",
  "CRITICALLY LOW",
];

const SOCIAL_RESULTS = [
  "WEAK",
  "UNSTABLE",
  "QUESTIONABLE",
  "LOW SIGNAL",
  "BUFFERING",
  "REQUIRES REPAIR",
  "INTERMITTENT",
  "UNDER INVESTIGATION",
];

const DIAGNOSES = [
  "Too unserious",
  "Professionally chaotic",
  "Severely overconfident",
  "Operating without supervision",
  "Needs immediate reality update",
  "Common sense deficiency detected",
  "Confidence-to-skill ratio is abnormal",
  "Advanced case of unnecessary confidence",
  "Logic module requires maintenance",
  "Certified menace to peaceful conversations",
  "Brain currently running experimental software",
  "High levels of unexplained confusion",
  "Excessive confidence detected",
  "Reality connection appears unstable",
  "Recommended treatment: think before typing",
];

const ENDINGS = [
  "😂",
  "💀",
  "😭",
  "🤡",
  "🤣",
  "🗿",
  "😮‍💨",
  "💀😂",
  "😭💀",
  "🤡💀",
];

const recentRoasts: string[] = [];
const MAX_RECENT_ROASTS = 25;

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomPercent(min: number, max: number): number {
  return Math.floor(
    min + Math.random() * (max - min + 1),
  );
}

function rememberRoast(roast: string): void {
  recentRoasts.push(roast);

  if (recentRoasts.length > MAX_RECENT_ROASTS) {
    recentRoasts.shift();
  }
}

export interface UserDiagnostic {
  roast: string;
  roastLevel: number;
  brainActivity: number;
  personality: string;
  logic: string;
  socialSignal: string;
  confidence: number;
  diagnosis: string;
}

/**
 * Generates a completely randomized diagnostic report.
 */
export function generateUserDiagnostic(): UserDiagnostic {
  let roast = "";

  for (let attempt = 0; attempt < 20; attempt++) {
    roast =
      `${randomItem(OPENERS)} ` +
      `${randomItem(OBSERVATIONS)}, ` +
      `${randomItem(PUNCHLINES)}. ` +
      randomItem(ENDINGS);

    if (!recentRoasts.includes(roast)) {
      break;
    }
  }

  rememberRoast(roast);

  return {
    roast,

    roastLevel: randomPercent(70, 100),

    brainActivity: randomPercent(1, 15),

    personality: randomItem(
      PERSONALITY_RESULTS,
    ),

    logic: randomItem(
      LOGIC_RESULTS,
    ),

    socialSignal: randomItem(
      SOCIAL_RESULTS,
    ),

    confidence: randomPercent(75, 100),

    diagnosis: randomItem(
      DIAGNOSES,
    ),
  };
}

/* =========================================================
   🌑 DARK VORTEX — ADVANCED ROAST / DIAGNOSTIC ENGINE
   ⚡ Powered by Vortex Tech

   • Large roast library
   • Randomized combinations
   • Multiple roast styles
   • Strong punchlines
   • Anti-repeat protection
   • Diagnostic statistics
   • Funny technical insults
   • No protected-trait targeting
========================================================= */

const OPENERS = [
  "Dark Vortex completed a full diagnostic and discovered that",
  "After an unnecessarily expensive investigation,",
  "The Vortex Intelligence System has officially determined that",
  "Our technicians have reviewed the evidence and concluded that",
  "Dark Vortex finished scanning the target and found that",
  "The Vortex scanner has returned its final report:",
  "After several seconds of pretending this was difficult,",
  "The system has analyzed the situation and concluded that",
  "Vortex AI has entered diagnostic mode and discovered that",
  "The results are finally in:",
  "Our highly advanced laboratory has detected that",
  "Dark Vortex reviewed your performance and unfortunately found that",
  "The Vortex research department has completed its experiment and confirmed that",
  "Security classification complete:",
  "The diagnostic department has issued an official statement:",
  "Vortex engineers have investigated the situation and regret to report that",
  "After checking every possible explanation,",
  "The system has performed a complete intelligence scan and found that",
  "Dark Vortex has consulted its entire database and determined that",
  "The machine has spoken, and unfortunately for you,",
  "Our analysts have reviewed your recent activities and discovered that",
  "The Vortex laboratory has completed a deep scan and detected that",
  "After cross-referencing your behavior with several warning databases,",
  "Dark Vortex has reached a conclusion that nobody wanted to hear:",
  "The investigation is complete. The evidence says",
];

const OBSERVATIONS = [
  "your common sense is still loading",
  "your brain is running on emergency battery",
  "your confidence is several software versions ahead of your ability",
  "your logic appears to have resigned",
  "your brain has opened 47 tabs and forgotten where the music is coming from",
  "your decision-making system needs a factory reset",
  "your thoughts are currently buffering at 2%",
  "your intelligence signal is dangerously weak",
  "your plans have no stable connection to reality",
  "your brain appears to be running trial software",
  "your common sense has left the group chat",
  "your ideas are arriving without quality control",
  "your reasoning department has closed for maintenance",
  "your mental Wi-Fi has one bar and questionable security",
  "your logic module is currently unavailable",
  "your thoughts are travelling without a destination",
  "your brain has misplaced its instruction manual",
  "your reasoning department is accepting no new applications",
  "your mental operating system has encountered an unexpected personality",
  "your ideas require several security updates",
  "your brain is negotiating with reality and losing badly",
  "your common sense missed the meeting again",
  "your logic has been suspended pending investigation",
  "your brain is doing unpaid overtime and still producing nothing",
  "your thoughts have excellent confidence and terrible navigation",
  "your intelligence appears to be on airplane mode",
  "your brain has requested an update but keeps pressing Remind Me Later",
  "your reasoning skills are currently under investigation",
  "your mental processor is overheating from basic calculations",
  "your brain has entered low-power mode permanently",
  "your logic appears to be operating without a license",
  "your thoughts have more bugs than features",
  "your brain is running a beta version of common sense",
  "your decision-making algorithm has discovered random mode",
  "your reasoning engine is powered by vibes alone",
  "your brain has the confidence of a genius and the output of a calculator with no batteries",
  "your intelligence has excellent marketing and terrible customer reviews",
  "your common sense is apparently a premium feature",
  "your thought process needs technical support",
  "your brain has been successfully disconnected from the plot",
  "your logic is taking a personal day",
  "your ideas are being generated without adult supervision",
  "your mental GPS keeps recalculating and never finds the destination",
  "your brain has confused confidence with competence",
  "your reasoning has entered an undocumented experimental phase",
  "your intelligence is currently stuck behind a captcha",
  "your brain is using resources it clearly does not understand",
  "your thoughts have somehow achieved maximum confidence with minimum accuracy",
  "your common sense has blocked you for its own protection",
  "your brain has apparently outsourced decision-making to a coin toss",
];

const PUNCHLINES = [
  "even your shadow needs some personal space",
  "your Wi-Fi disconnects just to avoid the conversation",
  "Google would need a completely new search engine to explain that",
  "even autocorrect has stopped trying to help you",
  "your calculator would ask for a second opinion",
  "your phone has more sense than the entire operation",
  "even a loading screen has accomplished more today",
  "your alarm clock wakes up disappointed",
  "your mirror deserves hazard pay",
  "even your keyboard is tired of correcting you",
  "your browser history needs professional supervision",
  "your notifications have started ignoring you",
  "even your battery percentage has more direction",
  "your GPS would simply say good luck",
  "your calculator has officially resigned",
  "even your search bar cannot locate the logic",
  "your keyboard is typing prayers at this point",
  "your phone considers you a stress test",
  "even your shadow is considering a career change",
  "your internet provider cannot repair this level of confusion",
  "your operating system needs to reboot before continuing",
  "your brain deserves an error message",
  "even a random number generator makes better decisions",
  "your plans have more plot holes than a low-budget movie",
  "your logic needs a subscription upgrade",
  "even the loading icon is moving faster than your reasoning",
  "your common sense has apparently blocked your number",
  "your brain needs customer support and extended warranty",
  "even the recycle bin rejected your ideas",
  "your decision-making belongs in beta testing",
  "even the spinning wheel of death has better productivity",
  "your phone would probably report you for suspicious activity",
  "even your calculator is asking why you keep pressing buttons",
  "your brain has somehow turned a simple task into a documentary",
  "your keyboard has started predicting disappointment instead of words",
  "even your notifications have higher standards",
  "your search history probably needs a legal representative",
  "your internet connection has better communication skills",
  "even a broken clock has more reliable timing",
  "your mirror has been trying to understand the situation all day",
  "your brain has more buffering than a crowded network",
  "even your spam folder has better organization",
  "your phone is doing unpaid emotional labor",
  "your logic has been placed on indefinite hold",
  "even your autocorrect has developed trust issues",
  "your operating system is stable; unfortunately, your decisions are not",
  "even a CAPTCHA would question whether you're human",
  "your thoughts have more unexpected errors than a beta application",
  "your brain needs a terms-of-service agreement before making another decision",
];

const SAVAGE_PUNCHLINES = [
  "even your own brain looks at your decisions and asks for context",
  "your common sense didn't just leave — it changed its address",
  "your confidence is doing all the heavy lifting because your logic clearly called in sick",
  "you have somehow made being confidently wrong look like a full-time profession",
  "your brain turns simple questions into international investigations",
  "your reasoning has the structural integrity of wet cardboard",
  "you could lose an argument with a loading screen",
  "your thoughts arrive late, confused, and somehow still overconfident",
  "your decision-making process needs witnesses",
  "you don't need a reality check; reality needs a break from you",
  "your brain has been running background processes nobody authorized",
  "you make bad decisions with the confidence of someone holding the correct answer",
  "your logic has been missing for so long that we may need to file a report",
  "your brain treats obvious solutions like suspicious links",
  "you have turned confusion into a personal brand",
  "your thought process has more detours than a city road under construction",
  "you could make a straight line reconsider its direction",
  "your ideas enter the room before their quality does",
  "your brain has mastered the art of reaching the wrong conclusion efficiently",
  "you bring a unique combination of confidence, confusion, and absolutely no evidence",
  "your reasoning is so unpredictable that even probability gave up",
  "your brain doesn't think outside the box; it lost the box",
  "you could overcomplicate a yes-or-no question",
  "your logic needs a map, a compass, and adult supervision",
  "your brain has somehow made common sense look like advanced mathematics",
];

const EXTRA_ROASTS = [
  "You are living proof that confidence does not require evidence.",
  "Your brain is not empty; it is simply aggressively underutilized.",
  "You have the rare ability to turn every simple situation into premium confusion.",
  "If common sense were Wi-Fi, yours would still be searching for networks.",
  "Your decision-making process deserves its own warning label.",
  "You don't miss the point — you travel several kilometres around it.",
  "You have never met a straightforward solution you couldn't complicate.",
  "Your brain has a very interesting relationship with reality. Mostly long distance.",
  "You are not behind the conversation; you are in a completely different conversation.",
  "Your confidence deserves respect. Your reasoning does not.",
  "You somehow make wrong answers sound professionally researched.",
  "Your brain has excellent uptime and terrible output.",
  "You are the human equivalent of clicking Skip Ad and getting another ad.",
  "Your logic has more plot twists than your excuses.",
  "You could make a tutorial about what not to do and still get confused halfway through.",
  "Your thoughts are so unpredictable even your brain gets surprised.",
  "You bring the same energy as a phone at 1% pretending everything is fine.",
  "You have the processing power of a calculator that somebody dropped in water.",
  "Your brain is running smoothly; unfortunately, it is running the wrong program.",
  "You are not a problem solver. You are a problem multiplier.",
  "You have achieved something remarkable: making silence sound intelligent by comparison.",
  "Your logic is not broken. It is simply exploring alternative realities.",
  "You are a premium example of why instructions come with pictures.",
  "Your brain has unlimited confidence and a very limited data plan.",
  "You make mistakes so creatively they almost deserve funding.",
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
  "PROFESSIONALLY UNSERIOUS",
  "UNRELIABLY CONFIDENT",
  "CHAOS-OPTIMIZED",
  "EXPERIMENTAL",
  "SUSPICIOUSLY CONFIDENT",
  "BEYOND CALIBRATION",
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
  "UNSTABLE",
  "CORRUPTED",
  "EXPERIMENTAL",
  "UNAUTHORIZED",
  "FAILED TO INITIALIZE",
  "NO COMPATIBLE LOGIC FOUND",
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
  "CRITICALLY UNSTABLE",
  "CONNECTION REFUSED",
  "LIMITED",
  "UNRELIABLE",
  "OUT OF RANGE",
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
  "Severe case of confident misunderstanding",
  "Critical shortage of common sense",
  "Unauthorized confidence detected",
  "Reasoning engine requires professional inspection",
  "Mental software is several versions behind",
  "Advanced confusion with premium confidence",
  "Decision-making algorithm requires supervision",
  "Reality synchronization failed",
  "Critical thinking service temporarily unavailable",
  "Excessive nonsense detected",
  "Brain firmware requires emergency maintenance",
  "Logic subscription appears to have expired",
  "Common sense installation failed",
  "Unscheduled chaos detected",
  "Professional overthinking with amateur execution",
  "Severe case of unnecessary confidence",
  "Reasoning system failed quality assurance",
  "High-risk decision maker detected",
  "Cognitive settings appear to be randomized",
  "Thought process requires external navigation",
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
  "😂💀",
  "🤣😭",
  "🫠",
  "😵‍💫",
  "💀🗿",
];

const recentRoasts: string[] = [];

const MAX_RECENT_ROASTS = 100;


// =========================================================
// RANDOM HELPERS
// =========================================================

function randomItem<T>(
  items: readonly T[],
): T {
  return items[
    Math.floor(
      Math.random() *
        items.length,
    )
  ]!;
}


function randomPercent(
  min: number,
  max: number,
): number {
  return Math.floor(
    min +
      Math.random() *
        (max - min + 1),
  );
}


function rememberRoast(
  roast: string,
): void {
  recentRoasts.push(
    roast,
  );

  if (
    recentRoasts.length >
    MAX_RECENT_ROASTS
  ) {
    recentRoasts.shift();
  }
}


// =========================================================
// ROAST STYLE
// =========================================================

type RoastStyle =
  | "diagnostic"
  | "technical"
  | "savage"
  | "chaotic"
  | "classic";


function randomRoastStyle(): RoastStyle {
  return randomItem([
    "diagnostic",
    "technical",
    "savage",
    "chaotic",
    "classic",
  ]);
}


// =========================================================
// ROAST GENERATION
// =========================================================

function generateRoastText(
  style: RoastStyle,
): string {
  switch (style) {
    case "savage":
      return (
        `${randomItem(
          OPENERS,
        )} ` +
        `${randomItem(
          OBSERVATIONS,
        )}. ` +
        `${randomItem(
          SAVAGE_PUNCHLINES,
        )}. ` +
        `${randomItem(
          ENDINGS,
        )}`
      );

    case "technical":
      return (
        `${randomItem(
          OPENERS,
        )} ` +
        `${randomItem(
          OBSERVATIONS,
        )}, ` +
        `${randomItem(
          PUNCHLINES,
        )}. ` +
        `System diagnosis: ${randomItem(
          DIAGNOSES,
        )}. ` +
        `${randomItem(
          ENDINGS,
        )}`
      );

    case "chaotic":
      return (
        `${randomItem(
          EXTRA_ROASTS,
        )} ` +
        `${randomItem(
          PUNCHLINES,
        )}. ` +
        `${randomItem(
          ENDINGS,
        )}`
      );

    case "classic":
      return (
        `${randomItem(
          EXTRA_ROASTS,
        )} ` +
        `${randomItem(
          SAVAGE_PUNCHLINES,
        )}. ` +
        `${randomItem(
          ENDINGS,
        )}`
      );

    case "diagnostic":
    default:
      return (
        `${randomItem(
          OPENERS,
        )} ` +
        `${randomItem(
          OBSERVATIONS,
        )}, ` +
        `${randomItem(
          PUNCHLINES,
        )}. ` +
        randomItem(
          ENDINGS,
        )
      );
  }
}


// =========================================================
// PUBLIC RESULT
// =========================================================

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


// =========================================================
// MAIN GENERATOR
// =========================================================

export function generateUserDiagnostic(): UserDiagnostic {
  let roast = "";

  const style =
    randomRoastStyle();

  for (
    let attempt = 0;
    attempt < 100;
    attempt++
  ) {
    const candidate =
      generateRoastText(
        style,
      );

    if (
      !recentRoasts.includes(
        candidate,
      )
    ) {
      roast = candidate;
      break;
    }
  }

  if (!roast) {
    roast =
      generateRoastText(
        "chaotic",
      );
  }

  rememberRoast(
    roast,
  );

  return {
    roast,

    roastLevel:
      randomPercent(
        82,
        100,
      ),

    brainActivity:
      randomPercent(
        1,
        18,
      ),

    personality:
      randomItem(
        PERSONALITY_RESULTS,
      ),

    logic:
      randomItem(
        LOGIC_RESULTS,
      ),

    socialSignal:
      randomItem(
        SOCIAL_RESULTS,
      ),

    confidence:
      randomPercent(
        78,
        100,
      ),

    diagnosis:
      randomItem(
        DIAGNOSES,
      ),
  };
}


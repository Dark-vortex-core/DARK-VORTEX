
/*
 * 🌑 DARK VORTEX — NIGERIAN COMEDY ENGINE
 *
 * 🇳🇬 Built for Nigerian WhatsApp groups.
 *
 * Goal:
 * - Sound like Nigerian banter, not generic AI jokes.
 * - Unexpected punchlines.
 * - Plenty of slang and everyday situations.
 * - Multiple comedy styles.
 * - Strong anti-repeat system.
 * - Easy to extend.
 */

export type MemeCategory =
  | "random"
  | "family"
  | "parents"
  | "money"
  | "salary"
  | "relationship"
  | "school"
  | "work"
  | "transport"
  | "traffic"
  | "power"
  | "internet"
  | "food"
  | "pos"
  | "whatsapp"
  | "friends"
  | "landlord"
  | "social"
  | "lagos"
  | "abuja";

export type MemeStyle =
  | "random"
  | "banter"
  | "story"
  | "dialogue"
  | "plot_twist"
  | "deadpan"
  | "group_chat"
  | "one_liner";

export interface MemeOptions {
  category?: MemeCategory;
  style?: MemeStyle;
  username?: string;
}

interface Joke {
  category: MemeCategory;
  styles: MemeStyle[];
  text: string;
  weight?: number;
}

/* =========================================================
   ANTI-REPEAT MEMORY
========================================================= */

const RECENT_MEMES: string[] = [];
const MAX_RECENT_MEMES = 80;

function remember(value: string): void {
  RECENT_MEMES.push(value);

  while (RECENT_MEMES.length > MAX_RECENT_MEMES) {
    RECENT_MEMES.shift();
  }
}

function wasRecentlyUsed(value: string): boolean {
  return RECENT_MEMES.includes(value);
}

export function clearMemeHistory(): void {
  RECENT_MEMES.length = 0;
}

/* =========================================================
   RANDOM HELPERS
========================================================= */

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function chance(percent: number): boolean {
  return Math.random() * 100 < percent;
}

function normalizeUsername(username?: string): string {
  return String(username || "")
    .replace(/^@+/, "")
    .trim();
}

function tag(username?: string): string {
  const clean = normalizeUsername(username);
  return clean ? `@${clean}, ` : "";
}

function emoji(): string {
  return pick([
    "😂",
    "😭",
    "🤣",
    "💀",
    "😭😂",
    "😂😭",
    "🤦🏽‍♂️",
    "😩",
    "💔",
    "🇳🇬",
  ]);
}

/* =========================================================
   NIGERIAN SLANG
========================================================= */

const SLANG = [
  "omo",
  "abeg",
  "sha",
  "na wa",
  "e shock me",
  "I no understand",
  "this life",
  "who send me",
  "we move",
  "no be small thing",
  "my brother",
  "my sister",
  "honestly",
  "at this point",
  "I don tire",
  "God abeg",
  "see ehn",
  "chai",
  "wetin be this",
  "na real wahala",
];

function slang(): string {
  return pick(SLANG);
}

/* =========================================================
   ONE-LINERS
========================================================= */

const ONE_LINERS: Joke[] = [
  {
    category: "money",
    styles: ["one_liner", "deadpan", "banter"],
    text: "My account balance and I are no longer on speaking terms.",
  },
  {
    category: "salary",
    styles: ["one_liner", "deadpan"],
    text: "Salary entered this morning. By afternoon, even the notification looked unemployed.",
  },
  {
    category: "power",
    styles: ["one_liner", "banter"],
    text: "NEPA brought light for 11 minutes. Long enough to make us believe again.",
  },
  {
    category: "internet",
    styles: ["one_liner", "deadpan"],
    text: "I bought data and the network immediately started acting like it was doing me a favour.",
  },
  {
    category: "relationship",
    styles: ["one_liner", "banter"],
    text: "Relationship is just two people saying 'I'm fine' and waiting for the other person to investigate.",
  },
  {
    category: "food",
    styles: ["one_liner", "banter"],
    text: "The last piece of meat in a Nigerian house has more security than a bank vault.",
  },
  {
    category: "parents",
    styles: ["one_liner", "banter"],
    text: "Nigerian mothers don't ask questions. They already know the answer and are giving you one last chance.",
  },
  {
    category: "transport",
    styles: ["one_liner", "banter"],
    text: "A Nigerian conductor can create space where physics has already resigned.",
  },
  {
    category: "work",
    styles: ["one_liner", "deadpan"],
    text: "Boss said 'quick meeting'. I knew immediately that lunch was no longer part of the company benefits.",
  },
  {
    category: "school",
    styles: ["one_liner", "deadpan"],
    text: "Lecturer said 'this is very easy'. That was the last peaceful moment of the semester.",
  },
  {
    category: "whatsapp",
    styles: ["one_liner", "group_chat"],
    text: "Nigerian WhatsApp groups have two speeds: completely dead and 47 messages before you can blink.",
  },
  {
    category: "landlord",
    styles: ["one_liner", "banter"],
    text: "My landlord doesn't check on me. He only remembers I exist when rent is involved.",
  },
  {
    category: "traffic",
    styles: ["one_liner", "deadpan"],
    text: "Google Maps said 18 minutes. Lagos traffic said 'let's discuss that privately'.",
  },
  {
    category: "friends",
    styles: ["one_liner", "banter"],
    text: "Nigerian friendship is mostly 'send your location' followed by absolutely no explanation.",
  },
  {
    category: "pos",
    styles: ["one_liner", "deadpan"],
    text: "POS transaction failed, account debited. My money has entered a witness protection programme.",
  },
];

/* =========================================================
   FAMILY
========================================================= */

const FAMILY_JOKES: Joke[] = [
  {
    category: "family",
    styles: ["dialogue", "banter"],
    text: `Mum: Who left this light on?

Me: I don't know.

Mum: Okay.

Me: 😌

Mum: So you don't know the light you used five minutes ago?

Me: I have decided to become a better person.`,
  },
  {
    category: "parents",
    styles: ["dialogue", "banter"],
    text: `Nigerian parent: Where are you going?

Me: Outside.

Parent: Outside where?

Me: Just outside.

Parent: What is outside?

Me: 😭

At this point I'm applying for a visa.`,
  },
  {
    category: "parents",
    styles: ["dialogue", "plot_twist"],
    text: `Mum: Come and help me with something.

Me: What is it?

Mum: Just come first.

Me: Where?

Mum: Come first.

Me: 😭

That's how 'something small' became a three-hour project.`,
  },
  {
    category: "family",
    styles: ["story", "plot_twist"],
    text: `I entered the kitchen quietly at 1 AM.

I was confident nobody was awake.

Then my mother appeared behind me:

"Are you looking for something?"

Ma'am...

I was looking for peace.`,
  },
  {
    category: "parents",
    styles: ["dialogue", "banter"],
    text: `Me: Mum, I'm tired.

Mum: Tired from what?

Me: Work.

Mum: When I was your age—

Me: I am no longer tired. Thank you.`,
  },
  {
    category: "family",
    styles: ["story", "banter"],
    text: `There is always that one sibling who doesn't contribute money to anything...

but somehow has an opinion about the exact brand of food everybody should buy.`,
  },
  {
    category: "parents",
    styles: ["dialogue", "plot_twist"],
    text: `Dad: Who touched my charger?

Everyone: Nobody.

Dad: Okay.

Everyone relaxes.

Dad, five minutes later:

"So nobody here uses my charger?"

WHY DID YOU WAIT? 😭`,
  },
  {
    category: "family",
    styles: ["story", "banter"],
    text: `Nigerian family members can hear a snack packet opening from two rooms away.

But when you call them from the sitting room:

"Eh?"

"Nothing."

They suddenly become deaf.`,
  },
];

/* =========================================================
   MONEY / SALARY
========================================================= */

const MONEY_JOKES: Joke[] = [
  {
    category: "salary",
    styles: ["story", "plot_twist"],
    text: `Salary entered at 8:03 AM.

By 8:17 AM:

Rent: seen.
Data: seen.
Transport: seen.
Food: seen.

My salary didn't even say goodbye.`,
  },
  {
    category: "money",
    styles: ["dialogue", "banter"],
    text: `Friend: Bro, you get money?

Me: Small.

Friend: How much?

Me: Enough to not answer that question.`,
  },
  {
    category: "money",
    styles: ["story", "deadpan"],
    text: `I checked my account balance today.

The bank app loaded.

I loaded.

We both stared at each other.

Nobody spoke.`,
  },
  {
    category: "money",
    styles: ["plot_twist", "story"],
    text: `I decided to start saving money.

Day 1: saved.

Day 2: saved.

Day 3: my family remembered my phone number.

Savings plan: cancelled.`,
  },
  {
    category: "salary",
    styles: ["banter", "story"],
    text: `The most talented people in Nigeria are not musicians.

It's the people who can make ₦20,000 survive until the end of the month.`,
  },
  {
    category: "money",
    styles: ["dialogue", "banter"],
    text: `Friend: Please borrow me ₦5k.

Me: I don't have.

Friend: Check well.

Me: 😭

Even my account balance has started insulting me.`,
  },
  {
    category: "money",
    styles: ["story", "plot_twist"],
    text: `I received an unexpected transfer.

For 30 seconds I was rich.

Then I checked the sender.

It was my own second account.`,
  },
];

/* =========================================================
   RELATIONSHIPS
========================================================= */

const RELATIONSHIP_JOKES: Joke[] = [
  {
    category: "relationship",
    styles: ["dialogue", "plot_twist"],
    text: `Partner: I'm fine.

Me: Okay.

Partner: Okay?

Me: 😭

Apparently "okay" was the wrong answer.`,
  },
  {
    category: "relationship",
    styles: ["story", "banter"],
    text: `Relationship tip:

If your partner says "do whatever you want",

DO NOT DO WHATEVER YOU WANT.

That sentence has hidden terms and conditions.`,
  },
  {
    category: "relationship",
    styles: ["dialogue", "banter"],
    text: `Me: Why are you angry?

Partner: I'm not angry.

Me: You sure?

Partner: Yes.

Me: Okay.

Partner: Fine.

Me: 😭

I have somehow made it worse.`,
  },
  {
    category: "relationship",
    styles: ["story", "plot_twist"],
    text: `I thought my relationship was peaceful.

Then I forgot one tiny detail from a conversation we had 47 days ago.

Apparently there was a meeting.

I did not attend.`,
  },
  {
    category: "relationship",
    styles: ["one_liner", "banter"],
    text: "Dating in Nigeria requires love, patience, data, transport money and the ability to say 'sorry' before you know what you did.",
  },
];

/* =========================================================
   FOOD
========================================================= */

const FOOD_JOKES: Joke[] = [
  {
    category: "food",
    styles: ["story", "banter"],
    text: `I bought suya and entered the house.

Suddenly:

"Ahhh, welcome!"

"How was your day?"

"Have you eaten?"

These people did not care about me 30 seconds ago.`,
  },
  {
    category: "food",
    styles: ["dialogue", "plot_twist"],
    text: `Mum: Don't touch the meat.

Me: Okay.

Five minutes later:

Mum: Who ate the meat?

Me: 😭

Why did you ask me not to touch it if you weren't going to protect it?`,
  },
  {
    category: "food",
    styles: ["story", "banter"],
    text: `Nigerian family fridge:

Your food: clearly labelled.

Your sibling's food: clearly labelled.

Mystery container: nobody knows.

Everybody is afraid to open it.`,
  },
  {
    category: "food",
    styles: ["plot_twist", "banter"],
    text: `I said I wasn't hungry.

Then I smelled jollof rice.

My body held a family meeting without me.`,
  },
  {
    category: "food",
    styles: ["dialogue", "banter"],
    text: `Friend: What did you eat?

Me: Rice.

Friend: Which rice?

Me: Nigerian rice.

Friend: 😐

Me: Don't complicate breakfast.`,
  },
  {
    category: "food",
    styles: ["story", "banter"],
    text: `The last piece of chicken in a Nigerian house is not food anymore.

It is a political position.`,
  },
];

/* =========================================================
   TRANSPORT
========================================================= */

const TRANSPORT_JOKES: Joke[] = [
  {
    category: "transport",
    styles: ["dialogue", "banter"],
    text: `Conductor: Enter, there's space.

Me: Where?

Conductor: Inside.

Me: I can see that.

Conductor: Enter first.

Me: 😭`,
  },
  {
    category: "transport",
    styles: ["story", "plot_twist"],
    text: `The bus looked full.

The conductor looked at me and said:

"One person still dey enter."

Sir.

Where?

The boot?`,
  },
  {
    category: "transport",
    styles: ["dialogue", "banter"],
    text: `Driver: Na shortcut.

Me: How long?

Driver: Ten minutes.

One hour later:

Me: Where are we?

Driver: Almost there.

Almost WHERE? 😭`,
  },
  {
    category: "transport",
    styles: ["story", "banter"],
    text: `Nigerian bus mathematics:

4 seats

7 passengers

1 conductor

2 bags

And somehow everyone has a seat.`,
  },
  {
    category: "transport",
    styles: ["one_liner", "banter"],
    text: "A Nigerian conductor can look at a full bus and still say 'shift small'. The man believes in miracles.",
  },
];

/* =========================================================
   TRAFFIC
========================================================= */

const TRAFFIC_JOKES: Joke[] = [
  {
    category: "traffic",
    styles: ["story", "plot_twist"],
    text: `I left home early to beat traffic.

Traffic had the same idea.

We met halfway.`,
  },
  {
    category: "traffic",
    styles: ["dialogue", "banter"],
    text: `Google Maps: 23 minutes.

Me: Nice.

Google Maps after 5 minutes:

1 hour 47 minutes.

Me:

"Who changed the constitution?"`,
  },
  {
    category: "traffic",
    styles: ["story", "banter"],
    text: `Two Nigerian drivers meet on a narrow road.

Nobody wants to reverse.

Both have somewhere important to be.

Now the entire road is attending a leadership summit.`,
  },
  {
    category: "traffic",
    styles: ["one_liner", "deadpan"],
    text: "Traffic can make two strangers become lifelong friends because both of them are suffering together.",
  },
];

/* =========================================================
   POWER / NEPA
========================================================= */

const POWER_JOKES: Joke[] = [
  {
    category: "power",
    styles: ["story", "plot_twist"],
    text: `Light came back.

Everybody shouted.

Fans started spinning.

Phones started charging.

Someone even opened the fridge.

11 minutes later:

Darkness.

That was not electricity.

That was a trailer.`,
  },
  {
    category: "power",
    styles: ["dialogue", "banter"],
    text: `Me: Is there light?

Neighbour: Yes.

Me: Since when?

Neighbour: I don't know.

Me: So why didn't you tell me?

Neighbour: I thought you knew.

Nigerian electricity requires intelligence gathering.`,
  },
  {
    category: "power",
    styles: ["story", "banter"],
    text: `Generator fuel remaining: 2 litres.

Nigerian family:

TV: ON
Decoder: ON
Fan: ON
Lights: ON
Phone chargers: 6

Everybody:

"Why is fuel finishing?"`,
  },
  {
    category: "power",
    styles: ["one_liner", "banter"],
    text: "When Nigerian light comes back, people don't celebrate. They panic-charge.",
  },
];

/* =========================================================
   INTERNET / DATA
========================================================= */

const INTERNET_JOKES: Joke[] = [
  {
    category: "internet",
    styles: ["story", "plot_twist"],
    text: `I bought 10GB of data.

Network: "Congratulations."

I opened one video.

Network: "Enjoy your 9.7GB."

I refreshed.

Network: "Enjoy your 4.2GB."

Me: What happened?

Network: "Experience."`,
  },
  {
    category: "internet",
    styles: ["dialogue", "banter"],
    text: `Network: 4G.

Me: Nice.

Speed: 12kb/s.

Me: So what exactly is the 4G doing?

Network:

"Looking good."`,
  },
  {
    category: "internet",
    styles: ["story", "banter"],
    text: `The network is always fast when you don't need it.

The moment you need to send one important message:

Loading...

Loading...

Loading...

"Connection timed out."

Na wa.`,
  },
  {
    category: "internet",
    styles: ["one_liner", "deadpan"],
    text: "Nigerian network providers have taught me that bars are a suggestion, not a promise.",
  },
];

/* =========================================================
   POS / BANKING
========================================================= */

const POS_JOKES: Joke[] = [
  {
    category: "pos",
    styles: ["dialogue", "plot_twist"],
    text: `Me: Please withdraw ₦10,000.

POS: Network.

Me: Okay.

POS: Network.

Me: Try again.

POS: Approved.

Bank: Debited.

POS: Failed.

Me:

So my money has left physically but not spiritually?`,
  },
  {
    category: "pos",
    styles: ["story", "banter"],
    text: `You see a POS agent with no queue.

You think:

"Today is my lucky day."

You get there.

"Network no dey."

Nigeria saw your happiness and cancelled it.`,
  },
  {
    category: "pos",
    styles: ["dialogue", "banter"],
    text: `Agent: How much?

Me: ₦5,000.

Agent: Plus charge.

Me: How much?

Agent: ₦200.

Me: For what?

Agent: For the privilege of receiving your own money.`,
  },
];

/* =========================================================
   SCHOOL
========================================================= */

const SCHOOL_JOKES: Joke[] = [
  {
    category: "school",
    styles: ["story", "plot_twist"],
    text: `Lecturer: Read everything.

Me: Everything?

Lecturer: Yes.

Exam day:

Question 1:

"Discuss the economic activities of a community mentioned once in week 3."

Me: 😭`,
  },
  {
    category: "school",
    styles: ["dialogue", "banter"],
    text: `Lecturer: This course is very easy.

Everybody:

😌

Two weeks later:

Everybody:

"Who has past questions?"

"Who has the lecturer's number?"

"Who knows the HOD?"`,
  },
  {
    category: "school",
    styles: ["story", "banter"],
    text: `You study for six hours.

You enter the exam hall.

Question paper:

"Good morning. Let's see what you know."

Me:

"Apparently not much."`,
  },
  {
    category: "school",
    styles: ["one_liner", "deadpan"],
    text: "Nigerian students don't fear exams. We fear the sentence: 'This question is compulsory.'",
  },
];

/* =========================================================
   WORK
========================================================= */

const WORK_JOKES: Joke[] = [
  {
    category: "work",
    styles: ["dialogue", "plot_twist"],
    text: `Boss: Do you have a minute?

Me: Yes.

Boss: Great.

Two hours later:

I'm in a meeting discussing a document I have never seen.`,
  },
  {
    category: "work",
    styles: ["story", "banter"],
    text: `Boss: We are a family here.

Me:

That's beautiful.

Then I remembered families don't usually send invoices to each other.`,
  },
  {
    category: "work",
    styles: ["story", "plot_twist"],
    text: `I finished my work early.

I was proud.

My boss looked at me and said:

"Since you're free..."

That was the beginning of the end.`,
  },
  {
    category: "work",
    styles: ["dialogue", "banter"],
    text: `Boss: Please make it short.

Me: Okay.

Boss after reading it:

"Can you explain further?"

Me:

So why did we start with short?`,
  },
];

/* =========================================================
   WHATSAPP / GROUP CHAT
========================================================= */

const WHATSAPP_JOKES: Joke[] = [
  {
    category: "whatsapp",
    styles: ["group_chat", "dialogue"],
    text: `Group member: Guys, I have a question.

Everyone: 👀

Group member: Never mind.

Everyone:

ADMIN.

DO SOMETHING.`,
  },
  {
    category: "whatsapp",
    styles: ["group_chat", "banter"],
    text: `Someone sends a 7-minute voice note.

Everyone reads it.

Nobody listens.

Then one person replies:

"Exactly."

EXACTLY WHAT? 😭`,
  },
  {
    category: "whatsapp",
    styles: ["group_chat", "plot_twist"],
    text: `WhatsApp group at 2:13 AM:

"Who is awake?"

At 2:14 AM:

47 people suddenly become online.

Nobody sleeps in this country.`,
  },
  {
    category: "whatsapp",
    styles: ["group_chat", "banter"],
    text: `One person leaves the group.

Everyone:

"Why?"

The person:

"Personal reasons."

Now everybody becomes CID.`,
  },
  {
    category: "whatsapp",
    styles: ["group_chat", "dialogue"],
    text: `Admin: Please stop sending unrelated messages.

Five minutes later:

Admin:

"Guys, who knows a good mechanic?"

The constitution has collapsed.`,
  },
  {
    category: "whatsapp",
    styles: ["group_chat", "banter"],
    text: `Family group:

Aunty: Good morning.

Aunty: Good morning.

Aunty: Good morning.

Aunty: Good morning.

At this point even the morning is tired.`,
  },
];

/* =========================================================
   FRIENDS
========================================================= */

const FRIEND_JOKES: Joke[] = [
  {
    category: "friends",
    styles: ["dialogue", "banter"],
    text: `Friend: Bro, where are you?

Me: Almost there.

Friend: Send location.

Me: 😭

Why are you bringing evidence into this?`,
  },
  {
    category: "friends",
    styles: ["story", "plot_twist"],
    text: `My friend said:

"Let's just go out for one hour."

We came back the next morning.

Nobody knows what happened.`,
  },
  {
    category: "friends",
    styles: ["dialogue", "banter"],
    text: `Friend: You dey around?

Me: Yes.

Friend: I need a small favour.

Me:

Why did you ask where I am first?`,
  },
  {
    category: "friends",
    styles: ["one_liner", "banter"],
    text: "A Nigerian friend saying 'I'll pay you back tomorrow' can mean tomorrow, next month, next year or never. Context matters.",
  },
];

/* =========================================================
   LANDLORD
========================================================= */

const LANDLORD_JOKES: Joke[] = [
  {
    category: "landlord",
    styles: ["dialogue", "banter"],
    text: `Landlord: Good evening.

Tenant: Good evening sir.

Landlord: How are you?

Tenant: Fine sir.

Landlord: Good.

Two seconds later:

"Your rent is due."

The greeting was a trap.`,
  },
  {
    category: "landlord",
    styles: ["story", "plot_twist"],
    text: `Landlord saw me outside and smiled.

I smiled back.

Then he said:

"Have you forgotten something?"

My heart left my body.

Rent has changed my personality.`,
  },
  {
    category: "landlord",
    styles: ["one_liner", "banter"],
    text: "The Nigerian landlord has a supernatural ability to appear exactly when your rent is due.",
  },
];

/* =========================================================
   LAGOS
========================================================= */

const LAGOS_JOKES: Joke[] = [
  {
    category: "lagos",
    styles: ["story", "banter"],
    text: `Lagos traffic can make you leave home angry, arrive angry, return angry...

and somehow still say:

"Tomorrow I'll leave earlier."`,
  },
  {
    category: "lagos",
    styles: ["one_liner", "banter"],
    text: "In Lagos, 'I'm five minutes away' is not a distance. It's an emotion.",
  },
  {
    category: "lagos",
    styles: ["dialogue", "plot_twist"],
    text: `Someone: Where are you?

Me: Lagos.

Someone: Which part?

Me:

The part where traffic has defeated me.`,
  },
  {
    category: "lagos",
    styles: ["story", "banter"],
    text: `Lagos weather:

Sunny.

Very sunny.

Why is it raining?

Why is it sunny again?

Why am I wet?

Why am I sweating?

Lagos:

"Yes."`,
  },
];

/* =========================================================
   ABUJA
========================================================= */

const ABUJA_JOKES: Joke[] = [
  {
    category: "abuja",
    styles: ["story", "banter"],
    text: `Abuja can look so peaceful that you forget you're still in Nigeria.

Then you check your account balance.

Peace cancelled.`,
  },
  {
    category: "abuja",
    styles: ["one_liner", "deadpan"],
    text: "Abuja is so calm sometimes you start wondering if everybody else in Nigeria is the one making noise.",
  },
  {
    category: "abuja",
    styles: ["story", "plot_twist"],
    text: `Me in Abuja:

"Life is peaceful."

My bank account:

"Don't get comfortable."`,
  },
];

/* =========================================================
   RANDOM SITUATION BUILDERS
========================================================= */

const RANDOM_SITUATIONS = [
  {
    setup: "you finally sit down after a long day",
    punchline:
      "someone from the next room shouts your name like they have discovered oil.",
  },
  {
    setup: "you say 'I'll sleep early tonight'",
    punchline:
      "somehow it's 2:47 AM and you're watching a man repair an old generator in a 2016 YouTube video.",
  },
  {
    setup: "you put your phone on charge",
    punchline:
      "NEPA immediately decides your phone has had enough happiness.",
  },
  {
    setup: "you tell yourself you won't spend money today",
    punchline:
      "life starts presenting expenses like a PowerPoint presentation.",
  },
  {
    setup: "you say 'let me just check WhatsApp'",
    punchline:
      "two hours later you know the entire history of a family you have never met.",
  },
  {
    setup: "you decide to eat healthy",
    punchline:
      "somebody walks past with hot jollof and your discipline resigns.",
  },
  {
    setup: "you finally get comfortable",
    punchline:
      "your mother remembers an errand from 2014.",
  },
  {
    setup: "you say 'I don't have money'",
    punchline:
      "someone replies 'just find small'.",
  },
  {
    setup: "you see your boss typing",
    punchline:
      "your heartbeat becomes faster than the office Wi-Fi.",
  },
  {
    setup: "you hear 'we need to talk'",
    punchline:
      "you start reviewing your entire life like a documentary.",
  },
  {
    setup: "you receive 'Good evening' from an unknown number",
    punchline:
      "you already know this is either business, family drama or someone selling land.",
  },
  {
    setup: "you hear 'come and eat'",
    punchline:
      "you suddenly remember that you have been hungry since 1998.",
  },
];

const RANDOM_PUNCHLINES = [
  "and somehow you're still the one explaining yourself.",
  "because apparently peace is not included in the Nigerian package.",
  "and that is how another normal day became a full episode.",
  "you just stand there asking yourself where everything went wrong.",
  "at this point, even Google needs context.",
  "and nobody thinks this is unusual.",
  "because Nigeria has already prepared the plot twist.",
  "you laugh because crying requires energy.",
  "and somehow tomorrow you're going to do the same thing again.",
  "the important thing is that nobody died. Probably.",
];

/* =========================================================
   ALL JOKES
========================================================= */

const ALL_JOKES: Joke[] = [
  ...ONE_LINERS,
  ...FAMILY_JOKES,
  ...MONEY_JOKES,
  ...RELATIONSHIP_JOKES,
  ...FOOD_JOKES,
  ...TRANSPORT_JOKES,
  ...TRAFFIC_JOKES,
  ...POWER_JOKES,
  ...INTERNET_JOKES,
  ...POS_JOKES,
  ...SCHOOL_JOKES,
  ...WORK_JOKES,
  ...WHATSAPP_JOKES,
  ...FRIEND_JOKES,
  ...LANDLORD_JOKES,
  ...LAGOS_JOKES,
  ...ABUJA_JOKES,
];

/* =========================================================
   CATEGORY MAP
========================================================= */

const CATEGORY_NAMES: Record<MemeCategory, string> = {
  random: "Random Nigeria",
  family: "Family",
  parents: "Nigerian Parents",
  money: "Money",
  salary: "Salary",
  relationship: "Relationship",
  school: "School",
  work: "Work",
  transport: "Transport",
  traffic: "Traffic",
  power: "NEPA / Generator",
  internet: "Internet / Data",
  food: "Food",
  pos: "POS / Banking",
  whatsapp: "WhatsApp / Groups",
  friends: "Friends",
  landlord: "Landlord",
  social: "Social Media",
  lagos: "Lagos",
  abuja: "Abuja",
};

export function getMemeCategories(): string[] {
  return Object.entries(CATEGORY_NAMES).map(
    ([key, value]) => `${key} — ${value}`,
  );
}

export function getMemeCategoryName(
  category: MemeCategory,
): string {
  return CATEGORY_NAMES[category];
}

export function isMemeCategory(
  value: string,
): value is MemeCategory {
  return Object.prototype.hasOwnProperty.call(
    CATEGORY_NAMES,
    value.toLowerCase(),
  );
}

function categoryMatches(
  joke: Joke,
  category: MemeCategory,
): boolean {
  if (category === "random") return true;

  if (joke.category === category) {
    return true;
  }

  if (
    category === "parents" &&
    joke.category === "family"
  ) {
    return true;
  }

  if (
    category === "salary" &&
    joke.category === "money"
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   STYLE FILTER
========================================================= */

function styleMatches(
  joke: Joke,
  style: MemeStyle,
): boolean {
  if (style === "random") return true;

  return joke.styles.includes(style);
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatJoke(
  text: string,
  username?: string,
): string {
  const prefix = tag(username);

  return [
    `${emoji()} ${prefix}${text}`,
  ].join("\n");
}

function formatOneLiner(
  text: string,
  username?: string,
): string {
  return `${emoji()} ${tag(username)}${text}`;
}

function formatRandomSituation(
  username?: string,
): string {
  const situation = pick(RANDOM_SITUATIONS);
  const punchline = pick(RANDOM_PUNCHLINES);

  return [
    `${emoji()} ${tag(username)}Omo,`,
    "",
    `👉 ${situation.setup}.`,
    "",
    `💀 ${situation.punchline}`,
    "",
    `And ${punchline}`,
  ].join("\n");
}

/* =========================================================
   MAIN GENERATOR
========================================================= */

export function generateNigerianMeme(
  options: MemeOptions = {},
): string {
  const category = options.category ?? "random";
  const style = options.style ?? "random";

  let candidates = ALL_JOKES.filter((joke) =>
    categoryMatches(joke, category),
  );

  if (style !== "random") {
    const styled = candidates.filter((joke) =>
      styleMatches(joke, style),
    );

    if (styled.length > 0) {
      candidates = styled;
    }
  }

  /*
   * If the selected category has no usable jokes,
   * fall back to the entire library.
   */
  if (candidates.length === 0) {
    candidates = ALL_JOKES;
  }

  /*
   * Prefer jokes that haven't appeared recently.
   */
  const fresh = candidates.filter(
    (joke) => !wasRecentlyUsed(joke.text),
  );

  const pool =
    fresh.length > 0 ? fresh : candidates;

  const selected = pick(pool);

  let result: string;

  if (
    selected.styles.includes("one_liner") &&
    !selected.styles.includes("story") &&
    chance(70)
  ) {
    result = formatOneLiner(
      selected.text,
      options.username,
    );
  } else {
    result = formatJoke(
      selected.text,
      options.username,
    );
  }

  remember(selected.text);

  return result;
}

/* =========================================================
   RANDOM MEME
========================================================= */

export function generateRandomNigerianMeme(
  username?: string,
): string {
  /*
   * Occasionally generate a completely fresh
   * situation instead of selecting a stored joke.
   */
  if (chance(30)) {
    const result = formatRandomSituation(username);
    remember(result);
    return result;
  }

  return generateNigerianMeme({
    category: "random",
    style: "random",
    username,
  });
}

/* =========================================================
   STYLE-SPECIFIC GENERATORS
========================================================= */

export function generateNigerianBanter(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "random",
    style: "banter",
    username,
  });
}

export function generateNigerianStory(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "random",
    style: "story",
    username,
  });
}

export function generateNigerianDialogue(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "random",
    style: "dialogue",
    username,
  });
}

export function generateNigerianPlotTwist(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "random",
    style: "plot_twist",
    username,
  });
}

export function generateNigerianOneLiner(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "random",
    style: "one_liner",
    username,
  });
}

export function generateNigerianGroupChatMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "whatsapp",
    style: "group_chat",
    username,
  });
}

/* =========================================================
   CATEGORY-SPECIFIC SHORTCUTS
========================================================= */

export function generateFamilyMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "family",
    username,
  });
}

export function generateMoneyMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "money",
    username,
  });
}

export function generateRelationshipMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "relationship",
    username,
  });
}

export function generateSchoolMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "school",
    username,
  });
}

export function generateWorkMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "work",
    username,
  });
}

export function generateTransportMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "transport",
    username,
  });
}

export function generatePowerMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "power",
    username,
  });
}

export function generateFoodMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "food",
    username,
  });
}

export function generateWhatsAppMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "whatsapp",
    username,
  });
}

export function generateLagosMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "lagos",
    username,
  });
}

export function generateAbujaMeme(
  username?: string,
): string {
  return generateNigerianMeme({
    category: "abuja",
    username,
  });
}

/* =========================================================
   RANDOM CATEGORY
========================================================= */

export function getRandomMemeCategory(): MemeCategory {
  const categories: MemeCategory[] = [
    "family",
    "parents",
    "money",
    "salary",
    "relationship",
    "school",
    "work",
    "transport",
    "traffic",
    "power",
    "internet",
    "food",
    "pos",
    "whatsapp",
    "friends",
    "landlord",
    "social",
    "lagos",
    "abuja",
  ];

  return pick(categories);
}

/* =========================================================
   RANDOM STYLE
========================================================= */

export function getRandomMemeStyle(): MemeStyle {
  return pick([
    "banter",
    "story",
    "dialogue",
    "plot_twist",
    "deadpan",
    "group_chat",
    "one_liner",
  ]);
}

/* =========================================================
   FULL RANDOM COMBINATION
========================================================= */

export function generateFreshNigerianMeme(
  username?: string,
): string {
  const category = getRandomMemeCategory();
  const style = getRandomMemeStyle();

  return generateNigerianMeme({
    category,
    style,
    username,
  });
}

/* =========================================================
   GROUP SPAM / MULTIPLE MEMES
========================================================= */

export function generateMemePack(
  count = 3,
  username?: string,
): string[] {
  const safeCount = Math.max(
    1,
    Math.min(Math.floor(count), 10),
  );

  const results: string[] = [];

  for (let i = 0; i < safeCount; i++) {
    results.push(
      generateFreshNigerianMeme(username),
    );
  }

  return results;
}

/* =========================================================
   DIAGNOSTIC / STATS
========================================================= */

export function getMemeStats(): {
  totalJokes: number;
  recentCount: number;
  categories: number;
} {
  return {
    totalJokes: ALL_JOKES.length,
    recentCount: RECENT_MEMES.length,
    categories: Object.keys(CATEGORY_NAMES).length,
  };
}


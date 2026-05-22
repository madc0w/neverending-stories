import { MongoClient } from 'mongodb';
import OpenAI from 'openai';

export interface StoryFragment {
	text: string;
	options: string[];
}

export interface StoryHistoryEntry {
	text: string;
	options: string[];
	choice?: string;
}

export interface StoryRecord {
	id: string;
	genre: string;
	turnCount: number;
	text: string;
	options: string[];
	ended: boolean;
	history: StoryHistoryEntry[];
	createdAt: string;
	updatedAt: string;
}

interface StoryGenerationInput {
	genre: string;
	turnCount: number;
	choice?: string;
	history: StoryHistoryEntry[];
}

const memoryStore = globalThis as typeof globalThis & {
	__neverendingStories?: Map<string, StoryRecord>;
};

let mongoClientPromise: Promise<MongoClient> | null = null;
let openAiClient: OpenAI | null = null;
let openAiClientKey = '';

function getConfig() {
	return {
		mongoUrl: process.env.MONGODB_URI ?? '',
		mongoDbName: process.env.MONGODB_DB ?? 'neverending-stories',
		openaiApiKey: process.env.OPENAI_API_KEY ?? '',
		openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
	};
}

function getMemoryStore() {
	memoryStore.__neverendingStories ??= new Map<string, StoryRecord>();
	return memoryStore.__neverendingStories;
}

async function getStoryCollection() {
	const config = getConfig();
	const mongoUrl = config.mongoUrl.trim();

	if (!mongoUrl) {
		return null;
	}

	mongoClientPromise ??= new MongoClient(mongoUrl).connect();
	const client = await mongoClientPromise;
	return client.db(config.mongoDbName).collection<StoryRecord>('stories');
}

export async function loadStory(id: string) {
	const collection = await getStoryCollection();

	if (collection) {
		return normalizeStory(await collection.findOne({ id }));
	}

	return getMemoryStore().get(id) ?? null;
}

export async function saveStory(story: StoryRecord) {
	const nextStory = {
		...story,
		updatedAt: new Date().toISOString(),
	};

	const collection = await getStoryCollection();

	if (collection) {
		await collection.updateOne(
			{ id: nextStory.id },
			{ $set: nextStory },
			{ upsert: true },
		);
	} else {
		getMemoryStore().set(nextStory.id, nextStory);
	}

	return nextStory;
}

export function createStoryId() {
	return `story_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStory(story: StoryRecord | null | undefined) {
	if (!story) {
		return null;
	}

	return {
		...story,
		history: Array.isArray(story.history) ? story.history : [],
		options: Array.isArray(story.options) ? story.options : [],
	};
}

function getOpenAiClient() {
	const config = getConfig();
	const apiKey = config.openaiApiKey.trim();

	if (!apiKey) {
		return null;
	}

	if (!openAiClient || openAiClientKey !== apiKey) {
		openAiClient = new OpenAI({ apiKey });
		openAiClientKey = apiKey;
	}

	return openAiClient;
}

function cleanOptions(options: unknown) {
	if (!Array.isArray(options)) {
		return [];
	}

	return [
		...new Set(options.map((option) => String(option).trim()).filter(Boolean)),
	].slice(0, 3);
}

function sanitizeFragment(fragment: unknown): StoryFragment {
	if (!fragment || typeof fragment !== 'object') {
		return { text: '', options: [] };
	}

	const candidate = fragment as Record<string, unknown>;

	return {
		text: typeof candidate.text === 'string' ? candidate.text.trim() : '',
		options: cleanOptions(candidate.options),
	};
}

function normalizeGenreKey(genre: string) {
	return genre.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function wordCount(text: string) {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

function ensurePageLength(text: string) {
	return wordCount(text) >= 260;
}

function getFallbackOptions(input: StoryGenerationInput) {
	const key = normalizeGenreKey(input.genre);
	const optionPools: Record<string, string[]> = {
		fantasy: [
			'Follow the candlelit procession into the ruined chapel crypt.',
			'Question the masked courier before the moonbridge collapses behind him.',
			'Pocket the rune coin and test it against the sealed iron door.',
			'Climb the watchtower and signal the griffin riders with mirror-fire.',
		],
		mystery: [
			'Dust the brass key for prints before anyone touches the desk.',
			'Tail the limping witness through the tram tunnel without being seen.',
			'Call the morgue and demand the unredacted autopsy photos tonight.',
			'Break into the landlord office and copy the tenant ledger.',
		],
		horror: [
			'Pry open the warped attic hatch before the scratching stops again.',
			'Nail salt lines across every doorway and wait in the kitchen.',
			'Follow the wet footprints into the basement boiler room now.',
			'Turn on every radio in the house to drown out the whispering.',
		],
		scifi: [
			'Override docking protocol and force a manual clamp to Bay 9.',
			'Cut power to Deck C and hunt the ghost signal source.',
			'Wake the cryo-engineer and show her the corrupted star map.',
			'Eject the relay drone and piggyback its camera through the hull breach.',
		],
		adventure: [
			'Race the rival crew to the basalt arch before high tide.',
			'Trade your last flare for the smuggler route through the gorge.',
			'Lower yourself into the sinkhole and map the carved tunnel walls.',
			'Use the broken sextant to line up the hidden canyon pass.',
		],
	};

	const fallbackPool = [
		'Follow the freshest clue before the trail goes cold.',
		'Confront the nearest suspect and force a direct answer.',
		'Inspect the strange device and trigger it on purpose.',
		'Slip away quietly and gather proof before anyone notices.',
	];

	const pool = optionPools[key] ?? fallbackPool;
	const startIndex = input.turnCount % pool.length;
	const rotated = [...pool.slice(startIndex), ...pool.slice(0, startIndex)];

	return rotated.slice(0, 2 + (input.turnCount % 2));
}

function buildPrompt(input: StoryGenerationInput) {
	const previousTurns = input.history
		.slice(-4)
		.map((entry, index) => {
			const choiceLine = entry.choice
				? `Choice: ${entry.choice}`
				: 'Choice: story beginning';
			return [
				`Turn ${Math.max(1, input.turnCount - Math.min(3, input.history.length - index - 1))}:`,
				`Text: ${entry.text}`,
				choiceLine,
			].join('\n');
		})
		.join('\n\n');

	const mustEndNow = input.turnCount >= 6;

	return [
		'Write immersive second-person fiction as if events are happening now.',
		`Genre: ${input.genre}`,
		`Current turn: ${input.turnCount + 1}`,
		input.choice
			? `The user chose: ${input.choice}`
			: 'This is the opening scene.',
		previousTurns
			? `Recent story context:\n${previousTurns}`
			: 'No prior story context exists.',
		'Do not mention writing, stories, narratives, scenes, genres, prompts, choices, or options.',
		'Do not use self-referential lines like "the story begins" or "a choice appears."',
		'Start with a concrete physical moment, not setup commentary.',
		'Use 3 to 5 paragraphs and aim for roughly 300 to 450 words for the main text.',
		'Show events in motion with sensory detail, specific objects, and immediate stakes.',
		'Every paragraph should advance the situation; avoid filler and repeated phrasing.',
		'Return only JSON with the exact shape {"text":"...","options":["...","...","..."]}.',
		'The options array must contain 2 or 3 distinct actions unless ending now.',
		'Each option must be specific, concrete, and materially different in approach.',
		'Avoid generic option language such as "press deeper," "inspect," "riskier path," or "hidden meaning."',
		'Each option should reference at least one tangible noun from the current moment.',
		'Do not wrap the response in markdown or add extra keys.',
		mustEndNow
			? 'This branch must end now with a satisfying conclusion. Return an empty options array.'
			: 'Keep the story moving toward a later conclusion and leave the scene on a branching decision.',
	].join('\n');
}

function fallbackFragment(input: StoryGenerationInput): StoryFragment {
	const vibeMap: Record<
		string,
		{
			setup: string;
			beats: string[];
			details: string[];
			endings: string[];
		}
	> = {
		fantasy: {
			setup:
				'A crown-shaped moon hangs over a road cut through old stone and wild heather.',
			beats: [
				'The air tastes faintly of oak smoke and old spells.',
				'Someone is watching from the treeline with patient magic.',
			],
			details: [
				'Your boots sink into a silver-tinged mist that clings to the ground as if the earth itself is breathing. Every ruined marker beside the road seems to have been carved by different hands, and yet all of them point toward the same unseen destination.',
				'Far ahead, a bell rings once inside the fog. It is not a church bell. It sounds older, deeper, and oddly deliberate, as though some hidden authority has just noticed your arrival and decided to test your courage.',
			],
			endings: [
				'The kingdom remembers your name.',
				'The last door opens on a dawn that no map ever drew.',
			],
		},
		mystery: {
			setup:
				'A locked room, a cracked photograph, and a city block gone strangely silent set the stage.',
			beats: [
				'Every clue points to someone who should not exist.',
				'The answer keeps moving one step ahead of you.',
			],
			details: [
				'Dust hangs in the air like a second, invisible curtain. The furniture has been shifted just enough to suggest a hurried search, but not enough to be careless. Whoever was here wanted the scene to look abandoned, and they failed by a single, telling detail.',
				'In the corner, the cracked photograph catches the light from the hall and reveals a face that should have been cut out of the record years ago. That impossible presence changes the shape of the room, making every shadow feel like a statement waiting to be translated.',
			],
			endings: [
				'The final clue fits perfectly, and the lie falls apart.',
				'The case closes with one quiet, impossible confession.',
			],
		},
		horror: {
			setup:
				'The hallway is longer than the house should allow, and every light seems to hesitate before turning on.',
			beats: [
				'Something taps from the inside of the walls.',
				'The thing in the dark knows your name and is learning the rest.',
			],
			details: [
				'The temperature drops in uneven pockets, as though the house is exhaling in slow, cold breaths. The wallpaper buckles in one narrow strip, and from behind it comes a faint, rhythmic scratching that pauses whenever you look directly at it.',
				'Every surface reflects a version of the room that is almost, but not quite, the same. In the warped shine of a picture frame, you glimpse a shape standing where no body should fit, and the shape seems patient rather than frantic.',
			],
			endings: [
				'The house goes still, but it is not empty.',
				'You escape the dark only to realize it followed you home.',
			],
		},
		sciFi: {
			setup:
				'A broken starship drifts between silent stations while the cockpit lights pulse in warning red.',
			beats: [
				'The AI is honest, but only in the way machines can be.',
				'There is another signal hidden beneath the one you came to answer.',
			],
			details: [
				'The ship vibrates with a low mechanical shiver, and every console pulse reminds you that the systems are dying in a very deliberate order. Outside the forward glass, the nearest station hangs like a dead moon, its docking lights blinking with a pattern that almost feels intentional.',
				'A half-finished diagnostic rolls across the screen, then erases itself before you can read the last line. Something in the ship is making choices without you, and the silence between the alerts feels less like a system failure and more like a warning being translated in real time.',
			],
			endings: [
				'The jump gate opens, and the future blazes ahead of you.',
				'The last transmission becomes the first line of a new map.',
			],
		},
	};

	const key = normalizeGenreKey(input.genre);
	const genre = vibeMap[key] ?? {
		setup: `Rain needles your coat as the alley gate clicks shut behind you.`,
		beats: [
			'Footsteps above you pause, then begin descending the metal stairs.',
			'A red status light starts blinking from inside a cracked service panel.',
		],
		details: [
			'Water drips from a bent fire escape onto a stack of shipping crates stamped with three different company seals. One crate is warm to the touch, and the wood around its latch is splintered from the inside out.',
			'A vending machine hums in the dark with no power line attached. Behind its glass, every row is empty except one: a paper cup marked with your initials in black marker.',
		],
		endings: [
			'When the noise finally dies, you are the only one still standing by the gate.',
			'By dawn, the district map has one less street and one new warning painted in white.',
		],
	};
	const details = genre.details ?? genre.beats;

	if (input.turnCount >= 6) {
		return {
			text: `${input.choice ? `Because you chose to ${input.choice.toLowerCase()}, ` : ''}${genre.endings[input.turnCount % genre.endings.length]}`,
			options: [],
		};
	}

	const opener = input.choice
		? `You commit to ${input.choice.toLowerCase()}, and the consequences hit fast.`
		: genre.setup;
	const body = [
		opener,
		details[input.turnCount % details.length],
		genre.beats[input.turnCount % genre.beats.length],
		`Time tightens around you as alarms rise and nearby faces start choosing sides. ${input.choice ? 'Your last move has already changed what people are willing to risk for you.' : 'If you hesitate now, someone else decides what happens next.'}`,
	].join('\n\n');

	if (!ensurePageLength(body)) {
		return {
			text: `${body}\n\n${details[(input.turnCount + 1) % details.length]}`,
			options: getFallbackOptions(input),
		};
	}

	return {
		text: body,
		options: getFallbackOptions(input),
	};
}

export async function generateStoryFragment(
	input: StoryGenerationInput,
): Promise<StoryFragment> {
	const client = getOpenAiClient();

	if (!client) {
		return fallbackFragment(input);
	}

	const config = getConfig();

	try {
		const response = await client.chat.completions.create({
			model: config.openaiModel,
			temperature: 0.9,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'system',
					content:
						'You generate branching fiction in JSON only. Never use meta writing language. Avoid repeated templates and produce concrete, materially different options.',
				},
				{ role: 'user', content: buildPrompt(input) },
			],
		});

		const content = response.choices[0]?.message?.content ?? '{}';
		const parsed = sanitizeFragment(JSON.parse(content));

		if (!parsed.text) {
			return fallbackFragment(input);
		}

		return {
			text: parsed.text,
			options: parsed.options.slice(0, input.turnCount >= 6 ? 0 : 3),
		};
	} catch {
		return fallbackFragment(input);
	}
}

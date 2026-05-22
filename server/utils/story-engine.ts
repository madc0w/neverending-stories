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
	isEnded: boolean;
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
		mongoUrl: process.env.MONGODB_URI,
		mongoDbName: process.env.MONGODB_DB ?? 'neverending-stories',
		openaiApiKey: process.env.OPENAI_API_KEY,
		openaiModel: process.env.OPENAI_MODEL ?? 'gpt-5.5',
	};
}

function getMemoryStore() {
	memoryStore.__neverendingStories ??= new Map<string, StoryRecord>();
	return memoryStore.__neverendingStories;
}

async function getStoryCollection() {
	const config = getConfig();
	const mongoUrl = config.mongoUrl?.trim();

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
	const apiKey = config.openaiApiKey?.trim();

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

const STORY_GENERATION_MAX_ATTEMPTS = 3;

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

export async function generateStoryFragment(
	input: StoryGenerationInput,
): Promise<StoryFragment> {
	const client = getOpenAiClient();

	if (!client) {
		throw new Error('OpenAI client is not configured.');
	}

	const config = getConfig();
	let lastError: unknown;

	for (
		let attempt = 1;
		attempt <= STORY_GENERATION_MAX_ATTEMPTS;
		attempt += 1
	) {
		try {
			// console.log(' process.env.OPENAI_MODEL', process.env.OPENAI_MODEL);
			// console.log('config.openaiModel', config.openaiModel);
			const response = await client.chat.completions.create({
				model: config.openaiModel,
				// temperature: 0.9,
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
				throw new Error('OpenAI returned an empty story fragment.');
			}

			if (input.turnCount < 6 && parsed.options.length === 0) {
				throw new Error('OpenAI returned no options before the ending turn.');
			}

			return {
				text: parsed.text,
				options: parsed.options.slice(0, input.turnCount >= 6 ? 0 : 3),
			};
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error('Story generation failed after multiple attempts.');
}

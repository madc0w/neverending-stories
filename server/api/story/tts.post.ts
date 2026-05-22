import OpenAI from 'openai';

let ttsClient: OpenAI | null = null;
let ttsClientKey = '';

function getTtsClient(apiKey: string) {
	if (!ttsClient || ttsClientKey !== apiKey) {
		ttsClient = new OpenAI({ apiKey });
		ttsClientKey = apiKey;
	}

	return ttsClient;
}

export default defineEventHandler(async (event) => {
	const body = await readBody<{ text?: string }>(event);
	const text = body?.text?.trim();

	if (!text) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Text is required.',
		});
	}

	const config = useRuntimeConfig(event);
	const apiKey = config.openaiApiKey?.trim();

	if (!apiKey) {
		throw createError({
			statusCode: 500,
			statusMessage: 'OpenAI API key is not configured.',
		});
	}

	const ttsModel = config.openaiTtsModel?.trim() || 'gpt-4o-mini-tts';
	const ttsVoice = config.openaiTtsVoice?.trim() || 'shimmer';
	const input = text.slice(0, 4096);
	const client = getTtsClient(apiKey);

	try {
		const speech = await client.audio.speech.create({
			model: ttsModel,
			voice: ttsVoice,
			input,
			response_format: 'mp3',
		});
		const audioBuffer = Buffer.from(await speech.arrayBuffer());

		setHeader(event, 'Content-Type', 'audio/mpeg');
		setHeader(event, 'Cache-Control', 'no-store');
		return audioBuffer;
	} catch {
		throw createError({
			statusCode: 502,
			statusMessage: 'Unable to synthesize speech right now.',
		});
	}
});

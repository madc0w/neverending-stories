import {
	createStoryId,
	generateStoryFragment,
	saveStory,
	type StoryRecord,
} from '~/server/utils/story-engine';

export default defineEventHandler(async (event) => {
	const body = await readBody<{ genre?: string }>(event);
	const genre = body?.genre?.trim();

	if (!genre) {
		throw createError({
			statusCode: 400,
			statusMessage: 'A genre is required.',
		});
	}

	const fragment = await generateStoryFragment({
		genre,
		turnCount: 0,
		history: [],
	});

	const now = new Date().toISOString();
	const story: StoryRecord = {
		id: createStoryId(),
		genre,
		turnCount: 1,
		text: fragment.text,
		options: fragment.options,
		ended: fragment.options.length === 0,
		history: [{ text: fragment.text, options: fragment.options }],
		createdAt: now,
		updatedAt: now,
	};

	const saved = await saveStory(story);

	return {
		storyId: saved.id,
		genre: saved.genre,
		text: saved.text,
		options: saved.options,
		ended: saved.ended,
	};
});

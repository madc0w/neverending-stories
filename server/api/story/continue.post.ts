import {
	generateStoryFragment,
	loadStory,
	saveStory,
} from '~/server/utils/story-engine';

export default defineEventHandler(async (event) => {
	const body = await readBody<{ storyId?: string; choice?: string }>(event);
	const storyId = body?.storyId?.trim();
	const choice = body?.choice?.trim();

	if (!storyId || !choice) {
		throw createError({
			statusCode: 400,
			statusMessage: 'A story id and choice are required.',
		});
	}

	const story = await loadStory(storyId);

	if (!story) {
		throw createError({ statusCode: 404, statusMessage: 'Story not found.' });
	}

	if (story.ended) {
		return {
			storyId: story.id,
			genre: story.genre,
			text: story.text,
			options: story.options,
			ended: true,
		};
	}

	const fragment = await generateStoryFragment({
		genre: story.genre,
		choice,
		turnCount: story.turnCount,
		history: story.history,
	});

	const updatedStory = await saveStory({
		...story,
		turnCount: story.turnCount + 1,
		text: fragment.text,
		options: fragment.options,
		ended: fragment.options.length === 0,
		history: [
			...story.history,
			{ text: fragment.text, options: fragment.options, choice },
		],
	});

	return {
		storyId: updatedStory.id,
		genre: updatedStory.genre,
		text: updatedStory.text,
		options: updatedStory.options,
		ended: updatedStory.ended,
	};
});

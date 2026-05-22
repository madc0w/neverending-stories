import { loadStory } from '~/server/utils/story-engine';

export default defineEventHandler(async (event) => {
	const storyId = getQuery(event).storyId;

	if (typeof storyId !== 'string' || !storyId.trim()) {
		throw createError({
			statusCode: 400,
			statusMessage: 'A story id is required.',
		});
	}

	const story = await loadStory(storyId.trim());

	if (!story) {
		throw createError({ statusCode: 404, statusMessage: 'Story not found.' });
	}

	return {
		storyId: story.id,
		genre: story.genre,
		text: story.text,
		options: story.options,
		isEnded: story.isEnded,
	};
});

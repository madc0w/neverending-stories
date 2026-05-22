<template>
	<main class="page-shell">
		<section class="hero-panel">
			<div class="hero-copy">
				<h1>Neverending Stories</h1>
				<p class="lead">Pick a genre. You choose what happens next.</p>
			</div>
		</section>

		<section
			class="story-grid"
			:class="{ 'story-grid--story-focused': isStoryPanelFocused }"
		>
			<aside class="genre-panel">
				<div class="panel-header">
					<p class="panel-label">Genres</p>
					<h2>Choose your doorway</h2>
				</div>

				<div class="genre-list">
					<GenreChip
						v-for="genre in genres"
						:key="genre.label"
						:label="genre.label"
						:description="genre.description"
						:is-active="selectedGenre === genre.label"
						@select="beginStory(genre.label)"
					/>
				</div>
				<!-- 
				<p class="hint">
					Select a genre to generate the opening scene. After that, each option
					becomes the next prompt.
				</p> -->
			</aside>

			<section class="story-panel">
				<div class="panel-header panel-header--story">
					<div>
						<p class="panel-label">Current tale</p>
						<h2>{{ panelTitle }}</h2>
					</div>

					<button
						v-if="story"
						class="ghost-button"
						type="button"
						@click="resetStory"
					>
						Start over
					</button>
				</div>

				<div v-if="isLoading && !story" class="status-card">
					<div class="spinner"></div>
					<p>{{ loadingLabel }}</p>
				</div>

				<div v-else-if="errorMessage" class="status-card status-card--error">
					<p>{{ errorMessage }}</p>
				</div>

				<template v-else-if="story">
					<div ref="storyFeedRef" class="story-feed">
						<article class="story-card">
							<div
								v-for="(entry, index) in transcript"
								:key="`${entry.kind}-${index}-${entry.text.slice(0, 16)}`"
								class="story-entry"
								:class="`story-entry--${entry.kind}`"
							>
								<div class="story-entry__header">
									<p class="story-entry__label">
										{{ entry.kind === 'choice' ? 'You chose' : 'Story' }}
									</p>
									<button
										v-if="
											entry.kind === 'narration' &&
											index === latestNarrationIndex
										"
										class="read-button"
										type="button"
										@click="readLatestChapterAndOptions"
									>
										<span
											class="read-button__spinner"
											:class="{
												'read-button__spinner--visible': isReadLoading,
											}"
										></span>
										<span class="read-button__label">{{
											isReadingAloud ? 'Stop reading' : 'Read to me'
										}}</span>
									</button>
								</div>
								<div class="story-entry__text">
									<p
										v-for="(paragraph, paragraphIndex) in splitParagraphs(
											entry.text,
										)"
										:key="paragraphIndex"
										class="story-text"
									>
										{{ paragraph }}
									</p>
								</div>
							</div>

							<div v-if="story.isEnded" class="ending-card">
								<strong>The story has ended.</strong>
								<p>
									This branch resolved cleanly. Start a new genre to generate
									another path.
								</p>
							</div>

							<div v-if="story.options.length" class="options-stack">
								<StoryOption
									v-for="(option, index) in story.options"
									:key="`${option}-${index}`"
									:index="index"
									:text="option"
									@pick="chooseOption(option)"
								/>
							</div>

							<div v-if="isLoading" class="status-card story-status-inline">
								<div class="spinner"></div>
								<p>{{ loadingLabel }}</p>
							</div>
						</article>
					</div>
				</template>

				<div v-else class="empty-state">
					<h3>No story yet</h3>
					<p>Select a genre on the left to generate the opening scene.</p>
				</div>
			</section>
		</section>
	</main>
</template>

<script setup lang="ts">
interface StoryState {
	storyId: string;
	genre: string;
	text: string;
	options: string[];
	isEnded: boolean;
}

interface TranscriptEntry {
	kind: 'narration' | 'choice';
	text: string;
}

interface GenreItem {
	label: string;
	description: string;
}

interface ApiFetchOptions {
	method?: string;
	body?: unknown;
	query?: Record<string, string>;
}

const genres: GenreItem[] = [
	{
		label: 'Fantasy',
		description:
			'Ancient maps, hidden doors, and the kind of magic that remembers your name.',
	},
	{
		label: 'Mystery',
		description:
			'Locked rooms, unreliable clues, and a truth that keeps moving one step ahead.',
	},
	{
		label: 'Sci-Fi',
		description:
			'Drifting stations, strange signals, and futures built from dangerous decisions.',
	},
	{
		label: 'Horror',
		description:
			'Uneasy hallways, impossible shadows, and the creeping sense you were expected.',
	},
	{
		label: 'Adventure',
		description:
			'Maps, ruins, rival expeditions, and fast turns through unknown territory.',
	},
];

const selectedGenre = ref('');
const story = ref<StoryState | null>(null);
const transcript = ref<TranscriptEntry[]>([]);
const isLoading = ref(false);
const errorMessage = ref('');
const isRestoring = ref(false);
const storyFeedRef = ref<HTMLElement | null>(null);
const isStoryPanelFocused = ref(false);
const isReadingAloud = ref(false);
const isReadLoading = ref(false);
let activeStoryAudio: HTMLAudioElement | null = null;
let activeStoryAudioUrl = '';
let activeReadSessionId = 0;
let activeReadAbortController: AbortController | null = null;

const panelTitle = computed(() => {
	if (story.value?.genre) {
		return story.value.genre;
	}

	if (selectedGenre.value) {
		return selectedGenre.value;
	}

	return 'Waiting for your first genre';
});
const loadingLabel = computed(() => {
	if (!story.value) {
		return 'Conjuring a new opening scene...';
	}

	return 'Writing the next chapter...';
});

const latestNarrationIndex = computed(() => {
	for (let index = transcript.value.length - 1; index >= 0; index -= 1) {
		if (transcript.value[index]?.kind === 'narration') {
			return index;
		}
	}

	return -1;
});

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}) {
	const url = new URL(path, window.location.origin);

	if (options.query) {
		for (const [key, value] of Object.entries(options.query)) {
			url.searchParams.set(key, value);
		}
	}

	const response = await fetch(url.toString(), {
		method: options.method ?? 'GET',
		headers: options.body
			? {
					'Content-Type': 'application/json',
				}
			: undefined,
		body: options.body ? JSON.stringify(options.body) : undefined,
	});

	if (!response.ok) {
		let message = `Request failed with status ${response.status}`;

		try {
			const payload = (await response.json()) as {
				message?: string;
				statusMessage?: string;
			};
			message = payload.statusMessage ?? payload.message ?? message;
		} catch {
			// Keep the generic status-based error when the payload is not JSON.
		}

		throw new Error(message);
	}

	return (await response.json()) as T;
}

useHead({
	title: 'Neverending Stories',
	meta: [
		{
			name: 'description',
			content:
				'An AI-generated choose-your-own-adventure app built with Nuxt 3.',
		},
	],
});

onMounted(async () => {
	if (typeof window === 'undefined') {
		return;
	}

	const storedStoryId = window.localStorage.getItem(
		'neverending-stories-story-id',
	);
	const storedTranscript = window.localStorage.getItem(
		'neverending-stories-transcript',
	);

	if (!storedStoryId) {
		return;
	}

	isRestoring.value = true;

	try {
		const restored = await apiFetch<StoryState>('/api/story/state', {
			query: { storyId: storedStoryId },
		});

		story.value = restored;
		selectedGenre.value = restored.genre;
		isStoryPanelFocused.value = true;
		transcript.value = parseTranscript(storedTranscript) ?? [
			{ kind: 'narration', text: restored.text },
		];
		await nextTick();
		scrollStoryFeedToBottom();
	} catch {
		window.localStorage.removeItem('neverending-stories-story-id');
		window.localStorage.removeItem('neverending-stories-transcript');
	} finally {
		isRestoring.value = false;
	}
});

async function beginStory(genre: string) {
	stopAudioPlayback();
	selectedGenre.value = genre;
	isStoryPanelFocused.value = true;
	isLoading.value = true;
	errorMessage.value = '';

	try {
		const response = await apiFetch<StoryState>('/api/story/start', {
			method: 'POST',
			body: { genre },
		});

		story.value = response;
		transcript.value = [{ kind: 'narration', text: response.text }];

		if (typeof window !== 'undefined') {
			window.localStorage.setItem(
				'neverending-stories-story-id',
				response.storyId,
			);
			window.localStorage.setItem(
				'neverending-stories-transcript',
				JSON.stringify(transcript.value),
			);
		}

		await nextTick();
		scrollStoryFeedToBottom();
	} catch (error) {
		errorMessage.value =
			error instanceof Error
				? error.message
				: 'Unable to start the story right now.';
		isStoryPanelFocused.value = false;
	} finally {
		isLoading.value = false;
	}
}

async function chooseOption(option: string) {
	if (!story.value) {
		return;
	}

	stopAudioPlayback();
	isLoading.value = true;
	errorMessage.value = '';
	transcript.value = [...transcript.value, { kind: 'choice', text: option }];
	await nextTick();
	scrollStoryFeedToBottom();

	try {
		const response = await apiFetch<StoryState>('/api/story/continue', {
			method: 'POST',
			body: {
				storyId: story.value.storyId,
				choice: option,
			},
		});

		story.value = response;
		transcript.value = [
			...transcript.value,
			{ kind: 'narration', text: response.text },
		];

		if (typeof window !== 'undefined') {
			window.localStorage.setItem(
				'neverending-stories-transcript',
				JSON.stringify(transcript.value),
			);
		}
	} catch (error) {
		errorMessage.value =
			error instanceof Error
				? error.message
				: 'Unable to continue the story right now.';
	} finally {
		isLoading.value = false;
	}
}

function resetStory() {
	stopAudioPlayback();
	story.value = null;
	selectedGenre.value = '';
	errorMessage.value = '';
	transcript.value = [];
	isStoryPanelFocused.value = false;

	if (typeof window !== 'undefined') {
		window.localStorage.removeItem('neverending-stories-story-id');
		window.localStorage.removeItem('neverending-stories-transcript');
	}
}

function splitParagraphs(text: string) {
	return text
		.split(/\n+/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
}

function parseTranscript(serialized: string | null) {
	if (!serialized) {
		return null;
	}

	try {
		const parsed = JSON.parse(serialized) as TranscriptEntry[];

		if (!Array.isArray(parsed)) {
			return null;
		}

		return parsed.filter(
			(entry) =>
				entry &&
				(entry.kind === 'narration' || entry.kind === 'choice') &&
				typeof entry.text === 'string',
		);
	} catch {
		return null;
	}
}

function readLatestChapterAndOptions() {
	if (typeof window === 'undefined') {
		return;
	}

	if (isReadingAloud.value) {
		stopAudioPlayback();
		return;
	}

	const narrationEntry = transcript.value[latestNarrationIndex.value];

	if (!narrationEntry || narrationEntry.kind !== 'narration') {
		return;
	}

	const chapterText = narrationEntry.text.trim();
	const options = story.value?.options ?? [];
	const speechSegments = buildSpeechSegments(chapterText, options);

	if (!speechSegments.length) {
		return;
	}

	errorMessage.value = '';
	const sessionId = ++activeReadSessionId;
	activeReadAbortController = new AbortController();
	isReadingAloud.value = true;
	isReadLoading.value = true;

	void playStoryAudioSegments(speechSegments, sessionId);
}

onBeforeUnmount(() => {
	if (typeof window === 'undefined') {
		return;
	}

	stopAudioPlayback();
});

function buildSpeechSegments(chapterText: string, options: string[]) {
	const chapterSentences = splitIntoSentences(chapterText);
	const segments = [...chapterSentences, 'What do you want to do now?'];

	if (options.length) {
		for (let index = 0; index < options.length; index += 1) {
			segments.push(`Option ${index + 1}. ${options[index]}`);
		}
	} else {
		segments.push('No options are currently available.');
	}

	return segments;
}

function splitIntoSentences(text: string) {
	const normalized = text.replace(/\s+/g, ' ').trim();

	if (!normalized) {
		return [];
	}

	return normalized
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter(Boolean);
}

async function playStoryAudioSegments(segments: string[], sessionId: number) {
	const prefetchedAudio = segments.map((segment) =>
		requestStoryAudio(segment, sessionId)
			.then((audioBlob) => ({ ok: true as const, audioBlob }))
			.catch((error: unknown) => ({ ok: false as const, error })),
	);

	for (const audioResultPromise of prefetchedAudio) {
		if (!isReadSessionActive(sessionId)) {
			return;
		}

		try {
			const audioResult = await audioResultPromise;

			if (!audioResult.ok) {
				throw audioResult.error;
			}

			if (!isReadSessionActive(sessionId)) {
				return;
			}

			await playAudioBlob(audioResult.audioBlob, sessionId);
		} catch (error) {
			if (!isReadSessionActive(sessionId)) {
				return;
			}

			stopAudioPlayback();
			errorMessage.value =
				error instanceof Error
					? error.message
					: 'Unable to read this chapter aloud.';
			return;
		}
	}

	if (isReadSessionActive(sessionId)) {
		cleanupActiveAudio();
		isReadingAloud.value = false;
		isReadLoading.value = false;
		activeReadAbortController = null;
	}
}

async function requestStoryAudio(text: string, sessionId: number) {
	const response = await fetch('/api/story/tts', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ text }),
		signal: activeReadAbortController?.signal,
	});

	if (!response.ok) {
		let message = `Unable to generate speech (status ${response.status}).`;

		try {
			const payload = (await response.json()) as { message?: string };
			message = payload.message ?? message;
		} catch {
			// Keep the status-based message.
		}

		throw new Error(message);
	}

	const audioBlob = await response.blob();

	if (!audioBlob.size) {
		throw new Error('Speech service returned empty audio.');
	}

	if (!isReadSessionActive(sessionId)) {
		throw new Error('Reading was cancelled.');
	}

	return audioBlob;
}

function playAudioBlob(audioBlob: Blob, sessionId: number) {
	cleanupActiveAudio();
	activeStoryAudioUrl = window.URL.createObjectURL(audioBlob);
	const audio = new window.Audio(activeStoryAudioUrl);
	activeStoryAudio = audio;

	return new Promise<void>((resolve, reject) => {
		audio.onended = () => {
			cleanupActiveAudio();
			resolve();
		};
		audio.onerror = () => {
			cleanupActiveAudio();
			reject(new Error('Audio playback failed.'));
		};

		void audio
			.play()
			.then(() => {
				if (isReadSessionActive(sessionId)) {
					isReadLoading.value = false;
				}

				if (!isReadSessionActive(sessionId)) {
					audio.pause();
					cleanupActiveAudio();
					resolve();
				}
			})
			.catch((error) => {
				cleanupActiveAudio();
				reject(
					error instanceof Error ? error : new Error('Audio playback failed.'),
				);
			});
	});
}

function isReadSessionActive(sessionId: number) {
	return isReadingAloud.value && sessionId === activeReadSessionId;
}

function cleanupActiveAudio() {
	if (activeStoryAudio) {
		activeStoryAudio.pause();
		activeStoryAudio.currentTime = 0;
		activeStoryAudio.onended = null;
		activeStoryAudio.onerror = null;
		activeStoryAudio = null;
	}

	if (activeStoryAudioUrl) {
		window.URL.revokeObjectURL(activeStoryAudioUrl);
		activeStoryAudioUrl = '';
	}
}

function stopAudioPlayback() {
	activeReadSessionId += 1;
	if (activeReadAbortController) {
		activeReadAbortController.abort();
		activeReadAbortController = null;
	}
	cleanupActiveAudio();
	isReadingAloud.value = false;
	isReadLoading.value = false;
}

function scrollStoryFeedToBottom() {
	const element = storyFeedRef.value;

	if (!element) {
		return;
	}

	element.scrollTop = element.scrollHeight;
}
</script>

<style scoped>
.page-shell {
	width: min(1240px, calc(100vw - 2rem));
	margin: 0 auto;
	padding: 1.5rem 0 3rem;
}

.hero-panel,
.story-grid {
	display: grid;
	gap: 1.25rem;
}

.hero-panel {
	grid-template-columns: 1fr;
	align-items: start;
	margin-bottom: 1.25rem;
}

.genre-panel,
.story-panel {
	position: relative;
	border: 1px solid rgba(255, 255, 255, 0.1);
	background: linear-gradient(
		180deg,
		rgba(255, 255, 255, 0.06),
		rgba(255, 255, 255, 0.03)
	);
	backdrop-filter: blur(18px);
	box-shadow: var(--shadow);
}

.hero-copy {
	padding: 0.5rem 0 0.25rem;
}

.hero-copy::after {
	content: none;
}

.eyebrow,
.panel-label {
	margin: 0 0 0.75rem;
	text-transform: uppercase;
	letter-spacing: 0.24em;
	font-size: 0.72rem;
	color: var(--accent-strong);
}

h1,
h2,
h3 {
	margin: 0;
	font-family: 'Crimson Pro', serif;
	font-weight: 700;
	letter-spacing: 0.01em;
}

h1 {
	font-size: clamp(1.95rem, 2.6vw, 3rem);
	line-height: 1.02;
	max-width: none;
	white-space: nowrap;
}

.lead {
	margin: 0.55rem 0 0;
	max-width: 62ch;
	color: var(--muted);
	font-size: 0.98rem;
	line-height: 1.55;
}

.story-grid {
	grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.1fr);
}

.story-grid--story-focused {
	grid-template-columns: minmax(0, 1fr);
}

.story-grid--story-focused .genre-panel {
	display: none;
}

.genre-panel,
.story-panel {
	border-radius: 28px;
	padding: 1.25rem;
}

.panel-header {
	display: flex;
	flex-wrap: wrap;
	align-items: start;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 1rem;
}

.panel-header h2 {
	font-size: 2rem;
}

.panel-header--story {
	margin-bottom: 1.1rem;
}

.genre-list {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.9rem;
}

.hint {
	margin: 1rem 0 0;
	color: var(--muted);
	line-height: 1.6;
}

.story-panel {
	min-height: 620px;
	display: flex;
	flex-direction: column;
	max-height: min(78dvh, 860px);
	overflow: hidden;
}

.story-feed {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	overflow-x: hidden;
	display: grid;
	gap: 1rem;
	padding-right: 0.3rem;
	scroll-behavior: smooth;
	overscroll-behavior: contain;
}

.ghost-button {
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: rgba(255, 255, 255, 0.06);
	color: var(--text);
	border-radius: 999px;
	padding: 0.7rem 1rem;
	cursor: pointer;
	transition:
		background 180ms ease,
		transform 180ms ease;
}

.ghost-button:hover {
	transform: translateY(-1px);
	background: rgba(255, 255, 255, 0.1);
}

.status-card,
.story-card,
.ending-card,
.empty-state {
	border-radius: 24px;
	border: 1px solid rgba(255, 255, 255, 0.08);
	background: rgba(6, 10, 20, 0.42);
}

.status-card,
.ending-card,
.empty-state {
	padding: 1.25rem;
}

.status-card {
	display: flex;
	align-items: center;
	gap: 0.85rem;
}

.status-card--error {
	color: var(--danger);
}

.spinner {
	width: 1rem;
	height: 1rem;
	border-radius: 50%;
	border: 2px solid rgba(255, 255, 255, 0.18);
	border-top-color: var(--accent);
	animation: spin 900ms linear infinite;
}

.story-card {
	padding: 1.45rem 1.35rem;
	display: grid;
	gap: 1rem;
}

.story-entry {
	display: grid;
	gap: 0.65rem;
	padding: 1rem 1rem 1.1rem;
	border-radius: 20px;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.08);
}

.story-entry--choice {
	background: rgba(243, 201, 105, 0.08);
	border-color: rgba(243, 201, 105, 0.22);
}

.story-entry__label {
	margin: 0;
	text-transform: uppercase;
	letter-spacing: 0.22em;
	font-size: 0.7rem;
	color: var(--accent-strong);
}

.story-entry__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
}

.read-button {
	border: 1px solid rgba(243, 201, 105, 0.32);
	background: rgba(243, 201, 105, 0.08);
	color: var(--accent-strong);
	border-radius: 999px;
	padding: 0.32rem 0.7rem;
	min-width: 8.5rem;
	position: relative;
	display: inline-grid;
	place-items: center;
	font-size: 0.72rem;
	letter-spacing: 0.03em;
	cursor: pointer;
	transition:
		background 180ms ease,
		border-color 180ms ease,
		transform 180ms ease;
}

.read-button:hover {
	background: rgba(243, 201, 105, 0.16);
	border-color: rgba(243, 201, 105, 0.48);
	transform: translateY(-1px);
}

.read-button__spinner {
	position: absolute;
	left: 0.7rem;
	width: 0.72rem;
	height: 0.72rem;
	border-radius: 50%;
	border: 2px solid rgba(243, 201, 105, 0.2);
	border-top-color: var(--accent-strong);
	animation: spin 900ms linear infinite;
	opacity: 0;
}

.read-button__spinner--visible {
	opacity: 1;
}

.read-button__label {
	text-align: center;
}

.story-entry__text {
	display: grid;
	gap: 0.9rem;
}

.story-text {
	margin: 0;
	color: var(--text);
	line-height: 1.8;
	font-size: 1.03rem;
}

.story-text + .story-text {
	margin-top: 1rem;
}

.story-status-inline {
	margin-top: 0.25rem;
}

.ending-card {
	margin-bottom: 0;
	border-color: rgba(110, 231, 183, 0.2);
}

.ending-card strong {
	display: block;
	margin-bottom: 0.35rem;
	color: var(--success);
}

.ending-card p,
.empty-state p {
	margin: 0;
	color: var(--muted);
	line-height: 1.7;
}

.options-stack {
	display: grid;
	gap: 0.8rem;
}

.empty-state h3 {
	margin-bottom: 0.35rem;
	font-size: 1.6rem;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

@media (max-width: 980px) {
	.hero-panel,
	.story-grid {
		grid-template-columns: 1fr;
	}

	.hero-copy,
	.genre-panel,
	.story-panel {
		border-radius: 24px;
	}

	.genre-list {
		grid-template-columns: 1fr;
	}
}

@media (max-width: 640px) {
	.page-shell {
		width: min(100vw - 1rem, 1240px);
		padding-top: 0.75rem;
	}

	.hero-copy,
	.genre-panel,
	.story-panel {
		padding: 1rem;
	}

	h1 {
		font-size: clamp(1.8rem, 8.5vw, 2.4rem);
		white-space: normal;
	}

	.panel-header h2 {
		font-size: 1.6rem;
	}
}
</style>

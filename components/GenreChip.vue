<template>
	<button
		class="genre-chip"
		:class="{ active: isActive }"
		type="button"
		@click="$emit('select')"
	>
		<span class="genre-chip__label">{{ label }}</span>
		<span class="genre-chip__description">{{ description }}</span>
	</button>
</template>

<script setup lang="ts">
defineProps<{
	label: string;
	description: string;
	isActive?: boolean;
}>();

defineEmits<{
	select: [];
}>();
</script>

<style scoped>
.genre-chip {
	border: 1px solid var(--line);
	background: linear-gradient(
		180deg,
		rgba(255, 255, 255, 0.06),
		rgba(255, 255, 255, 0.02)
	);
	border-radius: 20px;
	padding: 1rem 1.05rem;
	text-align: left;
	color: var(--text);
	display: grid;
	gap: 0.35rem;
	min-height: 110px;
	cursor: pointer;
	transition:
		transform 180ms ease,
		border-color 180ms ease,
		background 180ms ease;
}

.genre-chip:hover,
.genre-chip.active {
	transform: translateY(-2px);
	border-color: rgba(243, 201, 105, 0.5);
	background: linear-gradient(
		180deg,
		rgba(243, 201, 105, 0.15),
		rgba(255, 255, 255, 0.03)
	);
}

.genre-chip__label {
	font-family: 'Crimson Pro', serif;
	font-size: 1.35rem;
	font-weight: 700;
	letter-spacing: 0.01em;
}

.genre-chip__description {
	color: var(--muted);
	line-height: 1.5;
}
</style>

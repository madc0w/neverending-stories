<template>
	<button class="story-option" type="button" @click="$emit('pick')">
		<span class="story-option__index">{{ index + 1 }}</span>
		<span class="story-option__text">{{ text }}</span>
	</button>
</template>

<script setup lang="ts">
defineProps<{
	index: number;
	text: string;
}>();

defineEmits<{
	pick: [];
}>();
</script>

<style scoped>
.story-option {
	display: grid;
	grid-template-columns: 42px 1fr;
	gap: 0.9rem;
	align-items: center;
	width: 100%;
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: rgba(255, 255, 255, 0.05);
	color: var(--text);
	padding: 1rem 1rem;
	border-radius: 18px;
	cursor: pointer;
	transition:
		transform 180ms ease,
		border-color 180ms ease,
		background 180ms ease;
	text-align: left;
}

.story-option:hover {
	transform: translateY(-2px);
	border-color: rgba(243, 201, 105, 0.45);
	background: rgba(243, 201, 105, 0.1);
}

.story-option__index {
	display: inline-grid;
	place-items: center;
	width: 42px;
	height: 42px;
	border-radius: 50%;
	background: rgba(243, 201, 105, 0.16);
	color: var(--accent-strong);
	font-weight: 700;
}

.story-option__text {
	line-height: 1.45;
}
</style>

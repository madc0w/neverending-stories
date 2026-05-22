export default defineNuxtConfig({
	devtools: { enabled: true },
	compatibilityDate: '2026-05-22',
	css: ['~/assets/app.css'],
	app: {
		head: {
			title: 'Neverending Stories',
			meta: [
				{
					name: 'description',
					content: 'An AI-generated choose-your-own-adventure app.',
				},
				{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			],
		},
	},
	runtimeConfig: {
		mongoUrl: process.env.MONGODB_URI ?? '',
		mongoDbName: process.env.MONGODB_DB ?? 'neverending-stories',
		openaiApiKey: process.env.OPENAI_API_KEY ?? '',
		openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
		public: {},
	},
});

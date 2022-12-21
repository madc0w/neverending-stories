const defaultName1 = 'Timmy';
const defaultName2 = 'Sasha';
const defaultStoryAbout = 'having an adventure';

let isGenerating, name1Input, name2Input, storyAboutInput;

function onLoad() {
	name1Input = document.getElementById('name1-input');
	name2Input = document.getElementById('name2-input');
	storyAboutInput = document.getElementById('story-about-input');
	name1Input.value = defaultName1;
	name2Input.value = defaultName2;
	storyAboutInput.value = defaultStoryAbout;

	if (!window.speechSynthesis) {
		alert('No speech synthesis for you! That sucks.');
	}
}

async function generate() {
	if (!isGenerating) {
		isGenerating = true;

		// const apiKey = document.getElementById('api-key-input').value;
		const apiKey = getApiKey();
		const name1 = name1Input.value || defaultName1;
		if (!name1Input.value) {
			name1Input.value = name1;
		}
		const name2 = name2Input.value || defaultName2;
		if (!name2Input.value) {
			name2Input.value = name2;
		}
		const storyAbout = storyAboutInput.value || defaultStoryAbout;
		if (!storyAboutInput.value) {
			storyAboutInput.value = storyAbout;
		}
		const prompt = `generate a childen's story about ${name1} and ${name2} ${storyAbout}`;
		document.getElementById('story-gen-button').classList.add('hidden');
		document.getElementById('story-gen-spinner').classList.remove('hidden');
		const response = await fetch(
			'https://api.openai.com/v1/engines/text-davinci-003/completions',
			{
				method: 'POST',
				headers: {
					// 'Content-Type': 'application/json;charset=utf-8',
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					prompt,
					max_tokens: 1400,
					temperature: 0.87,
					top_p: 1,
					frequency_penalty: 0.4,
					presence_penalty: 0.38,
				}),
			}
		);
		const result = await response.json();
		document.getElementById('story-gen-button').classList.remove('hidden');
		document.getElementById('story-gen-spinner').classList.add('hidden');
		if (result.choices?.length > 0) {
			const text = result.choices[0].text;
			console.log(text);
			const html = text.replaceAll(/\n/g, '<br/>');
			document.getElementById('output-container').innerHTML = html;

			const msg = new SpeechSynthesisUtterance(text);
			setRandomVoice(msg);
			speechSynthesis.speak(msg);
		} else {
			console.error('failed to get response text. result=', result);
			alert("Well that did't work. Check console for details.");
		}
		isGenerating = false;
	}
}

function setRandomVoice(msg) {
	const voices = [];
	// new SpeechSynthesisUtterance();
	speechSynthesis.getVoices().forEach((voice) => {
		if (
			voice.lang.startsWith('en')
			// voice.lang.startsWith('fr') ||
			// voice.lang.startsWith('zh') ||
			// voice.lang.startsWith('ja')
		) {
			//			console.log("voice", voice);
			voices.push(voice);
		}
	});
	const voice = voices[Math.floor(Math.random() * voices.length)];
	msg.pitch = 1 + (Math.random() - 0.5) * 0.8;
	msg.voice = voice;
}

function getApiKey() {
	return 'sk-i02BDid56C2BZL0zjC' + 'WYT3BlbkFJAbhk5Xyh5azd9pEF7xWQ';
}

# TextToSpeechIntegration

Simple Node.js app for Azure AI Speech text-to-speech. It lets you enter text, choose a voice, adjust rate/pitch/volume/style, generate speech, save it as an MP3, and listen to the result in the browser.

## Features

- Browser UI for text input and speech parameters
- Azure AI Speech synthesis through the official JavaScript Speech SDK
- Saves generated audio files in `outputs/`
- Plays generated MP3 files in the browser
- Voice selection from Azure by locale, including an “All Azure voices” browser
- Shows the SSML sent to Azure for easier debugging

## Prerequisites

- Node.js 20 or newer
- An Azure AI Speech resource
- The resource key and region, for example `swedencentral`, `westeurope`, or `eastus`

## Setup on Windows

```powershell
npm install
Copy-Item .env.example .env
notepad .env
npm start
```

Open:

```text
http://localhost:3000
```

Your `.env` file should look like this:

```env
AZURE_SPEECH_KEY=replace-with-your-key
AZURE_SPEECH_REGION=replace-with-your-resource-region
PORT=3000
```

Do not commit `.env`; it is ignored by `.gitignore`.

## How to use

1. Enter text in the text area.
2. Pick a locale. The app automatically loads matching Azure voices, and you can also click **Load voices**. Select **All Azure voices** to browse every available voice.
3. Choose the exact voice, then adjust rate, pitch, volume, voice-specific speaking style, and MP3 quality.
4. Click **Generate MP3**.
5. Listen in the browser or download the saved MP3.

Generated files are saved under:

```text
outputs/
```

## Notes

- Speaking styles are loaded from the selected Azure voice when available. If Azure rejects a style, set **Speaking style** to **None**.
- The demo limits text input to 5,000 characters to avoid accidentally sending very large requests.
- The app stores files locally. For deployment, replace local storage with blob storage or another persistent file store.

## Useful scripts

```powershell
npm start
npm run dev
```

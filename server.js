const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

require('dotenv').config();

const express = require('express');
const sdk = require('microsoft-cognitiveservices-speech-sdk');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const PUBLIC_DIR = path.join(__dirname, 'public');

const AUDIO_FORMATS = {
  mp3_24khz_160kbps: {
    sdkName: 'Audio24Khz160KBitRateMonoMp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    label: 'MP3 - 24 kHz, 160 kbps, mono'
  },
  mp3_48khz_192kbps: {
    sdkName: 'Audio48Khz192KBitRateMonoMp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    label: 'MP3 - 48 kHz, 192 kbps, mono'
  },
  mp3_24khz_96kbps: {
    sdkName: 'Audio24Khz96KBitRateMonoMp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    label: 'MP3 - 24 kHz, 96 kbps, mono'
  },
  mp3_16khz_128kbps: {
    sdkName: 'Audio16Khz128KBitRateMonoMp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    label: 'MP3 - 16 kHz, 128 kbps, mono'
  }
};

app.use(express.json({ limit: '250kb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/outputs', express.static(OUTPUT_DIR, {
  setHeaders: (res) => {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
  }
}));

function getAzureConfig() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    throw new Error('Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION. Copy .env.example to .env and fill in your Azure Speech resource values.');
  }

  return { key, region };
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function percentString(value) {
  const number = clampNumber(value, 0, -100, 100);
  return number > 0 ? `+${number}%` : `${number}%`;
}

function buildSsml({ text, voice, locale, rate, pitch, volume, style }) {
  const safeLocale = /^[a-z]{2}-[A-Z]{2}$/.test(locale) ? locale : 'en-US';
  const safeVoice = voice && voice.trim() ? voice.trim() : 'en-US-JennyNeural';
  const safeVolume = ['default', 'x-soft', 'soft', 'medium', 'loud', 'x-loud'].includes(volume) ? volume : 'default';
  const safeStyle = style && style.trim() ? style.trim() : '';

  const prosody = `\n        <prosody rate="${percentString(rate)}" pitch="${percentString(pitch)}" volume="${escapeXml(safeVolume)}">${escapeXml(text)}</prosody>`;

  const styledContent = safeStyle
    ? `\n      <mstts:express-as style="${escapeXml(safeStyle)}">${prosody}\n      </mstts:express-as>`
    : prosody;

  return `<speak version="1.0" xml:lang="${escapeXml(safeLocale)}" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts">\n  <voice name="${escapeXml(safeVoice)}">${styledContent}\n  </voice>\n</speak>`;
}

function createSpeechConfig(formatKey, voice) {
  const { key, region } = getAzureConfig();
  const format = AUDIO_FORMATS[formatKey] || AUDIO_FORMATS.mp3_24khz_160kbps;
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat[format.sdkName];

  if (voice && voice.trim()) {
    speechConfig.speechSynthesisVoiceName = voice.trim();
  }

  return { speechConfig, format };
}

function closeSynthesizer(synthesizer) {
  return new Promise((resolve) => {
    // Do not reject from cleanup; preserve the original synthesis result/error.
    synthesizer.close(resolve, resolve);
  });
}

function speakSsmlToFile(speechConfig, ssml, outputPath) {
  return new Promise((resolve, reject) => {
    const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outputPath);
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    synthesizer.speakSsmlAsync(
      ssml,
      async (result) => {
        await closeSynthesizer(synthesizer);

        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve(result);
          return;
        }

        const cancellation = sdk.CancellationDetails.fromResult(result);
        reject(new Error(
          cancellation.errorDetails ||
          result.errorDetails ||
          'Speech synthesis did not complete.'
        ));
      },
      async (error) => {
        await closeSynthesizer(synthesizer);
        reject(new Error(typeof error === 'string' ? error : JSON.stringify(error)));
      }
    );
  });
}

app.get('/api/config', (_req, res) => {
  res.json({
    formats: Object.entries(AUDIO_FORMATS).map(([key, value]) => ({
      key,
      label: value.label
    })),
    defaultVoice: 'en-US-JennyNeural',
    defaultLocale: 'en-US'
  });
});

app.get('/api/voices', async (req, res) => {
  try {
    const locale = String(req.query.locale || '').trim() || undefined;
    const { speechConfig } = createSpeechConfig('mp3_24khz_160kbps');
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
    const result = await synthesizer.getVoicesAsync(locale);
    synthesizer.close();

    res.json({
      voices: result.voices.map((voice) => ({
        name: voice.name,
        shortName: voice.shortName,
        displayName: voice.displayName,
        localName: voice.localName,
        locale: voice.locale,
        gender: String(voice.gender),
        styles: voice.styleList || []
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/files', async (_req, res) => {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const entries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true });
    const files = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))
      .map(async (entry) => {
        const fullPath = path.join(OUTPUT_DIR, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          url: `/outputs/${encodeURIComponent(entry.name)}`,
          sizeBytes: stats.size,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString()
        };
      }));

    files.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/synthesize', async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) {
      res.status(400).json({ error: 'Text is required.' });
      return;
    }

    if (text.length > 5000) {
      res.status(400).json({ error: 'Text is too long for this demo. Keep it under 5,000 characters.' });
      return;
    }

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const voice = String(req.body.voice || 'en-US-JennyNeural').trim();
    const locale = String(req.body.locale || 'en-US').trim();
    const formatKey = String(req.body.format || 'mp3_24khz_160kbps');
    const rate = clampNumber(req.body.rate, 0, -50, 50);
    const pitch = clampNumber(req.body.pitch, 0, -50, 50);
    const volume = String(req.body.volume || 'default');
    const style = String(req.body.style || '').trim();

    const { speechConfig, format } = createSpeechConfig(formatKey, voice);
    const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.${format.extension}`;
    const outputPath = path.join(OUTPUT_DIR, fileName);
    const ssml = buildSsml({ text, voice, locale, rate, pitch, volume, style });

    await speakSsmlToFile(speechConfig, ssml, outputPath);

    res.json({
      fileName,
      url: `/outputs/${encodeURIComponent(fileName)}`,
      mimeType: format.mimeType,
      ssml
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`Azure Text To Speech app listening at http://localhost:${PORT}`);
});

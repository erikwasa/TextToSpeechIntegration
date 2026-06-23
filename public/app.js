const text = document.querySelector('#text');
const charCount = document.querySelector('#charCount');
const locale = document.querySelector('#locale');
const voice = document.querySelector('#voice');
const voiceInfo = document.querySelector('#voiceInfo');
const style = document.querySelector('#style');
const rate = document.querySelector('#rate');
const pitch = document.querySelector('#pitch');
const volume = document.querySelector('#volume');
const format = document.querySelector('#format');
const generate = document.querySelector('#generate');
const loadVoices = document.querySelector('#loadVoices');
const refreshFiles = document.querySelector('#refreshFiles');
const status = document.querySelector('#status');
const resultCard = document.querySelector('#resultCard');
const audio = document.querySelector('#audio');
const download = document.querySelector('#download');
const ssml = document.querySelector('#ssml');
const fileList = document.querySelector('#fileList');
const rateValue = document.querySelector('#rateValue');
const pitchValue = document.querySelector('#pitchValue');

let loadedVoices = [];

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function updateCounters() {
  charCount.textContent = text.value.length;
  rateValue.textContent = `${rate.value}%`;
  pitchValue.textContent = `${pitch.value}%`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }

  return data;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function getSelectedVoice() {
  return loadedVoices.find((item) => (item.shortName || item.name) === voice.value);
}

function resetStyleOptions(styles = []) {
  const selectedStyle = style.value;
  style.innerHTML = '<option value="">None</option>';

  for (const voiceStyle of styles) {
    const option = document.createElement('option');
    option.value = voiceStyle;
    option.textContent = voiceStyle;
    style.appendChild(option);
  }

  const previous = [...style.options].find((option) => option.value === selectedStyle);
  if (previous) {
    previous.selected = true;
  }
}

function updateVoiceDetails() {
  const selectedVoice = getSelectedVoice();

  if (!selectedVoice) {
    voiceInfo.textContent = 'Load voices to see gender, locale, and available speaking styles.';
    resetStyleOptions([]);
    return;
  }

  const displayName = selectedVoice.displayName || selectedVoice.localName || selectedVoice.shortName || selectedVoice.name;
  const shortName = selectedVoice.shortName || selectedVoice.name;
  const styles = selectedVoice.styles || [];
  const gender = selectedVoice.gender && selectedVoice.gender !== '0' ? selectedVoice.gender : 'unspecified gender';
  voiceInfo.textContent = `${displayName} · ${shortName} · ${selectedVoice.locale} · ${gender} · ${styles.length} style${styles.length === 1 ? '' : 's'}`;
  resetStyleOptions(styles);
}

function sortVoices(voices) {
  return [...voices].sort((a, b) => {
    const localeCompare = String(a.locale || '').localeCompare(String(b.locale || ''));
    if (localeCompare !== 0) return localeCompare;

    return String(a.displayName || a.localName || a.shortName || a.name)
      .localeCompare(String(b.displayName || b.localName || b.shortName || b.name));
  });
}

async function loadAvailableVoices() {
  const previousVoice = voice.value;
  loadVoices.disabled = true;
  setStatus('Loading voices from Azure...');

  try {
    const selectedLocale = locale.value === 'all' ? '' : locale.value;
    const data = await fetchJson(`/api/voices?locale=${encodeURIComponent(selectedLocale)}`);
    loadedVoices = sortVoices(data.voices || []);
    voice.innerHTML = '';

    for (const item of loadedVoices) {
      const option = document.createElement('option');
      const shortName = item.shortName || item.name;
      const displayName = item.displayName || item.localName || shortName;
      option.value = shortName;
      option.textContent = `${displayName} (${shortName})`;
      voice.appendChild(option);
    }

    const matchingOption = [...voice.options].find((option) => option.value === previousVoice);
    if (matchingOption) {
      matchingOption.selected = true;
    } else if (voice.options.length > 0) {
      voice.options[0].selected = true;
    }

    updateVoiceDetails();
    setStatus(`Loaded ${loadedVoices.length} voice${loadedVoices.length === 1 ? '' : 's'}.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    loadVoices.disabled = false;
  }
}

async function synthesize() {
  generate.disabled = true;
  setStatus('Generating MP3...');

  try {
    const data = await fetchJson('/api/synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text.value,
        locale: locale.value === 'all' ? getSelectedVoice()?.locale || 'en-US' : locale.value,
        voice: voice.value,
        style: style.value,
        rate: Number(rate.value),
        pitch: Number(pitch.value),
        volume: volume.value,
        format: format.value
      })
    });

    const urlWithCacheBust = `${data.url}?t=${Date.now()}`;
    audio.src = urlWithCacheBust;
    download.href = data.url;
    download.download = data.fileName;
    ssml.textContent = data.ssml;
    resultCard.hidden = false;
    await audio.play().catch(() => undefined);
    setStatus(`Saved ${data.fileName}`);
    await loadSavedFiles();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    generate.disabled = false;
  }
}

async function loadSavedFiles() {
  try {
    const data = await fetchJson('/api/files');
    fileList.innerHTML = '';

    if (!data.files.length) {
      fileList.innerHTML = '<p class="hint">No generated MP3 files yet.</p>';
      return;
    }

    for (const file of data.files) {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = `
        <div>
          <a href="${file.url}" download>${file.name}</a>
          <div class="file-meta">${formatBytes(file.sizeBytes)} · ${new Date(file.updatedAt).toLocaleString()}</div>
        </div>
        <audio controls src="${file.url}"></audio>
      `;
      fileList.appendChild(item);
    }
  } catch (error) {
    fileList.innerHTML = `<p class="hint">${error.message}</p>`;
  }
}

text.addEventListener('input', updateCounters);
rate.addEventListener('input', updateCounters);
pitch.addEventListener('input', updateCounters);
locale.addEventListener('change', loadAvailableVoices);
voice.addEventListener('change', updateVoiceDetails);
loadVoices.addEventListener('click', loadAvailableVoices);
generate.addEventListener('click', synthesize);
refreshFiles.addEventListener('click', loadSavedFiles);

updateCounters();
loadSavedFiles();
loadAvailableVoices().catch(() => undefined);

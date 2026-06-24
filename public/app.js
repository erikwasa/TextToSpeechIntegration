const addToQueue = document.querySelector('#addToQueue');
const addSplitToQueue = document.querySelector('#addSplitToQueue');
const clearQueue = document.querySelector('#clearQueue');
const startQueue = document.querySelector('#startQueue');
const queueList = document.querySelector('#queueList');

let queue = [];
let isProcessingQueue = false;
const text = document.querySelector('#text');
const filename = document.querySelector('#filename');
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
    const data = await synthesizePayload(getSynthesisPayload());

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

async function synthesizePayload(payload) {
  return fetchJson('/api/synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

function getSynthesisPayload(entryText = text.value, requestedFileName = filename.value) {
  const payload = {
    text: entryText,
    locale: locale.value === 'all' ? getSelectedVoice()?.locale || 'en-US' : locale.value,
    voice: voice.value,
    style: style.value,
    rate: Number(rate.value),
    pitch: Number(pitch.value),
    volume: volume.value,
    format: format.value
  };

  const cleanRequestedFileName = String(requestedFileName || '').trim();
  if (cleanRequestedFileName) {
    payload.fileName = cleanRequestedFileName;
  }

  return payload;
}

function stripMp3Extension(value) {
  return String(value || '').trim().replace(/\.mp3$/i, '');
}

function getNumberedQueueFileName(baseFileName, index, total) {
  const cleanBaseFileName = stripMp3Extension(baseFileName);
  if (!cleanBaseFileName) return '';

  const width = Math.max(2, String(total).length);
  return `${cleanBaseFileName}-${String(index + 1).padStart(width, '0')}`;
}

function createDownloadLink(url, fileName) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.textContent = fileName;
  return link;
}

function renderQueue() {
  queueList.innerHTML = '';

  if (!queue.length) {
    queueList.innerHTML = '<p class="hint">No entries queued.</p>';
    return;
  }

  queue.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = `queue-item queue-item-${item.status}`;

    const preview = item.text.length > 120
      ? `${item.text.slice(0, 120)}...`
      : item.text;

    row.innerHTML = `
      <div>
        <strong>${index + 1}. ${item.status}</strong>
        <div class="queue-requested-file"></div>
        <div class="queue-preview"></div>
        <div class="queue-result"></div>
        <div class="queue-error"></div>
      </div>
      <button type="button" class="secondary" data-remove="${item.id}" ${isProcessingQueue ? 'disabled' : ''}>Remove</button>
    `;

    const requestedFileName = row.querySelector('.queue-requested-file');
    if (item.requestedFileName) {
      requestedFileName.textContent = `Requested filename: ${item.requestedFileName}`;
    } else {
      requestedFileName.remove();
    }

    row.querySelector('.queue-preview').textContent = preview;

    const result = row.querySelector('.queue-result');
    if (item.fileName) {
      result.appendChild(createDownloadLink(item.url, item.fileName));
    }

    const error = row.querySelector('.queue-error');
    if (item.error) {
      error.textContent = item.error;
    } else {
      error.remove();
    }

    queueList.appendChild(row);
  });

  queueList.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      queue = queue.filter((item) => item.id !== button.dataset.remove);
      renderQueue();
    });
  });
}

function addEntryToQueue(entryText, requestedFileName = '') {
  const value = String(entryText || '').trim();

  if (!value) {
    setStatus('Text is required.', true);
    return;
  }

  if (value.length > 5000) {
    setStatus('Each queued entry must be under 5,000 characters.', true);
    return;
  }

  queue.push({
    id: crypto.randomUUID(),
    text: value,
    requestedFileName: String(requestedFileName || '').trim(),
    status: 'queued',
    fileName: '',
    url: '',
    error: ''
  });

  renderQueue();
  setStatus(`Queued ${queue.length} entr${queue.length === 1 ? 'y' : 'ies'}.`);
}

function addCurrentTextToQueue() {
  addEntryToQueue(text.value, filename.value);
}

function addParagraphsToQueue() {
  const entries = text.value
    .split(/\n\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!entries.length) {
    setStatus('No paragraphs found to queue.', true);
    return;
  }

  const baseFileName = filename.value;
  entries.forEach((entry, index) => {
    addEntryToQueue(entry, getNumberedQueueFileName(baseFileName, index, entries.length));
  });

  setStatus(`Queued ${entries.length} paragraph${entries.length === 1 ? '' : 's'}.`);
}

async function processQueue() {
  if (isProcessingQueue || !queue.length) return;

  isProcessingQueue = true;
  startQueue.disabled = true;
  addToQueue.disabled = true;
  addSplitToQueue.disabled = true;
  clearQueue.disabled = true;

  try {
    for (const item of queue) {
      if (item.status === 'done') continue;

      item.status = 'generating';
      item.error = '';
      renderQueue();
      setStatus(`Generating queued file ${queue.indexOf(item) + 1} of ${queue.length}...`);

      try {
        const data = await synthesizePayload(getSynthesisPayload(item.text, item.requestedFileName));

        item.status = 'done';
        item.fileName = data.fileName;
        item.url = data.url;

        audio.src = `${data.url}?t=${Date.now()}`;
        download.href = data.url;
        download.download = data.fileName;
        ssml.textContent = data.ssml;
        resultCard.hidden = false;
      } catch (error) {
        item.status = 'failed';
        item.error = error.message;
      }

      renderQueue();
      await loadSavedFiles();
    }

    setStatus('Queue finished.');
  } finally {
    isProcessingQueue = false;
    startQueue.disabled = false;
    addToQueue.disabled = false;
    addSplitToQueue.disabled = false;
    clearQueue.disabled = false;
    renderQueue();
  }
}

function clearQueuedEntries() {
  if (isProcessingQueue) return;
  queue = [];
  renderQueue();
  setStatus('Queue cleared.');
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

      const fileDetails = document.createElement('div');
      const link = createDownloadLink(file.url, file.name);
      link.className = 'file-download';
      const meta = document.createElement('div');
      meta.className = 'file-meta';
      meta.textContent = `${formatBytes(file.sizeBytes)} · ${new Date(file.updatedAt).toLocaleString()}`;
      fileDetails.append(link, meta);

      const player = document.createElement('audio');
      player.controls = true;
      player.src = file.url;

      item.append(fileDetails, player);
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
addToQueue.addEventListener('click', addCurrentTextToQueue);
addSplitToQueue.addEventListener('click', addParagraphsToQueue);
clearQueue.addEventListener('click', clearQueuedEntries);
startQueue.addEventListener('click', processQueue);

updateCounters();
loadSavedFiles();
renderQueue();
loadAvailableVoices().catch(() => undefined);

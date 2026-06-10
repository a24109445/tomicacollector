const DB_NAME = 'TomicaCollectorWeb';
const DB_VERSION = 1;
const STORE_NAME = 'tomicas';

const seriesOptions = [
  '一般紅盒',
  'Dream Tomica',
  '會場車',
  '舊藍標',
  '舊紅標',
  '日制舊紅標',
  'TLV',
  'Tomica Premium',
  'Boxset',
  'Tomica Shop',
  '聯名限定',
  '其他',
];

const ownedCountOptions = ['1', '2', '3', '4', '5'];

const state = {
  screen: 'list',
  items: [],
  query: '',
  editingId: null,
  barcodeFromScan: '',
  draft: null,
  scanStatus: 'idle',
  scannedBarcode: '',
  scanResult: null,
  stream: null,
  detector: null,
  scanTimer: null,
};

const app = document.querySelector('#app');

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('barcode', 'barcode', { unique: true });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = callback(store);

    tx.oncomplete = () => {
      db.close();
      resolve(result?.result ?? result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getAllTomicas() {
  const rows = await withStore('readonly', (store) => store.getAll());
  return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || b.id - a.id);
}

async function getTomicaById(id) {
  return withStore('readonly', (store) => store.get(Number(id)));
}

async function getTomicaByBarcode(barcode) {
  return withStore('readonly', (store) => store.index('barcode').get(String(barcode).trim()));
}

async function saveTomica(draft, id = null) {
  const now = new Date().toISOString();
  const row = {
    id: id ? Number(id) : undefined,
    barcode: draft.barcode.trim(),
    number: draft.number.trim(),
    name: draft.name.trim(),
    series: draft.series.trim(),
    year: draft.year.trim(),
    ownedCount: Number(draft.ownedCount) || 1,
    hasSticker: draft.hasSticker ? 1 : 0,
    photoDataUrl: draft.photoDataUrl || '',
    note: draft.note.trim(),
    createdAt: draft.createdAt || now,
    updatedAt: now,
  };

  await withStore('readwrite', (store) => store.put(row));
}

async function putTomica(row) {
  await withStore('readwrite', (store) => store.put(row));
}

async function deleteTomica(id) {
  await withStore('readwrite', (store) => store.delete(Number(id)));
}

function emptyDraft(barcode = '') {
  return {
    barcode,
    number: '',
    name: '',
    series: '',
    year: '',
    ownedCount: 1,
    hasSticker: 0,
    photoDataUrl: '',
    note: '',
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeTomica(raw, fallback = {}) {
  const now = new Date().toISOString();
  return {
    ...fallback,
    barcode: String(raw.barcode ?? fallback.barcode ?? '').trim(),
    number: String(raw.number ?? fallback.number ?? '').trim(),
    name: String(raw.name ?? fallback.name ?? '').trim(),
    series: String(raw.series ?? fallback.series ?? '').trim(),
    year: String(raw.year ?? fallback.year ?? '').trim(),
    ownedCount: Math.min(5, Math.max(1, Number(raw.ownedCount ?? fallback.ownedCount) || 1)),
    hasSticker: raw.hasSticker ? 1 : 0,
    photoDataUrl: String(raw.photoDataUrl ?? fallback.photoDataUrl ?? ''),
    note: String(raw.note ?? fallback.note ?? '').trim(),
    createdAt: String(fallback.createdAt ?? raw.createdAt ?? now),
    updatedAt: String(raw.updatedAt ?? now),
  };
}

async function exportBackup() {
  const items = await getAllTomicas();
  const backup = {
    app: 'TomicaCollector',
    format: 'tomicacollector-web-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: items.length,
    items,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tomicacollector-backup-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const incomingItems = Array.isArray(data) ? data : data.items;

  if (!Array.isArray(incomingItems)) {
    throw new Error('備份檔格式不正確。');
  }

  const existingItems = await getAllTomicas();
  const existingByBarcode = new Map(existingItems.map((item) => [item.barcode, item]));
  let importedCount = 0;
  let skippedCount = 0;

  for (const incoming of incomingItems) {
    const barcode = String(incoming.barcode ?? '').trim();
    if (!barcode) {
      skippedCount += 1;
      continue;
    }

    const existing = existingByBarcode.get(barcode);
    const normalized = normalizeTomica(incoming, existing);
    if (!normalized.number || !normalized.name) {
      skippedCount += 1;
      continue;
    }

    if (existing?.id) {
      normalized.id = existing.id;
    }

    await putTomica(normalized);
    importedCount += 1;
  }

  return { importedCount, skippedCount };
}

function stopCamera() {
  if (state.scanTimer) {
    cancelAnimationFrame(state.scanTimer);
    state.scanTimer = null;
  }

  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
}

async function refreshList() {
  const all = await getAllTomicas();
  const keyword = state.query.trim().toLowerCase();
  state.items = keyword
    ? all.filter((item) =>
        [item.name, item.number, item.barcode, item.series].some((value) =>
          String(value ?? '').toLowerCase().includes(keyword)
        )
      )
    : all;
}

async function navigate(screen, options = {}) {
  stopCamera();
  state.screen = screen;
  state.editingId = options.id ?? null;
  state.barcodeFromScan = options.barcode ?? '';
  state.scanStatus = 'idle';
  state.scannedBarcode = '';
  state.scanResult = null;

  if (screen === 'list') {
    await refreshList();
  }

  if (screen === 'form') {
    state.draft = options.id ? await getTomicaById(options.id) : emptyDraft(options.barcode);
  }

  render();
}

function render() {
  if (state.screen === 'list') renderList();
  if (state.screen === 'form') renderForm();
  if (state.screen === 'scanner') renderScanner();
  if (state.screen === 'photo') renderPhotoCamera();
}

function renderHeader(title, subtitle) {
  return `
    <header class="header">
      <h1 class="title">${title}</h1>
      <p class="subtitle">${subtitle}</p>
    </header>
  `;
}

function renderList() {
  app.innerHTML = `
    <main class="app">
      ${renderHeader('TomicaCollector', '網頁版，本機 IndexedDB 收藏管理')}
      <div class="toolbar">
        <button class="button primary" data-action="add">新增收藏</button>
        <button class="button" data-action="scan">掃描條碼</button>
      </div>
      <div class="toolbar">
        <button class="button" data-action="export">匯出備份</button>
        <button class="button" data-action="import">匯入備份</button>
      </div>
      <input class="hidden" id="backup-file" type="file" accept="application/json,.json" />
      <input class="search" id="search" value="${escapeHtml(state.query)}" placeholder="搜尋車名、編號、條碼、系列" />
      <section class="${state.items.length ? 'list' : 'empty'}">
        ${
          state.items.length
            ? state.items.map(renderCard).join('')
            : '<p>目前沒有收藏，先新增或掃描一台 Tomica。</p>'
        }
      </section>
    </main>
  `;

  app.querySelector('[data-action="add"]').addEventListener('click', () => navigate('form'));
  app.querySelector('[data-action="scan"]').addEventListener('click', () => navigate('scanner'));
  app.querySelector('[data-action="export"]').addEventListener('click', exportBackup);
  app.querySelector('[data-action="import"]').addEventListener('click', () => {
    app.querySelector('#backup-file').click();
  });
  app.querySelector('#backup-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await importBackup(file);
      alert(`匯入完成：${result.importedCount} 筆，略過 ${result.skippedCount} 筆。`);
      event.target.value = '';
      await navigate('list');
    } catch (error) {
      alert(error instanceof Error ? error.message : '匯入失敗，請確認 JSON 備份檔。');
      event.target.value = '';
    }
  });
  app.querySelector('#search').addEventListener('input', async (event) => {
    state.query = event.target.value;
    await refreshList();
    renderList();
  });
  app.querySelectorAll('[data-edit]').forEach((button) =>
    button.addEventListener('click', () => navigate('form', { id: button.dataset.edit }))
  );
  app.querySelectorAll('[data-delete]').forEach((button) =>
    button.addEventListener('click', async () => {
      const item = await getTomicaById(button.dataset.delete);
      if (confirm(`確定刪除「${item.name}」？`)) {
        await deleteTomica(button.dataset.delete);
        await navigate('list');
      }
    })
  );
}

function renderCard(item) {
  return `
    <article class="card">
      ${item.photoDataUrl ? `<img class="card-photo" src="${item.photoDataUrl}" alt="${escapeHtml(item.name)}" />` : ''}
      <h2 class="card-title">${escapeHtml(item.number)} ${escapeHtml(item.name)}</h2>
      <p class="meta">條碼：${escapeHtml(item.barcode)}</p>
      <p class="meta">系列：${escapeHtml(item.series || '未填')} / 年份：${escapeHtml(item.year || '未填')}</p>
      <p class="meta">車貼：${item.hasSticker ? '有' : '無'} / 數量：${item.ownedCount}</p>
      ${item.note ? `<p class="note">${escapeHtml(item.note)}</p>` : ''}
      <div class="actions">
        <button class="small-button" data-edit="${item.id}">編輯</button>
        <button class="small-button" data-delete="${item.id}">刪除</button>
      </div>
    </article>
  `;
}

function renderForm() {
  const draft = state.draft || emptyDraft();
  app.innerHTML = `
    <main class="app">
      ${renderHeader(state.editingId ? '編輯收藏' : '新增收藏', '資料只存在這台裝置的瀏覽器')}
      <form class="form" id="tomica-form">
        <section class="field">
          <label class="label">收藏照片</label>
          ${
            draft.photoDataUrl
              ? `<img class="photo-preview" src="${draft.photoDataUrl}" alt="收藏照片" />`
              : '<div class="photo-placeholder">尚未拍攝照片</div>'
          }
          <div class="toolbar">
            <button class="button" type="button" data-action="photo">${draft.photoDataUrl ? '重新拍攝' : '拍攝照片'}</button>
            ${
              draft.photoDataUrl
                ? '<button class="button danger" type="button" data-action="remove-photo">移除照片</button>'
                : ''
            }
          </div>
        </section>
        ${field('barcode', '條碼 *', draft.barcode, 'text', 'numeric')}
        ${field('number', '編號 *', draft.number)}
        ${field('name', '車名 *', draft.name)}
        ${selectField('series', '系列', draft.series, seriesOptions)}
        <div class="field ${draft.series === '其他' || isCustomSeries(draft.series) ? '' : 'hidden'}" id="custom-series-field">
          <label class="label" for="customSeries">其他系列</label>
          <input class="input" id="customSeries" value="${isCustomSeries(draft.series) ? escapeHtml(draft.series) : ''}" />
        </div>
        ${field('year', '年份', draft.year, 'text', 'numeric')}
        ${selectField('ownedCount', '持有數量', String(draft.ownedCount), ownedCountOptions)}
        <label class="checkbox">
          <input id="hasSticker" type="checkbox" ${draft.hasSticker ? 'checked' : ''} />
          是否有車貼
        </label>
        <div class="field">
          <label class="label" for="note">備註</label>
          <textarea class="textarea" id="note">${escapeHtml(draft.note)}</textarea>
        </div>
        <div class="toolbar">
          <button class="button" type="button" data-action="cancel">取消</button>
          <button class="button primary" type="submit">儲存</button>
        </div>
      </form>
    </main>
  `;

  app.querySelector('[data-action="cancel"]').addEventListener('click', () => navigate('list'));
  app.querySelector('[data-action="photo"]').addEventListener('click', () => {
    state.screen = 'photo';
    renderPhotoCamera();
  });
  app.querySelector('[data-action="remove-photo"]')?.addEventListener('click', () => {
    state.draft.photoDataUrl = '';
    renderForm();
  });
  app.querySelector('#series').addEventListener('change', (event) => {
    const customField = app.querySelector('#custom-series-field');
    customField.classList.toggle('hidden', event.target.value !== '其他');
  });
  app.querySelector('#tomica-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const series = form.series.value === '其他' ? form.customSeries.value.trim() : form.series.value;
    const draftToSave = {
      ...state.draft,
      barcode: form.barcode.value,
      number: form.number.value,
      name: form.name.value,
      series,
      year: form.year.value,
      ownedCount: form.ownedCount.value,
      hasSticker: form.hasSticker.checked ? 1 : 0,
      note: form.note.value,
    };

    if (!draftToSave.barcode.trim() || !draftToSave.number.trim() || !draftToSave.name.trim()) {
      alert('條碼、編號、車名為必填。');
      return;
    }

    try {
      await saveTomica(draftToSave, state.editingId);
      await navigate('list');
    } catch (error) {
      alert('儲存失敗，請確認條碼沒有重複。');
    }
  });
}

function field(id, label, value, type = 'text', inputMode = 'text') {
  return `
    <div class="field">
      <label class="label" for="${id}">${label}</label>
      <input class="input" id="${id}" name="${id}" type="${type}" inputmode="${inputMode}" value="${escapeHtml(value)}" />
    </div>
  `;
}

function selectField(id, label, value, options) {
  return `
    <div class="field">
      <label class="label" for="${id}">${label}</label>
      <select class="select" id="${id}" name="${id}">
        ${options
          .map((option) => `<option value="${escapeHtml(option)}" ${option === value || (option === '其他' && isCustomSeries(value)) ? 'selected' : ''}>${escapeHtml(option)}</option>`)
          .join('')}
      </select>
    </div>
  `;
}

function isCustomSeries(series) {
  return Boolean(series) && !seriesOptions.includes(series);
}

async function renderScanner() {
  app.innerHTML = `
    <main class="camera-screen">
      <video class="camera-video" id="scan-video" autoplay muted playsinline></video>
      <section class="camera-panel">
        <h1 class="card-title">對準 Tomica 外盒條碼</h1>
        <div id="scan-output" class="scan-result">
          <p class="help">掃描結果會顯示在這裡。若瀏覽器不支援自動辨識，可手動輸入條碼。</p>
        </div>
        <div class="field">
          <label class="label" for="manual-barcode">手動輸入條碼</label>
          <input class="input" id="manual-barcode" inputmode="numeric" />
        </div>
        <div class="toolbar">
          <button class="button" data-action="manual">查詢條碼</button>
          <button class="button" data-action="back">返回列表</button>
        </div>
      </section>
    </main>
  `;

  app.querySelector('[data-action="back"]').addEventListener('click', () => navigate('list'));
  app.querySelector('[data-action="manual"]').addEventListener('click', async () => {
    const value = app.querySelector('#manual-barcode').value.trim();
    if (value) await handleBarcode(value);
  });

  await startScanner();
}

async function startScanner() {
  const video = app.querySelector('#scan-video');

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    video.srcObject = state.stream;

    if ('BarcodeDetector' in window) {
      state.detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
      });
      scanFrame(video);
    } else {
      app.querySelector('#scan-output').innerHTML =
        '<p class="help">這個瀏覽器不支援自動條碼辨識，請用下方手動輸入條碼。</p>';
    }
  } catch (error) {
    app.querySelector('#scan-output').innerHTML =
      '<p class="missing">無法開啟相機</p><p class="help">iPhone 網頁相機需要 HTTPS 網址。請部署到 HTTPS 網站，或使用下方手動輸入條碼。</p>';
  }
}

async function scanFrame(video) {
  if (state.screen !== 'scanner' || !state.detector) return;

  if (video.readyState >= 2) {
    try {
      const codes = await state.detector.detect(video);
      if (codes[0]?.rawValue && codes[0].rawValue !== state.scannedBarcode) {
        await handleBarcode(codes[0].rawValue);
      }
    } catch {
      // Some browsers expose BarcodeDetector but fail on live video frames.
    }
  }

  state.scanTimer = requestAnimationFrame(() => scanFrame(video));
}

async function handleBarcode(barcode) {
  state.scannedBarcode = barcode;
  state.scanResult = await getTomicaByBarcode(barcode);
  state.scanStatus = state.scanResult ? 'found' : 'missing';
  renderScanResult();
}

function renderScanResult() {
  const output = app.querySelector('#scan-output');
  if (!output) return;

  if (state.scanStatus === 'found') {
    const item = state.scanResult;
    output.innerHTML = `
      <p class="found">已收藏</p>
      ${item.photoDataUrl ? `<img class="scan-photo" src="${item.photoDataUrl}" alt="${escapeHtml(item.name)}" />` : ''}
      <h2 class="card-title">${escapeHtml(item.number)} ${escapeHtml(item.name)}</h2>
      <p class="meta">條碼：${escapeHtml(item.barcode)}</p>
      <p class="meta">系列：${escapeHtml(item.series || '未填')} / 車貼：${item.hasSticker ? '有' : '無'}</p>
      <button class="button primary full" data-action="edit-found">查看 / 編輯</button>
    `;
    output.querySelector('[data-action="edit-found"]').addEventListener('click', () => navigate('form', { id: item.id }));
    return;
  }

  output.innerHTML = `
    <p class="missing">尚未收藏</p>
    <p class="meta">條碼：${escapeHtml(state.scannedBarcode)}</p>
    <button class="button primary full" data-action="add-missing">新增收藏</button>
  `;
  output.querySelector('[data-action="add-missing"]').addEventListener('click', () =>
    navigate('form', { barcode: state.scannedBarcode })
  );
}

async function renderPhotoCamera() {
  app.innerHTML = `
    <main class="camera-screen">
      <video class="camera-video" id="photo-video" autoplay muted playsinline></video>
      <section class="camera-panel">
        <div class="toolbar">
          <button class="button" data-action="cancel-photo">取消</button>
          <button class="button primary" data-action="take-photo">拍攝照片</button>
        </div>
      </section>
    </main>
  `;

  app.querySelector('[data-action="cancel-photo"]').addEventListener('click', () => {
    stopCamera();
    state.screen = 'form';
    renderForm();
  });
  app.querySelector('[data-action="take-photo"]').addEventListener('click', takePhoto);

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    app.querySelector('#photo-video').srcObject = state.stream;
  } catch {
    alert('無法開啟相機。iPhone 網頁相機需要 HTTPS 網址。');
    state.screen = 'form';
    renderForm();
  }
}

async function takePhoto() {
  const video = app.querySelector('#photo-video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  state.draft.photoDataUrl = canvas.toDataURL('image/jpeg', 0.78);
  stopCamera();
  state.screen = 'form';
  renderForm();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

await navigate('list');

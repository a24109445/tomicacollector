const DB_NAME = 'TomicaCollectorWeb';
const DB_VERSION = 3;
const STORE_NAME = 'tomicas';
const APP_VERSION = '2026-06-11-zxing-v11';

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
  scanMatches: [],
  scanDbCount: 0,
  stream: null,
  detector: null,
  scanTimer: null,
  zxingControls: null,
  isResolvingScan: false,
  lastScanAt: 0,
  formReturnScreen: 'list',
  totalValue: 0,
};

const app = document.querySelector('#app');

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('barcode', 'barcode', { unique: false });
        store.createIndex('updatedAt', 'updatedAt');
      } else {
        const store = request.transaction.objectStore(STORE_NAME);
        if (store.indexNames.contains('barcode')) {
          store.deleteIndex('barcode');
        }
        store.createIndex('barcode', 'barcode', { unique: false });
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
  const matches = await getTomicasByBarcode(barcode);
  return matches[0] ?? null;
}

async function getTomicasByBarcode(barcode) {
  const normalizedBarcode = normalizeBarcode(barcode);
  const rows = await getAllTomicas();
  return rows
    .filter((item) => normalizeBarcode(item.barcode) === normalizedBarcode)
    .sort((a, b) => String(b.year).localeCompare(String(a.year)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function saveTomica(draft, id = null) {
  const now = new Date().toISOString();
  const existingSameModel = id ? null : await findTomicaByBarcodeYear(draft.barcode, draft.year);
  const row = {
    id: id ? Number(id) : existingSameModel?.id,
    barcode: draft.barcode.trim(),
    number: draft.number.trim(),
    name: draft.name.trim(),
    series: draft.series.trim(),
    year: draft.year.trim(),
    ownedCount: Number(draft.ownedCount) || 1,
    price: parsePrice(draft.price),
    hasSticker: draft.hasSticker ? 1 : 0,
    photoDataUrl: draft.photoDataUrl || '',
    note: draft.note.trim(),
    createdAt: draft.createdAt || existingSameModel?.createdAt || now,
    updatedAt: now,
  };

  await withStore('readwrite', (store) => store.put(row));
}

async function findTomicaByBarcodeYear(barcode, year) {
  const normalizedBarcode = normalizeBarcode(barcode);
  const normalizedYear = String(year ?? '').trim();
  const rows = await getAllTomicas();
  return rows.find(
    (item) => normalizeBarcode(item.barcode) === normalizedBarcode && String(item.year ?? '').trim() === normalizedYear
  ) ?? null;
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
    price: '',
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

function normalizeBarcode(value) {
  return String(value ?? '').replace(/\D/g, '').trim();
}

function parsePrice(value) {
  const amount = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
}

function formatCurrency(value) {
  return `NT$ ${parsePrice(value).toLocaleString('zh-TW')}`;
}

function matchesKeyword(item, keyword) {
  const textKeyword = keyword.trim().toLowerCase();
  const digitKeyword = normalizeBarcode(keyword);
  const textFields = [item.name, item.number, item.barcode, item.series, item.year].map((value) =>
    String(value ?? '').toLowerCase()
  );

  if (textFields.some((value) => value.includes(textKeyword))) {
    return true;
  }

  return Boolean(digitKeyword) && [item.number, item.barcode, item.year].some((value) =>
    normalizeBarcode(value).includes(digitKeyword)
  );
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
    price: parsePrice(raw.price ?? fallback.price),
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
  const existingByBarcodeYear = new Map(
    existingItems.map((item) => [`${normalizeBarcode(item.barcode)}::${String(item.year ?? '').trim()}`, item])
  );
  let importedCount = 0;
  let skippedCount = 0;

  for (const incoming of incomingItems) {
    const barcode = String(incoming.barcode ?? '').trim();
    if (!barcode) {
      skippedCount += 1;
      continue;
    }

    const existing = existingByBarcodeYear.get(
      `${normalizeBarcode(barcode)}::${String(incoming.year ?? '').trim()}`
    );
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
  if (state.zxingControls) {
    state.zxingControls.stop();
    state.zxingControls = null;
  }

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
  const keyword = state.query.trim();
  state.totalValue = all.reduce((sum, item) => sum + parsePrice(item.price) * (Number(item.ownedCount) || 1), 0);
  state.items = keyword ? all.filter((item) => matchesKeyword(item, keyword)) : all;
}

async function navigate(screen, options = {}) {
  stopCamera();
  state.screen = screen;
  state.editingId = options.id ?? null;
  state.barcodeFromScan = options.barcode ?? '';
  state.formReturnScreen = options.returnTo ?? state.formReturnScreen;
  state.scanStatus = 'idle';
  state.scannedBarcode = '';
  state.scanResult = null;
  state.scanMatches = [];
  state.scanDbCount = 0;
  state.isResolvingScan = false;

  if (screen === 'list') {
    await refreshList();
  }

  if (screen === 'form') {
    state.draft = options.id ? await getTomicaById(options.id) : emptyDraft(options.barcode);
  }

  render();
}

function openForm(options = {}) {
  navigate('form', { ...options, returnTo: state.screen });
}

async function openFormPhoto(options = {}) {
  await navigate('form', { ...options, returnTo: state.screen });
  state.screen = 'photo';
  renderPhotoCamera();
}

function goBackFromForm() {
  navigate(state.formReturnScreen === 'scanner' ? 'scanner' : 'list');
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
      ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
    </header>
  `;
}

function renderList() {
  app.innerHTML = `
    <main class="app">
      ${renderHeader('TomicaCollector', '')}
      <p class="version">版本：${APP_VERSION}</p>
      <p class="help">版本更新時請先匯出備份，更新完後再匯入備份。</p>
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
      <section class="total-value">
        <span>收藏總價值</span>
        <strong>${formatCurrency(state.totalValue)}</strong>
      </section>
      <section id="collection-list"></section>
    </main>
  `;
  renderCollectionList();

  app.querySelector('[data-action="add"]').addEventListener('click', () => openForm());
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
    renderCollectionList();
  });
}

function renderCollectionList() {
  const list = app.querySelector('#collection-list');
  if (!list) return;

  list.className = state.items.length ? 'list' : 'empty';
  list.innerHTML = state.items.length
    ? state.items.map(renderCard).join('')
    : '<p>目前沒有收藏，先新增或掃描一台 Tomica。</p>';

  list.querySelectorAll('[data-edit]').forEach((button) =>
    button.addEventListener('click', () => openForm({ id: button.dataset.edit }))
  );
  list.querySelectorAll('[data-delete]').forEach((button) =>
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
      <p class="meta">車貼：${item.hasSticker ? '有' : '無'} / 數量：${item.ownedCount} / 金額：${formatCurrency(item.price)}</p>
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
      <button class="back-button" type="button" data-action="form-back">‹</button>
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
        ${field('price', '金額', draft.price, 'number', 'decimal')}
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

  app.querySelector('[data-action="form-back"]').addEventListener('click', goBackFromForm);
  app.querySelector('[data-action="cancel"]').addEventListener('click', goBackFromForm);
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
      price: form.price.value,
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
          <p class="help">掃描結果會顯示在這裡。掃到條碼後會自動比對收藏資料。</p>
        </div>
        <form class="field" id="manual-barcode-form">
          <label class="label" for="manual-barcode">手動輸入條碼</label>
          <input class="input" id="manual-barcode" inputmode="numeric" enterkeyhint="enter" />
        </form>
        <button class="button primary full" data-action="add-year">新增收藏/新增不同年份</button>
        <button class="button full" data-action="back">返回列表</button>
      </section>
    </main>
  `;

  app.querySelector('[data-action="back"]').addEventListener('click', () => navigate('list'));
  app.querySelector('[data-action="add-year"]').addEventListener('click', async () => {
    if (state.scannedBarcode) {
      await openFormPhoto({ barcode: state.scannedBarcode });
    } else {
      await openFormPhoto();
    }
  });
  app.querySelector('#manual-barcode-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = app.querySelector('#manual-barcode').value.trim();
    if (value) await handleBarcode(value);
  });
  app.querySelector('#manual-barcode').addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const value = event.currentTarget.value.trim();
      if (value) await handleBarcode(value);
    }
  });
  await startScanner();
}

async function startScanner() {
  const video = app.querySelector('#scan-video');

  if (window.ZXingBrowser?.BrowserMultiFormatReader) {
    await startZxingScanner(video);
    return;
  }

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

async function startZxingScanner(video) {
  const output = app.querySelector('#scan-output');
  output.innerHTML =
    '<p class="help">自動條碼辨識啟動中，請將條碼放在畫面中央並保持穩定。</p>';

  try {
    const reader = new window.ZXingBrowser.BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 900,
      tryPlayVideoTimeout: 8000,
    });

    state.zxingControls = await reader.decodeFromVideoDevice(
      undefined,
      video,
      async (result, error) => {
        if (!result || state.isResolvingScan) {
          return;
        }

        const text = result.getText();
        if (!text) {
          return;
        }

        await handleBarcode(text);
      }
    );
  } catch (error) {
    output.innerHTML =
      '<p class="missing">無法啟動自動條碼辨識</p><p class="help">請確認 Safari 已允許相機權限，並使用 HTTPS 網址。也可以先用下方手動輸入條碼。</p>';
  }
}

async function scanFrame(video) {
  if (state.screen !== 'scanner' || !state.detector) return;

  if (state.isResolvingScan) {
    state.scanTimer = requestAnimationFrame(() => scanFrame(video));
    return;
  }

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
  const normalizedBarcode = normalizeBarcode(barcode);
  if (!normalizedBarcode || state.isResolvingScan) {
    return;
  }

  const now = Date.now();
  if (normalizedBarcode === state.scannedBarcode && now - state.lastScanAt < 2500) {
    return;
  }

  state.isResolvingScan = true;
  state.scannedBarcode = normalizedBarcode;
  state.lastScanAt = now;

  const manualInput = app.querySelector('#manual-barcode');
  if (manualInput) {
    manualInput.value = normalizedBarcode;
  }

  state.scanDbCount = (await getAllTomicas()).length;
  state.scanMatches = await getTomicasByBarcode(normalizedBarcode);
  state.scanResult = state.scanMatches[0] ?? null;
  state.scanStatus = state.scanMatches.length > 0 ? 'found' : 'missing';
  state.isResolvingScan = false;
  renderScanResult();
}

function renderScanResult() {
  const output = app.querySelector('#scan-output');
  if (!output) return;

  if (state.scanStatus === 'found') {
    output.innerHTML = `
      <p class="found">已收藏</p>
      <p class="meta">條碼：${escapeHtml(state.scannedBarcode)}</p>
      <p class="meta">目前資料庫：${state.scanDbCount} 筆</p>
      <p class="meta">同條碼已收藏：${state.scanMatches.length} 種年份</p>
      <div class="scan-match-list">
        ${state.scanMatches.map(renderScanMatch).join('')}
      </div>
    `;
    output.querySelectorAll('[data-edit-scan]').forEach((button) =>
      button.addEventListener('click', () => openForm({ id: button.dataset.editScan }))
    );
    return;
  }

  output.innerHTML = `
    <p class="missing">未收藏</p>
    <p class="meta">條碼：${escapeHtml(state.scannedBarcode)}</p>
    <p class="meta">目前資料庫：${state.scanDbCount} 筆</p>
  `;
}

function renderScanMatch(item) {
  return `
    <article class="scan-match">
      ${item.photoDataUrl ? `<img class="scan-photo" src="${item.photoDataUrl}" alt="${escapeHtml(item.name)}" />` : ''}
      <h2 class="card-title">${escapeHtml(item.number)} ${escapeHtml(item.name)}</h2>
      <p class="meta">年份：${escapeHtml(item.year || '未填')} / 系列：${escapeHtml(item.series || '未填')}</p>
      <p class="meta">車貼：${item.hasSticker ? '有' : '無'} / 數量：${item.ownedCount} / 金額：${formatCurrency(item.price)}</p>
      <button class="button full" data-edit-scan="${item.id}" type="button">查看 / 編輯</button>
    </article>
  `;
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
  navigator.serviceWorker.register('./sw.js?v=11').then((registration) => {
    registration.update().catch(() => {});
  }).catch(() => {});
}

await navigate('list');

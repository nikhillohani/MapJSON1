/* ─────────────────────────────────────────────────────────────
   Map JSON Generator — app.js
   ───────────────────────────────────────────────────────────── */

const App = (() => {

  // ── CONSTANTS ──────────────────────────────────────────────
  const APP_VERSION = 'V2';
  const STORAGE_PREFIX = 'mapjson_saved_entries_v2_';
  const CURRENT_USER_KEY = 'mapjson_current_user_v2';
  const USAGE_KEY = 'mapjson_usage_log_v1';
  const DOWNLOAD_HISTORY_KEY = 'mapjson_download_history_v1';
  const THEME_KEY = 'mapjson_theme_mode_v1';
  const SPLASH_KEY = 'mapjson_splash_seen_v2';
  const MORE_FEATURES_PASSWORD = '1212';
  const OWNER_LOG_ENABLED = false; // Local browser-only debug panel. Keep false for live.
  const EXTENSION_FILE_URL = ''; // Paste your Box extension file URL here.
  const SUPABASE_URL = 'https://evdhpksrnqwoqayhfyjz.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInJlZiI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZGhwa3NybnF3b3FheWhmeWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMjkwNDYsImV4cCI6MjEwMzYwNTA0Nn0.9v4laJsYXroX-ZrP_5onLb0SEDxLXamc_huBF_4UNYY';
  const OWNER_NAMES = ['nikhil', 'nikhil lohani'];
  const DEFAULT_CTA_URL = 'https://www.vdx.tv/';

  // Edit this list to add, remove, or rename Fast Tutorial items.
  // Keep each `id` unique. Put local tutorial videos in assets/tutorials/.
  const FAST_TUTORIALS = [
    {
      id: 'json-use',
      title: 'Where We Used This JSON File?',
      videoSrc: 'assets/tutorials/where-json-used.mp4',
    },
    {
      id: 'mapjson-plus',
      title: 'How To Use MapJSON Plus',
      videoSrc: 'assets/tutorials/how-to-use-mapjson-plus.mp4',
    },
    {
      id: 'download-json',
      title: 'How To Download JSON File',
      videoSrc: 'assets/tutorials/how-to-download-json.mp4',
    },
  ];

  const COLORS = [
    { idx: 1, cls: 'f1', btn: 'sc1' },
    { idx: 2, cls: 'f2', btn: 'sc2' },
    { idx: 3, cls: 'f3', btn: 'sc3' },
    { idx: 4, cls: 'f4', btn: 'sc4' },
    { idx: 5, cls: 'f5', btn: 'sc5' },
    { idx: 6, cls: 'f6', btn: 'sc6' },
  ];
  const OPTIONAL_JSON_FIELDS = ['country', 'phone'];

  // ── STATE ──────────────────────────────────────────────────
  let globalIdCounter = 1;
  let groups          = [];   // [{ gid, slots:[{sid, data}], generatedJSON }]
  let gidCounter      = 0;
  let sidCounter      = 0;
  let allSaved        = [];   // flat list of every saved entry (persisted)
  let latestJSON      = '';
  let urlLookupResult = null; // holds the last built entry from URL lookup
  let urlEditOpen     = false;
  let currentUser     = null;
  let syncingJsonEditor = false;
  let selectedSlotIndex = 0;
  let undoStack = [];
  let redoStack = [];
  let taskStartedAt = Date.now();
  let taskTimerInterval = null;
  let taskCompletedElapsed = '';
  let downloadFolderHandle = null;
  let latestSubmissionId = '';
  let currentTool = 'hub';
  let forcedUrlTargetSlotIndex = null;
  let connectorStatusTimer = null;
  let connectorLastSeenAt = 0;
  const slotMaps = new Map();
  const reverseTimers = new Map();
  let gmapEmbedTimer = null;

  function userStorageKey() {
    return STORAGE_PREFIX + slugUser(currentUser || 'guest');
  }

  // ── STORAGE ────────────────────────────────────────────────
  function storageSave() {
    if (!currentUser) return;
    try {
      localStorage.setItem(userStorageKey(), JSON.stringify({
        allSaved,
      }));
      updateStoragePill('Saved ✓');
    } catch (e) {
      updateStoragePill('Storage error');
    }
  }

  function storageLoad() {
    if (!currentUser) return;
    try {
      const raw = localStorage.getItem(userStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.allSaved)        allSaved        = parsed.allSaved;
      globalIdCounter = 1;
    } catch (e) { /* ignore */ }
  }

  function loginUser() {
    currentUser = 'Nikhil Lohani';
    sessionStorage.setItem(CURRENT_USER_KEY, currentUser);
    recordUsage(currentUser);
    startWorkspace();
  }

  function recordUsage(name) {
    const usage = getUsageLog();
    const now = new Date();
    usage.unshift({
      name,
      version: APP_VERSION,
      at: now.toISOString(),
      displayAt: now.toLocaleString(),
    });
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage.slice(0, 50)));
  }

  function getUsageLog() {
    try {
      return JSON.parse(localStorage.getItem(USAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function renderUsageLog() {
    updateAdminVisibility();
    if (!OWNER_LOG_ENABLED) return;
    const list = document.getElementById('usage-list');
    if (!list) return;
    const usage = getUsageLog();
    if (!usage.length) {
      list.innerHTML = '<div class="empty-hist">No usage yet.</div>';
      return;
    }
    list.innerHTML = usage.map(item => `
      <div class="usage-item">
        <span class="usage-name">${esc(item.name || 'Unknown')}</span>
        <span class="usage-meta">${esc(item.version || APP_VERSION)} · ${esc(item.displayAt || '')}</span>
      </div>
    `).join('');
  }

  function clearUsageLog() {
    if (!OWNER_LOG_ENABLED || !isOwner()) return;
    if (!confirm('Clear the usage log for this browser?')) return;
    localStorage.removeItem(USAGE_KEY);
    renderUsageLog();
  }

  function isOwner() {
    return OWNER_NAMES.includes(slugUser(currentUser || '').replace(/-/g, ' '));
  }

  function updateAdminVisibility() {
    const panel = document.getElementById('owner-usage-panel');
    if (panel) panel.style.display = OWNER_LOG_ENABLED && isOwner() ? 'block' : 'none';
  }

  function createTrackingId(prefix) {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}_${id}`;
  }

  function createSubmissionId() {
    return createTrackingId('submission');
  }

  function getFilledCount() {
    return groups.reduce((sum, group) => sum + group.slots.filter(slot => slot.data).length, 0);
  }

      function sendRemoteUsage() {}

  function startWorkspace() {
    allSaved = [];
    latestJSON = '';
    undoStack = [];
    redoStack = [];
    taskStartedAt = Date.now();
    globalIdCounter = 1;
    groups = [];
    gidCounter = 0;
    sidCounter = 0;

    currentUser = 'Nikhil Lohani';
    storageLoad();
    updateAdminVisibility();
    addGroup();
    restoreSavedEntriesToSlots();
    selectSlot(selectedSlotIndex, { scroll: false });
    renderUsageLog();
    updateTotals();
    applyTheme();
    resetTaskTimer();
    updateUndoButton();
    updateFeatureAccess();
  }

  function setThemeMode(mode) {
    const nextMode = mode === 'day' ? 'day' : 'night';
    localStorage.setItem(THEME_KEY, nextMode);
    applyTheme();
  }

  function getThemeMode() {
    return localStorage.getItem(THEME_KEY) === 'day' ? 'day' : 'night';
  }

  function applyTheme() {
    const mode = getThemeMode();
    document.body.classList.toggle('theme-night', mode === 'night');
    document.body.classList.toggle('theme-day', mode === 'day');

    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.textContent = mode === 'night' ? 'Night' : 'Day';
  }

  function toggleThemeMode() {
    const nextMode = getThemeMode() === 'night' ? 'day' : 'night';
    setThemeMode(nextMode);
  }

  function showTool(tool) {
    currentTool = ['hub', 'mapjson'].includes(tool) ? tool : 'hub';
    const hub = document.getElementById('tool-hub');
    const mapjson = document.getElementById('mapjson-workspace');
    if (hub) hub.hidden = currentTool !== 'hub';
    if (mapjson) mapjson.hidden = currentTool !== 'mapjson';
    document.body.dataset.tool = currentTool;
    if (currentTool === 'mapjson') {
      setTimeout(() => {
        initSlotMaps();
      }, 50);
    }
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Number(seconds || 0));
    if (!total) return '-';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function updateStoragePill(msg) {
    const pill = document.getElementById('storage-pill');
    if (pill) {
      pill.textContent = msg;
      clearTimeout(pill._t);
      pill._t = setTimeout(() => { pill.textContent = 'Storage ready'; }, 2200);
    }
  }

  function toggleFeatureAccess() {
    const unlocked = sessionStorage.getItem('mapjson_more_features_unlocked') === '1';
    if (unlocked) {
      lockMoreFeatures();
      return;
    }
    const popover = document.getElementById('feature-access-popover');
    if (!popover) return;
    popover.classList.toggle('show');
    if (popover.classList.contains('show')) {
      setTimeout(() => document.getElementById('feature-access-password')?.focus(), 40);
    }
  }

  function toggleNotes() {
    const popover = document.getElementById('notes-popover');
    if (!popover) return;
    popover.classList.toggle('show');
  }

  function toggleJsonPhoneField() {
    const slot = getSelectedSlot();
    if (!slot?.data) {
      setHint('json-edit-hint', `Address ${selectedSlotIndex + 1} is empty. Add address details before adding a number.`, 'er');
      return;
    }
    const field = document.getElementById('json-phone-field');
    if (!field) return;
    const opening = field.classList.contains('is-hidden');
    field.classList.toggle('is-hidden', !opening);
    if (opening) {
      const input = document.getElementById('json-phone-input');
      if (input) input.value = normalizePhone(slot.data.phone);
      setTimeout(() => input?.focus(), 40);
    }
  }

  function toggleJsonCountryField() {
    const slot = getSelectedSlot();
    if (!slot?.data) {
      setHint('json-edit-hint', `Address ${selectedSlotIndex + 1} is empty. Add address details before adding a country.`, 'er');
      return;
    }
    const field = document.getElementById('json-country-field');
    if (!field) return;
    const opening = field.classList.contains('is-hidden');
    field.classList.toggle('is-hidden', !opening);
    if (opening) {
      const input = document.getElementById('json-country-input');
      if (input) input.value = normalizeCountry(slot.data.country) || 'USA';
      setTimeout(() => input?.focus(), 40);
    }
  }

  function saveJsonCountry() {
    const slot = getSelectedSlot();
    if (!slot?.data) {
      setHint('json-edit-hint', `Address ${selectedSlotIndex + 1} is empty. Add address details before saving a country.`, 'er');
      return;
    }
    const input = document.getElementById('json-country-input');
    const country = normalizeCountry(input?.value || '');
    if (input) input.value = country;
    setFieldHidden(slot, 'country', false);
    updateSlotField(selectedSlotIndex, 'country', country);
    updateGroupJsonFromSlots(groups[0]);
    latestJSON = JSON.stringify(renderStoreForSlot(slot), null, 2);
    storageSave();
    renderAll();
    selectSlot(selectedSlotIndex, { scroll: false });
    syncJsonOptionalTools();
    setHint('json-edit-hint', country ? `Country saved for Address ${selectedSlotIndex + 1}.` : `Country removed from Address ${selectedSlotIndex + 1}.`, 'ok');
  }

  function saveJsonPhoneNumber() {
    const slot = getSelectedSlot();
    if (!slot?.data) {
      setHint('json-edit-hint', `Address ${selectedSlotIndex + 1} is empty. Add address details before saving a number.`, 'er');
      return;
    }
    const input = document.getElementById('json-phone-input');
    const phone = normalizePhone(input?.value || '');
    if (input) input.value = phone;
    setFieldHidden(slot, 'phone', false);
    updateSlotField(selectedSlotIndex, 'phone', phone);
    updateGroupJsonFromSlots(groups[0]);
    latestJSON = JSON.stringify(renderStoreForSlot(slot), null, 2);
    storageSave();
    renderAll();
    selectSlot(selectedSlotIndex, { scroll: false });
    syncJsonOptionalTools();
    const hasPhone = !!normalizePhone(getSelectedSlot()?.data?.phone);
    setHint('json-edit-hint', hasPhone ? `Phone saved for Address ${selectedSlotIndex + 1}.` : `Phone removed from Address ${selectedSlotIndex + 1}.`, 'ok');
  }

  function sanitizeJsonPhoneInput() {
    const input = document.getElementById('json-phone-input');
    if (!input) return '';
    const phone = sanitizePhoneTypingValue(input.value);
    if (input.value !== phone) input.value = phone;
    return phone;
  }

  function syncJsonPhoneTools() {
    const slot = getSelectedSlot();
    const field = document.getElementById('json-phone-field');
    const input = document.getElementById('json-phone-input');
    const phone = normalizePhone(slot?.data?.phone);
    if (input) input.value = phone;
    if (!slot?.data) {
      if (field) field.classList.add('is-hidden');
      return;
    }
    if (!isFieldHidden(slot, 'phone') && phone) field?.classList.remove('is-hidden');
    else field?.classList.add('is-hidden');
  }

  function syncJsonCountryTools() {
    const slot = getSelectedSlot();
    const field = document.getElementById('json-country-field');
    const input = document.getElementById('json-country-input');
    const country = normalizeCountry(slot?.data?.country);
    if (input) input.value = country || 'USA';
    if (!slot?.data) {
      if (field) field.classList.add('is-hidden');
      return;
    }
    if (!isFieldHidden(slot, 'country') && country) field?.classList.remove('is-hidden');
    else field?.classList.add('is-hidden');
  }

  function syncJsonOptionalTools() {
    syncJsonFieldControls();
    syncJsonCountryTools();
    syncJsonPhoneTools();
  }

  function toggleJsonOptionsMenu() {
    const panel = document.getElementById('json-more-panel');
    const toggle = document.getElementById('json-more-toggle');
    if (!panel) return;
    const opening = panel.classList.contains('is-hidden');
    panel.classList.toggle('is-hidden', !opening);
    toggle?.classList.toggle('active', opening);
  }

  function addJsonField(field) {
    const slot = getSelectedSlot();
    if (!slot?.data || !OPTIONAL_JSON_FIELDS.includes(field)) {
      setHint('json-edit-hint', `Address ${selectedSlotIndex + 1} is empty. Add address details before editing fields.`, 'er');
      return;
    }
    pushUndoState();
    setFieldHidden(slot, field, false);
    if (field === 'country') {
      if (!normalizeCountry(slot.data.country)) slot.data = makeStoreEntry({ ...slot.data, country: 'USA' });
      updateGroupJsonFromSlots(groups[0]);
      storageSave();
      renderAll();
      selectSlot(selectedSlotIndex, { scroll: false });
      document.getElementById('json-country-field')?.classList.remove('is-hidden');
      document.getElementById('json-country-input')?.focus();
    } else if (field === 'phone') {
      slot.data = makeStoreEntry({ ...slot.data, phone: slot.data.phone || '' });
      updateGroupJsonFromSlots(groups[0]);
      storageSave();
      renderAll();
      selectSlot(selectedSlotIndex, { scroll: false });
      document.getElementById('json-phone-field')?.classList.remove('is-hidden');
      document.getElementById('json-phone-input')?.focus();
    }
    setHint('json-edit-hint', `${fieldLabel(field)} added to Address ${selectedSlotIndex + 1}.`, 'ok');
  }

  function removeJsonField(field) {
    const slot = getSelectedSlot();
    if (!slot?.data || !OPTIONAL_JSON_FIELDS.includes(field)) {
      setHint('json-edit-hint', `Address ${selectedSlotIndex + 1} is empty. Add address details before removing fields.`, 'er');
      return;
    }
    pushUndoState();
    setFieldHidden(slot, field, true);
    if (field === 'country') document.getElementById('json-country-field')?.classList.add('is-hidden');
    if (field === 'phone') document.getElementById('json-phone-field')?.classList.add('is-hidden');
    updateGroupJsonFromSlots(groups[0]);
    storageSave();
    renderAll();
    selectSlot(selectedSlotIndex, { scroll: false });
    setHint('json-edit-hint', `${fieldLabel(field)} removed from Address ${selectedSlotIndex + 1} JSON.`, 'ok');
  }

  function fieldLabel(field) {
    return field === 'phone' ? 'Number' : cap(field);
  }

  function getHiddenFields(slot) {
    return new Set(Array.isArray(slot?.hiddenFields) ? slot.hiddenFields : []);
  }

  function isFieldHidden(slot, field) {
    return getHiddenFields(slot).has(field);
  }

  function setFieldHidden(slot, field, hidden) {
    if (!slot || !OPTIONAL_JSON_FIELDS.includes(field)) return;
    const hiddenFields = getHiddenFields(slot);
    hidden ? hiddenFields.add(field) : hiddenFields.delete(field);
    slot.hiddenFields = [...hiddenFields];
  }

  function renderStoreForSlot(slot) {
    if (!slot?.data) return null;
    const entry = makeStoreEntry({ ...slot.data }, getHiddenFields(slot));
    delete entry._mapUrl;
    return entry;
  }

  function syncJsonFieldControls() {
    const slot = getSelectedSlot();
    document.querySelectorAll('.json-field-option').forEach(row => {
      const field = row.dataset.field;
      const disabled = !slot?.data;
      const hidden = isFieldHidden(slot, field);
      const hasField = !!slot?.data && Object.prototype.hasOwnProperty.call(slot.data, field);
      row.classList.toggle('is-active', !!slot?.data && !hidden && hasField);
      row.classList.toggle('is-removed', !!slot?.data && hidden);
      row.querySelectorAll('button').forEach(button => {
        button.disabled = disabled;
      });
    });
  }

  function unlockMoreFeatures() {
    const input = document.getElementById('feature-access-password');
    const hint = document.getElementById('feature-access-hint');
    if (!input) return;
    if (input.value === MORE_FEATURES_PASSWORD) {
      sessionStorage.setItem('mapjson_more_features_unlocked', '1');
      input.value = '';
      if (hint) setHint('feature-access-hint', '', '');
      updateFeatureAccess();
      return;
    }
    input.value = '';
    if (hint) setHint('feature-access-hint', 'Incorrect password.', 'er');
  }

  function lockMoreFeatures() {
    sessionStorage.removeItem('mapjson_more_features_unlocked');
    const input = document.getElementById('feature-access-password');
    if (input) input.value = '';
    setHint('feature-access-hint', '', '');
    updateFeatureAccess();
  }

  function updateFeatureAccess() {
    const unlocked = sessionStorage.getItem('mapjson_more_features_unlocked') === '1';
    const popover = document.getElementById('feature-access-popover');
    document.querySelectorAll('[data-locked-feature]').forEach(panel => {
      panel.classList.toggle('locked-feature', !unlocked);
    });
    if (popover && unlocked) popover.classList.remove('show');
    if (unlocked) {
      pulseAddressBetaNote();
      validateLookupInputs();
    }
  }

  function pulseAddressBetaNote() {
    const note = document.getElementById('address-beta-note');
    if (!note) return;
    note.classList.remove('show');
    window.setTimeout(() => note.classList.add('show'), 20);
    window.clearTimeout(note._hideTimer);
    note._hideTimer = window.setTimeout(() => note.classList.remove('show'), 3000);
  }

  // ── GROUPS ─────────────────────────────────────────────────
  function addGroup() {
    if (groups.length) return;
    const gid   = gidCounter++;
    const slots = [makeSlot(), makeSlot(), makeSlot()];
    groups.push({ gid, slots, generatedJSON: null });
    renderAll();
  }

  function restoreSavedEntriesToSlots() {
    const group = groups[0];
    if (!group || !allSaved.length) return;
    group.slots.forEach(slot => {
      slot.data = null;
      slot.hiddenFields = [];
    });

    allSaved.forEach(entry => {
      const connectorSlot = Number(entry._connectorSlot);
      if (!Number.isInteger(connectorSlot) || connectorSlot < 1 || connectorSlot > group.slots.length) return;
      group.slots[connectorSlot - 1].data = { ...entry };
      group.slots[connectorSlot - 1].hiddenFields = [];
    });

    const remainingEntries = [...allSaved]
      .reverse()
      .filter(entry => {
        const connectorSlot = Number(entry._connectorSlot);
        return !Number.isInteger(connectorSlot) || connectorSlot < 1 || connectorSlot > group.slots.length;
      });
    group.slots.forEach(slot => {
      if (slot.data || !remainingEntries.length) return;
      slot.data = { ...remainingEntries.shift() };
      slot.hiddenFields = [];
    });
    updateGroupJsonFromSlots(group);
    const maxId = allSaved
      .map(entry => Number(entry.id))
      .filter(Number.isFinite)
      .reduce((max, id) => Math.max(max, id), 0);
    globalIdCounter = Math.max(globalIdCounter, maxId + 1);
    renderAll();
  }

  function removeGroup(gid) {
    if (!confirm('Remove this entire address group?')) return;
    groups = groups.filter(g => g.gid !== gid);
    renderAll();
  }

  function makeSlot() {
    return { sid: sidCounter++, data: null };
  }

  function addSlotToGroup(gid) {
    const g = groups.find(g => g.gid === gid);
    if (!g) return;
    g.slots.push(makeSlot());
    renderAll();
  }

  function removeSlotFromGroup(gid, sid) {
    const g = groups.find(g => g.gid === gid);
    if (!g || g.slots.length <= 1) return;
    g.slots = g.slots.filter(s => s.sid !== sid);
    renderAll();
  }

  function clearSlotData(gid, sid) {
    const g = groups.find(g => g.gid === gid);
    if (!g) return;
    pushUndoState();
    const clearedIndex = g.slots.findIndex(s => s.sid === sid);
    const s = g.slots.find(s => s.sid === sid);
    const connectorSlot = Number(s?.data?._connectorSlot);
    if (s) {
      s.data = null;
      s.hiddenFields = [];
    }
    g.generatedJSON = null;
    if (clearedIndex >= 0) selectedSlotIndex = clearedIndex;
    syncCounterFromSlots();
    renderAll();
    renderSelectedJson();
    notifyConnectorSlotCleared(connectorSlot);
  }

  // ── RENDER ALL ─────────────────────────────────────────────
  function renderAll() {
    const container = document.getElementById('groups-container');
    destroySlotMaps();
    container.innerHTML = '';
    groups.forEach((g, gi) => container.appendChild(buildGroupCard(g, gi)));
    if (getFilledCount() === 0) container.appendChild(buildEmptyWorkspacePlaceholder());
    updateTotals();
    updateJsonTabs();
    updateTaskTimer();
    updateUndoButton();
    refreshJsonOutputVisibility();
    requestAnimationFrame(initSlotMaps);
  }

  // ── BUILD GROUP CARD ────────────────────────────────────────
  function buildGroupCard(g, gi) {
    const filledCount = g.slots.filter(s => s.data).length;

    const wrap = document.createElement('div');
    wrap.className = 'group-card';
    wrap.id = `group-${g.gid}`;

    // ── Group header
    const head = el('div', 'group-head', `
      <div class="group-logo-row">
        <img class="group-logo partner-logo" src="assets/header-partner-logo.svg" alt="" aria-hidden="true" />
        <span class="group-logo-divider" aria-hidden="true"></span>
        <img class="group-logo mapjson-logo" src="assets/mapjson-logo.jpg" alt="MapJSON" />
      </div>
      <div class="group-head-tools">
        <button class="header-map-cta header-extension-cta" type="button" onclick="App.openChromeInstall()" aria-label="Download MapJSON Connector extension" title="Download Extension">
          <img src="assets/chrome-extension.png" alt="" aria-hidden="true" />
        </button>
        <a class="gmap-open-cta header-map-cta is-disabled" id="gmap-open-cta" href="#" target="_blank" rel="noopener noreferrer" aria-label="Open Map">
          <img src="assets/google-map-pin.png" alt="" aria-hidden="true" />
          Open Map
        </a>
        <span class="connector-status-pill is-offline" id="connector-status-pill" title="Map extension status">
          <i aria-hidden="true"></i>
          <span>Map Extension</span>
        </span>
        <span class="pill timer-pill" id="task-timer">00:00</span>
        <button class="header-play-btn" id="header-play-btn" type="button" onclick="App.toggleFastTutorial()" aria-label="Toggle Fast Tutorial">
          <span aria-hidden="true"></span>
        </button>
      </div>
    `);
    wrap.appendChild(head);

    // ── Slots
    const slotsWrap = el('div', 'group-slots');
    g.slots.forEach((slot, si) => {
      slotsWrap.appendChild(buildSlotCard(g.gid, slot, si));
    });

    wrap.appendChild(slotsWrap);

    // ── Footer: Download JSON
    const footer = el('div', 'group-footer', `
      ${filledCount === g.slots.length && filledCount > 0 ? `
        <div class="campaign-field">
          <label for="campaign-name-${g.gid}">Campaign Name</label>
          <input id="campaign-name-${g.gid}" type="text" placeholder="Enter campaign name" oninput="App.validateCampaignName(${g.gid})" />
        </div>
      ` : ''}
      <div class="footer-actions">
        <button class="folder-btn" id="folder-btn-${g.gid}" onclick="App.chooseDownloadFolder(${g.gid})">
          Choose Folder
        </button>
        <button class="undo-btn footer-undo-btn" id="undo-btn" type="button" onclick="App.undoLastChange()" disabled>Undo</button>
        <button class="undo-btn footer-undo-btn" id="redo-btn" type="button" onclick="App.redoLastChange()" disabled>Redo</button>
        <button class="dl-btn${filledCount === g.slots.length && filledCount > 0 ? ' is-ready' : ' is-hidden'}" id="dl-${g.gid}"
          onclick="App.downloadGroup(${g.gid})"
          ${filledCount !== g.slots.length || !getCampaignName(g.gid) ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download All JSON
        </button>
      </div>
    `);
    wrap.appendChild(footer);

    return wrap;
  }

  function buildEmptyWorkspacePlaceholder() {
    const placeholder = el('div', 'empty-workspace-placeholder', `
      <img src="assets/live-chatbot.svg" alt="" aria-hidden="true" />
    `);
    return placeholder;
  }

  // ── BUILD SLOT CARD ─────────────────────────────────────────
  function buildSlotCard(gid, slot, si) {
    const color  = COLORS[si % COLORS.length];
    const filled = !!slot.data;
    const canRemove = false;
    const name   = filled ? slot.data.label  : `Address ${si + 1}`;
    const sub    = filled
      ? `${slot.data.address}${slot.data.city ? ', ' + slot.data.city : ''}`
      : 'Waiting for extraction';

    const card = document.createElement('div');
    card.className = `slot-card${filled ? ' is-filled ' + color.cls : ''}${si === selectedSlotIndex ? ' is-selected' : ''}`;
    card.id = `slot-${slot.sid}`;

    card.innerHTML = `
      <div class="slot-trigger" onclick="App.selectSlot(${si})">
        <div class="slot-dot">${String(si + 1).padStart(2, '0')}</div>
        <div class="slot-info">
          <div class="slot-name">${esc(name)}</div>
          <div class="slot-sub">${esc(sub)}</div>
        </div>
        ${filled
          ? `<button class="slot-clr-btn" title="Clear slot"
               onclick="event.stopPropagation(); App.clearSlotData(${gid}, ${slot.sid})">×</button>`
          : `<span class="slot-badge empty-badge">Empty</span>
             ${canRemove
               ? `<button class="slot-clr-btn slot-remove-btn" title="Remove this empty address"
                 onclick="event.stopPropagation(); App.removeSlotFromGroup(${gid}, ${slot.sid})">×</button>`
               : ''
             }`
        }
      </div>

      ${filled ? buildSlotPreview(gid, slot, si) : ''}
    `;

    return card;
  }

  function buildSlotPreview(gid, slot, si) {
    const data = slot.data;
    const slotJson = JSON.stringify(renderStoreForSlot(slot), null, 2);
    const map = hasCoords(data)
      ? `<div class="slot-map interactive-map" id="slot-map-${slot.sid}" data-slot-id="${slot.sid}"
          role="application" aria-label="Draggable map pin for ${esc(data.label || data.address || 'address')}"></div>`
      : `<div class="slot-map slot-map-empty">No map preview until lat/long is available.</div>`;

    return `
      <div class="slot-preview">
        <div class="slot-json-editor">
          <pre class="slot-json-highlight" id="slot-json-highlight-${slot.sid}" aria-hidden="true">${highlightJsonText(slotJson)}</pre>
          <textarea class="slot-json-box" spellcheck="false"
            aria-label="Edit Address ${si + 1} JSON"
            oninput="App.handleSlotJsonEdit(${si}, this)"
            onblur="App.refreshAfterSlotJsonEdit(${si}, this)"
            onscroll="App.syncSlotJsonScroll(${slot.sid}, this)">${escJson(slotJson)}</textarea>
          <div class="hint slot-json-hint" id="slot-json-hint-${slot.sid}" aria-live="polite"></div>
        </div>
        ${map}
      </div>
    `;
  }

  function hasCoords(data) {
    return Number.isFinite(Number(data.lat)) && Number.isFinite(Number(data.long));
  }

  function initSlotMaps() {
    document.querySelectorAll('.interactive-map').forEach(mapEl => {
      const sid = Number(mapEl.dataset.slotId);
      if (slotMaps.has(sid)) return;
      const slotInfo = findSlotBySid(sid);
      const data = slotInfo?.slot?.data;
      if (!data || !hasCoords(data)) return;
      const cleanup = renderDraggablePinMap(mapEl, sid, Number(data.lat), Number(data.long));
      slotMaps.set(sid, { cleanup });
    });
  }

  function destroySlotMaps() {
    reverseTimers.forEach(timer => clearTimeout(timer));
    reverseTimers.clear();
    slotMaps.forEach(({ cleanup }) => cleanup?.());
    slotMaps.clear();
  }

  function renderDraggablePinMap(mapEl, sid, lat, long, options = {}) {
    const previewOnly = !!options.previewOnly;
    const showPin = options.showPin !== false;
    let zoom = options.zoom || 16;
    let centerLat = lat;
    let centerLong = long;
    let markerLat = lat;
    let markerLong = long;
    const size = 256;
    const rect = mapEl.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || mapEl.clientWidth || 640));
    const height = Math.max(240, Math.round(rect.height || mapEl.clientHeight || 260));

    mapEl.innerHTML = `
      <div class="map-tiles"></div>
      ${showPin ? '<button type="button" class="map-pin" aria-label="Drag map pin"></button>' : ''}
      <div class="map-zoom-controls" aria-label="Map zoom controls">
        <button type="button" class="map-zoom-btn" data-zoom="in" aria-label="Zoom in">+</button>
        <button type="button" class="map-zoom-btn" data-zoom="out" aria-label="Zoom out">−</button>
      </div>
      <div class="map-attribution">© OpenStreetMap contributors</div>
    `;

    const tilesLayer = mapEl.querySelector('.map-tiles');
    const marker = mapEl.querySelector('.map-pin');
    let startX = 0;
    let startY = 0;
    let currentDx = 0;
    let currentDy = 0;
    let dragStartDx = 0;
    let dragStartDy = 0;
    let dragging = false;
    let panning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartCenter = null;
    let panMoved = false;
    let lastMapFillAt = 0;

    const positionMarker = () => {
      if (!marker) return;
      const center = latLngToWorld(centerLat, centerLong, zoom);
      const markerPoint = latLngToWorld(markerLat, markerLong, zoom);
      currentDx = markerPoint.x - center.x;
      currentDy = markerPoint.y - center.y;
      marker.style.transform = `translate(calc(-50% + ${currentDx}px), calc(-100% + ${currentDy}px)) rotate(-45deg)`;
    };

    const renderTiles = () => {
      const center = latLngToWorld(centerLat, centerLong, zoom);
      const tileStartX = Math.floor((center.x - width / 2) / size) - 1;
      const tileEndX = Math.floor((center.x + width / 2) / size) + 1;
      const tileStartY = Math.floor((center.y - height / 2) / size) - 1;
      const tileEndY = Math.floor((center.y + height / 2) / size) + 1;
      const maxTile = 2 ** zoom;
      const tiles = [];

      for (let x = tileStartX; x <= tileEndX; x++) {
        for (let y = tileStartY; y <= tileEndY; y++) {
          if (y < 0 || y >= maxTile) continue;
          const wrappedX = ((x % maxTile) + maxTile) % maxTile;
          tiles.push(`<img class="map-tile" src="https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png" alt="" style="left:${Math.round(x * size - center.x + width / 2)}px;top:${Math.round(y * size - center.y + height / 2)}px">`);
        }
      }

      tilesLayer.innerHTML = tiles.join('');
      positionMarker();
    };

    const setZoom = nextZoom => {
      zoom = Math.max(3, Math.min(19, nextZoom));
      renderTiles();
    };

    const moveMarker = (dx, dy) => {
      if (!marker) return;
      currentDx = dx;
      currentDy = dy;
      marker.style.transform = `translate(calc(-50% + ${dx}px), calc(-100% + ${dy}px)) rotate(-45deg)`;
      const center = latLngToWorld(centerLat, centerLong, zoom);
      const point = worldToLatLng(center.x + dx, center.y + dy, zoom);
      if (previewOnly) {
        updateLatLongFinderPreviewPin(point.lat, point.long, false);
      } else {
        updateSlotFromMapDrag(sid, point.lat, point.long, false);
      }
    };

    const moveMarkerToPoint = (clientX, clientY, commit) => {
      if (!marker) return;
      const mapRect = mapEl.getBoundingClientRect();
      const dx = clientX - mapRect.left - mapRect.width / 2;
      const dy = clientY - mapRect.top - mapRect.height / 2;
      moveMarker(dx, dy);
      const center = latLngToWorld(centerLat, centerLong, zoom);
      const point = worldToLatLng(center.x + dx, center.y + dy, zoom);
      markerLat = point.lat;
      markerLong = point.long;
      positionMarker();
      if (commit) {
        if (previewOnly) {
          updateLatLongFinderPreviewPin(point.lat, point.long, true);
        } else {
          updateSlotFromMapDrag(sid, point.lat, point.long, true);
        }
      }
    };

    const pointFromClient = (clientX, clientY) => {
      const mapRect = mapEl.getBoundingClientRect();
      const dx = clientX - mapRect.left - mapRect.width / 2;
      const dy = clientY - mapRect.top - mapRect.height / 2;
      const center = latLngToWorld(centerLat, centerLong, zoom);
      return worldToLatLng(center.x + dx, center.y + dy, zoom);
    };

    const fillGoogleMapsUrlFromMapClick = (clientX, clientY) => {
      if (previewOnly) return;
      const point = pointFromClient(clientX, clientY);
      const input = document.getElementById('url-lookup-input');
      if (!input) return;
      input.value = `https://www.google.com/maps?q=${point.lat.toFixed(6)},${point.long.toFixed(6)}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      validateLookupInputs();
      setHint('url-lookup-hint', 'Map click added this location URL. Press Extract & Build Entry.', 'ok');
      lastMapFillAt = Date.now();
    };

    const onMarkerPointerMove = event => {
      if (!dragging) return;
      moveMarker(
        dragStartDx + (event.clientX - startX),
        dragStartDy + (event.clientY - startY)
      );
    };

    const onPointerUp = event => {
      if (!dragging) return;
      dragging = false;
      marker.classList.remove('dragging');
      marker.releasePointerCapture?.(event.pointerId);
      const center = latLngToWorld(centerLat, centerLong, zoom);
      const point = worldToLatLng(center.x + currentDx, center.y + currentDy, zoom);
      markerLat = point.lat;
      markerLong = point.long;
      positionMarker();
      if (previewOnly) {
        updateLatLongFinderPreviewPin(point.lat, point.long, true);
      } else {
        updateSlotFromMapDrag(sid, point.lat, point.long, true);
      }
    };

    const onMapPointerMove = event => {
      if (!panning) return;
      if (Math.hypot(event.clientX - panStartX, event.clientY - panStartY) > 6) panMoved = true;
      const nextCenter = worldToLatLng(
        panStartCenter.x - (event.clientX - panStartX),
        panStartCenter.y - (event.clientY - panStartY),
        zoom
      );
      centerLat = nextCenter.lat;
      centerLong = nextCenter.long;
      renderTiles();
    };

    const onMapPointerUp = event => {
      if (!panning) return;
      const wasClick = !panMoved && !event.target.closest('.map-zoom-controls');
      panning = false;
      mapEl.classList.remove('panning');
      mapEl.releasePointerCapture?.(event.pointerId);
      if (wasClick) fillGoogleMapsUrlFromMapClick(event.clientX, event.clientY);
    };

    if (marker) {
      marker.addEventListener('pointerdown', event => {
        event.preventDefault();
        event.stopPropagation();
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        dragStartDx = currentDx;
        dragStartDy = currentDy;
        marker.classList.add('dragging');
        marker.setPointerCapture?.(event.pointerId);
        if (!previewOnly) pushUndoState();
      });
      marker.addEventListener('pointermove', onMarkerPointerMove);
      marker.addEventListener('pointerup', onPointerUp);
      marker.addEventListener('pointercancel', onPointerUp);
    }
    const onMapPointerDown = event => {
      if (event.target.closest('.map-zoom-controls')) return;
      event.preventDefault();
      panning = true;
      panStartX = event.clientX;
      panStartY = event.clientY;
      panStartCenter = latLngToWorld(centerLat, centerLong, zoom);
      panMoved = false;
      mapEl.classList.add('panning');
      mapEl.setPointerCapture?.(event.pointerId);
    };
    const onMapDoubleClick = event => {
      if (event.target.closest('.map-zoom-controls')) return;
      event.preventDefault();
      if (!previewOnly) pushUndoState();
      moveMarkerToPoint(event.clientX, event.clientY, true);
    };
    const onMapClick = event => {
      if (event.target.closest('.map-zoom-controls') || event.target.closest('.map-pin')) return;
      if (panMoved || Date.now() - lastMapFillAt < 250) return;
      fillGoogleMapsUrlFromMapClick(event.clientX, event.clientY);
    };
    mapEl.addEventListener('pointerdown', onMapPointerDown);
    mapEl.addEventListener('click', onMapClick);
    mapEl.addEventListener('dblclick', onMapDoubleClick);
    mapEl.addEventListener('pointermove', onMapPointerMove);
    mapEl.addEventListener('pointerup', onMapPointerUp);
    mapEl.addEventListener('pointercancel', onMapPointerUp);
    mapEl.querySelectorAll('.map-zoom-btn').forEach(button => {
      button.addEventListener('click', () => {
        setZoom(zoom + (button.dataset.zoom === 'in' ? 1 : -1));
      });
    });

    const onWheel = event => {
      event.preventDefault();
      setZoom(zoom + (event.deltaY < 0 ? 1 : -1));
    };
    mapEl.addEventListener('wheel', onWheel, { passive: false });

    renderTiles();

    return () => {
      if (marker) {
        marker.removeEventListener('pointermove', onMarkerPointerMove);
        marker.removeEventListener('pointerup', onPointerUp);
        marker.removeEventListener('pointercancel', onPointerUp);
      }
      mapEl.removeEventListener('pointerdown', onMapPointerDown);
      mapEl.removeEventListener('click', onMapClick);
      mapEl.removeEventListener('dblclick', onMapDoubleClick);
      mapEl.removeEventListener('pointermove', onMapPointerMove);
      mapEl.removeEventListener('pointerup', onMapPointerUp);
      mapEl.removeEventListener('pointercancel', onMapPointerUp);
      mapEl.removeEventListener('wheel', onWheel);
      mapEl.innerHTML = '';
    };
  }

  function latLngToWorld(lat, long, zoom) {
    const scale = 256 * (2 ** zoom);
    const sinLat = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180);
    return {
      x: ((long + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
    };
  }

  function worldToLatLng(x, y, zoom) {
    const scale = 256 * (2 ** zoom);
    const long = (x / scale) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / scale;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, long };
  }

  function findSlotBySid(sid) {
    for (const group of groups) {
      const slot = group.slots.find(item => item.sid === sid);
      if (slot) return { group, slot, index: group.slots.indexOf(slot) };
    }
    return null;
  }

  function updateSlotFromMapDrag(sid, lat, long, shouldReverseGeocode) {
    const slotInfo = findSlotBySid(sid);
    if (!slotInfo?.slot?.data) return;
    const nextLat = Number(lat.toFixed(7));
    const nextLong = Number(long.toFixed(7));
    slotInfo.slot.data.lat = nextLat;
    slotInfo.slot.data.long = nextLong;
    selectedSlotIndex = slotInfo.index;
    updateGroupJsonFromSlots(slotInfo.group);
    storageSave();
    renderSelectedJson();

    if (!shouldReverseGeocode) return;
    // Pin was just dropped: sync the Map Preview immediately instead of
    // waiting for the debounced update, so it never shows a stale spot.
    clearTimeout(gmapEmbedTimer);
    updateGmapEmbed();
    setHint('json-edit-hint', `Pin moved. Updating Address ${slotInfo.index + 1} from map...`, 'load');
    const existingTimer = reverseTimers.get(sid);
    if (existingTimer) clearTimeout(existingTimer);
    reverseTimers.set(sid, setTimeout(() => reverseGeocodeDraggedPin(sid, nextLat, nextLong), 250));
  }

  async function reverseGeocodeDraggedPin(sid, lat, long) {
    const slotInfo = findSlotBySid(sid);
    if (!slotInfo?.slot?.data) return;
    try {
      const details = await fetchAddressDetails({ lat, long });
      if (!isSlotStillAtCoords(slotInfo.slot, lat, long)) return;
      applyReverseGeocodeDetailsToSlot(slotInfo.slot, details);
      updateGroupJsonFromSlots(slotInfo.group);
      storageSave();
      renderAll();
      selectSlot(slotInfo.index, { scroll: false });
      clearTimeout(gmapEmbedTimer);
      updateGmapEmbed();
      setHint('json-edit-hint', `Pin moved. Address ${slotInfo.index + 1} updated from map.`, 'ok');
    } catch (e) {
      if (isSlotStillAtCoords(slotInfo.slot, lat, long)) {
        renderAll();
        selectSlot(slotInfo.index, { scroll: false });
        clearTimeout(gmapEmbedTimer);
        updateGmapEmbed();
      }
      setHint('json-edit-hint', 'Pin moved, but address lookup failed. Lat/long were updated.', 'er');
    }
  }

  function isSlotStillAtCoords(slot, lat, long) {
    if (!slot?.data) return false;
    return Number(slot.data.lat).toFixed(7) === Number(lat).toFixed(7)
      && Number(slot.data.long).toFixed(7) === Number(long).toFixed(7);
  }

  function applyReverseGeocodeDetailsToSlot(slot, details = {}) {
    if (!slot?.data) return;
    const next = {
      label: details.label || '',
      address: details.address || '',
      city: details.city || '',
      state: details.state || '',
      zip: details.zip || '',
    };
    const hasResolvedAddress = Object.values(next).some(value => String(value || '').trim());
    if (!hasResolvedAddress) return;
    Object.assign(slot.data, next);
  }

  function formatCoord(value) {
    return Number(value).toFixed(6);
  }

  function mapEmbedUrl(lat, long) {
    const latNum = Number(lat);
    const longNum = Number(long);
    const delta = 0.006;
    const bbox = [
      longNum - delta,
      latNum - delta,
      longNum + delta,
      latNum + delta,
    ].join(',');

    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latNum},${longNum}`;
  }

  // ── SLOT INTERACTIONS ───────────────────────────────────────
  function toggleSlot(sid) {
    const card = document.getElementById(`slot-${sid}`);
    if (card) card.classList.toggle('open');
  }

  function switchSlotTab(sid, tab, btn) {
    btn.closest('.tabs-mini').querySelectorAll('.tmb').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById(`tc-p-${sid}`).classList.toggle('on', tab === 'paste');
    document.getElementById(`tc-m-${sid}`).classList.toggle('on', tab === 'manual');
  }

  function parsePaste(sid) {
    const url = val(`url-${sid}`);
    const raw = val(`raw-${sid}`);
    if (url) {
      const c = extractCoords(url);
      setHint(`ch-${sid}`,
        c ? `✓ lat ${c.lat}, long ${c.long}` : '✗ Could not extract coords from URL.',
        c ? 'ok' : 'er');
    }
    if (raw) {
      const p = parseAddr(raw);
      setHint(`ah-${sid}`,
        p ? `✓ "${p.label}" · ${p.city}, ${p.state} ${p.zip}` : '✗ Format: Name / Street / City, ST ZIP',
        p ? 'ok' : 'er');
    }
  }

  // ── SAVE SLOT ───────────────────────────────────────────────
  function saveSlot(gid, sid) {
    const g    = groups.find(g => g.gid === gid);
    if (!g) return;
    const slot = g.slots.find(s => s.sid === sid);
    if (!slot) return;

    const isPaste = document.getElementById(`tc-p-${sid}`)?.classList.contains('on');
    let data;

    if (isPaste) {
      const url    = val(`url-${sid}`);
      const raw    = val(`raw-${sid}`);
      const cta    = getCtaValue(val(`pcta-${sid}`));
      const coords = extractCoords(url);
      const addr   = parseAddr(raw);
      data = makeStoreEntry({
        id:      padId(globalIdCounter),
        label:   addr ? addr.label   : '',
        address: addr ? addr.address : '',
        city:    addr ? addr.city    : '',
        state:   addr ? addr.state   : '',
        zip:     addr ? addr.zip     : '',
        cta,
        lat:  coords ? coords.lat  : null,
        long: coords ? coords.long : null,
      });
    } else {
      data = makeStoreEntry({
        id:      padId(globalIdCounter),
        label:   val(`ml-${sid}`),
        address: val(`ma-${sid}`),
        city:    val(`mc-${sid}`),
        state:   val(`ms-${sid}`).toUpperCase(),
        zip:     val(`mz-${sid}`),
        cta:     getCtaValue(val(`mcta-${sid}`)),
        lat:     parseFloat(val(`mlat-${sid}`)) || null,
        long:    parseFloat(val(`mlng-${sid}`)) || null,
      });
    }

    // Validate — at minimum need a label or address
    if (!data.label && !data.address) {
      alert('Please fill in at least the business name or address before saving.');
      return;
    }

    slot.data = data;
    slot.hiddenFields = [];
    g.generatedJSON = null;
    globalIdCounter++;

    // Persist to localStorage immediately
    storageSave();

    renderAll();

    // Collapse the saved slot
    const card = document.getElementById(`slot-${sid}`);
    if (card) card.classList.remove('open');

    // Flash storage pill
    updateStoragePill('Saved ✓');
  }

  // ── GEOCODE (inline in Manual tab) ─────────────────────────
  async function geocodeSlot(sid) {
    const label   = val(`ml-${sid}`);
    const address = val(`ma-${sid}`);
    const city    = val(`mc-${sid}`);
    const state   = val(`ms-${sid}`);
    const query   = [label || address, city, state].filter(Boolean).join(', ');

    if (!query.trim()) {
      setHint(`geo-h-${sid}`, 'Fill in the name/address fields first.', 'er');
      return;
    }

    const btn = document.getElementById(`geobtn-${sid}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Fetching…'; }
    setHint(`geo-h-${sid}`, 'Contacting OpenStreetMap Nominatim…', 'load');

    try {
      const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();

      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat).toFixed(7);
        const lng = parseFloat(data[0].lon).toFixed(7);
        document.getElementById(`mlat-${sid}`).value = lat;
        document.getElementById(`mlng-${sid}`).value = lng;
        setHint(`geo-h-${sid}`, `✓ Filled: ${lat}, ${lng}`, 'ok');
      } else {
        setHint(`geo-h-${sid}`, '✗ No results. Try a more specific address.', 'er');
      }
    } catch (e) {
      setHint(`geo-h-${sid}`, '✗ Request failed. Check your connection.', 'er');
    }

    if (btn) { btn.disabled = false; btn.textContent = '📍 Auto-fetch Lat/Long from Address'; }
  }

  // ── URL → FULL ENTRY LOOKUP ────────────────────────────────
  async function lookupFromUrl() {
    const rawUrl = val('url-lookup-input').trim();
    const cta    = getCtaValue();
    if (!rawUrl) { setHint('url-lookup-hint', 'Please paste a Google Maps URL first.', 'er'); return; }
    if (!isValidUrl(cta)) {
      setHint('url-lookup-hint', 'Enter a valid CTA URL before extracting.', 'er');
      validateLookupInputs();
      return;
    }
    const connectorSlotIndex = forcedUrlTargetSlotIndex;
    const target = connectorSlotIndex === null
      ? findNextEmptySlot()
      : getSlotTargetByIndex(connectorSlotIndex);
    forcedUrlTargetSlotIndex = null;
    if (!target) {
      setHint('url-lookup-hint', 'All three slots are full. Clear a slot before adding another address.', 'er');
      return;
    }
    if (target.slot?.data) {
      setHint('url-lookup-hint', `Address ${target.index + 1} already has data. Clear it before sending a new map URL.`, 'er');
      return;
    }

    const btn = document.getElementById('url-lookup-btn');
    btn.disabled = true;
    btn.textContent = 'Working...';
    setLookupLoading(true, 'Extracting map data...');
    setHint('url-lookup-hint', 'Parsing URL...', 'load');
    urlEditOpen = false;

    // ── Step 1: extract coords + place name from URL ──────────
    const coords = extractCoords(rawUrl);
    if (!coords) {
      setHint('url-lookup-hint', '✗ Could not find coordinates in this URL. Make sure it is a full Google Maps place URL (contains @lat,lng).', 'er');
      setLookupLoading(false);
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Extract &amp; Build Entry`;
      return;
    }
    const duplicate = findDuplicateLocation(rawUrl, coords);
    if (duplicate) {
      const duplicateName = duplicate.label || `Address ${duplicate.slotIndex + 1}`;
      alert(`This location is already added in Address ${duplicate.slotIndex + 1}: ${duplicateName}`);
      setHint('url-lookup-hint', `Duplicate blocked. Address ${duplicate.slotIndex + 1} already has this location.`, 'er');
      setLookupLoading(false);
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Extract &amp; Build Entry`;
      return;
    }
    startTaskTimer();
    setLookupLoading(true, 'Reading coordinates...');

    // Extract place name from URL path e.g. /place/AMC+The+Americana+at+Brand+18/
    let label = '';
    const placeMatch = rawUrl.match(/\/place\/([^/@]+)/);
    if (placeMatch) {
      label = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      // Clean up any trailing noise
      label = label.replace(/\s*\(.*?\)\s*/g, '').trim();
    }

    setLookupLoading(true, 'Resolving address details...');
    setHint('url-lookup-hint', `✓ Coords found (${coords.lat}, ${coords.long}). Reverse-geocoding address...`, 'load');

    // ── Step 2: reverse geocode with Nominatim ────────────────
    let address = '', city = '', state = '', zip = '';
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.long}&format=json&addressdetails=1`;
      const res  = await fetch(nominatimUrl, { headers: { 'Accept-Language': 'en', 'User-Agent': 'MapJSONGenerator/1.0' } });
      const data = await res.json();

      if (data && data.address) {
        const details = formatNominatimDetails(data);
        address = details.address;
        city    = details.city;
        state   = details.state;
        zip     = details.zip;
        setHint('url-lookup-hint', `✓ Address resolved. Filling next empty slot...`, 'ok');
      } else {
        setHint('url-lookup-hint', 'Coordinates found, but address lookup returned no results. Filling available fields...', 'load');
      }
    } catch (e) {
      setHint('url-lookup-hint', 'Coordinates found, but reverse geocoding failed. Filling available fields...', 'load');
    }

    // ── Step 3: build result object ───────────────────────────
    urlLookupResult = makeStoreEntry({
      id:      padId(globalIdCounter),
      label,
      address,
      city,
      state,
      zip,
      cta,
      lat:  coords.lat,
      long: coords.long,
    });
    urlLookupResult._mapUrl = rawUrl;
    if (connectorSlotIndex !== null) {
      urlLookupResult._connectorSlot = connectorSlotIndex + 1;
    }

    setLookupLoading(true, 'Filling next empty slot...');
    fillNextEmptySlot(urlLookupResult, target, {
      reset: () => resetUrlLookup('✓ Added to Address ' + (selectedSlotIndex + 1) + '. JSON generated below.'),
    });
    setLookupLoading(false);
    btn.disabled = false;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Extract &amp; Build Entry`;
  }

  // ── ADDRESS → FULL ENTRY LOOKUP ────────────────────────────
  async function lookupFromAddress() {
    pulseAddressBetaNote();
    const rawAddress = val('address-lookup-input').trim();
    const manual = parseManualAddressInput(rawAddress);
    const cta = getCtaValue();
    if (!rawAddress) { setHint('address-lookup-hint', 'Enter an address first.', 'er'); return; }
    if (!isValidUrl(cta)) {
      setHint('address-lookup-hint', 'Enter a valid CTA URL before searching.', 'er');
      validateLookupInputs();
      return;
    }

    const target = findNextEmptySlot();
    if (!target) {
      setHint('address-lookup-hint', 'All three slots are full. Clear a slot before adding another address.', 'er');
      return;
    }

    const btn = document.getElementById('address-lookup-btn');
    btn.disabled = true;
    btn.textContent = 'Working...';
    setLookupLoadingById('address-lookup-loading', 'address-lookup-loading-text', true, 'Searching address details...');
    setHint('address-lookup-hint', 'Contacting OpenStreetMap Nominatim...', 'load');

    try {
      const results = await searchManualAddress(manual);

      if (!Array.isArray(results) || !results.length) {
        setHint('address-lookup-hint', 'No results. Try adding city, state, ZIP, or a more specific location name.', 'er');
        return;
      }

      const result = results[0];
      const coords = {
        lat: Number(parseFloat(result.lat).toFixed(7)),
        long: Number(parseFloat(result.lon).toFixed(7)),
      };
      setLookupLoadingById('address-lookup-loading', 'address-lookup-loading-text', true, 'Resolving full address...');

      const details = await fetchAddressDetails(coords, result);
      const entry = makeStoreEntry({
        id: padId(globalIdCounter),
        label: manual.label || details.label || '',
        address: details.address || manual.address || rawAddress,
        city: details.city || manual.city || '',
        state: details.state || manual.state || '',
        zip: details.zip || manual.zip || '',
        cta,
        lat: coords.lat,
        long: coords.long,
      });

      setHint('address-lookup-hint', 'Address resolved. Filling next empty slot...', 'ok');
      fillNextEmptySlot(entry, target, {
        reset: () => resetAddressLookup('✓ Added to Address ' + (selectedSlotIndex + 1) + '. JSON generated below.'),
        fullHintId: 'address-lookup-hint',
      });
    } catch (e) {
      setHint('address-lookup-hint', 'Request failed. Check your connection and try again.', 'er');
    } finally {
      setLookupLoadingById('address-lookup-loading', 'address-lookup-loading-text', false);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> Search &amp; Build Entry`;
      }
      validateLookupInputs();
    }
  }

  function setLookupLoading(active, message) {
    setLookupLoadingById('lookup-loading', 'lookup-loading-text', active, message);
  }

  async function searchManualAddress(manual) {
    const queries = [manual.labelQuery, manual.query, manual.addressQuery].filter(Boolean);
    const uniqueQueries = [...new Set(queries)];
    const candidates = [];
    const structuredUrl = buildStructuredNominatimUrl(manual);
    if (structuredUrl) {
      try {
        const structuredRes = await fetch(structuredUrl, { headers: { 'Accept-Language': 'en', 'User-Agent': 'MapJSONGenerator/1.0' } });
        const structuredResults = await structuredRes.json();
        if (Array.isArray(structuredResults)) {
          structuredResults.forEach(result => candidates.push({ ...result, _query: 'structured' }));
        }
      } catch (e) { /* keep trying other providers */ }
    }

    for (const query of uniqueQueries) {
      try {
        const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=8`;
        const searchRes = await fetch(searchUrl, { headers: { 'Accept-Language': 'en', 'User-Agent': 'MapJSONGenerator/1.0' } });
        const results = await searchRes.json();
        if (Array.isArray(results)) {
          results.forEach(result => candidates.push({ ...result, _query: query }));
        }
      } catch (e) { /* keep trying Photon */ }

      try {
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en`;
        const photonRes = await fetch(photonUrl, { headers: { 'Accept-Language': 'en' } });
        const photonData = await photonRes.json();
        if (Array.isArray(photonData?.features)) {
          photonData.features.map(feature => normalizePhotonFeature(feature, query)).forEach(result => candidates.push(result));
        }
      } catch (e) { /* provider unavailable */ }
    }
    return dedupeAndRankCandidates(candidates, manual);
  }

  function buildStructuredNominatimUrl(manual) {
    if (!manual.address && !manual.city && !manual.state && !manual.zip) return '';
    const params = new URLSearchParams({
      format: 'json',
      addressdetails: '1',
      limit: '8',
    });
    if (manual.address) params.set('street', manual.address);
    if (manual.city) params.set('city', manual.city);
    if (manual.state) params.set('state', manual.state);
    if (manual.zip) params.set('postalcode', manual.zip);
    if (manual.region) params.set('country', manual.region);
    return `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  }

  function normalizePhotonFeature(feature, query) {
    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates || [];
    const street = [props.housenumber, props.street].filter(Boolean).join(' ');
    const display = [props.name, street, props.city, props.state, props.postcode, props.country].filter(Boolean).join(', ');
    return {
      lat: coords[1],
      lon: coords[0],
      name: props.name || '',
      display_name: display,
      class: props.osm_key || '',
      type: props.osm_value || '',
      osm_type: 'photon',
      osm_id: props.osm_id || display,
      address: {
        house_number: props.housenumber || '',
        road: props.street || '',
        city: props.city || props.locality || props.county || '',
        town: props.city || '',
        state: props.state || '',
        postcode: props.postcode || '',
        country: props.country || '',
        country_code: props.countrycode || '',
      },
      _query: query,
      _provider: 'photon',
    };
  }

  function dedupeAndRankCandidates(candidates, manual) {
    const seen = new Set();
    return candidates
      .filter(candidate => {
        const key = `${candidate.osm_type || ''}:${candidate.osm_id || ''}:${candidate.lat || ''}:${candidate.lon || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(candidate => ({ ...candidate, _score: scoreAddressCandidate(candidate, manual) }))
      .sort((a, b) => b._score - a._score);
  }

  function scoreAddressCandidate(candidate, manual) {
    const a = candidate.address || {};
    const haystack = normalizeText([
      candidate.name,
      candidate.display_name,
      a.road,
      a.city,
      a.town,
      a.village,
      a.state,
      a.postcode,
    ].filter(Boolean).join(' '));
    const label = normalizeText(manual.label);
    const road = normalizeRoadText(manual.road);
    const city = normalizeText(manual.city);
    const state = normalizeText(manual.state);
    const zip = normalizeText(manual.zip);
    const classType = `${candidate.class || ''} ${candidate.type || ''}`;

    let score = 0;
    if (label && haystack.includes(label)) score += 95;
    if (label && words(label).filter(word => haystack.includes(word)).length >= Math.min(2, words(label).length)) score += 32;
    if (road && normalizeRoadText(a.road || '').includes(road)) score += 34;
    if (city && normalizeText(a.city || a.town || a.village || '').includes(city)) score += 24;
    if (state && stateMatches(a.state || '', state, a.country_code)) score += 18;
    if (zip && normalizeText(a.postcode || '').startsWith(zip)) score += 18;
    if (/(leisure|park|playground|amenity)/i.test(classType)) score += 16;
    if (/(mall|retail|commercial|shop|building)/i.test(classType) && /centre|center|mall/i.test(manual.label)) score += 12;
    if (candidate._query === manual.labelQuery) score += 12;
    if (road && a.road && !normalizeRoadText(a.road).includes(road) && !label) score -= 20;
    return score;
  }

  function stateMatches(candidateState, manualState, countryCode) {
    const candidate = normalizeText(candidateState);
    const candidateAbbr = normalizeText(abbreviateState(candidateState || '', countryCode));
    const manual = normalizeText(manualState);
    return !!manual && (candidate.includes(manual) || candidateAbbr.includes(manual) || manual.includes(candidate));
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function normalizeRoadText(value) {
    return normalizeText(value)
      .replace(/\bstreet\b/g, 'st')
      .replace(/\bavenue\b/g, 'ave')
      .replace(/\broad\b/g, 'rd')
      .replace(/\bdrive\b/g, 'dr')
      .replace(/\blane\b/g, 'ln');
  }

  function words(value) {
    return normalizeText(value).split(' ').filter(word => word.length > 2);
  }

  function setLookupLoadingById(boxId, textId, active, message) {
    const text = document.getElementById(textId);
    const targetBox = document.getElementById(boxId);
    if (!targetBox) return;
    targetBox.classList.toggle('show', !!active);
    if (text && message) text.textContent = message;
  }

  function renderUrlPreview(entry) {
    const card = document.getElementById('url-preview-card');
    const fields = document.getElementById('url-preview-fields');
    if (!card || !fields) return;
    const rows = [
      { k: 'id',      v: entry.id },
      { k: 'label',   v: entry.label },
      { k: 'address', v: entry.address },
      { k: 'city',    v: entry.city },
      { k: 'state',   v: entry.state },
      { k: 'zip',     v: entry.zip },
      ...(entry.country ? [{ k: 'country', v: entry.country }] : []),
      ...(entry.phone ? [{ k: 'phone', v: entry.phone }] : []),
      { k: 'cta',     v: entry.cta },
      { k: 'lat',     v: entry.lat,  coords: true },
      { k: 'long',    v: entry.long, coords: true },
    ];
    fields.innerHTML = rows.map(r => {
      const empty = r.v === '' || r.v === null || r.v === undefined;
      const cls   = empty ? 'pf-val empty' : (r.coords ? 'pf-val coords' : 'pf-val');
      const disp  = empty ? '(empty)' : esc(String(r.v));
      return `<div class="pf-row"><span class="pf-key">${r.k}</span><span class="${cls}">${disp}</span></div>`;
    }).join('');
    card.style.display = 'block';
  }

  function toggleUrlEdit() {
    urlEditOpen = !urlEditOpen;
    const form = document.getElementById('url-edit-form');
    const btn  = document.getElementById('url-edit-toggle');
    if (!form || !btn) return;
    form.style.display = urlEditOpen ? 'block' : 'none';
    btn.textContent    = urlEditOpen ? '✕ Close Edit' : '✏️ Edit Fields';
    if (urlEditOpen && urlLookupResult) {
      // Pre-fill edit fields
      document.getElementById('ue-label').value   = urlLookupResult.label   || '';
      document.getElementById('ue-address').value = urlLookupResult.address || '';
      document.getElementById('ue-city').value    = urlLookupResult.city    || '';
      document.getElementById('ue-state').value   = urlLookupResult.state   || '';
      document.getElementById('ue-zip').value     = urlLookupResult.zip     || '';
      document.getElementById('ue-lat').value     = urlLookupResult.lat     || '';
      document.getElementById('ue-long').value    = urlLookupResult.long    || '';
    }
  }

  function applyUrlEdits() {
    if (!urlLookupResult) return;
    urlLookupResult.label   = val('ue-label');
    urlLookupResult.address = val('ue-address');
    urlLookupResult.city    = val('ue-city');
    urlLookupResult.state   = val('ue-state').toUpperCase();
    urlLookupResult.zip     = val('ue-zip');
    urlLookupResult.lat     = parseFloat(val('ue-lat'))  || urlLookupResult.lat;
    urlLookupResult.long    = parseFloat(val('ue-long')) || urlLookupResult.long;
    renderUrlPreview(urlLookupResult);
    toggleUrlEdit(); // close edit form
    setHint('url-lookup-hint', '✓ Fields updated.', 'ok');
  }

  function saveUrlEntryDirect() {
    if (!urlLookupResult) return;
    const entry = { ...urlLookupResult };
    allSaved.unshift(entry);
    globalIdCounter++;
    storageSave();
    renderHistory();
    updateTotals();
    // Show in JSON output
    latestJSON = JSON.stringify(entry, null, 2);
    showLatestJSON(entry);
    // Reset for next entry
    urlLookupResult = null;
    const previewCard = document.getElementById('url-preview-card');
    const editForm = document.getElementById('url-edit-form');
    if (previewCard) previewCard.style.display = 'none';
    if (editForm) editForm.style.display = 'none';
    document.getElementById('url-lookup-input').value = '';
    document.getElementById('url-lookup-cta').value   = '';
    setHint('url-lookup-hint', '✓ Entry saved! Paste another URL to continue.', 'ok');
  }

  function addUrlEntryToSlot() {
    if (!urlLookupResult) return;
    // Find the first empty slot across all groups
    for (const g of groups) {
      for (const s of g.slots) {
        if (!s.data) {
          s.data = { ...urlLookupResult };
          g.generatedJSON = null;
          globalIdCounter++;
          storageSave();
          renderAll();
          resetUrlLookup('✓ Added to slot in Group ' + (groups.indexOf(g) + 1) + '. Paste another URL to continue.');
          // Scroll to it
          setTimeout(() => {
            const el = document.getElementById(`slot-${s.sid}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 80);
          return;
        }
      }
    }
    setHint('url-lookup-hint', 'All three slots are full. Clear a slot before adding another address.', 'er');
  }

  function resetUrlLookup(message) {
    urlLookupResult = null;
    urlEditOpen = false;
    const previewCard = document.getElementById('url-preview-card');
    const editForm = document.getElementById('url-edit-form');
    if (previewCard) previewCard.style.display = 'none';
    if (editForm) editForm.style.display = 'none';
    document.getElementById('url-lookup-input').value = '';
    if (!document.getElementById('global-cta-enabled')?.checked) {
      document.getElementById('url-lookup-cta').value = '';
    }
    validateLookupInputs();
    if (message) setHint('url-lookup-hint', message, 'ok');
  }

  function resetAddressLookup(message) {
    document.getElementById('address-lookup-input').value = '';
    validateLookupInputs();
    if (message) setHint('address-lookup-hint', message, 'ok');
  }

  function findNextEmptySlot() {
    for (const g of groups) {
      for (const s of g.slots) {
        if (!s.data) return { group: g, slot: s };
      }
    }
    return null;
  }

  function getSlotTargetByIndex(index) {
    const group = groups[0];
    if (!group) return null;
    const safeIndex = Math.max(0, Math.min(group.slots.length - 1, Number(index) || 0));
    const slot = group.slots[safeIndex];
    return slot ? { group, slot, index: safeIndex } : null;
  }

  function getSelectedSlot() {
    const group = groups[0];
    if (!group) return null;
    return group.slots[selectedSlotIndex] || null;
  }

  function selectSlot(index, options = {}) {
    const group = groups[0];
    if (!group) return;
    selectedSlotIndex = Math.max(0, Math.min(group.slots.length - 1, Number(index) || 0));
    updateJsonTabs();
    renderSelectedJson();
    document.querySelectorAll('.slot-card').forEach((card, cardIndex) => {
      card.classList.toggle('is-selected', cardIndex === selectedSlotIndex);
    });
    if (options.scroll !== false) {
      const slot = getSelectedSlot();
      const el = slot ? document.getElementById(`slot-${slot.sid}`) : null;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function receiveMapUrlFromExtension(slotIndex, mapUrl, options = {}) {
    const safeIndex = Math.max(0, Math.min((groups[0]?.slots.length || 1) - 1, Number(slotIndex) || 0));
    const input = document.getElementById('url-lookup-input');
    if (!input || !mapUrl) return;
    showTool('mapjson');
    selectSlot(safeIndex, { scroll: options.scroll !== false });
    input.value = String(mapUrl);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    forcedUrlTargetSlotIndex = safeIndex;
    validateLookupInputs();
    if (options.autoExtract !== false) {
      lookupFromUrl();
    } else {
      setHint('url-lookup-hint', `Map URL loaded for Address ${safeIndex + 1}. Press Extract & Build Entry.`, 'ok');
    }
  }

  async function receiveMapUrlBatchFromExtension(items, options = {}) {
    const cleanItems = (Array.isArray(items) ? items : [])
      .map(item => ({
        slot: Math.max(0, Math.min(2, Number(item.slot) - 1 || 0)),
        url: String(item.url || '').trim(),
        clear: Boolean(item.clear)
      }))
      .filter(item => item.url || item.clear);
    if (!cleanItems.length) return;
    showTool('mapjson');
    for (const item of cleanItems) {
      if (item.clear) {
        clearSlotFromConnector(item.slot);
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
      receiveMapUrlFromExtension(item.slot, item.url, {
        autoExtract: false,
        scroll: false
      });
      forcedUrlTargetSlotIndex = item.slot;
      await lookupFromUrl();
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    setHint('url-lookup-hint', `Connector added ${cleanItems.length} map URL${cleanItems.length > 1 ? 's' : ''}.`, 'ok');
  }

  function clearSlotFromConnector(slotIndex) {
    const target = getSlotTargetByIndex(slotIndex);
    if (!target?.slot) return;
    const connectorSlot = Number(slotIndex) + 1;
    const existing = target.slot.data;
    if (!existing || Number(existing._connectorSlot) !== connectorSlot) {
      setHint('url-lookup-hint', `Connector slot ${connectorSlot} has no locked entry to remove.`, 'er');
      return;
    }
    target.slot.data = null;
    target.slot.hiddenFields = [];
    allSaved = allSaved.filter(entry => Number(entry._connectorSlot) !== connectorSlot);
    updateGroupJsonFromSlots(target.group);
    storageSave();
    renderAll();
    selectSlot(slotIndex, { scroll: false });
    updateTotals();
  }

  function notifyConnectorSlotCleared(connectorSlot) {
    if (!Number.isInteger(connectorSlot) || connectorSlot < 1 || connectorSlot > 3) return;
    window.postMessage({
      source: 'MAPJSON_TOOL',
      type: 'MAPJSON_CLEAR_CONNECTOR_SLOT',
      slot: connectorSlot
    }, window.location.origin);
  }

  function updateConnectorStatus(isOnline) {
    const pill = document.getElementById('connector-status-pill');
    if (!pill) return;
    pill.classList.toggle('is-online', !!isOnline);
    pill.classList.toggle('is-offline', !isOnline);
    const text = pill.querySelector('span');
    if (text) text.textContent = isOnline ? 'Activated' : 'Extension Missing';
    pill.title = isOnline ? 'Map extension is loaded' : 'Install or reload the MapJSON Connector extension';
  }

  function pingConnectorStatus() {
    window.postMessage({
      source: 'MAPJSON_TOOL',
      type: 'MAPJSON_CONNECTOR_PING'
    }, window.location.origin);
    setTimeout(() => {
      updateConnectorStatus(Date.now() - connectorLastSeenAt < 2200);
    }, 650);
  }

  function startConnectorStatusMonitor() {
    if (connectorStatusTimer) clearInterval(connectorStatusTimer);
    updateConnectorStatus(false);
    pingConnectorStatus();
    connectorStatusTimer = setInterval(pingConnectorStatus, 3000);
  }

  function normalizeMapUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      url.hash = '';
      url.searchParams.delete('entry');
      return url.toString().replace(/\/$/, '');
    } catch (e) {
      return String(value || '').trim().replace(/\/$/, '');
    }
  }

  function locationKeyFromCoords(coords) {
    if (!coords || !Number.isFinite(Number(coords.lat)) || !Number.isFinite(Number(coords.long ?? coords.lng))) return '';
    const lat = Number(coords.lat).toFixed(6);
    const long = Number(coords.long ?? coords.lng).toFixed(6);
    return `${lat},${long}`;
  }

  function findDuplicateLocation(mapUrl, coords) {
    const urlKey = normalizeMapUrl(mapUrl);
    const coordKey = locationKeyFromCoords(coords);
    const slots = groups[0]?.slots || [];
    for (let index = 0; index < slots.length; index += 1) {
      const data = slots[index]?.data;
      if (!data) continue;
      const sameUrl = urlKey && data._mapUrl && normalizeMapUrl(data._mapUrl) === urlKey;
      const sameCoords = coordKey && locationKeyFromCoords({ lat: data.lat, long: data.long }) === coordKey;
      if (sameUrl || sameCoords) return { ...data, slotIndex: index };
    }
    return null;
  }

  function handleConnectorLaunchParams() {
    const params = new URLSearchParams(window.location.search);
    const batchRaw = params.get('mapjsonBatch');
    if (batchRaw) {
      const autoExtract = params.get('mapjsonAuto') !== '0';
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      try {
        const batch = JSON.parse(batchRaw);
        setTimeout(() => {
          if (autoExtract) receiveMapUrlBatchFromExtension(batch);
        }, 300);
      } catch (e) {
        setHint('url-lookup-hint', 'Could not read connector batch URLs.', 'er');
      }
      return;
    }
    const mapUrl = params.get('mapjsonUrl');
    if (!mapUrl) return;
    const slot = Math.max(1, Math.min(3, Number(params.get('mapjsonSlot')) || 1)) - 1;
    const autoExtract = params.get('mapjsonAuto') !== '0';
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    setTimeout(() => receiveMapUrlFromExtension(slot, mapUrl, { autoExtract }), 300);
  }

  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.source !== 'MAPJSON_CONNECTOR') return;
    if (data.type === 'MAPJSON_CONNECTOR_PONG') {
      connectorLastSeenAt = Date.now();
      updateConnectorStatus(true);
      return;
    }
    if (Array.isArray(data.batch)) {
      receiveMapUrlBatchFromExtension(data.batch);
      return;
    }
    if (data.mapUrl) {
      receiveMapUrlFromExtension(Number(data.slot) - 1, data.mapUrl);
    }
  });

  function updateJsonTabs() {
    document.querySelectorAll('#json-tabs .json-tab-main').forEach(btn => {
      const index = Number(btn.dataset.slotIndex);
      const slot = groups[0]?.slots[index];
      btn.classList.toggle('on', index === selectedSlotIndex);
      btn.classList.toggle('filled', !!slot?.data);
    });
    document.querySelectorAll('#json-tabs .json-tab-copy').forEach(btn => {
      const index = Number(String(btn.id || '').replace('json-map-copy-', ''));
      const slot = groups[0]?.slots[index];
      const hasMapUrl = !!slot?.data?._mapUrl;
      btn.disabled = !hasMapUrl;
      btn.classList.toggle('filled', hasMapUrl);
    });
  }

  function renderSelectedJson() {
    const slot = getSelectedSlot();
    const el = document.getElementById('json-out');
    if (!el) {
      latestJSON = slot?.data ? JSON.stringify(renderStoreForSlot(slot), null, 2) : '';
      updateJsonTabs();
      syncJsonOptionalTools();
      scheduleGmapEmbedUpdate();
      return;
    }
    syncingJsonEditor = true;
    if (slot?.data) {
      el.value = JSON.stringify(renderStoreForSlot(slot), null, 2);
      el.classList.remove('empty');
      latestJSON = el.value;
      updateJsonHighlight(el.value);
      setHint('json-edit-hint', `Editing Address ${selectedSlotIndex + 1}.`, 'ok');
    } else {
      el.value = '';
      el.classList.add('empty');
      latestJSON = '';
      updateJsonHighlight('');
      setHint('json-edit-hint', `Address ${selectedSlotIndex + 1} is empty. Extract a URL or paste a valid store JSON here.`, '');
    }
    syncingJsonEditor = false;
    updateJsonTabs();
    syncJsonOptionalTools();
    scheduleGmapEmbedUpdate();
  }

  // ── GOOGLE MAPS VERIFICATION EMBED ──────────────────────────
  function updateGmapOpenCta(rawUrl) {
    const cta = document.getElementById('gmap-open-cta');
    if (!cta) return;
    if (rawUrl && isValidUrl(rawUrl)) {
      cta.href = rawUrl;
      cta.classList.remove('is-disabled');
      cta.setAttribute('aria-disabled', 'false');
    } else {
      cta.href = 'https://www.google.com/maps';
      cta.classList.add('is-disabled');
      cta.setAttribute('aria-disabled', 'true');
    }
  }

  function refreshGmapPreviewVisibility() {
    const block = document.getElementById('gmap-embed-block');
    if (!block) return;
    const slotData = getSelectedSlot()?.data;
    const hasSlotCoords = !!(slotData && hasCoords(slotData));
    block.classList.toggle('is-hidden', !hasSlotCoords);
  }

  function scheduleGmapEmbedUpdate() {
    // Debounced so live pin-dragging (which also calls renderSelectedJson)
    // doesn't reload the iframe on every pixel of movement.
    clearTimeout(gmapEmbedTimer);
    gmapEmbedTimer = setTimeout(updateGmapEmbed, 350);
  }

  function updateGmapEmbed() {
    const frame = document.getElementById('gmap-embed-frame');
    const empty = document.getElementById('gmap-embed-empty');
    const label = document.getElementById('gmap-embed-label');
    refreshGmapPreviewVisibility();
    if (!frame || !empty) return;

    const slotData = getSelectedSlot()?.data;
    const coords = hasCoords(slotData)
      ? { lat: Number(slotData.lat), long: Number(slotData.long), label: slotData.label || '' }
      : null;

    if (!coords) {
      frame.classList.remove('is-visible');
      frame.removeAttribute('src');
      delete frame.dataset.src;
      empty.classList.remove('is-hidden');
      if (label) label.textContent = '';
      return;
    }

    const lat = Number(coords.lat);
    const long = Number(coords.long);
    const src = `https://maps.google.com/maps?q=${lat},${long}&z=17&output=embed`;
    if (frame.dataset.src !== src) {
      frame.src = src;
      frame.dataset.src = src;
    }
    frame.classList.add('is-visible');
    empty.classList.add('is-hidden');
    if (label) label.textContent = coords.label ? `— ${coords.label}` : '';
  }

  function updateGroupJsonFromSlots(group = groups[0]) {
    if (!group) return;
    const stores = group.slots.filter(slot => slot.data).map(slot => renderStoreForSlot(slot));
    group.generatedJSON = stores.length ? JSON.stringify({ listing: { stores } }, null, 2) : null;
  }

  function updateSlotField(index, field, value) {
    const group = groups[0];
    const slot = group?.slots[index];
    if (!slot?.data) return false;
    selectedSlotIndex = index;
    const numericFields = new Set(['lat', 'long']);
    let nextValue;
    if (numericFields.has(field)) {
      const numericValue = Number(value);
      nextValue = value === '' || !Number.isFinite(numericValue) ? null : numericValue;
    } else {
      nextValue = field === 'state' ? String(value).toUpperCase() : value;
    }
    const currentValue = field === 'phone' ? normalizePhone(slot.data.phone) : slot.data[field];
    const comparableNext = field === 'phone' ? normalizePhone(nextValue) : nextValue;
    if (Object.is(currentValue, comparableNext)) return false;
    pushUndoState();
    setFieldHidden(slot, field, false);
    slot.data = makeStoreEntry({ ...slot.data, [field]: comparableNext });
    updateGroupJsonFromSlots(group);
    latestJSON = JSON.stringify(renderStoreForSlot(slot), null, 2);
    storageSave();
    selectSlot(index, { scroll: false });
    return true;
  }

  function fillNextEmptySlot(entry, target, options = {}) {
    const destination = target || findNextEmptySlot();
    if (!destination) {
      setHint(options.fullHintId || 'url-lookup-hint', 'All three slots are full. Clear a slot before adding another address.', 'er');
      return false;
    }

    pushUndoState();
    destination.slot.data = { ...entry };
    destination.slot.hiddenFields = [];
    destination.group.generatedJSON = null;
    selectedSlotIndex = destination.group.slots.indexOf(destination.slot);
    globalIdCounter++;
    updateGroupJsonFromSlots(destination.group);
    storageSave();
    renderAll();
    renderSelectedJson();
    if (typeof options.reset === 'function') {
      options.reset();
    } else {
      resetUrlLookup('✓ Added to Address ' + (selectedSlotIndex + 1) + '. JSON generated below.');
    }
    const missing = getMissingFieldsForSlot(destination.slot, selectedSlotIndex);
    if (missing.length) {
      setTimeout(() => {
        alert('Please review and update these extracted fields before download:\n\n' + missing.join('\n'));
      }, 120);
    }

    setTimeout(() => {
      const el = document.getElementById(`slot-${destination.slot.sid}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);

    return true;
  }

  // ── GENERATE GROUP ──────────────────────────────────────────
  function generateGroup(gid) {
    const output = buildGroupJSON(gid);
    if (!output) return;
    downloadGroup(gid);
  }

  function buildGroupJSON(gid) {
    const g = groups.find(g => g.gid === gid);
    if (!g) return null;

    const stores = g.slots.filter(s => s.data).map(s => renderStoreForSlot(s));
    if (!stores.length) return null;

    const output   = { listing: { stores } };
    const jsonStr  = JSON.stringify(output, null, 2);
    g.generatedJSON = jsonStr;
    latestJSON      = jsonStr;

    // Push to allSaved (avoid duplicates by id)
    stores.forEach(s => {
      if (!allSaved.find(e => e.id === s.id)) allSaved.unshift(s);
    });

    storageSave();

    renderAll();
    renderSelectedJson();
    renderHistory();
    updateTotals();
    return output;
  }

  // ── DOWNLOAD GROUP JSON ─────────────────────────────────────
  async function downloadGroup(gid) {
    const g = groups.find(g => g.gid === gid);
    if (!g) return;
    if (!isGroupComplete(g)) {
      alert('Please fill all 3 slots before downloading JSON.');
      return;
    }
    const campaignName = getCampaignName(gid);
    if (!campaignName) {
      alert('Please enter Campaign Name before downloading JSON.');
      document.getElementById(`campaign-name-${gid}`)?.focus();
      return;
    }
    if (!hasValidCtaForDownload(g)) {
      alert('CTA URL is required before download. Please select a CTA URL or enter a valid custom URL.');
      return;
    }
    const missing = getMissingFields(g);
    if (missing.length) {
      alert('Please review and update these fields before download:\n\n' + missing.join('\n'));
      return;
    }
    if (!g.generatedJSON) buildGroupJSON(gid);
    if (!g.generatedJSON) return;
    const stores   = JSON.parse(g.generatedJSON).listing.stores;
    const filename = 'data.json';
    latestSubmissionId = createSubmissionId();
    const elapsed = taskCompletedElapsed || formatElapsed(Date.now() - taskStartedAt);
    await downloadBlob(g.generatedJSON, filename, 'application/json');
    await recordDownloadHistory({
      id: latestSubmissionId,
      campaignName: campaignName || 'Untitled Campaign',
      duration: elapsed,
      stores,
      filename
    });
    playSuccessSound();
    markTaskCompleted();
  }

  function isGroupComplete(g) {
    return !!g && g.slots.length > 0 && g.slots.every(slot => !!slot.data);
  }

  function getCampaignName(gid) {
    return (document.getElementById(`campaign-name-${gid}`)?.value || '').trim();
  }

  function validateCampaignName(gid) {
    const g = groups.find(group => group.gid === gid);
    const btn = document.getElementById(`dl-${gid}`);
    if (!btn || !g) return;
    const filledCount = g.slots.filter(slot => slot.data).length;
    btn.classList.toggle('is-hidden', !isGroupComplete(g));
    btn.disabled = !isGroupComplete(g) || !getCampaignName(gid);
  }

  async function chooseDownloadFolder(gid) {
    if (!window.showDirectoryPicker) {
      alert('Folder selection is not supported in this browser. The Download JSON button will use your default downloads folder.');
      return;
    }
    try {
      downloadFolderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const btn = document.getElementById(`folder-btn-${gid}`);
      if (btn) btn.textContent = 'Folder Selected';
      updateStoragePill('Folder selected');
    } catch (e) {
      if (e?.name !== 'AbortError') {
        alert('Could not choose that folder. Please try again.');
      }
    }
  }

  // ── JSON OUTPUT ─────────────────────────────────────────────
  function showLatestJSON(obj) {
    const el = document.getElementById('json-out');
    if (!el) return;
    syncingJsonEditor = true;
    el.className = 'json-box';
    el.value = JSON.stringify(obj, null, 2);
    updateJsonHighlight(el.value);
    syncingJsonEditor = false;
    setHint('json-edit-hint', 'JSON is editable. Valid changes update the selected address instantly.', 'ok');
  }

  function copyLatest() {
    const text = val('json-out') || latestJSON;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copy-btn');
      btn.textContent = '✓ Copied!';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('ok'); }, 2000);
    });
  }

  function copySlotMapUrl(index) {
    const slotIndex = Number(index);
    const slot = groups[0]?.slots[slotIndex];
    const mapUrl = slot?.data?._mapUrl || '';
    if (!mapUrl) {
      setHint('json-edit-hint', `Address ${slotIndex + 1} does not have a saved Map URL.`, 'er');
      return;
    }
    copyTextToClipboard(mapUrl).then(() => {
      const btn = document.getElementById(`json-map-copy-${slotIndex}`);
      if (!btn) return;
      if (!btn.dataset.iconHtml) btn.dataset.iconHtml = btn.innerHTML;
      btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      btn.classList.add('ok');
      setTimeout(() => {
        btn.innerHTML = btn.dataset.iconHtml;
        btn.classList.remove('ok');
      }, 1400);
    }).catch(() => {
      const input = document.getElementById('url-lookup-input');
      if (input) {
        input.value = mapUrl;
        input.focus();
        input.select();
        validateLookupInputs();
        setHint('json-edit-hint', 'Map URL is selected in the search field. Press Cmd+C to copy it.', 'ok');
      } else {
        setHint('json-edit-hint', 'Could not copy the Map URL in this browser.', 'er');
      }
    });
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
    }
    return fallbackCopyText(text);
  }

  function fallbackCopyText(text) {
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy_failed'));
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  // ── HISTORY ─────────────────────────────────────────────────
  const HIST_COLORS = [
    { bg: 'var(--s1l)', fg: 'var(--s1)' },
    { bg: 'var(--s2l)', fg: 'var(--s2)' },
    { bg: 'var(--s3l)', fg: 'var(--s3)' },
    { bg: 'var(--s4l)', fg: 'var(--s4)' },
    { bg: 'var(--s5l)', fg: 'var(--s5)' },
    { bg: 'var(--s6l)', fg: 'var(--s6)' },
  ];

  function getDownloadHistory() {
    try {
      return JSON.parse(localStorage.getItem(DOWNLOAD_HISTORY_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveDownloadHistory(history) {
    localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  }


  function hasSupabaseConfig() {
    return SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;
  }

  async function saveRemoteHistory(entry) {
    if (!hasSupabaseConfig()) return false;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/mapjson_history`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        campaign_name: entry.campaignName || 'Untitled Campaign',
        duration: entry.duration || null,
        store_count: entry.storeCount || 0,
        data: entry.data || null
      })
    });
    if (!response.ok) throw new Error(`Supabase save failed: ${response.status}`);
    return true;
  }

  async function fetchRemoteHistory() {
    if (!hasSupabaseConfig()) return null;
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/mapjson_history?select=id,campaign_name,duration,saved_at,store_count&order=saved_at.desc&limit=10`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    if (!response.ok) throw new Error(`Supabase fetch failed: ${response.status}`);
    const rows = await response.json();
    return rows.map(row => ({
      id: row.id,
      campaignName: row.campaign_name || 'Untitled Campaign',
      savedAt: row.saved_at,
      savedAtDisplay: row.saved_at ? new Date(row.saved_at).toLocaleString() : '',
      duration: row.duration || '',
      storeCount: row.store_count || 0
    }));
  }

  function summarizeStores(stores) {
    return stores
      .slice(0, 3)
      .map(store => [store.label, store.city, store.state].filter(Boolean).join(', '))
      .filter(Boolean)
      .join(' | ') || `${stores.length} saved address${stores.length === 1 ? '' : 'es'}`;
  }

  async function recordDownloadHistory(record) {
    const now = new Date();
    const entry = {
      id: record.id || createSubmissionId(),
      campaignName: record.campaignName,
      savedAt: now.toISOString(),
      savedAtDisplay: now.toLocaleString(),
      duration: record.duration || '00:00',
      fileName: record.filename || 'data.json',
      storeCount: record.stores.length,
      summary: summarizeStores(record.stores),
      data: { listing: { stores: record.stores } }
    };
    saveDownloadHistory([entry, ...getDownloadHistory()]);
    renderRecentHistory();
    try {
      await saveRemoteHistory(entry);
      await refreshRecentHistory();
    } catch (e) {
      console.warn(e);
    }
    await writeHistoryRecordFile(entry);
  }

  async function writeHistoryRecordFile(entry) {
    if (!downloadFolderHandle) return;
    try {
      const safeId = String(entry.id).replace(/[^a-zA-Z0-9_-]/g, '-');
      const fileHandle = await downloadFolderHandle.getFileHandle(`history-${safeId}.json`, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' }));
      await writable.close();
    } catch (e) {
      updateStoragePill('History file skipped');
    }
  }

  async function refreshRecentHistory() {
    try {
      const remoteHistory = await fetchRemoteHistory();
      if (remoteHistory) {
        renderRecentHistory(remoteHistory);
        return;
      }
    } catch (e) {
      console.warn(e);
    }
    renderRecentHistory();
  }

  function renderRecentHistory(historyOverride) {
    const list = document.getElementById('recent-history-list');
    if (!list) return;
    const history = (historyOverride || getDownloadHistory()).slice(0, 10);
    if (!history.length) {
      list.innerHTML = '<div class="empty-hist">No downloads yet.</div>';
      return;
    }
    list.innerHTML = history.map(item => {
      const meta = [item.savedAtDisplay || '', item.duration || ''].filter(Boolean).join(' • ');
      return `
      <div class="recent-history-item">
        <div>
          <b>${esc(item.campaignName || 'Untitled Campaign')}</b>
          <span>${esc(meta)}</span>
        </div>
      </div>
    `;
    }).join('');
  }

  function renderHistory() {
    const count = document.getElementById('hist-cnt');
    if (count) count.textContent = allSaved.length;
    const list = document.getElementById('hist-list');
    if (!list) return;
    if (!allSaved.length) {
      list.innerHTML = '<div class="empty-hist">No entries yet.</div>';
      return;
    }
    list.innerHTML = allSaved.map((item, i) => {
      const c = HIST_COLORS[i % HIST_COLORS.length];
      return `
        <div class="hist-item" onclick="App.previewSaved(${i})">
          <span class="hi-id"
            style="background:${c.bg};color:${c.fg}">${esc(item.id)}</span>
          <span class="hi-label">${esc(item.label || '(no label)')}</span>
          <span class="hi-city">${esc(item.city || '')}${item.state ? ', ' + item.state : ''}</span>
          <button class="hi-del"
            onclick="event.stopPropagation(); App.delSaved(${i})">×</button>
        </div>`;
    }).join('');
  }

  function previewSaved(i) {
    latestJSON = JSON.stringify(allSaved[i], null, 2);
    showLatestJSON(allSaved[i]);
  }

  function delSaved(i) {
    allSaved.splice(i, 1);
    storageSave();
    renderHistory();
    updateTotals();
  }

  function clearAll() {
    if (!allSaved.length) return;
    if (!confirm('Clear all saved entries from history? This cannot be undone.')) return;
    allSaved = [];
    storageSave();
    renderHistory();
    updateTotals();
  }

  // ── EXPORT ──────────────────────────────────────────────────
  function exportAllJSON() {
    if (!allSaved.length) { alert('No entries to export yet.'); return; }
    const out = JSON.stringify({ listing: { stores: [...allSaved].reverse() } }, null, 2);
    downloadBlob(out, 'data.json', 'application/json');
  }

  // ── TOTALS ──────────────────────────────────────────────────
  function updateTotals() {
    const totalSlots = groups.reduce((sum, group) => sum + group.slots.length, 0);
    const filledSlots = groups.reduce((sum, group) => (
      sum + group.slots.filter(slot => slot.data).length
    ), 0);
    const total = document.getElementById('total-count');
    const hist = document.getElementById('hist-cnt');
    const urlFilledMeta = document.getElementById('url-filled-meta');
    if (total) total.textContent = filledSlots;
    if (hist) hist.textContent = allSaved.length;
    if (urlFilledMeta) urlFilledMeta.textContent = `${filledSlots} / ${totalSlots || 3} filled`;
    document.querySelectorAll('.dl-btn').forEach(btn => {
      btn.classList.toggle('is-hidden', filledSlots === 0);
      btn.disabled = filledSlots === 0;
    });
    groups.forEach(group => validateCampaignName(group.gid));
    if (filledSlots >= totalSlots && totalSlots > 0) stopTaskTimer();
  }

  // ── UTILITIES ────────────────────────────────────────────────
  function padId(n) { return String(n).padStart(5, '0'); }

  function val(id) {
    return (document.getElementById(id) || {}).value || '';
  }

  function isValidUrl(value) {
    try {
      const url = new URL(String(value).trim());
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  function refreshJsonOutputVisibility() {
    const panel = document.querySelector('.json-output-panel');
    if (!panel) return;
    const rawUrl = val('url-lookup-input').trim();
    const rawAddress = val('address-lookup-input').trim();
    const hasBuiltData = (groups[0]?.slots || []).some(slot => !!slot?.data);
    const shouldShow = !!(rawUrl || rawAddress || hasBuiltData);
    panel.classList.toggle('is-hidden', !shouldShow);
  }

  function validateLookupInputs() {
    const rawUrl = val('url-lookup-input').trim();
    const rawAddress = val('address-lookup-input').trim();
    const cta = getCtaValue();
    const validCta = isValidUrl(cta);
    const urlBtn = document.getElementById('url-lookup-btn');
    const addressBtn = document.getElementById('address-lookup-btn');
    const valid = !!rawUrl && validCta;
    if (urlBtn) urlBtn.disabled = !valid;
    if (addressBtn) addressBtn.disabled = !(rawAddress && validCta);
    updateGmapOpenCta(rawUrl);
    refreshGmapPreviewVisibility();
    refreshJsonOutputVisibility();
    if (cta && !isValidUrl(cta)) {
      setHint('url-lookup-hint', 'CTA URL must start with http:// or https://', 'er');
      if (rawAddress) setHint('address-lookup-hint', 'CTA URL must start with http:// or https://', 'er');
    } else if ((rawUrl || rawAddress) && !cta) {
      setHint('url-lookup-hint', 'CTA URL is required.', 'er');
      if (rawAddress) setHint('address-lookup-hint', 'CTA URL is required.', 'er');
    } else {
      setHint('url-lookup-hint', '', '');
      if (!rawAddress) setHint('address-lookup-hint', '', '');
    }
    return valid;
  }

  function handleJsonEdit() {
    if (syncingJsonEditor) return;
    const text = val('json-out').trim();
    const group = groups[0];
    const slot = getSelectedSlot();
    if (!group || !slot) return;
    if (!text) {
      pushUndoState();
      latestJSON = '';
      slot.data = null;
      slot.hiddenFields = [];
      updateGroupJsonFromSlots(group);
      storageSave();
      renderAll();
      selectSlot(selectedSlotIndex, { scroll: false });
      updateJsonHighlight('');
      setHint('json-edit-hint', '', '');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      updateJsonHighlight(text);
      setHint('json-edit-hint', 'JSON is not valid yet. Slots will update when it parses.', 'er');
      return;
    }

    const store = normalizeEditableStore(parsed);
    if (!store) {
      setHint('json-edit-hint', 'Use one store object, or { "listing": { "stores": [record] } }.', 'er');
      return;
    }

    pushUndoState();
    slot.data = normalizeStore(store, slot.data, selectedSlotIndex);
    slot.hiddenFields = OPTIONAL_JSON_FIELDS.filter(field => !(field in store));
    updateGroupJsonFromSlots(group);
    latestJSON = JSON.stringify(renderStoreForSlot(slot), null, 2);
    syncCounterFromSlots();
    storageSave();
    renderAll();
    selectSlot(selectedSlotIndex, { scroll: false });
    updateJsonHighlight(val('json-out'));
    setHint('json-edit-hint', `Address ${selectedSlotIndex + 1} updated from JSON.`, 'ok');
  }

  function normalizeEditableStore(parsed) {
    if (Array.isArray(parsed?.listing?.stores)) return parsed.listing.stores[0] || null;
    if (Array.isArray(parsed?.stores)) return parsed.stores[0] || null;
    if (Array.isArray(parsed)) return parsed[0] || null;
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  }

  function normalizeStores(parsed) {
    if (Array.isArray(parsed?.listing?.stores)) return parsed.listing.stores;
    if (Array.isArray(parsed?.stores)) return parsed.stores;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && ('label' in parsed || 'address' in parsed || 'lat' in parsed || 'long' in parsed)) return [parsed];
    return null;
  }

  function normalizeStore(store, existing, index) {
    return makeStoreEntry({
      id: String(store.id || existing?.id || padId(index + 1)).padStart(5, '0'),
      label: store.label || '',
      address: store.address || '',
      city: store.city || '',
      state: String(store.state || '').toUpperCase(),
      zip: store.zip || '',
      country: store.country || '',
      phone: store.phone || '',
      cta: store.cta || '',
      lat: Number.isFinite(Number(store.lat)) ? Number(store.lat) : null,
      long: Number.isFinite(Number(store.long)) ? Number(store.long) : null,
      _mapUrl: store._mapUrl || existing?._mapUrl || '',
    });
  }

  function makeStoreEntry(source = {}, hiddenFields = new Set()) {
    const phone = normalizePhone(source.phone);
    const country = normalizeCountry(source.country);
    const hidden = hiddenFields instanceof Set ? hiddenFields : new Set(hiddenFields || []);
    const entry = {
      id: source.id || '',
      label: source.label || '',
      address: source.address || '',
      city: source.city || '',
      state: source.state || '',
      zip: source.zip || '',
    };
    if (!hidden.has('country') && (country || Object.prototype.hasOwnProperty.call(source, 'country'))) entry.country = country;
    if (!hidden.has('phone') && (phone || Object.prototype.hasOwnProperty.call(source, 'phone'))) entry.phone = phone;
    entry.cta = source.cta || '';
    entry.lat = source.lat ?? null;
    entry.long = source.long ?? null;
    if (source._mapUrl) entry._mapUrl = source._mapUrl;
    return entry;
  }

  function normalizePhone(value) {
    return sanitizePhoneNumber(value);
  }

  function normalizeCountry(value) {
    return String(value || '').trim();
  }

  function sanitizePhoneNumber(value) {
    return String(value || '')
      .replace(/[^\d+\s().-]/g, '')
      .replace(/(?!^)\+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sanitizePhoneTypingValue(value) {
    return String(value || '')
      .replace(/[^\d+\s().-]/g, '')
      .replace(/(?!^)\+/g, '')
      .replace(/[^\S\r\n]+/g, ' ');
  }


  function syncCounterFromSlots() {
    const ids = groups
      .flatMap(group => group.slots.map(slot => Number(slot.data?.id)))
      .filter(Number.isFinite);
    globalIdCounter = ids.length ? Math.max(...ids) + 1 : 1;
  }

  function setHint(id, msg, cls) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.className = 'hint ' + (cls || ''); }
  }

  function getCtaValue(localValue) {
    const choice = document.getElementById('cta-choice')?.value || DEFAULT_CTA_URL;
    const selectedValue = choice === 'custom' ? (val('url-lookup-cta').trim() || DEFAULT_CTA_URL) : choice;
    const useGlobal = document.getElementById('global-cta-enabled')?.checked;
    return useGlobal && selectedValue ? selectedValue : (localValue || selectedValue || '');
  }

  function handleCtaChoiceChange() {
    const choice = document.getElementById('cta-choice')?.value || DEFAULT_CTA_URL;
    const custom = document.getElementById('url-lookup-cta');
    const quick = document.getElementById('cta-quick-value');
    const customButton = document.getElementById('cta-custom-btn');
    if (custom) {
      custom.classList.toggle('is-hidden', choice !== 'custom');
      custom.style.display = choice === 'custom' ? 'block' : 'none';
      if (choice !== 'custom') custom.value = '';
    }
    if (quick) quick.value = choice === 'custom' ? (val('url-lookup-cta') || DEFAULT_CTA_URL) : choice;
    if (customButton) customButton.classList.toggle('active', choice === 'custom');
    validateLookupInputs();
  }

  function enableCustomCta() {
    const choice = document.getElementById('cta-choice');
    if (choice) choice.value = choice.value === 'custom' ? DEFAULT_CTA_URL : 'custom';
    handleCtaChoiceChange();
    if (choice?.value === 'custom') {
      setTimeout(() => document.getElementById('url-lookup-cta')?.focus(), 40);
    }
  }

  function syncGlobalCta() {
    const useGlobal = document.getElementById('global-cta-enabled')?.checked;
    const globalUrl = getCtaValue();
    if (!useGlobal || !globalUrl) return;
    if (!isValidUrl(globalUrl)) return;
    pushUndoState();

    document.querySelectorAll('input[id^="pcta-"], input[id^="mcta-"]')
      .forEach(input => { input.value = globalUrl; });

    groups.forEach(group => {
      group.slots.forEach(slot => {
        if (slot.data) slot.data.cta = globalUrl;
      });
      group.generatedJSON = null;
    });

    allSaved = allSaved.map(entry => ({ ...entry, cta: globalUrl }));
    storageSave();
    renderHistory();
    updateTotals();
    if (groups[0]?.slots.some(slot => slot.data)) {
      updateGroupJsonFromSlots(groups[0]);
      renderSelectedJson();
    }
  }

  function getMissingFields(group) {
    const required = [
      ['label', 'Business'],
      ['address', 'Address'],
      ['city', 'City'],
      ['state', 'State'],
      ['zip', 'ZIP'],
      ['cta', 'CTA URL'],
      ['lat', 'Latitude'],
      ['long', 'Longitude'],
    ];
    const missing = [];
    group.slots.forEach((slot, index) => {
      missing.push(...getMissingFieldsForSlot(slot, index, required));
    });
    return missing;
  }

  function getMissingFieldsForSlot(slot, index, requiredList) {
    if (!slot.data) return [];
    const required = requiredList || [
      ['label', 'Business'],
      ['address', 'Address'],
      ['city', 'City'],
      ['state', 'State'],
      ['zip', 'ZIP'],
      ['cta', 'CTA URL'],
      ['lat', 'Latitude'],
      ['long', 'Longitude'],
    ];
    return required.reduce((items, [key, label]) => {
      const value = slot.data[key];
      if (value === '' || value === null || value === undefined) {
        items.push(`Address ${index + 1}: ${label}`);
      }
      return items;
    }, []);
  }

  function hasValidCtaForDownload(group) {
    return group.slots
      .filter(slot => slot.data)
      .every(slot => isValidUrl(slot.data.cta));
  }

  function captureState() {
    return {
      groups: groups.map(group => ({
        gid: group.gid,
        generatedJSON: group.generatedJSON,
        slots: group.slots.map(slot => ({
          sid: slot.sid,
          data: slot.data ? { ...slot.data } : null,
          hiddenFields: Array.isArray(slot.hiddenFields) ? [...slot.hiddenFields] : [],
        })),
      })),
      globalIdCounter,
      selectedSlotIndex,
      latestJSON,
    };
  }

  function restoreState(snapshot) {
    groups = snapshot.groups.map(group => ({
      gid: group.gid,
      generatedJSON: group.generatedJSON,
      slots: group.slots.map(slot => ({
        sid: slot.sid,
        data: slot.data ? { ...slot.data } : null,
        hiddenFields: Array.isArray(slot.hiddenFields) ? [...slot.hiddenFields] : [],
      })),
    }));
    globalIdCounter = snapshot.globalIdCounter;
    selectedSlotIndex = snapshot.selectedSlotIndex;
    latestJSON = snapshot.latestJSON;
    storageSave();
    renderAll();
    selectSlot(selectedSlotIndex, { scroll: false });
  }

  function pushUndoState() {
    undoStack.push(captureState());
    undoStack = undoStack.slice(-20);
    redoStack = [];
    updateUndoButton();
  }

  function undoLastChange() {
    const previous = undoStack.pop();
    if (!previous) return;
    redoStack.push(captureState());
    redoStack = redoStack.slice(-20);
    restoreState(previous);
    updateUndoButton();
    setHint('json-edit-hint', 'Last change reverted.', 'ok');
  }

  function redoLastChange() {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(captureState());
    undoStack = undoStack.slice(-20);
    restoreState(next);
    updateUndoButton();
    setHint('json-edit-hint', 'Change restored.', 'ok');
  }

  function updateUndoButton() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  function startTaskTimer() {
    if (taskTimerInterval) return;
    if (taskTimerInterval) clearInterval(taskTimerInterval);
    taskStartedAt = Date.now();
    taskCompletedElapsed = '';
    updateTaskTimer();
    taskTimerInterval = setInterval(updateTaskTimer, 1000);
  }

  function resetTaskTimer() {
    if (taskTimerInterval) clearInterval(taskTimerInterval);
    taskTimerInterval = null;
    taskStartedAt = Date.now();
    taskCompletedElapsed = '';
    const el = document.getElementById('task-timer');
    if (el) el.textContent = '00:00';
  }

  function startEntryTimer() {
    if (taskTimerInterval) return;
    startTaskTimer();
  }

  function updateTaskTimer() {
    const el = document.getElementById('task-timer');
    if (!el) return;
    el.textContent = formatElapsed(Date.now() - taskStartedAt);
  }

  function stopTaskTimer() {
    if (!taskTimerInterval) return;
    updateTaskTimer();
    taskCompletedElapsed = formatElapsed(Date.now() - taskStartedAt);
    clearInterval(taskTimerInterval);
    taskTimerInterval = null;
  }

  function markTaskCompleted() {
    const el = document.getElementById('task-timer');
    if (!el) return;
    const elapsed = taskCompletedElapsed || formatElapsed(Date.now() - taskStartedAt);
    el.textContent = `Task completed in ${elapsed}`;
    if (taskTimerInterval) clearInterval(taskTimerInterval);
    taskTimerInterval = null;
    showSuccessModal(elapsed);
  }

  function showSuccessModal(elapsed) {
    const modal = document.getElementById('success-modal');
    const copy = document.getElementById('success-copy');
    if (copy) copy.textContent = `Your JSON was generated in just ${elapsed}.`;
    if (modal) modal.classList.add('show');
  }

  function playSuccessSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
      master.connect(ctx.destination);

      [523.25, 659.25, 783.99].forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + index * 0.09;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.8, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(start + 0.24);
      });

      setTimeout(() => ctx.close?.(), 800);
    } catch (e) { /* Sound is optional. */ }
  }

  function closeSuccessModal() {
    const modal = document.getElementById('success-modal');
    if (modal) modal.classList.remove('show');
  }

  function openChromeInstall() {
    if (EXTENSION_FILE_URL) {
      window.open(EXTENSION_FILE_URL, '_blank', 'noopener');
      return;
    }
    alert('Extension download link is not added yet. Paste your Box file URL in EXTENSION_FILE_URL inside js/app.js.');
  }

  function renderFastTutorials() {
    const list = document.getElementById('tutorial-list');
    if (!list) return;
    list.innerHTML = FAST_TUTORIALS.map(item => {
      return `
        <div class="tutorial-item" data-tutorial-id="${esc(item.id)}">
          <div class="tutorial-video is-hidden" id="tutorial-video-${esc(item.id)}">
            <video controls preload="metadata" src="${esc(item.videoSrc || '')}">
              Your browser cannot play this video.
            </video>
          </div>
          <button class="tutorial-topic" type="button" onclick="App.toggleTutorialVideo('${esc(item.id)}')">
            <span>${esc(item.title)}</span>
            <b id="tutorial-toggle-label-${esc(item.id)}">Watch</b>
          </button>
        </div>
      `;
    }).join('');
  }

  function toggleTutorialVideo(topic) {
    const video = document.getElementById(`tutorial-video-${topic}`);
    const label = document.getElementById(`tutorial-toggle-label-${topic}`);
    if (!video) return;
    const opening = video.classList.contains('is-hidden');
    video.classList.toggle('is-hidden', !opening);
    if (label) label.textContent = opening ? 'Hide' : 'Watch';
  }

  function toggleFastTutorial() {
    const panel = document.querySelector('.tutorial-panel');
    const button = document.getElementById('header-play-btn');
    if (!panel) return;
    const opening = panel.classList.contains('is-hidden');
    panel.classList.toggle('is-hidden', !opening);
    button?.classList.toggle('is-active', opening);
    if (opening) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel.classList.add('is-focused');
      setTimeout(() => panel.classList.remove('is-focused'), 1400);
    }
  }

  function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(total / 60)).padStart(2, '0');
    const seconds = String(total % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function updateJsonHighlight(text) {
    const highlight = document.getElementById('json-highlight');
    if (!highlight) return;
    highlight.innerHTML = text ? highlightJsonText(text) : '';
    syncJsonScroll();
  }

  function syncJsonScroll() {
    const textarea = document.getElementById('json-out');
    const highlight = document.getElementById('json-highlight');
    if (!textarea || !highlight) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }

  function syncSlotJsonScroll(sid, textarea) {
    const highlight = document.getElementById(`slot-json-highlight-${sid}`);
    if (!textarea || !highlight) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }

  function updateSlotJsonHighlight(sid, text, textarea) {
    const highlight = document.getElementById(`slot-json-highlight-${sid}`);
    if (!highlight) return;
    highlight.innerHTML = text ? highlightJsonText(text) : '';
    if (textarea) syncSlotJsonScroll(sid, textarea);
  }

  function handleSlotJsonEdit(index, textarea) {
    const group = groups[0];
    const slot = group?.slots[index];
    if (!group || !slot || !textarea) return;

    selectedSlotIndex = index;
    const text = String(textarea.value || '').trim();
    updateSlotJsonHighlight(slot.sid, textarea.value, textarea);

    if (!text) {
      pushUndoState();
      slot.data = null;
      slot.hiddenFields = [];
      latestJSON = '';
      updateGroupJsonFromSlots(group);
      syncCounterFromSlots();
      storageSave();
      renderAll();
      selectSlot(index, { scroll: false });
      refreshJsonOutputVisibility();
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setHint(`slot-json-hint-${slot.sid}`, 'JSON is not valid yet. Card will update when it parses.', 'er');
      return;
    }

    const store = normalizeEditableStore(parsed);
    if (!store) {
      setHint(`slot-json-hint-${slot.sid}`, 'Use one store object, or { "listing": { "stores": [record] } }.', 'er');
      return;
    }

    pushUndoState();
    slot.data = normalizeStore(store, slot.data, index);
    slot.hiddenFields = OPTIONAL_JSON_FIELDS.filter(field => !(field in store));
    updateGroupJsonFromSlots(group);
    latestJSON = JSON.stringify(renderStoreForSlot(slot), null, 2);
    syncCounterFromSlots();
    storageSave();
    renderSelectedJson();
    updateTotals();
    refreshJsonOutputVisibility();
    setHint(`slot-json-hint-${slot.sid}`, `Address ${index + 1} updated from JSON.`, 'ok');
  }

  function refreshAfterSlotJsonEdit(index, textarea) {
    if (textarea) {
      try {
        const parsed = JSON.parse(String(textarea.value || '').trim());
        if (!normalizeEditableStore(parsed)) return;
      } catch (e) {
        return;
      }
    }
    selectedSlotIndex = index;
    renderAll();
    selectSlot(index, { scroll: false });
  }

  function highlightJsonText(text) {
    const tokenPattern = /("(?:[^"\\]|\\.)*")(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],]/g;
    let html = '';
    let lastIndex = 0;
    let match;

    while ((match = tokenPattern.exec(text)) !== null) {
      html += escJson(text.slice(lastIndex, match.index));
      const token = match[0];
      if (match[1]) {
        html += match[2]
          ? `<span class="json-key">${escJson(match[1])}</span>${escJson(match[2])}`
          : `<span class="json-string">${escJson(match[1])}</span>`;
      } else if (/^-?\d/.test(token)) {
        html += `<span class="json-number">${escJson(token)}</span>`;
      } else if (/^(true|false|null)$/.test(token)) {
        html += `<span class="json-literal">${escJson(token)}</span>`;
      } else {
        html += `<span class="json-bracket">${escJson(token)}</span>`;
      }
      lastIndex = tokenPattern.lastIndex;
    }

    return html + escJson(text.slice(lastIndex));
  }

  function escJson(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function slugUser(name) {
    return String(name).trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'guest';
  }

  function cap(s) {
    return String(s).charAt(0).toUpperCase() + String(s).slice(1);
  }

  function el(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls)  d.className   = cls;
    if (html) d.innerHTML   = html;
    return d;
  }

  function extractCoords(url) {
    const text = String(url || '');
    const placeMatches = [...text.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
    if (placeMatches.length) {
      const match = placeMatches[placeMatches.length - 1];
      return { lat: parseFloat(match[1]), long: parseFloat(match[2]) };
    }

    const queryPair = text.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (queryPair) return { lat: parseFloat(queryPair[1]), long: parseFloat(queryPair[2]) };

    const atMatch = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    return atMatch ? { lat: parseFloat(atMatch[1]), long: parseFloat(atMatch[2]) } : null;
  }

  async function fetchAddressDetails(coords, fallback = {}) {
    let source = fallback;
    try {
      const reverseUrl = `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.long}&format=json&addressdetails=1&zoom=18`;
      const reverseRes = await fetch(reverseUrl, { headers: { 'Accept-Language': 'en', 'User-Agent': 'MapJSONGenerator/1.0' } });
      const reverseData = await reverseRes.json();
      if (reverseData && reverseData.address) source = reverseData;
    } catch (e) { /* Use search result details if reverse lookup fails. */ }

    return formatNominatimDetails(source);
  }

  function formatNominatimDetails(data = {}) {
    const a = data.address || {};
    const displayParts = String(data.display_name || '').split(',').map(part => part.trim()).filter(Boolean);
    const street = [a.house_number, a.road || a.pedestrian || a.footway || a.path].filter(Boolean).join(' ');
    const parsedDisplay = parseAddressLine(displayParts.join(', '));
    const label = data.name || a.shop || a.amenity || a.office || a.building || a.tourism || firstDisplayPart(data.display_name);
    return {
      label: label || '',
      address: street || a.neighbourhood || a.suburb || parsedDisplay.address || '',
      city: a.city || a.town || a.village || a.municipality || a.county || parsedDisplay.city || '',
      state: abbreviateState(a.state || parsedDisplay.state || '', a.country_code),
      zip: normalizePostcode(a.postcode || parsedDisplay.zip, a.country_code),
    };
  }

  function parseManualAddressInput(raw) {
    const lines = String(raw || '').split('\n').map(line => line.trim()).filter(Boolean);
    const label = lines.length > 1 ? lines[0] : '';
    const addressText = lines.length > 1 ? lines.slice(1).join(', ') : lines[0] || '';
    const parsed = parseAddressLine(addressText);
    return {
      label,
      query: lines.join(', '),
      labelQuery: [label, parsed.city, parsed.state, parsed.zip].filter(Boolean).join(', '),
      addressQuery: addressText,
      address: parsed.address || addressText,
      road: parsed.road,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      region: parsed.region,
    };
  }

  function parseAddressLine(line) {
    const text = String(line || '').trim();
    const parts = text.split(',').map(part => part.trim()).filter(Boolean);
    const stateZipPattern = /^([A-Za-z][A-Za-z .'-]*?)\s+([A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d|\d{5}(?:-\d{4})?)$/i;
    const last = parts[parts.length - 1] || '';
    const hasTrailingRegion = parts.length > 3 || (parts.length > 2 && !stateZipPattern.test(last));
    const trailingRegion = hasTrailingRegion ? last : '';
    const stateZipSource = hasTrailingRegion ? parts[parts.length - 2] || '' : last;
    const stateZip = stateZipSource.match(stateZipPattern);
    const city = stateZip ? parts[parts.length - (hasTrailingRegion ? 3 : 2)] || '' : '';
    const addressEnd = stateZip ? parts.length - (hasTrailingRegion ? 3 : 2) : 1;
    const address = parts.slice(0, Math.max(1, addressEnd)).join(', ') || text;
    return {
      address,
      road: extractRoadName(address),
      city: stateZip ? city : '',
      state: stateZip ? normalizeRegionName(stateZip[1]) : '',
      zip: stateZip ? normalizePostcode(stateZip[2].toUpperCase(), trailingRegion.toLowerCase() === 'united states' ? 'us' : '') : '',
      region: trailingRegion,
    };
  }

  function normalizeRegionName(region) {
    const value = String(region || '').trim();
    return value.length === 2 ? value.toUpperCase() : cap(value);
  }

  function extractRoadName(address) {
    return String(address || '')
      .replace(/^\d+\w?\s+/, '')
      .replace(/\b(street)\b/ig, 'st')
      .replace(/\b(avenue)\b/ig, 'ave')
      .replace(/\b(road)\b/ig, 'rd')
      .trim();
  }

  function firstDisplayPart(displayName) {
    return String(displayName || '').split(',').map(part => part.trim()).filter(Boolean)[0] || '';
  }

  function abbreviateState(state, countryCode) {
    if (String(countryCode || '').toLowerCase() !== 'us') return state || '';
    const STATE_ABBR = {
      'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
      'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
      'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
      'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
      'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
      'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
      'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC',
      'North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA',
      'Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN',
      'Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA',
      'West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC',
    };
    return STATE_ABBR[state] || state || '';
  }

  function normalizePostcode(postcode, countryCode) {
    const zip = String(postcode || '').trim();
    if (!zip) return '';

    if (String(countryCode || '').toLowerCase() === 'us') {
      const match = zip.match(/^(\d{5})(?:-\d{4})?$/);
      if (match) return match[1];
    }

    return zip;
  }

  function parseAddr(raw) {
    const lines = raw.trim().split('\n')
      .map(l => l.trim().replace(/,$/, '')).filter(Boolean);
    if (lines.length < 2) return null;
    const label = lines[0];
    const addressText = lines.slice(1).join(', ');
    const parsed = parseAddressLine(addressText);
    if (parsed.city || parsed.state || parsed.zip) return {
      label,
      address: parsed.address,
      city:    parsed.city,
      state:   parsed.state,
      zip:     parsed.zip,
    };
    return { label, address: lines.slice(1).join(', '), city: '', state: '', zip: '' };
  }

  function syntaxHL(obj) {
    return JSON.stringify(obj, null, 2)
      .replace(
        /("(?:[^"\\]|\\.)*"(\s*:)?|-?\d+\.?\d*(?:[eE][+\-]?\d+)?|true|false|null)/g,
        m => {
          if (/^"/.test(m)) return /:$/.test(m)
            ? `<span class="jk">${m}</span>`
            : `<span class="js">${m}</span>`;
          if (m === 'null') return `<span class="jnl">${m}</span>`;
          return `<span class="jn">${m}</span>`;
        }
      )
      .replace(/[{}\[\]]/g, c => `<span class="jb">${c}</span>`);
  }

  async function downloadBlob(content, filename, type) {
    if (downloadFolderHandle) {
      try {
        const fileHandle = await downloadFolderHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(new Blob([content], { type }));
        await writable.close();
        return;
      } catch (e) {
        alert('Could not save to the selected folder. Using browser download instead.');
        downloadFolderHandle = null;
      }
    }
    const blob = new Blob([content], { type });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── INIT ────────────────────────────────────────────────────
  function init() {
    currentUser = 'Nikhil Lohani';
    sessionStorage.setItem(CURRENT_USER_KEY, currentUser);
    applyTheme();
    setInterval(applyTheme, 15 * 60 * 1000);
    handleSplash();
    recordUsage(currentUser);
    sendRemoteUsage(currentUser);
    startWorkspace();
    showTool('mapjson');
    renderFastTutorials();
    renderUsageLog();
    refreshRecentHistory();
    validateLookupInputs();
    handleConnectorLaunchParams();
    startConnectorStatusMonitor();
  }

  function handleSplash() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    if (sessionStorage.getItem(SPLASH_KEY) === '1') {
      splash.style.display = 'none';
      return;
    }
    sessionStorage.setItem(SPLASH_KEY, '1');
    setTimeout(() => {
      splash.classList.add('hidden');
      setTimeout(() => { splash.style.display = 'none'; }, 650);
    }, 3000);
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── PUBLIC API ───────────────────────────────────────────────
  return {
    showTool,
    loginUser,
    addGroup,
    removeGroup,
    removeSlotFromGroup,
    addSlotToGroup,
    clearSlotData,
    toggleSlot,
    switchSlotTab,
    parsePaste,
    saveSlot,
    geocodeSlot,
    lookupFromUrl,
    receiveMapUrlFromExtension,
    receiveMapUrlBatchFromExtension,
    lookupFromAddress,
    startEntryTimer,
    toggleUrlEdit,
    applyUrlEdits,
    saveUrlEntryDirect,
    addUrlEntryToSlot,
    generateGroup,
    downloadGroup,
    validateCampaignName,
    chooseDownloadFolder,
    copyLatest,
    copySlotMapUrl,
    exportAllJSON,
    previewSaved,
    delSaved,
    clearAll,
    clearUsageLog,
    syncGlobalCta,
    handleCtaChoiceChange,
    enableCustomCta,
    undoLastChange,
    redoLastChange,
    toggleFeatureAccess,
    toggleNotes,
    toggleJsonOptionsMenu,
    toggleJsonCountryField,
    saveJsonCountry,
    toggleJsonPhoneField,
    saveJsonPhoneNumber,
    addJsonField,
    removeJsonField,
    sanitizeJsonPhoneInput,
    unlockMoreFeatures,
    lockMoreFeatures,
    closeSuccessModal,
    openChromeInstall,
    toggleTutorialVideo,
    toggleFastTutorial,
    setThemeMode,
    toggleThemeMode,
    selectSlot,
    validateLookupInputs,
    handleJsonEdit,
    handleSlotJsonEdit,
    refreshAfterSlotJsonEdit,
    syncJsonScroll,
    syncSlotJsonScroll,
  };

})();

window.App = App;

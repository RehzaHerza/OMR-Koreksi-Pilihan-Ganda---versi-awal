/* ============================================================
   config.js — State, penyimpanan, & GEOMETRI BERSAMA
   ------------------------------------------------------------
   Ini modul paling penting. Fungsi cellNormPos() dipakai DUA kali:
   - sheet-generator.js  -> untuk MENGGAMBAR kotak saat cetak
   - scanner.js          -> untuk MEMBACA kotak dari foto
   Karena keduanya pakai rumus yang sama, posisi pasti sinkron.
   ============================================================ */

const OMR = (function () {

  /* ---------- Penyimpanan multi-profil (localStorage, offline) ----------
     - PROFILES_KEY menyimpan daftar guru + profil aktif.
     - Tiap profil punya data sendiri di kunci DATA_PREFIX + id.
     - Tetap per-perangkat (localStorage); profil hanya memisahkan data
       beberapa guru yang berbagi browser yang SAMA.
  ----------------------------------------------------------------------- */
  const PROFILES_KEY = 'omr_profiles_v1';
  const DATA_PREFIX = 'omr_state_v1__';
  const LEGACY_KEY = 'omr_state_v1';   // data versi single-user (utk migrasi)

  const defaultState = () => ({
    config: {
      examTitle: 'Ulangan Harian',
      numQuestions: 20,
      numOptions: 5,      // A..E
      columns: 2,
      defaultWeight: 1,
      // --- Header format resmi (untuk lembar cetak) ---
      titleLines: 'LEMBAR JAWABAN\nASESMEN SUMATIF AKHIR SEMESTER\nTAHUN PELAJARAN 2025/2026',
      mapel: '',          // bila kosong -> dicetak sbg garis isian
      hariTanggal: '',
      waktu: '',
      // --- Bagian esai (hanya dicetak, TIDAK discan) ---
      hasEssay: false,
      essayCount: 5
    },
    answerKey: [],        // [{correct:'B', weight:1}, ...]
    students: [],         // [{id,name,kelas,answers:[],score,maxScore,percent,detail:[],ts}]
    models: []            // [{id,name,config,answerKey}] -> template lembar tersimpan
  });

  let profiles = loadProfiles();
  let state = loadState();

  function loadProfiles() {
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.list && p.list.length) return p;
      }
    } catch (e) { /* lanjut buat baru */ }

    // Pertama kali: buat profil default + migrasi data lama bila ada
    const id = uid('p');
    const reg = { active: id, list: [{ id, name: 'Guru 1' }] };
    localStorage.setItem(PROFILES_KEY, JSON.stringify(reg));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      localStorage.setItem(DATA_PREFIX + id, legacy); // data lama -> profil pertama
      localStorage.removeItem(LEGACY_KEY);
    }
    return reg;
  }

  function dataKey() { return DATA_PREFIX + profiles.active; }

  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function loadState() {
    try {
      const raw = localStorage.getItem(dataKey());
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      const d = defaultState();
      return Object.assign(d, s, { config: Object.assign(d.config, s.config || {}) });
    } catch (e) {
      console.warn('State korup, reset.', e);
      return defaultState();
    }
  }

  function save() {
    try { localStorage.setItem(dataKey(), JSON.stringify(state)); return true; }
    catch (e) { console.warn('Gagal menyimpan (penyimpanan mungkin penuh):', e); return false; }
  }
  function saveProfiles() { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); }

  function resetAll() {
    state = defaultState();
    save();
  }

  /* ---------- API Profil ---------- */
  function listProfiles() { return profiles.list.slice(); }
  function activeProfile() { return profiles.list.find(p => p.id === profiles.active) || profiles.list[0]; }

  function switchProfile(id) {
    if (!profiles.list.some(p => p.id === id)) return;
    profiles.active = id; saveProfiles();
    state = loadState();
    syncAnswerKeyInternal();
  }
  function addProfile(name) {
    const id = uid('p');
    profiles.list.push({ id, name: (name || '').trim() || ('Guru ' + (profiles.list.length + 1)) });
    profiles.active = id; saveProfiles();
    state = loadState(); syncAnswerKeyInternal();
    return id;
  }
  function renameProfile(id, name) {
    const p = profiles.list.find(x => x.id === id);
    if (p && name && name.trim()) { p.name = name.trim(); saveProfiles(); }
  }
  function deleteProfile(id) {
    if (profiles.list.length <= 1) return false;        // sisakan minimal 1
    localStorage.removeItem(DATA_PREFIX + id);          // hapus data profil itu
    profiles.list = profiles.list.filter(x => x.id !== id);
    if (profiles.active === id) profiles.active = profiles.list[0].id;
    saveProfiles();
    state = loadState(); syncAnswerKeyInternal();
    return true;
  }

  function syncAnswerKeyInternal() {
    const n = state.config.numQuestions;
    const w = state.config.defaultWeight;
    const ak = state.answerKey;
    while (ak.length < n) ak.push({ correct: 'A', half: null, weight: w });
    ak.length = n;
    ak.forEach(e => { if (e.weight == null) e.weight = w; });
    save();
  }

  /* ---------- Util huruf opsi ---------- */
  const LETTERS = 'ABCDEFGHIJ';
  function optionLetters(n) { return LETTERS.slice(0, n).split(''); }

  /* ---------- GEOMETRI LAYOUT (normalized 0..1) ----------
     Sistem koordinat (u,v) berada DI DALAM persegi yang dibentuk
     oleh 4 marker pojok:
       (0,0)=kiri-atas  (1,0)=kanan-atas
       (0,1)=kiri-bawah (1,1)=kanan-bawah
     Generator memetakan (u,v) -> halaman cetak.
     Scanner memetakan (u,v) -> foto via homography.
  ------------------------------------------------------------ */
  const LAYOUT = {
    marginX: 0.05,        // margin kiri/kanan area soal (dlm ruang marker)
    marginTop: 0.25,      // ruang header resmi (judul + identitas + sub-judul)
    marginBottom: 0.06,   // ruang kotak Nilai (mode tanpa esai)
    colGap: 0.045,        // jarak antar blok kolom (kiri-kanan terpisah)
    qLabelFrac: 0.14,     // porsi lebar kolom untuk nomor soal (lebih kecil)
    optAreaFrac: 0.86,    // = 1 - qLabelFrac -> opsi mengisi penuh kolom (semua kotak sama lebar)
    boxFillW: 0.62,       // ukuran sampling relatif lebar 1 kotak
    boxFillH: 0.52        // ukuran sampling relatif tinggi 1 baris
  };

  function rowsPerColumn(cfg) {
    return Math.ceil(cfg.numQuestions / cfg.columns);
  }

  /* Posisi pusat kotak opsi untuk (soal ke-q [0-based], opsi ke-o [0-based]).
     Mengembalikan {u, v, w, h} dalam ruang normalized marker. */
  function cellNormPos(q, o, cfg) {
    const L = LAYOUT;
    const rpc = rowsPerColumn(cfg);
    const col = Math.floor(q / rpc);
    const row = q % rpc;

    const availW = 1 - 2 * L.marginX;
    const availH = 1 - L.marginTop - L.marginBottom;
    const colW = (availW - L.colGap * (cfg.columns - 1)) / cfg.columns;

    const colX0 = L.marginX + col * (colW + L.colGap);
    const rowH = availH / rpc;
    const vCenter = L.marginTop + rowH * (row + 0.5);

    const optAreaX0 = colX0 + colW * L.qLabelFrac;
    const optAreaW = colW * L.optAreaFrac;
    const boxW = optAreaW / cfg.numOptions;
    const uCenter = optAreaX0 + boxW * (o + 0.5);

    return {
      u: uCenter,
      v: vCenter,
      w: boxW * L.boxFillW,
      h: rowH * L.boxFillH,
      colX0, colW, rowH, vCenter, optAreaX0, optAreaW, boxW
    };
  }

  /* Posisi nomor soal (kiri tiap baris) */
  function labelNormPos(q, cfg) {
    const L = LAYOUT;
    const rpc = rowsPerColumn(cfg);
    const col = Math.floor(q / rpc);
    const row = q % rpc;
    const availW = 1 - 2 * L.marginX;
    const availH = 1 - L.marginTop - L.marginBottom;
    const colW = (availW - L.colGap * (cfg.columns - 1)) / cfg.columns;
    const colX0 = L.marginX + col * (colW + L.colGap);
    const rowH = availH / rpc;
    return { u: colX0 + colW * 0.02, v: L.marginTop + rowH * (row + 0.5) };
  }

  /* ---------- API publik ---------- */
  return {
    get state() { return state; },
    get cfg() { return state.config; },
    save, resetAll,
    optionLetters, LETTERS,
    LAYOUT, rowsPerColumn, cellNormPos, labelNormPos,

    /* profil guru */
    listProfiles, activeProfile, switchProfile, addProfile, renameProfile, deleteProfile,

    /* model lembar (template tersimpan) */
    listModels() { return (state.models || []).map(m => ({ id: m.id, name: m.name })); },
    saveModel(name) {
      if (!state.models) state.models = [];
      const clone = o => JSON.parse(JSON.stringify(o));
      const nm = (name || '').trim() || (state.config.examTitle || 'Model') ;
      const existing = state.models.find(m => m.name === nm);
      const data = { config: clone(state.config), answerKey: clone(state.answerKey) };
      if (existing) { Object.assign(existing, data); }
      else { state.models.push(Object.assign({ id: uid('m'), name: nm }, data)); }
      save();
    },
    loadModel(id) {
      const m = (state.models || []).find(x => x.id === id);
      if (!m) return false;
      const clone = o => JSON.parse(JSON.stringify(o));
      state.config = Object.assign(defaultState().config, clone(m.config));
      state.answerKey = clone(m.answerKey);
      save(); syncAnswerKeyInternal();
      return true;
    },
    deleteModel(id) {
      state.models = (state.models || []).filter(x => x.id !== id);
      save();
    },

    /* sinkronkan panjang answerKey dengan numQuestions */
    syncAnswerKey: syncAnswerKeyInternal
  };
})();

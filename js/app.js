/* ============================================================
   app.js — Controller utama (perekat semua modul)
   ============================================================ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, props = {}, kids = []) => {
    const e = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (Array.isArray(kids) ? kids : [kids]).forEach(c => c != null && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  };

  let currentScan = null;     // {answers, name, kelas}
  let stream = null;          // kamera
  let currentTab = 'setup';   // tab aktif (utk render ulang stlh ganti profil)
  // --- mode live ---
  let liveActive = false, liveGraded = false, liveLast = null, liveStable = 0, liveTimer = null, liveVideo = null, liveFrame = null;
  const LIVE_STABLE = 4, LIVE_MOVE_TOL = 12, LIVE_INTERVAL = 280;

  /* ---------------- Profile bar ---------------- */
  function renderProfileBar() {
    const bar = $('#profile-bar'); if (!bar) return;
    bar.innerHTML = '';
    const active = OMR.activeProfile();
    const sel = el('select', { title: 'Pilih kelas' },
      OMR.listProfiles().map(p => {
        const o = el('option', { value: p.id }); o.textContent = p.name; return o;
      }));
    sel.value = active.id;
    sel.addEventListener('change', e => {
      OMR.switchProfile(e.target.value);
      currentScan = null;
      renderProfileBar();
      switchTab(currentTab);
    });
    bar.appendChild(el('span', { class: 'pf-label' }, 'Kelas:'));
    bar.appendChild(sel);
    bar.appendChild(el('button', { onclick: addProfilePrompt }, '+ Tambah'));
    bar.appendChild(el('button', { onclick: renameProfilePrompt }, 'Ubah nama'));
    bar.appendChild(el('button', { class: 'danger', onclick: deleteProfilePrompt }, 'Hapus'));
  }
  async function addProfilePrompt() {
    const name = await modalPrompt('Nama kelas baru (mis. X TKP):');
    if (name === null) return;
    OMR.addProfile(name);
    currentScan = null;
    renderProfileBar(); switchTab(currentTab);
    toast('Kelas "' + (OMR.activeProfile().name) + '" ditambahkan.', 'ok');
  }
  async function renameProfilePrompt() {
    const p = OMR.activeProfile();
    const name = await modalPrompt('Ubah nama kelas:', p.name);
    if (name === null) return;
    OMR.renameProfile(p.id, name);
    renderProfileBar();
    toast('Nama kelas diperbarui.', 'ok');
  }
  async function deleteProfilePrompt() {
    const p = OMR.activeProfile();
    if (OMR.listProfiles().length <= 1) { await modalAlert('Tidak bisa menghapus satu-satunya kelas.'); return; }
    if (!(await modalConfirm(`Hapus kelas "${p.name}" beserta SEMUA data-nya (kunci, daftar nama & nilai)? Tindakan ini tidak bisa dibatalkan.`, { danger: true, okText: 'Hapus' }))) return;
    const nm = p.name;
    OMR.deleteProfile(p.id);
    currentScan = null;
    renderProfileBar(); switchTab(currentTab);
    toast('Kelas "' + nm + '" dihapus.', 'warn');
  }

  /* ---------------- Navigasi ---------------- */
  function switchTab(id) {
    currentTab = id;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + id));
    $$('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    const hdr = document.querySelector('header.app'); if (hdr) hdr.classList.remove('menu-open'); // tutup menu mobile
    if (id !== 'scan') stopCamera();
    ({ setup: renderSetup, key: renderKey, sheet: renderSheet, scan: renderScan, results: renderResults }[id])();
  }

  /* ---------------- 1. Pengaturan ---------------- */
  function renderSetup() {
    const c = OMR.cfg;
    $('#view-setup').innerHTML = '';
    const card = el('div', { class: 'card' }, [
      el('h2', {}, 'Pengaturan Ujian'),
      el('p', { class: 'sub' }, 'Atur dulu sebelum membuat kunci & lembar jawaban. Mengubah jumlah soal akan menyesuaikan kunci jawaban.')
    ]);
    const form = el('div', { class: 'grid-form' }, [
      mkField('Judul ujian (internal)', mkInput('text', c.examTitle, v => c.examTitle = v, 'cfg-title')),
      mkField('Jumlah soal', mkInput('number', c.numQuestions, v => c.numQuestions = clamp(+v, 1, 100), 'cfg-q', { min: 1, max: 100 })),
      mkField('Jumlah opsi (A–…)', mkSelect([3, 4, 5, 6], c.numOptions, v => c.numOptions = +v, 'cfg-o')),
      mkField('Kolom di lembar', mkSelect([1, 2, 3], c.columns, v => c.columns = +v, 'cfg-col')),
      mkField('Bobot tiap soal', mkInput('number', c.defaultWeight, v => c.defaultWeight = Math.max(1, Math.round(+v) || 1), 'cfg-w', { min: 1, step: 1 })),
      mkField('KKM (batas tuntas, 0–100)', mkInput('number', c.kkm ?? 70, v => c.kkm = clamp(Math.round(+v), 0, 100), 'cfg-kkm', { min: 0, max: 100, step: 1 }))
    ]);
    card.appendChild(form);

    // --- Header lembar resmi ---
    card.appendChild(el('h3', { class: 'section' }, 'Header Lembar (untuk cetak)'));
    const ta = el('textarea', { id: 'cfg-titlelines', rows: '3', style: 'width:100%;font-family:var(--sans);font-size:14px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;resize:vertical' });
    ta.value = c.titleLines || '';
    ta.addEventListener('input', e => c.titleLines = e.target.value);
    card.appendChild(el('label', { class: 'field' }, ['Judul kop (tiap baris = 1 baris di lembar)', ta]));
    card.appendChild(el('div', { class: 'grid-form', style: 'margin-top:12px' }, [
      mkField('Mata Pelajaran (kosong = garis isian)', mkInput('text', c.mapel || '', v => c.mapel = v, 'cfg-mapel')),
      mkField('Hari/Tanggal (opsional)', mkInput('text', c.hariTanggal || '', v => c.hariTanggal = v, 'cfg-hari')),
      mkField('Waktu (opsional)', mkInput('text', c.waktu || '', v => c.waktu = v, 'cfg-waktu'))
    ]));

    // --- Bagian esai ---
    card.appendChild(el('h3', { class: 'section' }, 'Bagian Esai (hanya dicetak, dinilai manual)'));
    const essayWrap = el('div', { class: 'grid-form' }, [
      mkField('Sertakan halaman esai?', mkSelect(['Tidak', 'Ya'], c.hasEssay ? 'Ya' : 'Tidak', v => c.hasEssay = (v === 'Ya'), 'cfg-essay')),
      mkField('Jumlah soal esai', mkInput('number', c.essayCount || 5, v => c.essayCount = clamp(+v, 1, 20), 'cfg-essayn', { min: 1, max: 20 }))
    ]);
    card.appendChild(essayWrap);

    card.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn accent', onclick: () => saveSetup(), 'aria-label': 'Simpan Pengaturan' }, 'Simpan Pengaturan'),
      el('button', { class: 'btn ghost', onclick: resetEverything }, 'Reset Semua Data')
    ]));
    $('#view-setup').appendChild(card);

    // --- Manajemen Model Lembar ---
    renderModelCard();
    // --- Daftar Nama Siswa (roster kelas ini) ---
    renderRosterCard();
  }

  /* Ubah teks/tempel jadi array nama (1 nama per baris; abaikan kolom angka) */
  function parseRosterText(text) {
    return dedupeNames(text.split(/\r?\n/).map(line => pickName(line.split(/[\t,;]+/))).filter(Boolean));
  }
  const HEADER_WORDS = new Set(['no', 'no.', 'nomor', 'nama', 'nama siswa', 'name', 'siswa', 'nis']);
  function pickName(cells) {
    cells = cells.map(c => String(c).trim()).filter(Boolean);
    if (!cells.length) return '';
    let name;
    if (cells.length === 1) name = cells[0];
    else {
      const names = cells.filter(c => !/^\d+([.,]\d+)?$/.test(c)); // buang sel angka murni (No)
      name = (names.sort((a, b) => b.length - a.length)[0]) || cells[cells.length - 1];
    }
    if (HEADER_WORDS.has(name.toLowerCase())) return ''; // lewati baris judul
    return name;
  }
  function dedupeNames(arr) {
    const seen = new Set(), out = [];
    arr.forEach(n => { const k = n.toLowerCase(); if (n && !seen.has(k)) { seen.add(k); out.push(n); } });
    return out;
  }
  function addNamesToRoster(names) {
    if (!names.length) { toast('Tidak ada nama terbaca.', 'warn', '#view-setup'); return; }
    OMR.state.roster = dedupeNames((OMR.state.roster || []).concat(names));
    OMR.save(); renderRosterCard();
    toast(names.length + ' nama ditambahkan. Total ' + OMR.state.roster.length + ' nama.', 'ok', '#view-setup');
  }
  function importRosterFile(e) {
    const f = e.target.files[0]; if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const reader = new FileReader();
    if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = ev => {
        try {
          const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
          addNamesToRoster(dedupeNames(rows.map(r => pickName(r)).filter(Boolean)));
        } catch (err) { toast('Gagal membaca file Excel.', 'err', '#view-setup'); }
      };
      reader.readAsArrayBuffer(f);
    } else { // csv / txt
      reader.onload = ev => addNamesToRoster(parseRosterText(ev.target.result));
      reader.readAsText(f);
    }
    e.target.value = '';
  }

  function downloadRosterTemplate() {
    try {
      const aoa = [['No', 'Nama Siswa'],
        [1, 'Budi Santoso'], [2, 'Siti Aminah'], [3, 'Ahmad Fauzi'],
        [4, ''], [5, ''], [6, ''], [7, ''], [8, '']];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 6 }, { wch: 32 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Daftar Siswa');
      XLSX.writeFile(wb, 'Template Daftar Nama Siswa.xlsx');
    } catch (e) { toast('Gagal membuat template.', 'err', '#view-setup'); }
  }

  function renderRosterCard() {
    const roster = OMR.state.roster || [];
    const card = el('div', { class: 'card' }, [
      el('h2', {}, 'Daftar Nama Siswa'),
      el('p', { class: 'sub' }, 'Daftar nama untuk kelas "' + OMR.activeProfile().name + '". Saat scan, nama tinggal dipilih (tak perlu diketik). Tempel nama (1 per baris) dari Excel, atau impor file. Belum punya format? Unduh template dulu, isi kolom Nama, lalu impor kembali.')
    ]);
    const ta = el('textarea', { id: 'roster-paste', rows: '4', placeholder: 'Tempel nama di sini, satu nama per baris…\nBudi Santoso\nSiti Aminah\n…' });
    card.appendChild(ta);
    card.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn accent', onclick: () => { addNamesToRoster(parseRosterText($('#roster-paste').value)); $('#roster-paste').value = ''; } }, 'Tambah dari teks'),
      el('button', { class: 'btn ghost', onclick: () => $('#roster-file').click() }, 'Impor file (Excel/CSV)'),
      el('button', { class: 'btn ghost', onclick: downloadRosterTemplate }, 'Unduh Template'),
      el('input', { type: 'file', id: 'roster-file', accept: '.xlsx,.xls,.csv,.txt', style: 'display:none', onchange: importRosterFile })
    ]));
    if (roster.length) {
      card.appendChild(el('h3', { class: 'section' }, roster.length + ' nama tersimpan'));
      const chips = el('div', { class: 'chips' });
      roster.forEach((n, i) => {
        chips.appendChild(el('span', { class: 'chip' }, [
          document.createTextNode(n),
          el('button', { class: 'chip-x', title: 'Hapus', onclick: () => { OMR.state.roster.splice(i, 1); OMR.save(); renderRosterCard(); } }, '×')
        ]));
      });
      card.appendChild(chips);
      card.appendChild(el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn ghost sm', onclick: async () => { if (await modalConfirm('Kosongkan seluruh daftar nama kelas ini?', { danger: true, okText: 'Kosongkan' })) { OMR.state.roster = []; OMR.save(); renderRosterCard(); toast('Daftar nama dikosongkan.', 'warn'); } } }, 'Kosongkan daftar nama')
      ]));
    } else {
      card.appendChild(el('div', { class: 'empty', style: 'padding:16px' }, 'Belum ada nama. Tempel atau impor daftar nama siswa kelas ini.'));
    }
    // ganti kartu lama bila sudah ada (agar tdk dobel saat renderRosterCard dipanggil ulang)
    const old = $('#roster-card'); if (old) old.remove();
    card.id = 'roster-card';
    $('#view-setup').appendChild(card);
  }

  function renderModelCard() {
    const models = OMR.listModels();
    const card = el('div', { class: 'card' }, [
      el('h2', {}, 'Model Lembar'),
      el('p', { class: 'sub' }, 'Simpan kombinasi pengaturan + kunci jawaban sebagai "model" untuk dipakai ulang (mis. tiap tahun/mapel beda). Pilih model sebelum mencetak & sebelum scan.')
    ]);
    const row = el('div', { class: 'btn-row' });
    if (models.length) {
      const sel = el('select', { id: 'model-sel', style: 'width:auto;min-width:200px' }, models.map(m => { const o = el('option', { value: m.id }); o.textContent = m.name; return o; }));
      row.appendChild(sel);
      row.appendChild(el('button', { class: 'btn', onclick: () => { OMR.loadModel($('#model-sel').value); renderSetup(); toast('Model dimuat. Pengaturan & kunci diperbarui.', 'ok', '#view-setup'); } }, 'Muat'));
      row.appendChild(el('button', { class: 'btn ghost', onclick: async () => { const m = models.find(x => x.id === $('#model-sel').value); if (m && await modalConfirm('Hapus model "' + m.name + '"?', { danger: true, okText: 'Hapus' })) { OMR.deleteModel(m.id); renderSetup(); toast('Model "' + m.name + '" dihapus.', 'warn'); } } }, 'Hapus'));
    } else {
      card.appendChild(el('div', { class: 'empty', style: 'padding:14px' }, 'Belum ada model tersimpan.'));
    }
    row.appendChild(el('button', { class: 'btn accent', onclick: async () => { const n = await modalPrompt('Simpan sebagai Model — beri nama:', OMR.cfg.examTitle); if (n === null) return; saveSetup(true); OMR.saveModel(n); renderSetup(); toast('Model "' + (n || OMR.cfg.examTitle) + '" tersimpan.', 'ok', '#view-setup'); } }, '+ Simpan sebagai Model'));
    card.appendChild(row);
    $('#view-setup').appendChild(card);
  }

  function saveSetup(silent) {
    OMR.cfg.examTitle = $('#cfg-title').value || 'Ulangan Harian';
    OMR.cfg.numQuestions = clamp(+$('#cfg-q').value, 1, 100);
    OMR.cfg.numOptions = +$('#cfg-o').value;
    OMR.cfg.columns = +$('#cfg-col').value;
    OMR.cfg.defaultWeight = Math.max(1, Math.round(+$('#cfg-w').value) || 1);
    OMR.cfg.kkm = clamp(Math.round(+$('#cfg-kkm').value), 0, 100);
    if ($('#cfg-titlelines')) OMR.cfg.titleLines = $('#cfg-titlelines').value;
    if ($('#cfg-mapel')) OMR.cfg.mapel = $('#cfg-mapel').value;
    if ($('#cfg-hari')) OMR.cfg.hariTanggal = $('#cfg-hari').value;
    if ($('#cfg-waktu')) OMR.cfg.waktu = $('#cfg-waktu').value;
    if ($('#cfg-essay')) OMR.cfg.hasEssay = ($('#cfg-essay').value === 'Ya');
    if ($('#cfg-essayn')) OMR.cfg.essayCount = clamp(+$('#cfg-essayn').value, 1, 20);
    OMR.syncAnswerKey();
    OMR.state.answerKey.forEach(e => e.weight = OMR.cfg.defaultWeight); // bobot ini berlaku ke SEMUA soal
    OMR.save();
    if (!silent) toast('Pengaturan tersimpan. Semua soal kini berbobot ' + OMR.cfg.defaultWeight + '.', 'ok', '#view-setup');
  }
  async function resetEverything() {
    if (!(await modalConfirm('Hapus SEMUA data (pengaturan, kunci, & nilai siswa)? Tindakan ini tidak bisa dibatalkan.', { danger: true, okText: 'Hapus Semua' }))) return;
    OMR.resetAll(); OMR.syncAnswerKey(); renderSetup();
    toast('Semua data direset.', 'warn', '#view-setup');
  }

  /* ---------------- 2. Kunci Jawaban ---------------- */
  function renderKey() {
    OMR.syncAnswerKey();
    const letters = OMR.optionLetters(OMR.cfg.numOptions);
    const wrap = $('#view-key'); wrap.innerHTML = '';
    const card = el('div', { class: 'card' }, [
      el('h2', {}, 'Kunci Jawaban'),
      el('p', { class: 'sub' }, 'Setel jawaban benar tiap soal. Bobot bisa beda per soal.')
    ]);
    const grid = el('div', { class: 'key-grid' });
    OMR.state.answerKey.forEach((k, i) => {
      k.half = null; // pilgan murni: tanpa nilai separuh
      const corr = el('select', {}, letters.map(L => optEl(L, L)));
      corr.value = k.correct;
      corr.addEventListener('change', e => { k.correct = e.target.value; OMR.save(); });
      const wt = mkInput('number', k.weight ?? 1, v => { k.weight = Math.max(1, Math.round(+v) || 1); OMR.save(); }, '', { min: 1, step: 1 });
      grid.appendChild(el('div', { class: 'key-item' }, [
        el('div', { class: 'no' }, String(i + 1)),
        el('div', {}, [el('div', { class: 'lbl' }, 'Benar'), corr]),
        el('div', {}, [el('div', { class: 'lbl' }, 'Bobot'), wt])
      ]));
    });
    // Tinggi kolom tetap: maks 20 soal per kolom (1-20 kolom 1, 21-40 kolom 2, dst).
    const perCol = 20;
    const rows = Math.max(1, Math.min(OMR.state.answerKey.length, perCol));
    grid.style.gridTemplateRows = `repeat(${rows}, auto)`;
    card.appendChild(grid);
    card.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn ghost', onclick: () => { OMR.state.answerKey.forEach(k => k.correct = letters[0]); OMR.save(); renderKey(); } }, 'Set semua jawaban → ' + letters[0]),
      el('button', { class: 'btn accent', onclick: () => toast('Kunci tersimpan otomatis.', 'ok', '#view-key') }, 'Selesai')
    ]));
    wrap.appendChild(card);
  }

  /* ---------------- 3. Lembar Jawaban ---------------- */
  function renderSheet() {
    OMR.syncAnswerKey();
    const wrap = $('#view-sheet'); wrap.innerHTML = '';
    const pages = OMRSheet.pages(OMR.cfg);   // [hal.1, (hal.2 esai)]
    const previews = el('div', {});
    pages.forEach((c, i) => {
      previews.appendChild(el('div', { class: 'canvas-wrap', style: 'margin-bottom:10px' }, c));
      if (i === 0) previews.lastChild.appendChild(el('div', { class: 'sub', style: 'margin:6px 0 0' }, 'Halaman 1 — DISCAN'));
      else previews.lastChild.appendChild(el('div', { class: 'sub', style: 'margin:6px 0 0' }, 'Halaman ' + (i + 1) + ' — esai (tidak discan)'));
    });
    const card = el('div', { class: 'card' }, [
      el('h2', {}, 'Lembar Jawaban'),
      el('p', { class: 'sub' }, 'Cetak lembar ini. Halaman 1 (pilihan ganda) yang difoto untuk dikoreksi — empat kotak hitam di sudutnya WAJIB ikut tercetak & terlihat. Halaman esai (bila ada) tidak discan.'),
      previews,
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn accent', onclick: () => OMRSheet.print(OMR.cfg) }, 'Cetak'),
        el('button', { class: 'btn', onclick: () => OMRSheet.downloadPDF(OMR.cfg) }, 'Unduh PDF')
      ])
    ]);
    wrap.appendChild(card);
  }

  /* ---------------- 4. Scan & Koreksi ---------------- */
  function renderScan() {
    const wrap = $('#view-scan'); wrap.innerHTML = '';
    const card = el('div', { class: 'card' }, [
      el('h2', {}, 'Scan & Koreksi'),
      el('p', { class: 'sub' }, 'Mode Live: arahkan lembar ke kamera (mis. webcam di tripod menghadap bawah) — begitu stabil, app otomatis membaca & menilai. Atau ambil/unggah satu foto secara manual.'),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn accent', id: 'btn-live', onclick: startLive }, 'Mulai Mode Live'),
        el('button', { class: 'btn', id: 'btn-cam', onclick: startCamera }, 'Ambil Satu Foto'),
        el('button', { class: 'btn ghost', onclick: () => $('#file-in').click() }, 'Unggah Foto'),
        el('input', { type: 'file', id: 'file-in', accept: 'image/*', style: 'display:none', onchange: onUpload })
      ]),
      el('div', { id: 'cam-area' }),
      el('div', { id: 'scan-result' })
    ]);
    wrap.appendChild(card);
  }

  async function startCamera() {
    stopCamera();
    const area = $('#cam-area'); area.innerHTML = '';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } });
    } catch (e) {
      toast('Tidak bisa akses kamera: ' + e.message + '. Gunakan "Unggah Foto".', 'err', '#cam-area'); return;
    }
    const video = el('video', { autoplay: '', playsinline: '' });
    video.srcObject = stream;
    area.appendChild(video);
    area.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn accent', onclick: () => capture(video) }, 'Ambil & Koreksi'),
      el('button', { class: 'btn ghost', onclick: stopCamera }, 'Tutup Kamera')
    ]));
  }
  function stopCamera() {
    liveActive = false;
    if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
    liveVideo = null; liveLast = null; liveStable = 0; liveGraded = false;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    const a = $('#cam-area'); if (a) a.innerHTML = '';
  }

  /* ---------------- Mode Live ---------------- */
  async function startLive() {
    stopCamera();
    const area = $('#cam-area'); area.innerHTML = '';
    $('#scan-result').innerHTML = '';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } });
    } catch (e) {
      toast('Tidak bisa akses kamera: ' + e.message + '. Coba "Unggah Foto".', 'err', '#cam-area'); return;
    }
    const video = el('video', { autoplay: '', playsinline: '', muted: '' });
    video.srcObject = stream; liveVideo = video;
    area.appendChild(el('div', { class: 'live-stage' }, [video, el('div', { id: 'live-status', class: 'live-status' }, 'Memulai kamera…')]));
    area.appendChild(el('div', { class: 'btn-row' }, [el('button', { class: 'btn ghost', onclick: stopCamera }, 'Hentikan Mode Live')]));
    OMR.syncAnswerKey();
    liveActive = true; liveGraded = false; liveLast = null; liveStable = 0;
    loopLive();
  }

  function frameCanvas(video) {
    if (!liveFrame) liveFrame = document.createElement('canvas');
    liveFrame.width = video.videoWidth; liveFrame.height = video.videoHeight;
    liveFrame.getContext('2d').drawImage(video, 0, 0);
    return liveFrame;
  }
  function fidMove(a, b) {
    return ['tl', 'tr', 'bl', 'br'].reduce((s, k) => s + Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y), 0) / 4;
  }
  function setStatus(text, cls) { const s = $('#live-status'); if (s) { s.textContent = text; s.className = 'live-status' + (cls ? ' ' + cls : ''); } }

  function loopLive() {
    if (!liveActive || !liveVideo) return;
    if (liveVideo.videoWidth) {
      const c = frameCanvas(liveVideo);
      const res = OMRCV.process(c, c.width, c.height, OMR.cfg);
      if (res.ok) {
        const f = res.debug.fids;
        const move = liveLast ? fidMove(f, liveLast) : 999;
        liveLast = f;
        liveStable = (move < LIVE_MOVE_TOL) ? liveStable + 1 : 1;
        const g = OMRScore.gradeAll(res.answers, OMR.state.answerKey);
        if (liveStable >= LIVE_STABLE && !liveGraded) {
          liveGraded = true; liveActive = false;
          setStatus('Terkunci ✓ — periksa & simpan', 'ok');
          runPipeline(c, c.width, c.height, true);
          return;
        }
        setStatus(`Lembar terdeteksi · nilai sementara ${g.percent} · tahan stabil (${Math.min(liveStable, LIVE_STABLE)}/${LIVE_STABLE})`, 'ok');
      } else {
        liveStable = 0; liveLast = null;
        setStatus('Arahkan lembar — pastikan ke-4 sudut (kotak hitam) terlihat jelas', 'wait');
      }
    }
    liveTimer = setTimeout(loopLive, LIVE_INTERVAL);
  }

  function resumeLive() {
    $('#scan-result').innerHTML = '';
    currentScan = null;
    if (!stream || !liveVideo) return;
    liveActive = true; liveGraded = false; liveLast = null; liveStable = 0;
    setStatus('Siap — arahkan lembar berikutnya', 'wait');
    loopLive();
  }

  function capture(video) {
    const c = el('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    stopCamera();
    runPipeline(c, c.width, c.height);
  }
  function onUpload(e) {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => runPipeline(img, img.naturalWidth, img.naturalHeight);
    img.onerror = () => toast('Gagal memuat gambar.', 'err', '#scan-result');
    img.src = URL.createObjectURL(f);
  }

  function nameField() {
    const roster = OMR.state.roster || [];
    const input = mkInput('text', '', v => currentScan.name = v, 'st-name');
    input.setAttribute('placeholder', roster.length ? 'Ketik atau pilih nama…' : 'Ketik nama siswa…');
    const field = mkField('Nama siswa  ·  kelas: ' + currentScan.kelas, input);
    if (roster.length) {
      input.setAttribute('list', 'roster-dl');
      field.appendChild(el('datalist', { id: 'roster-dl' }, roster.map(n => el('option', { value: n }))));
    }
    return el('div', { class: 'grid-form', style: 'margin-top:14px' }, [field]);
  }

  function runPipeline(src, w, h, liveMode) {
    OMR.syncAnswerKey();
    const res = OMRCV.process(src, w, h, OMR.cfg);
    const box = $('#scan-result'); box.innerHTML = '';
    if (!res.ok) {
      box.appendChild(notice(res.reason, 'err'));
      if (liveMode) box.appendChild(el('div', { class: 'btn-row' }, [el('button', { class: 'btn', onclick: resumeLive }, 'Coba Lagi')]));
      return;
    }
    currentScan = { answers: res.answers.slice(), name: '', kelas: OMR.activeProfile().name };
    const dbg = el('canvas');
    currentScan.res = res;
    currentScan.dbg = dbg;
    drawResultOverlay();

    box.appendChild(el('h3', { class: 'section' }, 'Verifikasi pembacaan'));
    box.appendChild(notice('Lingkaran merah = marker. Kotak HIJAU = jawaban benar (kunci), MERAH = pilihan siswa yang salah, biru = titik baca. Soal kuning perlu Anda pastikan (kosong/ganda).', 'warn'));
    box.appendChild(el('div', { class: 'canvas-wrap' }, dbg));
    box.appendChild(nameField());
    box.appendChild(el('h3', { class: 'section' }, 'Jawaban terbaca (bisa dikoreksi)'));
    box.appendChild(el('div', { id: 'review' }));
    box.appendChild(el('div', { id: 'score-preview' }));
    if (liveMode) {
      box.appendChild(el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn accent', onclick: () => { if (saveStudent()) resumeLive(); } }, 'Simpan & Scan Berikutnya'),
        el('button', { class: 'btn ghost', onclick: resumeLive }, 'Lewati & Lanjut')
      ]));
    } else {
      box.appendChild(el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn accent', onclick: saveStudent }, 'Simpan ke Daftar Nilai'),
        el('button', { class: 'btn ghost', onclick: () => { currentScan = null; box.innerHTML = ''; } }, 'Buang')
      ]));
    }
    renderReview();
    if (liveMode) { const n = $('#st-name'); if (n) n.focus(); }
  }

  function drawResultOverlay() {
    if (!currentScan || !currentScan.dbg || !currentScan.res) return;
    OMRCV.drawDebug(currentScan.dbg, currentScan.res, {
      answers: currentScan.answers,
      key: OMR.state.answerKey.map(k => k && k.correct),
      letters: OMR.optionLetters(OMR.cfg.numOptions)
    });
  }

  function renderReview() {
    const letters = OMR.optionLetters(OMR.cfg.numOptions);
    const rv = $('#review'); rv.innerHTML = '';
    const grid = el('div', { class: 'review-grid' });
    currentScan.answers.forEach((ans, q) => {
      const flag = (ans === '?' || ans === '-');
      const correct = (OMR.state.answerKey[q] || {}).correct;
      const opts = el('div', { class: 'opt-btns' });
      [...letters, '–'].forEach(L => {
        const val = L === '–' ? '-' : L;
        let cls = (ans === val ? 'sel ' : '') + (L === '–' ? 'blank ' : '');
        if (correct && val === correct) cls += 'correct ';
        else if (val === ans && ans !== correct && val !== '-') cls += 'wrong ';
        const b = el('button', { class: cls.trim(), onclick: () => { currentScan.answers[q] = val; renderReview(); } }, L);
        opts.appendChild(b);
      });
      grid.appendChild(el('div', { class: 'rev-q' + (flag ? ' flag' : '') }, [
        el('span', { class: 'qn' }, String(q + 1)), opts
      ]));
    });
    rv.appendChild(grid);
    drawResultOverlay();   // overlay gambar ikut warna terbaru setelah koreksi
    renderScorePreview();
  }
  function renderScorePreview() {
    const g = OMRScore.gradeAll(currentScan.answers, OMR.state.answerKey);
    const sp = $('#score-preview'); sp.innerHTML = '';
    sp.appendChild(el('div', { class: 'card', style: 'margin-top:14px;background:var(--surface-2)' }, [
      el('div', { class: 'score-big', html: `${g.percent}<small> / 100</small>` }),
      el('div', { class: 'kv' }, [
        el('span', { html: `Skor: <b>${g.score}</b> / ${g.maxScore}` }),
        el('span', { html: `<span class="stat benar">Benar ${g.counts.benar || 0}</span>` }),
        el('span', { html: `<span class="stat salah">Salah ${(g.counts.salah || 0) + (g.counts.kosong || 0) + (g.counts.ganda || 0)}</span>` })
      ])
    ]));
  }
  function saveStudent() {
    if (currentScan.answers.includes('?')) { toast('Masih ada soal ambigu (kuning). Pastikan dulu semua.', 'warn', '#scan-result'); return false; }
    if (!currentScan.name.trim()) { toast('Isi nama siswa dulu.', 'warn', '#scan-result'); return false; }
    const g = OMRScore.gradeAll(currentScan.answers, OMR.state.answerKey);
    OMR.state.students.push({
      id: Date.now(), name: currentScan.name.trim(), kelas: currentScan.kelas.trim(),
      answers: currentScan.answers.slice(), score: g.score, maxScore: g.maxScore,
      percent: g.percent, counts: g.counts, ts: Date.now()
    });
    if (!OMR.save()) {
      OMR.state.students.pop();   // batalkan: penyimpanan gagal
      toast('Penyimpanan penuh. Buka tab Rekap Nilai → Unduh Excel, lalu "Kosongkan Daftar", baru simpan lagi.', 'err', '#scan-result');
      return false;
    }
    currentScan = null; $('#scan-result').innerHTML = '';
    toast('Tersimpan. Lihat tab "Rekap Nilai".', 'ok', '#scan-result');
    return true;
  }

  /* ---------------- 5. Rekap Nilai ---------------- */
  function renderResults() {
    const wrap = $('#view-results'); wrap.innerHTML = '';
    const st = OMR.state.students;
    const kkm = OMR.cfg.kkm ?? 70;
    const card = el('div', { class: 'card' }, [
      el('h2', {}, 'Rekap Nilai'),
      el('p', { class: 'sub' }, `${st.length} siswa tersimpan · KKM ${kkm} (hijau = tuntas, merah = di bawah KKM). Unduh dalam format Excel, Word, atau PDF.`)
    ]);
    card.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn', disabled: st.length ? null : 'disabled', onclick: () => OMRExport.toExcel(st) }, 'Unduh Excel'),
      el('button', { class: 'btn', disabled: st.length ? null : 'disabled', onclick: () => OMRExport.toDOCX(st) }, 'Unduh Word'),
      el('button', { class: 'btn', disabled: st.length ? null : 'disabled', onclick: () => OMRExport.toPDF(st) }, 'Unduh PDF'),
      el('button', { class: 'btn ghost', disabled: st.length ? null : 'disabled', onclick: clearStudents }, 'Kosongkan Daftar')
    ]));
    if (!st.length) { card.appendChild(el('div', { class: 'empty' }, 'Belum ada nilai. Lakukan scan di tab "Scan & Koreksi".')); }
    else {
      const rows = st.map((s, i) => {
        const c = s.counts || {};
        const salah = (c.salah || 0) + (c.kosong || 0) + (c.ganda || 0);
        return el('tr', {}, [
          el('td', {}, String(i + 1)),
          el('td', { class: 'name' }, s.name),
          el('td', {}, s.kelas || '-'),
          el('td', { html: `<span class="stat benar">${c.benar || 0}</span>` }),
          el('td', { html: `<span class="stat salah">${salah}</span>` }),
          el('td', {}, `${s.score} / ${s.maxScore}`),
          el('td', { html: `<span class="pill ${s.percent >= kkm ? 'pass' : 'fail'}">${s.percent}</span>` }),
          el('td', {}, el('button', { class: 'btn ghost sm', onclick: async () => { if (await modalConfirm('Hapus ' + s.name + '?', { danger: true, okText: 'Hapus' })) { OMR.state.students.splice(i, 1); OMR.save(); renderResults(); toast('Siswa dihapus.', 'warn'); } } }, 'Hapus'))
        ]);
      });
      const table = el('table', { class: 'rekap' }, [
        el('thead', {}, el('tr', {}, ['No', 'Nama', 'Kelas', 'Benar', 'Salah', 'Skor', 'Nilai', ''].map(h => el('th', {}, h)))),
        el('tbody', {}, rows)
      ]);
      card.appendChild(el('div', { class: 'table-scroll' }, table));
    }
    wrap.appendChild(card);
  }
  async function clearStudents() {
    if (!(await modalConfirm('Kosongkan seluruh daftar nilai? (kunci & pengaturan tetap)', { danger: true, okText: 'Kosongkan' }))) return;
    OMR.state.students = []; OMR.save(); renderResults();
    toast('Daftar nilai dikosongkan.', 'warn');
  }

  /* ---------------- Helpers ---------------- */
  /* Modal custom (pengganti alert/confirm/prompt bawaan browser) */
  function modal({ title, message, input, defaultValue, okText = 'OK', cancelText = 'Batal', danger = false, showCancel = true }) {
    return new Promise(resolve => {
      const back = el('div', { class: 'modal-back' });
      const card = el('div', { class: 'modal-card' });
      if (title) card.appendChild(el('div', { class: 'modal-title' }, title));
      if (message) card.appendChild(el('div', { class: 'modal-msg' }, message));
      let field = null;
      if (input) { field = el('input', { type: 'text', class: 'modal-input', value: defaultValue || '' }); card.appendChild(field); }
      const okBtn = el('button', { class: 'btn ' + (danger ? 'btn-danger' : 'accent') }, okText);
      const cancelBtn = el('button', { class: 'btn ghost' }, cancelText);
      card.appendChild(el('div', { class: 'modal-row' }, showCancel ? [cancelBtn, okBtn] : [okBtn]));
      back.appendChild(card);
      document.body.appendChild(back);
      requestAnimationFrame(() => back.classList.add('show'));
      function close(val) { document.removeEventListener('keydown', onKey); back.classList.remove('show'); setTimeout(() => back.remove(), 200); resolve(val); }
      function onKey(e) { if (e.key === 'Enter') { e.preventDefault(); close(input ? field.value : true); } else if (e.key === 'Escape') { close(input ? null : false); } }
      okBtn.addEventListener('click', () => close(input ? field.value : true));
      cancelBtn.addEventListener('click', () => close(input ? null : false));
      back.addEventListener('click', e => { if (e.target === back) close(input ? null : false); });
      document.addEventListener('keydown', onKey);
      if (field) { field.focus(); field.select(); } else okBtn.focus();
    });
  }
  const modalAlert = (message, title = '') => modal({ title, message, showCancel: false });
  const modalConfirm = (message, opts = {}) => modal(Object.assign({ message, okText: 'Ya', cancelText: 'Batal' }, opts));
  const modalPrompt = (label, defaultValue = '') => modal({ title: label, input: true, defaultValue });

  function mkField(label, control) { return el('label', { class: 'field' }, [label, control]); }
  function mkInput(type, val, on, id, extra = {}) {
    const i = el('input', Object.assign({ type, value: val }, id ? { id } : {}, extra));
    i.addEventListener('input', e => on(e.target.value));
    return i;
  }
  function mkSelect(values, sel, on, id) {
    const s = el('select', id ? { id } : {}, values.map(v => optEl(String(v), String(v))));
    s.value = String(sel);
    s.addEventListener('change', e => on(e.target.value));
    return s;
  }
  function optEl(text, value) { const o = el('option', { value }); o.textContent = text; return o; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n || a)); }
  function notice(text, type) { return el('div', { class: 'notice ' + type }, text); }
  /* Notifikasi popup melayang (selalu terlihat walau halaman di-scroll).
     Param 'anchor' lama diabaikan — semua toast kini tampil di posisi tetap. */
  function toast(text, type /*, anchor */) {
    type = type || 'ok';
    let host = document.getElementById('toast-host');
    if (!host) { host = el('div', { id: 'toast-host' }); document.body.appendChild(host); }
    const icons = { ok: '✓', warn: '!', err: '✕', info: 'i' };
    const t = el('div', { class: 'toast toast-' + type });
    t.appendChild(el('span', { class: 'toast-ic' }, icons[type] || icons.info));
    t.appendChild(el('span', { class: 'toast-tx' }, text));
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    let done = false;
    const close = () => { if (done) return; done = true; t.classList.remove('show'); t.classList.add('hide'); setTimeout(() => t.remove(), 280); };
    const timer = setTimeout(close, type === 'err' ? 4200 : 2800);
    t.addEventListener('click', () => { clearTimeout(timer); close(); });
  }
  function download(href, name) { const a = el('a', { href, download: name }); document.body.appendChild(a); a.click(); a.remove(); }

  /* ---------------- Init ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    OMR.syncAnswerKey();
    renderProfileBar();
    $$('nav.tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    const mt = $('#menu-toggle');
    if (mt) mt.addEventListener('click', () => document.querySelector('header.app').classList.toggle('menu-open'));
    switchTab('setup');
    // app siap -> sembunyikan splash (jaga waktu tampil minimum agar tak berkedip)
    const splash = document.getElementById('splash');
    if (splash) {
      const SPLASH_MIN_MS = 2200; // <-- SETTING lama tampil layar pembuka (milidetik). Ubah angka ini.
      const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - (window.__splashStart || Date.now())));
      setTimeout(() => { splash.classList.add('hide'); setTimeout(() => splash.remove(), 500); }, wait);
    }
  });
})();

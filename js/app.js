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

  /* ---------------- Profile bar ---------------- */
  function renderProfileBar() {
    const bar = $('#profile-bar'); if (!bar) return;
    bar.innerHTML = '';
    const active = OMR.activeProfile();
    const sel = el('select', { title: 'Pilih profil guru' },
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
    bar.appendChild(el('span', { class: 'pf-label' }, 'Profil guru:'));
    bar.appendChild(sel);
    bar.appendChild(el('button', { onclick: addProfilePrompt }, '+ Tambah'));
    bar.appendChild(el('button', { onclick: renameProfilePrompt }, 'Ubah nama'));
    bar.appendChild(el('button', { class: 'danger', onclick: deleteProfilePrompt }, 'Hapus'));
  }
  function addProfilePrompt() {
    const name = prompt('Nama guru / profil baru:');
    if (name === null) return;
    OMR.addProfile(name);
    currentScan = null;
    renderProfileBar(); switchTab(currentTab);
  }
  function renameProfilePrompt() {
    const p = OMR.activeProfile();
    const name = prompt('Ubah nama profil:', p.name);
    if (name === null) return;
    OMR.renameProfile(p.id, name);
    renderProfileBar();
  }
  function deleteProfilePrompt() {
    const p = OMR.activeProfile();
    if (OMR.listProfiles().length <= 1) { alert('Tidak bisa menghapus satu-satunya profil.'); return; }
    if (!confirm(`Hapus profil "${p.name}" beserta SEMUA data-nya (kunci & nilai)? Tidak bisa dibatalkan.`)) return;
    OMR.deleteProfile(p.id);
    currentScan = null;
    renderProfileBar(); switchTab(currentTab);
  }

  /* ---------------- Navigasi ---------------- */
  function switchTab(id) {
    currentTab = id;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + id));
    $$('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
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
      mkField('Judul ujian', mkInput('text', c.examTitle, v => c.examTitle = v, 'cfg-title')),
      mkField('Jumlah soal', mkInput('number', c.numQuestions, v => c.numQuestions = clamp(+v, 1, 100), 'cfg-q', { min: 1, max: 100 })),
      mkField('Jumlah opsi (A–…)', mkSelect([3, 4, 5, 6], c.numOptions, v => c.numOptions = +v, 'cfg-o')),
      mkField('Kolom di lembar', mkSelect([1, 2, 3], c.columns, v => c.columns = +v, 'cfg-col')),
      mkField('Bobot default / soal', mkInput('number', c.defaultWeight, v => c.defaultWeight = Math.max(0.1, +v), 'cfg-w', { min: .5, step: .5 }))
    ]);
    card.appendChild(form);
    card.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn accent', onclick: saveSetup }, 'Simpan Pengaturan'),
      el('button', { class: 'btn ghost', onclick: resetEverything }, 'Reset Semua Data')
    ]));
    $('#view-setup').appendChild(card);
  }
  function saveSetup() {
    OMR.cfg.examTitle = $('#cfg-title').value || 'Ulangan Harian';
    OMR.cfg.numQuestions = clamp(+$('#cfg-q').value, 1, 100);
    OMR.cfg.numOptions = +$('#cfg-o').value;
    OMR.cfg.columns = +$('#cfg-col').value;
    OMR.cfg.defaultWeight = Math.max(0.1, +$('#cfg-w').value);
    OMR.syncAnswerKey();
    toast('Pengaturan tersimpan.', 'ok', '#view-setup');
  }
  function resetEverything() {
    if (!confirm('Hapus SEMUA data (pengaturan, kunci, & nilai siswa)? Tidak bisa dibatalkan.')) return;
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
      el('p', { class: 'sub' }, 'Setel jawaban benar tiap soal. Kolom "Setengah" opsional: bila diisi, opsi itu dinilai separuh bobot. Bobot bisa beda per soal.')
    ]);
    const grid = el('div', { class: 'key-grid' });
    OMR.state.answerKey.forEach((k, i) => {
      const half = el('select', {}, [optEl('–', ''), ...letters.map(L => optEl(L, L))]);
      half.value = k.half || '';
      half.addEventListener('change', e => { k.half = e.target.value || null; OMR.save(); });
      const corr = el('select', {}, letters.map(L => optEl(L, L)));
      corr.value = k.correct;
      corr.addEventListener('change', e => { k.correct = e.target.value; OMR.save(); });
      const wt = mkInput('number', k.weight ?? 1, v => { k.weight = Math.max(0.1, +v || 1); OMR.save(); }, '', { min: .5, step: .5 });
      grid.appendChild(el('div', { class: 'key-item' }, [
        el('div', { class: 'no' }, String(i + 1)),
        el('div', {}, [el('div', { class: 'lbl' }, 'Benar'), corr]),
        el('div', {}, [el('div', { class: 'lbl' }, 'Setengah'), half]),
        el('div', {}, [el('div', { class: 'lbl' }, 'Bobot'), wt])
      ]));
    });
    card.appendChild(grid);
    card.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn ghost', onclick: () => { OMR.state.answerKey.forEach(k => k.correct = letters[0]); OMR.save(); renderKey(); } }, 'Set semua → ' + letters[0]),
      el('button', { class: 'btn accent', onclick: () => toast('Kunci tersimpan otomatis.', 'ok', '#view-key') }, 'Selesai')
    ]));
    wrap.appendChild(card);
  }

  /* ---------------- 3. Lembar Jawaban ---------------- */
  function renderSheet() {
    const wrap = $('#view-sheet'); wrap.innerHTML = '';
    const canvas = el('canvas');
    OMRSheet.render(canvas, OMR.cfg);
    const card = el('div', { class: 'card' }, [
      el('h2', {}, 'Lembar Jawaban'),
      el('p', { class: 'sub' }, 'Cetak lembar ini, lalu siswa menyilang (X) opsi dengan ballpoint. Empat kotak hitam di sudut WAJIB ikut tercetak — itu acuan pembacaan kamera.'),
      el('div', { class: 'canvas-wrap' }, canvas),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn accent', onclick: () => OMRSheet.print(canvas) }, 'Cetak'),
        el('button', { class: 'btn', onclick: () => OMRSheet.downloadPDF(canvas, OMR.cfg) }, 'Unduh PDF'),
        el('button', { class: 'btn ghost', onclick: () => download(canvas.toDataURL('image/png'), 'lembar_jawaban.png') }, 'Unduh PNG')
      ])
    ]);
    wrap.appendChild(card);
  }

  /* ---------------- 4. Scan & Koreksi ---------------- */
  function renderScan() {
    const wrap = $('#view-scan'); wrap.innerHTML = '';
    const card = el('div', { class: 'card' }, [
      el('h2', {}, 'Scan & Koreksi'),
      el('p', { class: 'sub' }, 'Foto lembar yang sudah disilang (lewat kamera atau unggah file). Pastikan keempat sudut & seluruh lembar terlihat, pencahayaan rata.'),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn', id: 'btn-cam', onclick: startCamera }, 'Buka Kamera'),
        el('button', { class: 'btn ghost', onclick: () => $('#file-in').click() }, 'Unggah Foto'),
        el('input', { type: 'file', id: 'file-in', accept: 'image/*', style: 'display:none', onchange: onUpload })
      ]),
      el('div', { id: 'cam-area' }),
      el('div', { id: 'scan-result' })
    ]);
    wrap.appendChild(card);
  }

  async function startCamera() {
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
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    const a = $('#cam-area'); if (a) a.innerHTML = '';
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

  function runPipeline(src, w, h) {
    OMR.syncAnswerKey();
    const res = OMRCV.process(src, w, h, OMR.cfg);
    const box = $('#scan-result'); box.innerHTML = '';
    if (!res.ok) { box.appendChild(notice(res.reason, 'err')); return; }
    currentScan = { answers: res.answers.slice(), name: '', kelas: '' };
    const dbg = el('canvas');
    OMRCV.drawDebug(dbg, res);

    box.appendChild(el('h3', { class: 'section' }, 'Verifikasi pembacaan'));
    box.appendChild(notice('Periksa overlay: lingkaran merah = marker, kotak biru = titik baca. Soal bertanda kuning perlu Anda pastikan (kosong/ganda).', 'warn'));
    box.appendChild(el('div', { class: 'canvas-wrap' }, dbg));
    box.appendChild(el('div', { class: 'grid-form', style: 'margin-top:14px' }, [
      mkField('Nama siswa', mkInput('text', '', v => currentScan.name = v, 'st-name')),
      mkField('Kelas', mkInput('text', '', v => currentScan.kelas = v, 'st-kelas'))
    ]));
    box.appendChild(el('h3', { class: 'section' }, 'Jawaban terbaca (bisa dikoreksi)'));
    box.appendChild(el('div', { id: 'review' }));
    box.appendChild(el('div', { id: 'score-preview' }));
    box.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn accent', onclick: saveStudent }, 'Simpan ke Daftar Nilai'),
      el('button', { class: 'btn ghost', onclick: () => { currentScan = null; box.innerHTML = ''; } }, 'Buang')
    ]));
    renderReview();
  }

  function renderReview() {
    const letters = OMR.optionLetters(OMR.cfg.numOptions);
    const rv = $('#review'); rv.innerHTML = '';
    const grid = el('div', { class: 'review-grid' });
    currentScan.answers.forEach((ans, q) => {
      const flag = (ans === '?' || ans === '-');
      const opts = el('div', { class: 'opt-btns' });
      [...letters, '–'].forEach(L => {
        const val = L === '–' ? '-' : L;
        const b = el('button', { class: (ans === val ? 'sel ' : '') + (L === '–' ? 'blank' : ''), onclick: () => { currentScan.answers[q] = val; renderReview(); } }, L);
        opts.appendChild(b);
      });
      grid.appendChild(el('div', { class: 'rev-q' + (flag ? ' flag' : '') }, [
        el('span', { class: 'qn' }, String(q + 1)), opts
      ]));
    });
    rv.appendChild(grid);
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
        el('span', { html: `<span class="stat setengah">Setengah ${g.counts.setengah || 0}</span>` }),
        el('span', { html: `<span class="stat salah">Salah ${(g.counts.salah || 0) + (g.counts.kosong || 0) + (g.counts.ganda || 0)}</span>` })
      ])
    ]));
  }
  function saveStudent() {
    if (currentScan.answers.includes('?')) { toast('Masih ada soal ambigu (kuning). Pastikan dulu semua.', 'warn', '#scan-result'); return; }
    if (!currentScan.name.trim()) { toast('Isi nama siswa dulu.', 'warn', '#scan-result'); return; }
    const g = OMRScore.gradeAll(currentScan.answers, OMR.state.answerKey);
    OMR.state.students.push({
      id: Date.now(), name: currentScan.name.trim(), kelas: currentScan.kelas.trim(),
      answers: currentScan.answers.slice(), score: g.score, maxScore: g.maxScore,
      percent: g.percent, counts: g.counts, detail: g.detail, ts: Date.now()
    });
    OMR.save();
    currentScan = null; $('#scan-result').innerHTML = '';
    toast('Tersimpan. Lihat tab "Rekap Nilai".', 'ok', '#scan-result');
  }

  /* ---------------- 5. Rekap Nilai ---------------- */
  function renderResults() {
    const wrap = $('#view-results'); wrap.innerHTML = '';
    const st = OMR.state.students;
    const card = el('div', { class: 'card' }, [
      el('h2', {}, 'Rekap Nilai'),
      el('p', { class: 'sub' }, `${st.length} siswa tersimpan. Unduh dalam format Excel, Word, atau PDF.`)
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
          el('td', { html: `<span class="stat setengah">${c.setengah || 0}</span>` }),
          el('td', { html: `<span class="stat salah">${salah}</span>` }),
          el('td', {}, `${s.score} / ${s.maxScore}`),
          el('td', { html: `<span class="pill">${s.percent}</span>` }),
          el('td', {}, el('button', { class: 'btn ghost sm', onclick: () => { if (confirm('Hapus ' + s.name + '?')) { OMR.state.students.splice(i, 1); OMR.save(); renderResults(); } } }, 'Hapus'))
        ]);
      });
      const table = el('table', { class: 'rekap' }, [
        el('thead', {}, el('tr', {}, ['No', 'Nama', 'Kelas', 'Benar', 'Stgh', 'Salah', 'Skor', 'Nilai', ''].map(h => el('th', {}, h)))),
        el('tbody', {}, rows)
      ]);
      card.appendChild(el('div', { class: 'table-scroll' }, table));
    }
    wrap.appendChild(card);
  }
  function clearStudents() {
    if (!confirm('Kosongkan seluruh daftar nilai? (kunci & pengaturan tetap)')) return;
    OMR.state.students = []; OMR.save(); renderResults();
  }

  /* ---------------- Helpers ---------------- */
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
  function toast(text, type, anchor) {
    const n = notice(text, type);
    const host = $(anchor) || document.body;
    host.insertBefore(n, host.firstChild);
    setTimeout(() => n.remove(), 3500);
  }
  function download(href, name) { const a = el('a', { href, download: name }); document.body.appendChild(a); a.click(); a.remove(); }

  /* ---------------- Init ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    OMR.syncAnswerKey();
    renderProfileBar();
    $$('nav.tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    switchTab('setup');
  });
})();

# Koreksi Pilihan Ganda — Scan Kamera (Silang Ballpoint)

Web app *native* (HTML/CSS/JS, tanpa framework, tanpa server) untuk mengoreksi
lembar jawaban pilihan ganda yang **disilang (X) pakai ballpoint**, lewat
**foto kamera atau unggah gambar**. Berjalan penuh di browser, data tersimpan
lokal (offline). Cocok di-hosting di **GitHub Pages**.

## Alur pakai

1. **Pengaturan** — judul ujian, jumlah soal, jumlah opsi (A–E), kolom, bobot.
2. **Kunci Jawaban** — set jawaban benar tiap soal. Kolom *Setengah* opsional:
   bila diisi, opsi itu bernilai **separuh bobot**. Bobot bisa beda per soal.
3. **Lembar Jawaban** — cetak / unduh lembar. Lembar punya **4 kotak hitam di
   sudut** sebagai acuan kamera. Siswa menyilang opsi dengan ballpoint.
4. **Scan & Koreksi** — foto lembar (kamera/unggah). App mendeteksi marker,
   meluruskan perspektif, lalu membaca tiap kotak. Hasil ditampilkan dengan
   overlay + **bisa dikoreksi manual** (soal kosong/ganda ditandai kuning).
   Isi nama siswa → **Simpan ke Daftar Nilai**.
5. **Rekap Nilai** — tabel nilai semua siswa + **unduh Excel / Word / PDF**.

## Cara kerja koreksi (ringkas)

- Lembar dibuat oleh app sendiri, jadi geometri kotak diketahui pasti.
- Saat foto: deteksi 4 marker sudut → hitung *homography* (koreksi perspektif)
  → petakan tiap kotak ke foto → hitung rasio piksel gelap → opsi paling gelap
  = jawaban. Kosong & ganda dideteksi dan ditandai untuk diperiksa.
- Penilaian: **benar** (poin penuh), **setengah** (opsi alternatif di kunci),
  **salah/kosong/ganda** (0).

## Edit di VSCode

```
omr/
├── index.html              # shell + urutan <script>
├── css/style.css           # tema & layout
├── js/
│   ├── config.js           # state, storage, GEOMETRI bersama (paling inti)
│   ├── scanner.js          # computer vision (deteksi marker, homography, baca silang)
│   ├── scoring.js          # benar / setengah / salah
│   ├── sheet-generator.js  # buat lembar jawaban printable
│   ├── export.js           # ekspor Excel / DOCX / PDF
│   └── app.js              # controller UI
└── lib/                    # library export (LOKAL, bukan CDN)
    ├── xlsx.full.min.js        (SheetJS)
    ├── jspdf.umd.min.js
    ├── jspdf.plugin.autotable.min.js
    └── docx.iife.js
```

Buka folder di VSCode. Untuk uji lokal, jalankan server statis (kamera butuh
`https://` atau `localhost`):

```bash
# pilih salah satu
python3 -m http.server 8000
# atau ekstensi "Live Server" di VSCode
```

Lalu buka `http://localhost:8000`.

## Hosting di GitHub Pages

1. Buat repo, push seluruh isi folder ini (termasuk `lib/`).
2. Settings → Pages → Source: `Deploy from a branch` → branch `main`, folder `/root`.
3. Akses di `https://<user>.github.io/<repo>/`. Kamera aktif karena Pages `https`.

## Catatan penting (jujur, baca ini)

- **Akurasi pembacaan bergantung kualitas foto.** Ambil tegak lurus, semua
  sudut & lembar masuk frame, cahaya rata, tanpa bayangan/silau. Marker hitam
  di 4 sudut **wajib** ikut terfoto.
- Pipeline ini sudah diuji secara sintetis (20/20 benar). Pada foto nyata,
  ambang deteksi (`MIN_FILL`, `DOMINANCE` di `scanner.js`; `inkThr` faktor)
  mungkin perlu **dikalibrasi** sekali. Itu sebabnya ada **koreksi manual** —
  itu jaring pengaman, bukan kekurangan. Periksa beberapa lembar pertama.
- Jika "Marker tidak terdeteksi": kontras kurang / sudut terpotong / foto buram.
- Data tersimpan di `localStorage` browser ini saja. Hapus cache = hilang.
  Ekspor rutin ke Excel sebagai cadangan.

## Profil guru (beberapa guru, satu perangkat)

Di header ada **Profil guru**. Tiap profil punya pengaturan, kunci jawaban,
dan daftar nilai sendiri yang terpisah penuh. Berguna kalau beberapa guru
memakai komputer/browser yang sama.

- Ganti profil lewat dropdown — data ikut berganti.
- **+ Tambah** untuk guru baru, **Ubah nama**, **Hapus** (menghapus seluruh
  data profil itu; minimal satu profil harus tetap ada).
- Catatan: ini tetap **per-perangkat**. Kalau tiap guru pakai HP/laptop
  sendiri, datanya memang sudah otomatis terpisah tanpa perlu profil. Profil
  hanya memisahkan beberapa guru pada browser yang SAMA. Bukan akun terpusat,
  data tidak tersinkron antar perangkat.
- Data versi lama (sebelum fitur profil) otomatis dipindah ke profil pertama.

## Batas versi ini

Penyimpanan lokal per-perangkat (bukan server/cloud, tanpa login). Koreksi
esai dilakukan manual di luar app.

## Format resmi & Model lembar (baru)

Lembar yang dihasilkan kini berformat resmi: kop judul yang bisa diatur,
identitas (Mata Pelajaran/Hari-Tanggal/Waktu/No. Peserta/Nama/Kelas), tabel
"A. PILIHAN GANDA" bergaris dua kolom, opsi halaman "B. ESSAY/URAIAN"
(hanya dicetak, tidak discan), dan kotak Nilai/Paraf. **Empat marker hitam
tetap ada** di sudut area pilihan ganda (halaman 1) — itu yang membuat scan
bekerja, jadi halaman 1 wajib tercetak utuh & difoto lengkap.

Di tab Pengaturan ada **Model Lembar**: simpan kombinasi pengaturan + kunci
sebagai model bernama (mis. tiap tahun/mapel beda), lalu muat sebelum mencetak
& scan. Penting: lembar tetap **dicetak dari app ini** (yang memuat marker);
app tidak membaca lembar dari luar yang tanpa marker.

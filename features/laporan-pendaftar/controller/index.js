const { Op } = require("sequelize");
const exceljs = require("exceljs");
const { TrxBeasiswa, TrxPilihanProgramStudi, sequelize } = require("../../../models");
const { successResponse, errorResponse } = require("../../../common/response");

const getWhereCondition = (tipe_laporan, jalur_text, search) => {
  const where = {};
  if (jalur_text) where.jalur = jalur_text; 
  if (search) {
    where[Op.or] = [
      { nama_lengkap: { [Op.like]: `%${search}%` } },
      { nik: { [Op.like]: `%${search}%` } },
      { kode_pendaftaran: { [Op.like]: `%${search}%` } },
    ];
  }

  switch (String(tipe_laporan)) {
    case "1": where.is_active = 1; break;
    case "2": where.is_active = 0; break;
    case "3": where.id_flow = 3; break;
    case "4": where.status_lulus_administrasi = "Y"; break;
    case "5": where.status_dari_verifikator_dinas = "Y"; break;
    case "6": where.status_lulus_wawancara_akademik = "Y"; break;
    case "7": where.id_flow = 14; break;
  }
  return where;
};

exports.getLaporanPaginated = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", tipe_laporan, id_jalur } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = getWhereCondition(tipe_laporan, id_jalur, search);

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: offset,
      order: [["id_trx_beasiswa", "DESC"]],
      attributes: ['id_trx_beasiswa', 'kode_pendaftaran', 'nama_lengkap', 'nik', 'jalur'] 
    });

    return successResponse(res, "Berhasil memuat data laporan", {
      result: rows,
      total: count,
      current_page: parseInt(page),
      total_pages: Math.ceil(count / parseInt(limit)),
    });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getJalurList = async (req, res) => {
  try {
    const listJalur = await TrxBeasiswa.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('jalur')), 'jalur']],
      where: { jalur: { [Op.ne]: null, [Op.not]: "" } },
      raw: true
    });
    const result = listJalur.map(item => item.jalur);
    return successResponse(res, "Berhasil memuat list jalur", result);
  } catch (error) {
    return errorResponse(res, "Gagal mengambil list jalur");
  }
};

exports.exportLaporanExcel = async (req, res) => {
  try {
    const { search = "", tipe_laporan, id_jalur } = req.query;
    const where = getWhereCondition(tipe_laporan, id_jalur, search);
    
    // 1. Ambil data pendaftar (Gunakan raw: true agar lebih ringan)
    const data = await TrxBeasiswa.findAll({ 
      where, 
      order: [["id_trx_beasiswa", "DESC"]],
      raw: true
    });

    // Kumpulkan semua id_trx_beasiswa untuk mengambil pilihan studinya sekaligus
    const listIdTrx = data.map(p => p.id_trx_beasiswa);

    // 2. Ambil seluruh data pilihan prodi untuk pendaftar yang difilter
    let pilihanData = [];
    if (listIdTrx.length > 0) {
      pilihanData = await TrxPilihanProgramStudi.findAll({
        where: { id_trx_beasiswa: { [Op.in]: listIdTrx } },
        order: [["id_trx_beasiswa", "ASC"], ["id", "ASC"]], // Diurutkan agar Pilihan 1, 2, 3 sesuai urutan insert
        raw: true
      });
    }

    // 3. Kelompokkan pilihan per pendaftar dan cari panjang kolom maksimal (dinamis)
    const mapPilihan = {};
    let maxPilihanCount = 0; // Variabel untuk menyimpan jumlah pilihan terbanyak

    pilihanData.forEach((row) => {
      if (!mapPilihan[row.id_trx_beasiswa]) {
        mapPilihan[row.id_trx_beasiswa] = [];
      }
      mapPilihan[row.id_trx_beasiswa].push(row);
      
      // Update maxPilihanCount jika user ini punya pilihan lebih banyak
      if (mapPilihan[row.id_trx_beasiswa].length > maxPilihanCount) {
        maxPilihanCount = mapPilihan[row.id_trx_beasiswa].length;
      }
    });

    // Minimal sediakan 1 kolom pilihan meskipun data kosong agar format tabel tetap rapi
    if (maxPilihanCount === 0) maxPilihanCount = 1;

    // 4. Siapkan Excel
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet("Rekap Pendaftar");

    // Kolom Statis Awal
    const columns = [
      { header: "No.", key: "no", width: 5 },
      { header: "Kode Pendaftar", key: "kode_pendaftaran", width: 20 },
      { header: "Nama Pendaftar", key: "nama_lengkap", width: 30 },
      { header: "Periode", key: "periode", width: 10 },
      { header: "Jalur", key: "jalur", width: 20 },
      { header: "Penerima Beasiswa", key: "penerima_beasiswa", width: 15 },
      { header: "Kode Prodi Diterima", key: "kode_prodi", width: 15 },
      { header: "Prodi Diterima", key: "prodi_final", width: 20 },
      { header: "Nama Ayah", key: "ayah_nama", width: 20 },
      { header: "Pekerjaan Ayah", key: "ayah_pekerjaan", width: 20 },
      { header: "Penghasilan Ayah", key: "ayah_penghasilan", width: 20 },
      { header: "Nama Ibu", key: "ibu_nama", width: 20 },
      { header: "Pekerjaan Ibu", key: "ibu_pekerjaan", width: 20 },
      { header: "Penghasilan Ibu", key: "ibu_penghasilan", width: 20 },
      { header: "L/P", key: "jenis_kelamin", width: 5 },
      { header: "Tgl. Lahir", key: "tanggal_lahir", width: 12 },
      { header: "Tmp. Lahir", key: "tempat_lahir", width: 15 },
      { header: "Agama", key: "agama", width: 12 },
      { header: "NIK", key: "nik", width: 20 },
      { header: "Suku", key: "suku", width: 12 },
      { header: "No. KK", key: "nkk", width: 20 },
      { header: "Email", key: "email", width: 20 },
      { header: "No. HP", key: "no_hp", width: 15 },
      { header: "Alamat KTP", key: "tinggal_alamat", width: 30 },
      { header: "RT", key: "tinggal_rt", width: 5 },
      { header: "RW", key: "tinggal_rw", width: 5 },
      { header: "Dusun", key: "tinggal_dusun", width: 15 },
      { header: "Kode Pos", key: "tinggal_kode_pos", width: 10 },
      { header: "Desa/Kel", key: "tinggal_kel", width: 15 },
      { header: "Kecamatan", key: "tinggal_kec", width: 15 },
      { header: "Kab/Kota", key: "tinggal_kab_kota", width: 15 },
      { header: "Provinsi", key: "tinggal_prov", width: 15 },
      { header: "Kab/Kota Kerja", key: "kerja_kab_kota", width: 15 },
      { header: "Provinsi Kerja", key: "kerja_prov", width: 15 },
      { header: "Kab/Kota Verif", key: "nama_dinas_kabkota", width: 15 },
      { header: "Provinsi Verif", key: "nama_dinas_provinsi", width: 15 },
      { header: "Jenjang", key: "jenjang_sekolah", width: 10 },
      { header: "Jurusan Sekolah", key: "nama_jurusan_sekolah", width: 15 },
      { header: "Sekolah", key: "sekolah", width: 20 },
      { header: "Jurusan", key: "jurusan", width: 15 },
      { header: "Thn Lulus", key: "tahun_lulus", width: 10 },
      { header: "Aktif", key: "is_active", width: 8 },
      { header: "Buta Warna", key: "kondisi_buta_warna", width: 12 },
    ];

    // 5. Generate Kolom Pilihan Secara Dinamis 
    for (let i = 1; i <= maxPilihanCount; i++) { 
      // Lebar kolom di-set ke 35 karena formatnya "Nama PT - Nama Prodi" akan cukup panjang
      columns.push({ header: `Pilihan ${i}`, key: `pilihan_${i}`, width: 35 }); 
    }

    // Kolom Statis Akhir
    columns.push({ header: "Nama Selektor", key: "verifikator_nama", width: 20 });

    worksheet.columns = columns;
    worksheet.getRow(1).font = { bold: true };

    // 6. Masukkan data ke baris Excel
    data.forEach((p, index) => {
      const rowData = {
        no: index + 1,
        kode_pendaftaran: p.kode_pendaftaran || "-",
        nama_lengkap: p.nama_lengkap || "-",
        periode: "2026",
        jalur: p.jalur || "-",
        penerima_beasiswa: p.id_flow === 14 ? "Ya" : "Tidak",
        kode_prodi: "-",
        prodi_final: p.prodi_final || "-",
        ayah_nama: p.ayah_nama || "-",
        ayah_pekerjaan: p.ayah_pekerjaan || "-",
        ayah_penghasilan: p.ayah_penghasilan || "-",
        ibu_nama: p.ibu_nama || "-",
        ibu_pekerjaan: p.ibu_pekerjaan || "-",
        ibu_penghasilan: p.ibu_penghasilan || "-",
        jenis_kelamin: p.jenis_kelamin || "-",
        tanggal_lahir: p.tanggal_lahir || "-",
        tempat_lahir: p.tempat_lahir || "-",
        agama: p.agama || "-",
        nik: p.nik || "-",
        suku: p.suku || "-",
        nkk: p.nkk || "-",
        email: p.email || "-",
        no_hp: p.no_hp || "-",
        tinggal_alamat: p.tinggal_alamat || "-",
        tinggal_rt: p.tinggal_rt || "-",
        tinggal_rw: p.tinggal_rw || "-",
        tinggal_dusun: p.tinggal_dusun || "-",
        tinggal_kode_pos: p.tinggal_kode_pos || "-",
        tinggal_kel: p.tinggal_kel || "-",
        tinggal_kec: p.tinggal_kec || "-",
        tinggal_kab_kota: p.tinggal_kab_kota || "-",
        tinggal_prov: p.tinggal_prov || "-",
        kerja_kab_kota: p.kerja_kab_kota || "-",
        kerja_prov: p.kerja_prov || "-",
        nama_dinas_kabkota: p.nama_dinas_kabkota || "-",
        nama_dinas_provinsi: p.nama_dinas_provinsi || "-",
        jenjang_sekolah: p.jenjang_sekolah || "-",
        nama_jurusan_sekolah: p.nama_jurusan_sekolah || "-",
        sekolah: p.sekolah || "-",
        jurusan: p.jurusan || "-",
        tahun_lulus: p.tahun_lulus || "-",
        is_active: p.is_active === 1 ? "Ya" : "Tidak",
        kondisi_buta_warna: p.kondisi_buta_warna === "Y" ? "Ya" : "Tidak",
        verifikator_nama: p.verifikator_nama || "-",
      };

      // 7. Ambil daftar pilihan untuk user ini
      const pilihanUser = mapPilihan[p.id_trx_beasiswa] || [];

      // Isi kolom pilihan secara dinamis (Format: "Nama PT - Nama Prodi")
      for (let i = 1; i <= maxPilihanCount; i++) {
        // Karena array index dimulai dari 0, kurangi i dengan 1
        const pilihanDetail = pilihanUser[i - 1]; 
        
        if (pilihanDetail) {
          rowData[`pilihan_${i}`] = `${pilihanDetail.nama_pt || "-"} - ${pilihanDetail.nama_prodi || "-"}`;
        } else {
          rowData[`pilihan_${i}`] = "-"; // Kosongkan jika user ini tidak punya pilihan ke-i
        }
      }

      worksheet.addRow(rowData);
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Rekap_Pendaftar.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { 
    console.error("Error Export Excel:", error);
    return errorResponse(res, "Gagal export file"); 
  }
};
const { Op } = require("sequelize");
const { TrxBeasiswa, sequelize, TrxMahasiswaFinal } = require("../../../models");
const { successResponse, errorResponse } = require("../../../common/response");
const excelJS = require("exceljs");
// ✅ TAMBAHAN: Import getFileUrl untuk translate URL S3
const { getFileUrl } = require("../../../common/middleware/upload_middleware");

// ==========================================
// 1. Get Data Master Penetapan (Halaman Utama)
// ==========================================
exports.getListPenetapanMaster = async (req, res) => {
  try {
    const rows = await TrxBeasiswa.findAll({
      attributes: [
        "id_ref_beasiswa",
        "nama_beasiswa",
        [sequelize.fn("COUNT", sequelize.col("id_trx_beasiswa")), "jumlah_penerima"]
      ],
      where: { id_flow: 14 },
      group: ["id_ref_beasiswa", "nama_beasiswa"]
    });

    const formattedData = rows.map((r, index) => ({
      no: index + 1,
      id_ref_beasiswa: r.id_ref_beasiswa || 0,
      nama_penetapan: r.nama_beasiswa || "Penetapan Beasiswa 2025",
      tanggal_penetapan: new Date().toISOString().split("T")[0], 
      instansi: "Kementerian Pertanian", 
      jumlah_kuota: r.get("jumlah_penerima"),
      keterangan: "Selesai" 
    }));

    return successResponse(res, "Data master penetapan dimuat", {
      result: formattedData,
      total: formattedData.length,
      current_page: 1,
      total_pages: 1
    });
  } catch (error) {
    console.error("Error getListPenetapanMaster:", error);
    return errorResponse(res, "Internal Server Error");
  }
};

// ==========================================
// 2. Get Data Detail Penetapan (Halaman Detail)
// ==========================================
exports.getDetailPenetapan = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const id_ref = req.query.id_ref || null;
    const offset = (page - 1) * limit;

    const whereCondition = { id_flow: 14 };
    if (id_ref) whereCondition.id_ref_beasiswa = id_ref;

    if (search) {
      whereCondition[Op.or] = [
        { nama_lengkap: { [Op.like]: `%${search}%` } },
        { kode_pendaftaran: { [Op.like]: `%${search}%` } },
        { pt_final: { [Op.like]: `%${search}%` } },
        { prodi_final: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa", "nama_lengkap", "kode_pendaftaran",
        "nama_kluster", "pt_final", "prodi_final", "urutan_ranking", "file_rekomendasi_teknis"
      ],
      limit,
      offset,
      order: [["urutan_ranking", "ASC"]],
    });

    // ✅ PERBAIKAN: Format data agar file rekomtek menjadi URL S3 yang utuh
    const mappedRows = rows.map(row => {
      const r = row.toJSON();
      if (r.file_rekomendasi_teknis) {
        r.file_rekomendasi_teknis = getFileUrl(req, "rekomtek", r.file_rekomendasi_teknis);
      }
      return r;
    });

    return successResponse(res, "Data detail penetapan dimuat", {
      result: mappedRows,
      total: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
    });
  } catch (error) {
    console.error("Error getDetailPenetapan:", error);
    return errorResponse(res, "Internal Server Error");
  }
};

// ==========================================
// 3. Cek Dokumen (Dari Tahap Rekomtek)
// ==========================================
exports.cekDokumenPenetapan = async (req, res) => {
  try {
    const data = await TrxBeasiswa.findOne({
      where: { id_flow: 14, file_rekomendasi_teknis: { [Op.ne]: null } },
      attributes: ["file_rekomendasi_teknis"]
    });

    // ✅ PERBAIKAN: Berikan URL utuh dari NEO S3
    const fileUrl = data && data.file_rekomendasi_teknis 
      ? getFileUrl(req, "rekomtek", data.file_rekomendasi_teknis) 
      : null;

    return successResponse(res, "Status dokumen penetapan", {
      filename: fileUrl
    });
  } catch (error) {
    return errorResponse(res, "Gagal mengecek dokumen");
  }
};

// ==========================================
// 4. Download Data Penetapan
// ==========================================
exports.downloadDataPenetapan = async (req, res) => {
  try {
    const id_ref = req.query.id_ref || null;

    const whereCondition = { id_flow: 14 };
    if (id_ref) whereCondition.id_ref_beasiswa = id_ref;

    const data = await TrxBeasiswa.findAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa",  // ✅ Ditambahkan untuk acuan penentu susulan/awal
        "kode_pendaftaran",
        "nama_lengkap",
        "nik", 
        "no_hp", 
        "tinggal_kab_kota", 
        "tinggal_prov",     
        "jenjang_final", 
        "prodi_final",
        "pt_final",
        "jalur",            
        "nama_kluster",
        "jenis_kelamin",
        "urutan_ranking"
      ],
      order: [["urutan_ranking", "ASC"]],
    });

    if (!data || data.length === 0) {
      return res.status(404).send("Data tidak ditemukan");
    }

    const workbook = new excelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Peserta Diterima");

    worksheet.columns = [
      { header: "No", key: "no", width: 5 },
      { header: "Kode Peserta", key: "kode_pendaftaran", width: 20 },
      { header: "Nama Lengkap", key: "nama_lengkap", width: 35 },
      { header: "NIK", key: "nik", width: 20 },
      { header: "No. HP", key: "no_hp", width: 15 },
      { header: "Kabupaten/Kota Asal", key: "kabkota", width: 25 },
      { header: "Provinsi Asal", key: "provinsi", width: 25 },
      { header: "Program Studi Diterima", key: "prodi_lengkap", width: 40 },
      { header: "Kampus Diterima", key: "pt_final", width: 35 },
      { header: "Jalur", key: "jalur_pendaftaran", width: 20 },
      { header: "Kluster", key: "nama_kluster", width: 20 },
      { header: "Jenis Kelamin", key: "jenis_kelamin", width: 15 },
      { header: "Keterangan", key: "keterangan", width: 25 },
    ];

    // Opsional: Cari ID paling awal untuk dijadikan patokan (baseline)
    // Jika data tidak kosong, kita ambil ID terkecil sebagai indikator kloter pertama
    const minId = Math.min(...data.map(d => d.id_trx_beasiswa));
    
    // Asumsi: Jika selisih ID dari kloter pertama sangat jauh (misal data baru masuk seminggu kemudian), 
    // kita anggap itu susulan. 
    // *Anda bisa mengganti '1000' dengan jarak ID/kuota yang masuk akal menurut sistem Anda.
    const BATAS_SELISIH_SUSULAN = 1000; 

    data.forEach((item, index) => {
      const prodiLengkap = item.jenjang_final && item.prodi_final 
        ? `${item.jenjang_final} - ${item.prodi_final}` 
        : item.prodi_final || item.jenjang_final || "-";

      // ✅ LOGIKA KETERANGAN: Awal vs Susulan
      let statusRekomtek = "Rekomtek Awal"; // Default

      // Jika suatu saat Anda menambahkan kolom di DB, logikanya cukup: 
      // statusRekomtek = item.jenis_rekomtek || "Rekomtek Awal";

      // Logika simulasi menggunakan ID:
      if ((item.id_trx_beasiswa - minId) > BATAS_SELISIH_SUSULAN) {
         statusRekomtek = "Rekomtek Susulan";
      }

      worksheet.addRow({
        no: index + 1,
        kode_pendaftaran: item.kode_pendaftaran || "-",
        nama_lengkap: item.nama_lengkap || "-",
        nik: item.nik || "-",
        no_hp: item.no_hp || "-",
        kabkota: item.tinggal_kab_kota || "-",
        provinsi: item.tinggal_prov || "-",
        prodi_lengkap: prodiLengkap, 
        pt_final: item.pt_final || "-",
        jalur_pendaftaran: item.jalur || "-",
        nama_kluster: item.nama_kluster || "-",
        jenis_kelamin: item.jenis_kelamin || "-",
        keterangan: statusRekomtek, // ✅ Masukkan variabel status di sini
      });
    });

    // Styling Header
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Data_Penetapan_${id_ref || 'All'}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.status(200).end();

  } catch (error) {
    console.error("Error downloadDataPenetapan:", error);
    return res.status(500).send("Internal Server Error");
  }
};


exports.getExternalMahasiswaFinal = async (req, res) => {
  try {
    const { id_pt_final, id_jenjang, tahun, tahun_angkatan } = req.query;

    const whereCondition = {};

    if (id_pt_final) {
      whereCondition.id_pt = id_pt_final;
    }

    if (id_jenjang) {
      let stringJenjang = "";

      const id = parseInt(id_jenjang, 10);
      switch (id) {
        case 1: stringJenjang = "D1"; break;
        case 2: stringJenjang = "D2"; break;
        case 3: stringJenjang = "D3"; break;
        case 4: stringJenjang = "D4"; break;
        case 5: stringJenjang = "S1"; break;
        case 6: stringJenjang = "S2"; break;
        case 7: stringJenjang = "S3"; break;
        default: stringJenjang = null;
      }

      if (stringJenjang) {
        whereCondition.jenjang = { [Op.like]: `%${stringJenjang}%` };
      } else {
        whereCondition.jenjang = "TIDAK_ADA_MAPPING_JENJANG_INI";
      }
    }

    const filterTahun = tahun_angkatan || tahun;
    if (filterTahun) {
      whereCondition.tahun_angkatan = filterTahun;
    }

    const rows = await TrxMahasiswaFinal.findAll({
      where: whereCondition,
      order: [["created_at", "DESC"]],
      attributes: { exclude: [] }
    });

    return successResponse(res, "Data Mahasiswa Final berhasil ditarik", {
      result: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("GET EXTERNAL MAHASISWA FINAL ERROR:", error);
    return errorResponse(res, "Internal Server Error", 500);
  }
};
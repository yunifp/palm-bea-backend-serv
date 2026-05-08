const { Op, fn, col } = require("sequelize");
const { 
  TrxBeasiswa, 
  TrxBaDinasKabkota, 
  TrxSkDinasKabkota,
  TrxBaDinasProvinsi, 
  TrxSkDinasProvinsi 
} = require("../../../models");
const { successResponse, errorResponse } = require("../../../common/response");
const ExcelJS = require("exceljs");
const { getFileUrl } = require("../../../common/middleware/upload_middleware");

exports.getRekapProvinsi = async (req, res) => {
  try {
    const { kode_kabkota } = req.query;

    const whereCondition = { 
      id_flow: 9,
      kode_dinas_provinsi: { [Op.ne]: null }
    };

    if (kode_kabkota && kode_kabkota !== "all") {
      whereCondition.kode_dinas_kabkota = kode_kabkota;
    }

    const rekap = await TrxBeasiswa.findAll({
      where: whereCondition,
      attributes: [
        "kode_dinas_provinsi",
        "nama_dinas_provinsi",
        [fn("COUNT", col("id_trx_beasiswa")), "jumlah_pendaftar"]
      ],
      group: ["kode_dinas_provinsi", "nama_dinas_provinsi"],
      order: [["nama_dinas_provinsi", "ASC"]],
      raw: true
    });

    const totalAfirmasi = await TrxBeasiswa.count({
      where: { ...whereCondition, nama_kluster: "Afirmasi" }
    });
    
    const totalReguler = await TrxBeasiswa.count({
      where: { ...whereCondition, nama_kluster: "Reguler" }
    });

    const listKabkota = await TrxBeasiswa.findAll({
      where: { id_flow: 9, kode_dinas_kabkota: { [Op.ne]: null } },
      attributes: ["kode_dinas_kabkota", "nama_dinas_kabkota"],
      group: ["kode_dinas_kabkota", "nama_dinas_kabkota"],
      order: [["nama_dinas_kabkota", "ASC"]],
      raw: true
    });

    return successResponse(res, "Berhasil memuat rekapitulasi provinsi", {
      rekap,
      total_afirmasi: totalAfirmasi,
      total_reguler: totalReguler,
      list_kabkota: listKabkota 
    });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getDetailProvinsi = async (req, res) => {
  try {
    const { kode_dinas_provinsi } = req.params;
    // ✅ Menangkap parameter filter kode_kabkota (dari query frontend)
    const { page = 1, limit = 10, search = "", kode_kabkota } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereCondition = {
      id_flow: 9,
      kode_dinas_provinsi: kode_dinas_provinsi
    };

    // ✅ Jika user klik kabupaten di frontend, saring berdasarkan kabupaten
    if (kode_kabkota && kode_kabkota !== "all") {
      whereCondition.kode_dinas_kabkota = kode_kabkota;
    }

    if (search) {
      whereCondition[Op.or] = [
        { nama_lengkap: { [Op.like]: `%${search}%` } },
        { nik: { [Op.like]: `%${search}%` } },
        { kode_pendaftaran: { [Op.like]: `%${search}%` } },
        { nama_dinas_kabkota: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa",
        "nama_lengkap",
        "nik",
        "kode_pendaftaran",
        "jalur",
        "tag_daerah_3T",
        "tag_sktm",
        "id_kluster",
        "nama_kluster",
        "nama_dinas_provinsi",
        "nama_dinas_kabkota",
        "id_flow" 
      ],
      limit: parseInt(limit),
      offset: offset,
      order: [
        ["nama_dinas_kabkota", "ASC"], 
        ["nama_lengkap", "ASC"]
      ],
      raw: true
    });

    const nama_provinsi = rows.length > 0 ? rows[0].nama_dinas_provinsi : "";

    const mappedRows = rows.map((item) => ({
      ...item,
      is_sktm: (item.tag_sktm === "1" || item.tag_sktm === "Y"), 
      is_3t: (item.tag_daerah_3T === "1"),
    }));

    return successResponse(res, "Berhasil memuat detail pendaftar", {
      nama_provinsi: nama_provinsi,
      total_pendaftar: count,
      result: mappedRows,
      current_page: parseInt(page),
      total_pages: Math.ceil(count / parseInt(limit))
    });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.ubahStatusKluster = async (req, res) => {
  try {
    const { id_trx_beasiswa } = req.params;
    const { nama_kluster } = req.body; 

    const beasiswa = await TrxBeasiswa.findByPk(id_trx_beasiswa);

    if (!beasiswa) {
      return errorResponse(res, "Data tidak ditemukan", 404);
    }

    if (!nama_kluster) {
      return errorResponse(res, "Nama kluster wajib dikirim", 400);
    }

    const id_kluster = nama_kluster === "Afirmasi" ? 1 : 2; 

    beasiswa.nama_kluster = nama_kluster;
    beasiswa.id_kluster = id_kluster;
    await beasiswa.save();

    return successResponse(res, `Berhasil mengubah kluster menjadi ${nama_kluster}`, {
      id_trx_beasiswa,
      nama_kluster
    });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.kirimLembagaSeleksi = async (req, res) => {
  try {
    const [updated] = await TrxBeasiswa.update(
      { id_flow: 10 },
      { where: { id_flow: 9 } }
    );
    return successResponse(res, `Berhasil mengirim ${updated} pendaftar ke Lembaga Seleksi.`);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.exportDetailSemua = async (req, res) => {
  try {
    const rows = await TrxBeasiswa.findAll({
      where: { id_flow: 9 },
      attributes: [
        "nama_lengkap", 
        "nik", 
        "kode_pendaftaran", 
        "jalur", 
        "nama_dinas_provinsi", 
        "nama_dinas_kabkota", 
        "nama_kluster"
      ],
      order: [
        ["nama_dinas_provinsi", "ASC"], 
        ["nama_dinas_kabkota", "ASC"], 
        ["nama_lengkap", "ASC"]
      ],
      raw: true
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Detail Verifikasi Nasional");

    worksheet.columns = [
      { header: "No", key: "no", width: 8 },
      { header: "Nama Lengkap", key: "nama_lengkap", width: 35 },
      { header: "NIK", key: "nik", width: 25 },
      { header: "Kode Pendaftaran", key: "kode_pendaftaran", width: 25 },
      { header: "Jalur", key: "jalur", width: 20 },
      { header: "Provinsi", key: "nama_dinas_provinsi", width: 35 },
      { header: "Kabupaten/Kota", key: "nama_dinas_kabkota", width: 35 }, 
      { header: "Nama Kluster", key: "nama_kluster", width: 20 }
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0F0FF" }
      };
    });

    rows.forEach((row, index) => {
      worksheet.addRow({
        no: index + 1,
        nama_lengkap: row.nama_lengkap || "-",
        nik: row.nik || "-",
        kode_pendaftaran: row.kode_pendaftaran || "-",
        jalur: row.jalur || "-",
        nama_dinas_provinsi: row.nama_dinas_provinsi || "-",
        nama_dinas_kabkota: row.nama_dinas_kabkota || "-",
        nama_kluster: row.nama_kluster || "-"
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Data_Detail_Verifikasi_Nasional.xlsx"
    );

    await workbook.xlsx.write(res);
    return res.status(200).end();

  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.kirimDataKewilayahan = async (req, res) => {
  try {
    const [updatedCount] = await TrxBeasiswa.update(
      { id_flow: 6 },
      { where: { id_flow: 13 } }
    );

    return successResponse(res, `Berhasil mengirim ${updatedCount} data ke tahap seleksi (Flow 6)`);
  } catch (error) {
    return errorResponse(res, "Internal Server Error saat mengirim data");
  }
};

exports.getDokumenProvinsi = async (req, res) => {
  try {
    const { kode_dinas_provinsi } = req.params;

    if (!kode_dinas_provinsi) {
      return errorResponse(res, "Kode Provinsi tidak valid", 400);
    }

    const baList = await TrxBaDinasProvinsi.findAll({
      where: { kode_dinas_provinsi },
      order: [["created_at", "DESC"]],
      raw: true
    });

    const skList = await TrxSkDinasProvinsi.findAll({
      where: { kode_dinas_provinsi },
      order: [["created_at", "DESC"]],
      raw: true
    });

    const latestBa = baList.length > 0 ? baList[0] : null;
    const latestSk = skList.length > 0 ? skList[0] : null;

    const formattedBa = [];
    if (latestBa && latestBa.filename) {
      formattedBa.push({
        ...latestBa,
        file_url: getFileUrl(req, "berita_acara", latestBa.filename)
      });
    }

    const formattedSk = [];
    if (latestSk && latestSk.filename) {
      formattedSk.push({
        ...latestSk,
        file_url: getFileUrl(req, "persyaratan", latestSk.filename) 
      });
    }

    return successResponse(res, "Berhasil memuat dokumen dari provinsi", {
      berita_acara: formattedBa,
      surat_keputusan: formattedSk
    });
  } catch (error) {
    console.error("Error getDokumenProvinsi:", error);
    return errorResponse(res, "Internal Server Error", 500);
  }
};

// ✅ TAMBAHAN: REKAP KABUPATEN/KOTA UNTUK SATU PROVINSI
exports.getRekapKabkotaByProvinsi = async (req, res) => {
  try {
    const { kode_dinas_provinsi } = req.params;

    if (!kode_dinas_provinsi) {
      return errorResponse(res, "Kode Provinsi tidak valid", 400);
    }

    const rekap = await TrxBeasiswa.findAll({
      where: {
        id_flow: 9,
        kode_dinas_provinsi: kode_dinas_provinsi,
        kode_dinas_kabkota: { [Op.ne]: null }
      },
      attributes: [
        "kode_dinas_kabkota",
        "nama_dinas_kabkota",
        [fn("COUNT", col("id_trx_beasiswa")), "jumlah_pendaftar"]
      ],
      group: ["kode_dinas_kabkota", "nama_dinas_kabkota"],
      order: [["nama_dinas_kabkota", "ASC"]],
      raw: true
    });

    const provinsiInfo = await TrxBeasiswa.findOne({
      where: { kode_dinas_provinsi },
      attributes: ["nama_dinas_provinsi"],
      raw: true
    });

    return successResponse(res, "Berhasil memuat rekapitulasi kabupaten/kota", {
      rekap,
      nama_provinsi: provinsiInfo ? provinsiInfo.nama_dinas_provinsi : "Provinsi"
    });
  } catch (error) {
    console.error("Error getRekapKabkotaByProvinsi:", error);
    return errorResponse(res, "Internal Server Error", 500);
  }
};

// ✅ TAMBAHAN: MENDAPATKAN DOKUMEN BA & SK KABUPATEN/KOTA
exports.getDokumenKabkota = async (req, res) => {
  try {
    const { kode_dinas_kabkota } = req.params;

    if (!kode_dinas_kabkota) {
      return errorResponse(res, "Kode Kabupaten/Kota tidak valid", 400);
    }

    const baList = await TrxBaDinasKabkota.findAll({
      where: { kode_dinas_kabkota },
      order: [["created_at", "DESC"]],
      raw: true
    });

    const skList = await TrxSkDinasKabkota.findAll({
      where: { kode_dinas_kabkota },
      order: [["created_at", "DESC"]],
      raw: true
    });

    const latestBa = baList.length > 0 ? baList[0] : null;
    const latestSk = skList.length > 0 ? skList[0] : null;

    const formattedBa = [];
    if (latestBa && latestBa.filename) {
      formattedBa.push({
        ...latestBa,
        file_url: getFileUrl(req, "berita_acara", latestBa.filename)
      });
    }

    const formattedSk = [];
    if (latestSk && latestSk.filename) {
      formattedSk.push({
        ...latestSk,
        file_url: getFileUrl(req, "persyaratan", latestSk.filename) 
      });
    }

    return successResponse(res, "Berhasil memuat dokumen dari kabupaten/kota", {
      berita_acara: formattedBa,
      surat_keputusan: formattedSk
    });
  } catch (error) {
    console.error("Error getDokumenKabkota:", error);
    return errorResponse(res, "Internal Server Error", 500);
  }
};
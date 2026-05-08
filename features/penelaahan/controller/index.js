const { Op } = require("sequelize");
const { TrxBeasiswa, sequelize } = require("../../../models");
const { successResponse, errorResponse } = require("../../../common/response");
const ExcelJS = require("exceljs");

exports.getPendaftarPenelaahan = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    const whereCondition = { id_flow: 11 };

    if (search) {
      whereCondition[Op.or] = [
        { nama_lengkap: { [Op.like]: `%${search}%` } },
        { nik: { [Op.like]: `%${search}%` } },
        { kode_pendaftaran: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa", "nama_lengkap", "nik", "kode_pendaftaran", 
        "jalur", "nama_kluster", "status_wawancara"
      ],
      limit,
      offset,
      order: [["nama_lengkap", "ASC"]],
    });

    return successResponse(res, "Data penelaahan berhasil dimuat", {
      result: rows,
      total: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
    });
  } catch (error) {
    console.error("Error getPendaftarPenelaahan:", error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.downloadExcelPenelaahan = async (req, res) => {
  try {
    const rows = await TrxBeasiswa.findAll({
      where: { id_flow: 11 },
      attributes: ["kode_pendaftaran","nama_lengkap", "nama_kluster", "status_wawancara"], 
      order: [["nama_lengkap", "ASC"]],
      raw: true
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Penelaahan");

    worksheet.columns = [
      { header: "Kode Pendaftaran", key: "kode_pendaftaran", width: 30 },
      { header: "Nama Lengkap", key: "nama", width: 35 },
      { header: "Kluster", key: "kluster", width: 20 },
      { header: "Status Wawancara", key: "status_wawancara", width: 25 },
    ];

    rows.forEach((row) => {
      worksheet.addRow({
        nama: row.nama_lengkap || "-",
        kode_pendaftaran: row.kode_pendaftaran || "-",
        kluster: row.nama_kluster || "-",
        status_wawancara: row.status_wawancara || "-",
      });
    });

    for (let i = 1; i <= 4; i++) {
      const cell = worksheet.getRow(1).getCell(i);
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F0FF" } };
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=data_penelaahan_perankingan.xlsx");

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    console.error("Error downloadExcelPenelaahan:", error);
    return errorResponse(res, "Gagal mengunduh file Excel");
  }
};

exports.uploadHasilPerankingan = async (req, res) => {
  try {
    if (!req.file) return errorResponse(res, "File Excel tidak ditemukan");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) return errorResponse(res, "Sheet tidak ditemukan");

    let successCount = 0;
    let failedCount = 0;

    const extractVal = (cell) => {
      if (!cell || cell.value == null) return null;
      let val = cell.value;
      if (typeof val === 'object') {
        if (val.result !== undefined) return val.result;
        if (val.richText) return val.richText.map(r => r.text).join("");
        if (val.text) return val.text;
      }
      return val.toString().trim();
    };

    let kodeCol = 1, idPtCol = -1, ptCol = -1, idProdiCol = -1, prodiCol = -1;
    
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      const txt = extractVal(cell)?.toLowerCase() || "";
      if (txt.includes("kode") || txt.includes("pendaftaran")) kodeCol = colNumber;
      else if (txt.includes("id pt")) idPtCol = colNumber;
      else if (txt.includes("pt")) ptCol = colNumber;
      else if (txt.includes("id prodi")) idProdiCol = colNumber;
      else if (txt.includes("prodi")) prodiCol = colNumber;
    });

    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const kodePendaftaran = extractVal(row.getCell(kodeCol));
      const idPtFinal = idPtCol !== -1 ? extractVal(row.getCell(idPtCol)) : null;
      const ptFinal = ptCol !== -1 ? extractVal(row.getCell(ptCol)) : null;
      const idProdiFinal = idProdiCol !== -1 ? extractVal(row.getCell(idProdiCol)) : null;
      const prodiFinal = prodiCol !== -1 ? extractVal(row.getCell(prodiCol)) : null;
      const urutan_excel = i - 1; 

      if (!kodePendaftaran) continue;

      try {
        await sequelize.query(
          `UPDATE trx_beasiswa SET id_pt_final = :id_pt, pt_final = :pt, id_prodi_final = :id_prodi, prodi_final = :prodi, urutan_ranking = :urutan WHERE kode_pendaftaran = :kode AND id_flow = 11`,
          {
            replacements: { 
              id_pt: idPtFinal || null,
              pt: ptFinal || null, 
              id_prodi: idProdiFinal || null,
              prodi: prodiFinal || null, 
              urutan: urutan_excel, 
              kode: kodePendaftaran 
            },
            type: sequelize.QueryTypes.UPDATE
          }
        );
        successCount++;
      } catch (error) {
        failedCount++;
      }
    }

    return successResponse(res, `Upload selesai. ${successCount} data berhasil diperbarui sesuai urutan Excel.`);
  } catch (error) {
    console.error("Error uploadHasilPerankingan:", error);
    return errorResponse(res, "Gagal memproses file Excel");
  }
};

exports.getHasilPerankingan = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    const whereCondition = {
      id_flow: 11,
      pt_final: {
        [Op.and]: [
          { [Op.not]: null },
          { [Op.ne]: "" },
          { [Op.ne]: "null" }
        ]
      }
    };

    if (search) {
      whereCondition[Op.or] = [
        { nama_lengkap: { [Op.like]: `%${search}%` } },
        { pt_final: { [Op.like]: `%${search}%` } },
        { prodi_final: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      attributes: ["id_trx_beasiswa", "kode_pendaftaran", "nama_lengkap", "nama_kluster", "status_wawancara", "id_pt_final", "pt_final", "id_prodi_final", "prodi_final", "urutan_ranking"],
      limit,
      offset,
      order: [["urutan_ranking", "ASC"]],
    });

    return successResponse(res, "Data hasil perankingan dimuat", {
      result: rows,
      total: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
    });
  } catch (error) {
    console.error("Error getHasil:", error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.kirimDataPenelaahan = async (req, res) => {
  try {
    const [updatedCount] = await TrxBeasiswa.update(
      { id_flow: 12 },
      { 
        where: { 
          id_flow: 11,
          pt_final: { [Op.ne]: null }
        } 
      }
    );

    if (updatedCount === 0) {
      return successResponse(res, "Tidak ada data hasil perankingan yang bisa dikirim.");
    }

    return successResponse(res, `Berhasil mengirim ${updatedCount} pendaftar ke tahap selanjutnya (Flow 12).`);
  } catch (error) {
    console.error("Error kirimDataPenelaahan:", error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.resetHasilPerankingan = async (req, res) => {
  try {
    const [updatedCount] = await TrxBeasiswa.update(
      { id_pt_final: null, pt_final: null, id_prodi_final: null, prodi_final: null, urutan_ranking: null },
      { where: { id_flow: 11 } }
    );

    return successResponse(res, "Berhasil mereset data hasil perankingan. Silakan unggah ulang file Excel.");
  } catch (error) {
    console.error("Error resetHasilPerankingan:", error);
    return errorResponse(res, "Gagal mereset data perankingan.");
  }
};

exports.downloadExcelSemuaPenelaahan = async (req, res) => {
  try {
    const rows = await TrxBeasiswa.findAll({
      where: { id_flow: 11 },
      attributes: [
        "id_trx_beasiswa", "nama_lengkap", "nik", "kode_pendaftaran", 
        "jalur", "nama_kluster", "status_wawancara", 
        "id_pt_final", "pt_final", "id_prodi_final", "prodi_final"
      ],
      order: [["nama_lengkap", "ASC"]],
      raw: true
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Semua Data Penelaahan");

    worksheet.columns = [
      { header: "No", key: "no", width: 5 },
      { header: "Nama Lengkap", key: "nama", width: 35 },
      { header: "NIK", key: "nik", width: 25 },
      { header: "Kode Pendaftaran", key: "kode", width: 25 },
      { header: "Jalur", key: "jalur", width: 20 },
      { header: "Kluster", key: "kluster", width: 20 },
      { header: "Status Wawancara", key: "status_wawancara", width: 25 },
      { header: "ID PT Final", key: "id_pt_final", width: 15 },
      { header: "PT Final", key: "pt_final", width: 25 },
      { header: "ID Prodi Final", key: "id_prodi_final", width: 15 },
      { header: "Prodi Final", key: "prodi_final", width: 25 },
    ];

    rows.forEach((row, index) => {
      worksheet.addRow({
        no: index + 1,
        nama: row.nama_lengkap || "-",
        nik: row.nik || "-",
        kode: row.kode_pendaftaran || "-",
        jalur: row.jalur || "-",
        kluster: row.nama_kluster || "-",
        status_wawancara: row.status_wawancara || "-",
        id_pt_final: row.id_pt_final || "-",
        pt_final: row.pt_final || "-",
        id_prodi_final: row.id_prodi_final || "-",
        prodi_final: row.prodi_final || "-"
      });
    });

    for (let i = 1; i <= 11; i++) {
      const cell = worksheet.getRow(1).getCell(i);
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F0FF" } };
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Semua_Data_Penelaahan.xlsx");

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    console.error("Error downloadExcelSemuaPenelaahan:", error);
    return errorResponse(res, "Gagal mengunduh file Excel semua data");
  }
};
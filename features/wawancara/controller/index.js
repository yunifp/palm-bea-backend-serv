const { Op } = require("sequelize");
const { TrxBeasiswa } = require("../../../models"); 
const { successResponse, errorResponse } = require("../../../common/response");
const ExcelJS = require("exceljs");
const fs = require("fs");

exports.getPendaftarWawancara = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    const whereCondition = { id_flow: 10 };

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

    return successResponse(res, "Data wawancara berhasil dimuat", {
      result: rows,
      total: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
    });
  } catch (error) {
    console.error("Error getPendaftarWawancara:", error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.downloadExcelWawancara = async (req, res) => {
  try {
    const rows = await TrxBeasiswa.findAll({
      where: { id_flow: 10 },
      attributes: [
        "nama_lengkap", "nik", "kode_pendaftaran", "jalur", "nama_kluster", "status_wawancara" // Tambahkan status_wawancara
      ],
      order: [["nama_lengkap", "ASC"]],
      raw: true
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Wawancara");

    // Header Note
    worksheet.mergeCells("A1:G1");
    const noteCell1 = worksheet.getCell("A1");
    noteCell1.value = 'CATATAN: Isi kolom "Status Wawancara" dengan angka 1 (Rekomendasi) atau 0 (Tidak Rekomendasi).';
    noteCell1.font = { color: { argb: "FFFF0000" }, italic: true, bold: true };

    // Header tabel (Baris 3)
    worksheet.getRow(3).values = [
      "No", "Nama Lengkap", "NIK", "Kode Pendaftaran", "Jalur", "Status Kluster", "Status Wawancara"
    ];

    worksheet.columns = [
      { key: "no", width: 5 },
      { key: "nama", width: 30 },
      { key: "nik", width: 25 },
      { key: "kode", width: 25 },
      { key: "jalur", width: 20 },
      { key: "kluster", width: 20 },
      { key: "status_wawancara", width: 25 },
    ];

    rows.forEach((row, index) => {
      // Logika konversi balik dari String Database ke Angka Excel
      let statusExcel = ""; 
      if (row.status_wawancara === "Rekomendasi") statusExcel = 1;
      else if (row.status_wawancara === "Tidak Rekomendasi") statusExcel = 0;

      worksheet.addRow({
        no: index + 1,
        nama: row.nama_lengkap || "-",
        nik: row.nik || "-",
        kode: row.kode_pendaftaran || "-",
        jalur: row.jalur || "-",
        kluster: row.nama_kluster || "-",
        status_wawancara: statusExcel, // Sekarang berisi data terbaru (1/0 atau kosong)
      });
    });

    // Styling header
    worksheet.getRow(3).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F0FF" } };
      cell.border = { top: { style:'thin' }, left: { style:'thin' }, bottom: { style:'thin' }, right: { style:'thin' }};
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=rekap_wawancara.xlsx");

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    console.error("Error downloadExcelWawancara:", error);
    return errorResponse(res, "Gagal mengunduh file Excel");
  }
};

exports.uploadExcelWawancara = async (req, res) => {
  try {
    if (!req.file) return errorResponse(res, "File Excel tidak ditemukan", 400);

    const workbook = new ExcelJS.Workbook();
    
    // Mendukung baca file baik dari memory (buffer) maupun dari disk (path)
    if (req.file.path) {
      await workbook.xlsx.readFile(req.file.path);
      fs.unlinkSync(req.file.path); // Hapus temp file setelah dibaca
    } else {
      await workbook.xlsx.load(req.file.buffer);
    }

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) return errorResponse(res, "Format Excel tidak valid", 400);

    const updates = [];
    
    // Looping setiap baris, data mulai di baris ke-4
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 3) {
        const kodePendaftaran = row.getCell(4).value; // Kolom D: Kode Pendaftaran
        const statusRaw = row.getCell(7).value; // Kolom G: Status Wawancara

        if (kodePendaftaran && statusRaw !== null && statusRaw !== "") {
          let statusText = null;
          // Konversi angka 1 dan 0 dari Excel ke text untuk DB
          if (statusRaw.toString().trim() === "1") statusText = "Rekomendasi";
          else if (statusRaw.toString().trim() === "0") statusText = "Tidak Rekomendasi";

          if (statusText) {
            updates.push({ 
              kode_pendaftaran: kodePendaftaran.toString().trim(), 
              status_wawancara: statusText 
            });
          }
        }
      }
    });

    // Proses Update ke Database
    if (updates.length > 0) {
      for (const item of updates) {
        await TrxBeasiswa.update(
          { status_wawancara: item.status_wawancara },
          { where: { kode_pendaftaran: item.kode_pendaftaran, id_flow: 10 } }
        );
      }
    }

    return successResponse(res, `Berhasil memproses dan mengunggah ${updates.length} data rekomendasi wawancara.`);
  } catch (error) {
    console.error("Error uploadExcelWawancara:", error);
    return errorResponse(res, "Gagal memproses file Excel");
  }
};

exports.updateNilaiWawancaraSingle = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const { status_wawancara } = req.body; 

    if (status_wawancara && !["Rekomendasi", "Tidak Rekomendasi"].includes(status_wawancara)) {
        return errorResponse(res, "Nilai status seleksi tidak valid.", 400);
    }

    const updateData = {};
    if (status_wawancara !== undefined) updateData.status_wawancara = status_wawancara;

    if (Object.keys(updateData).length > 0) {
        await TrxBeasiswa.update(updateData, { 
          where: { id_trx_beasiswa: idTrxBeasiswa, id_flow: 10 } 
        });
    }

    return successResponse(res, "Data wawancara berhasil diperbarui.");
  } catch (error) {
    console.error("Error updateNilaiWawancaraSingle:", error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.kirimDataWawancara = async (req, res) => {
  try {
    const pendaftarBelumDinilai = await TrxBeasiswa.count({
      where: {
        id_flow: 10,
        [Op.or]: [
          { status_wawancara: null },
          { status_wawancara: "" }
        ]
      }
    });

    if (pendaftarBelumDinilai > 0) {
      return errorResponse(
        res, 
        `Validasi Gagal: Terdapat ${pendaftarBelumDinilai} pendaftar yang belum diberikan status wawancara. Silakan download, isi, dan upload rekap excel terlebih dahulu.`, 
        400
      );
    }

    const [updatedCount] = await TrxBeasiswa.update(
      { id_flow: 11 },
      { where: { id_flow: 10 } }
    );
    
    return successResponse(res, `Berhasil mengirim ${updatedCount} pendaftar ke tahap selanjutnya.`);
  } catch (error) {
    console.error("Error kirimDataWawancara:", error);
    return errorResponse(res, "Internal Server Error");
  }
};
const { Op } = require("sequelize");
const { 
  RefPerguruanTinggi, 
  RefProgramStudi, 
  TrxBeasiswa, 
  TrxPilihanProgramStudi, 
  sequelize 
} = require("../../../models");
const { successResponse, errorResponse } = require("../../../common/response");

// Skenario 1: Get list Perguruan Tinggi
exports.getPerguruanTinggi = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereCondition = search
      ? { nama_pt: { [Op.like]: `%${search}%` } }
      : {};

    const { count, rows } = await RefPerguruanTinggi.findAndCountAll({
      where: whereCondition,
      limit: parseInt(limit),
      offset: offset,
      order: [["nama_pt", "ASC"]],
      raw: true, // Menggunakan raw: true agar query lebih ringan
    });

    return successResponse(res, "Berhasil memuat data Perguruan Tinggi", {
      result: rows,
      total: count,
      current_page: parseInt(page),
      total_pages: Math.ceil(count / parseInt(limit)),
    });
  } catch (error) {
    console.error("Error getPerguruanTinggi:", error);
    return errorResponse(res, "Internal Server Error");
  }
};

// Skenario 2: Get list Program Studi berdasarkan ID PT atau Pencarian
exports.getProgramStudi = async (req, res) => {
  try {
    const { id_pt, search = "", page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const whereCondition = {};
    if (id_pt) whereCondition.id_pt = id_pt;
    if (search) whereCondition.nama_prodi = { [Op.like]: `%${search}%` };

    const { count, rows } = await RefProgramStudi.findAndCountAll({
      where: whereCondition,
      limit: parseInt(limit),
      offset: offset,
      order: [["nama_prodi", "ASC"]],
      raw: true,
    });

    return successResponse(res, "Berhasil memuat data Program Studi", {
      result: rows,
      total: count,
      current_page: parseInt(page),
      total_pages: Math.ceil(count / parseInt(limit)),
    });
  } catch (error) {
    console.error("Error getProgramStudi:", error);
    return errorResponse(res, "Internal Server Error");
  }
};

// Skenario 3: Get ALL data (Mode Ekstrim untuk Testing Payload/Bandwidth)
exports.getAllDataEkstrim = async (req, res) => {
  try {
    // Sengaja menarik data dalam jumlah besar tanpa pagination 
    // untuk melihat seberapa berat rendering di sisi klien dan payload network
    const allProdi = await RefProgramStudi.findAll({
      raw: true
    });

    return successResponse(res, "Berhasil memuat seluruh data", {
      total_data: allProdi.length,
      result: allProdi
    });
  } catch (error) {
    console.error("Error getAllDataEkstrim:", error);
    return errorResponse(res, "Internal Server Error");
  }
};

// Skenario 4: Load Test Submit Pendaftaran
exports.submitBeasiswaLoadTest = async (req, res) => {
  // 1. Inisialisasi Transaksi Database
  // Memastikan semua query berjalan dalam 1 koneksi terisolasi. Jika 1 gagal, semua di-rollback.
  const t = await sequelize.transaction();

  try {
    const {
      nama_lengkap,
      nik,
      email,
      id_jalur = 1,
      pilihan_program_studi
    } = req.body;

    // 2. Generate Kode Pendaftaran Aman (Menghindari Op.like)
    // Menggunakan t.LOCK.UPDATE agar jika ada 100 request masuk bersamaan, 
    // baris ini akan mengantre (antrean mikrodetik) agar tidak mendapat sequence yang sama.
    const lastRecord = await TrxBeasiswa.findOne({
      where: { id_jalur: id_jalur },
      attributes: ['sequence'],
      order: [['sequence', 'DESC']],
      transaction: t,
      lock: t.LOCK.UPDATE 
    });

    // Kalkulasi sequence baru
    const nextSequence = (lastRecord && lastRecord.sequence) ? lastRecord.sequence + 1 : 1;
    const tahun = new Date().getFullYear().toString().slice(-2);
    const kodeJalur = String(id_jalur).padStart(2, '0');
    const strSequence = String(nextSequence).padStart(6, '0');
    const finalKodePendaftaran = `${tahun}${kodeJalur}${strSequence}`;

    // 3. Insert Data Transaksi Beasiswa Utama
    const insertData = {
      nama_lengkap: nama_lengkap || "Tester Load Test",
      nik: nik || "3303" + Math.floor(Math.random() * 100000000000), // Random NIK mockup
      email: email || "tester@example.com",
      id_jalur: id_jalur,
      id_flow: 2, 
      flow: "Verifikasi",
      sequence: nextSequence,
      kode_pendaftaran: finalKodePendaftaran,
      created_at: new Date(),
      updated_at: new Date()
    };

    const newTrx = await TrxBeasiswa.create(insertData, { transaction: t });

    // 4. Insert Pilihan Prodi (Bulk Insert untuk efisiensi query)
    if (pilihan_program_studi && Array.isArray(pilihan_program_studi)) {
      const prodiData = pilihan_program_studi.map(item => ({
        id_trx_beasiswa: newTrx.id_trx_beasiswa,
        id_pt: item.id_pt,
        nama_pt: item.nama_pt,
        id_prodi: item.id_prodi,
        nama_prodi: item.nama_prodi
      }));

      await TrxPilihanProgramStudi.bulkCreate(prodiData, { transaction: t });
    }

    // 5. Commit Transaksi secara permanen ke Database
    await t.commit();

    return successResponse(res, "Pendaftaran berhasil disubmit (Mode Load Test)", {
      kode_pendaftaran: finalKodePendaftaran,
      id_trx_beasiswa: newTrx.id_trx_beasiswa
    });

  } catch (error) {
    // 6. Rollback transaksi jika terjadi kegagalan/timeout
    await t.rollback();
    console.error("Error submit load test:", error);
    return errorResponse(res, "Internal Server Error");
  }
};
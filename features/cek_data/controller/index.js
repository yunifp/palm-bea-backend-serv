const crypto = require("crypto");
const { TrxBeasiswa } = require("../../../models");
const { Op } = require("sequelize");
const { successResponse, errorResponse } = require("../../../common/response");

// Penyimpanan memori lokal untuk captcha
const captchaStore = {};

// Fungsi untuk men-generate Captcha baru
exports.getCaptcha = (req, res) => {
  const a = Math.floor(Math.random() * 10);
  const b = Math.floor(Math.random() * 10);
  const answer = a + b;

  const captchaId = crypto.randomUUID();
  captchaStore[captchaId] = answer;

  return successResponse(res, "Captcha berhasil dimuat", {
    captchaId,
    question: `Berapa ${a} + ${b}?`,
  });
};

exports.cekDataByKeyword = async (req, res) => {
  try {
    const { keyword } = req.query;

    if (!keyword) {
      return errorResponse(res, "Parameter pencarian (NIK atau Kode Pendaftaran) tidak boleh kosong.");
    }

    const data = await TrxBeasiswa.findAll({
      where: {
        [Op.or]: [
          { nik: keyword },
          { kode_pendaftaran: keyword }
        ]
      },
      order: [["id_trx_beasiswa", "DESC"]] 
    });

    if (!data || data.length === 0) {
      return successResponse(res, "Data tidak ditemukan untuk pencarian tersebut.", []);
    }

    return successResponse(res, "Data pendaftar berhasil ditemukan.", data);
  } catch (error) {
    console.error("Error cekDataByKeyword:", error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.cekStatusPublic = async (req, res) => {
  try {
    const { keyword, captchaId, answer } = req.query;

    if (!keyword) {
      return errorResponse(res, "Parameter pencarian tidak boleh kosong.", 400);
    }

    // --- VERIFIKASI CAPTCHA LOKAL ---
    if (!captchaId || answer === undefined) {
      return errorResponse(res, "Silakan selesaikan hitungan captcha terlebih dahulu.", 400);
    }
    
    if (!(captchaId in captchaStore) || captchaStore[captchaId] !== Number(answer)) {
      if (captchaId in captchaStore) delete captchaStore[captchaId];
      return errorResponse(res, "Jawaban captcha salah atau kedaluwarsa.", 400);
    }
    
    // Hapus captcha setelah digunakan sekali
    delete captchaStore[captchaId];
    // --------------------------------

    const data = await TrxBeasiswa.findAll({
      where: {
        [Op.or]: [
          { nik: keyword },
          { kode_pendaftaran: keyword }
        ]
      },
      attributes: [
        "nama_lengkap", 
        "nama_beasiswa", 
        "id_flow", 
        "nama_kluster", 
        "pt_final", 
        "prodi_final"
      ],
      order: [["id_trx_beasiswa", "DESC"]]
    });

    if (!data || data.length === 0) {
      return successResponse(res, "Data tidak ditemukan.", []);
    }

    return successResponse(res, "Status berhasil ditemukan.", data);
  } catch (error) {
    console.error("Error cekStatusPublic:", error);
    return errorResponse(res, "Internal Server Error", 500);
  }
};
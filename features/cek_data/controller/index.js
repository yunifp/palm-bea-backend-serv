const { TrxBeasiswa } = require("../../../models");
const { Op } = require("sequelize");
const { successResponse, errorResponse } = require("../../../common/response");

// 1. Nama fungsi diubah menjadi cekDataByKeyword
exports.cekDataByKeyword = async (req, res) => {
  try {
    // 2. Mengambil parameter keyword dari frontend
    const { keyword } = req.query;

    if (!keyword) {
      return errorResponse(res, "Parameter pencarian (NIK atau Kode Pendaftaran) tidak boleh kosong.");
    }

    // 3. Mencari berdasarkan NIK ATAU Kode Pendaftaran
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
    const { keyword } = req.query;

    if (!keyword) {
      return errorResponse(res, "Parameter pencarian tidak boleh kosong.");
    }

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
    return errorResponse(res, "Internal Server Error");
  }
};
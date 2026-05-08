const {
  TrxDokumenUmum,
  TrxDokumenKhusus,
  TrxDokumenDinasDaerah,
  TrxSkDinasKabkota,
  TrxSkDinasProvinsi,
  TrxBeasiswa,
  TrxBaDinasKabkota,
  TrxBaDinasProvinsi
} = require("../../../models");
const { getFileUrl } = require("../../../common/middleware/upload_middleware");
const { successResponse, failResponse, errorResponse } = require("../../../common/response");

// ID dokumen SKTM di tabel ref_dokumen
const ID_DOKUMEN_SKTM = 13;

/**
 * Helper: update tag_sktm di trx_beasiswa berdasarkan
 * apakah dokumen SKTM (id_ref_dokumen = 13) sudah diupload
 */
const syncTagSktm = async (id_trx_beasiswa) => {
  const sktmDoc = await TrxDokumenUmum.findOne({
    where: {
      id_trx_beasiswa,
      id_ref_dokumen: ID_DOKUMEN_SKTM,
    },
  });

  const tag_sktm = sktmDoc ? "1" : "0";

  await TrxBeasiswa.update(
    { tag_sktm },
    { where: { id_trx_beasiswa } }
  );

  return tag_sktm;
};

const syncKluster = async (id_trx_beasiswa, id_ref_sktm) => {
  // Cek apakah dokumen SKTM sudah diupload
  const sktmDoc = await TrxDokumenUmum.findOne({
    where: { id_trx_beasiswa, id_ref_dokumen: id_ref_sktm },
  });

  const hasSktm = !!sktmDoc?.file;

  const id_kluster = hasSktm ? 2 : 1;
  const nama_kluster = hasSktm ? "Afirmasi" : "Reguler";

  // Update ke tabel transaksi beasiswa
  await TrxBeasiswa.update(
    { id_kluster, nama_kluster },
    { where: { id_trx_beasiswa } }
  );

  return { id_kluster, nama_kluster };
};

exports.uploadPersyaratan = async (req, res) => {
  try {
    const { id_trx_beasiswa, id_ref_dokumen, nama_dokumen_persyaratan } = req.body;
    
    // ✅ PERBAIKAN: Menyimpan Full Path untuk mendukung folder dinamis (Tanpa memotong string)
    const filename = req.file.filename || req.file.key || null;
    if (!filename) return failResponse(res, "Gagal mendapatkan nama file dari sistem penyimpanan");
    
    const { kategori } = req.params;

    const id_is_kabkota = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13];
    const id_is_prov = [7, 8];
    const ID_REF_SKTM = 13;

    let is_true_kabkot = "N";
    let is_true_prov = "N";

    if (kategori === "umum") {
      if (id_is_kabkota.includes(Number(id_ref_dokumen))) {
        is_true_kabkot = "Y";
      }

      if (id_is_prov.includes(Number(id_ref_dokumen))) {
        is_true_prov = "Y";
      }
    }

    let existingData;
    if (kategori === "umum") {
      existingData = await TrxDokumenUmum.findOne({
        where: { id_trx_beasiswa, id_ref_dokumen },
      });
    } else if (kategori === "khusus") {
      existingData = await TrxDokumenKhusus.findOne({
        where: { id_trx_beasiswa, id_ref_dokumen },
      });
    } else if (kategori === "dinas") {
      existingData = await TrxDokumenDinasDaerah.findOne({
        where: { id_trx_beasiswa, id_ref_dokumen },
      });
    }

    let returnData;

    if (existingData) {
      if (kategori === "umum") {
        await TrxDokumenUmum.update(
          {
            nama_dokumen_persyaratan,
            file: filename,
            timestamp: new Date(),
            verifikator_catatan: null,
            is_kabkota: is_true_kabkot,
            is_prov: is_true_prov,
          },
          { where: { id_trx_beasiswa, id_ref_dokumen } }
        );
        returnData = await TrxDokumenUmum.findOne({ where: { id_trx_beasiswa, id_ref_dokumen } });
      } else if (kategori === "khusus") {
        await TrxDokumenKhusus.update(
          { nama_dokumen_persyaratan, file: filename, timestamp: new Date(), verifikator_catatan: null },
          { where: { id_trx_beasiswa, id_ref_dokumen } }
        );
        returnData = await TrxDokumenKhusus.findOne({ where: { id_trx_beasiswa, id_ref_dokumen } });
      } else if (kategori === "dinas") {
        await TrxDokumenDinasDaerah.update(
          { nama_dokumen_persyaratan, file: filename, timestamp: new Date(), verifikator_catatan: null },
          { where: { id_trx_beasiswa, id_ref_dokumen } }
        );
        returnData = await TrxDokumenDinasDaerah.findOne({ where: { id_trx_beasiswa, id_ref_dokumen } });
      }
    } else {
      if (kategori === "umum") {
        returnData = await TrxDokumenUmum.create({
          id_trx_beasiswa,
          id_ref_dokumen,
          nama_dokumen_persyaratan,
          file: filename,
          timestamp: new Date(),
          is_kabkota: is_true_kabkot,
          is_prov: is_true_prov,
        });
      } else if (kategori === "khusus") {
        returnData = await TrxDokumenKhusus.create({
          id_trx_beasiswa,
          id_ref_dokumen,
          nama_dokumen_persyaratan,
          file: filename,
          timestamp: new Date(),
        });
      } else if (kategori === "dinas") {
        returnData = await TrxDokumenDinasDaerah.create({
          id_trx_beasiswa,
          id_ref_dokumen,
          nama_dokumen_persyaratan,
          file: filename,
          timestamp: new Date(),
        });
      }
    }

    // Sync tag_sktm setelah upload dokumen umum
    let tag_sktm = null;
    if (kategori === "umum") {
      tag_sktm = await syncTagSktm(id_trx_beasiswa);
    }

    // Sync kluster berdasarkan keberadaan dokumen SKTM
    let klusterData = null;
    if (kategori === "umum") {
      klusterData = await syncKluster(id_trx_beasiswa, ID_REF_SKTM);
    }

    const mappedData = {
      ...returnData.dataValues,
      file: getFileUrl(req, "persyaratan", returnData.file),
      ...(tag_sktm !== null && { tag_sktm }),
      ...(klusterData !== null && { ...klusterData }),
    };

    return successResponse(res, "File berhasil diupload", mappedData);
  } catch (error) {
    console.log(error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getPersyaratanUploaded = async (req, res) => {
  try {
    const { kategori, idTrxBeasiswa } = req.params;

    let uploaded;
    if (kategori === "umum") {
      uploaded = await TrxDokumenUmum.findAll({
        where: { id_trx_beasiswa: idTrxBeasiswa },
        attributes: ["id_ref_dokumen", "nama_dokumen_persyaratan", "file", "verifikator_catatan"],
      });
    } else if (kategori === "khusus") {
      uploaded = await TrxDokumenKhusus.findAll({
        where: { id_trx_beasiswa: idTrxBeasiswa },
        attributes: ["id_ref_dokumen", "nama_dokumen_persyaratan", "file", "verifikator_catatan"],
      });
    } else if (kategori === "dinas") {
      uploaded = await TrxDokumenDinasDaerah.findAll({
        where: { id_trx_beasiswa: idTrxBeasiswa },
        attributes: ["id_ref_dokumen", "nama_dokumen_persyaratan", "file", "verifikator_catatan"],
      });
    }

    const mappedData = uploaded.map((item) => ({
      id_ref_dokumen: item.id_ref_dokumen,
      nama_dokumen_persyaratan: item.nama_dokumen_persyaratan,
      verifikator_catatan: item.verifikator_catatan,
      file: getFileUrl(req, "persyaratan", item.file),
    }));

    return successResponse(res, "Data berhasil dimuat", mappedData);
  } catch (error) {
    console.error(error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.updateCatatanPersyaratan = async (req, res) => {
  try {
    const { kategori, idTrxDokumen } = req.params;
    const { catatan, verifikator } = req.body;
    const { nama } = req.user;

    const updateData = {};

    if (catatan) {
      if (verifikator == "ditjenbun") updateData.verifikator_catatan = catatan;
      else if (verifikator == "dinas") updateData.verifikator_dinas_catatan = catatan;
    }

    if (nama) {
      if (verifikator == "ditjenbun") updateData.verifikator_nama = nama;
      else if (verifikator == "dinas") updateData.verifikator_dinas_nama = nama;
    }

    if (verifikator == "ditjenbun") updateData.verifikator_timestamp = new Date();
    else if (verifikator == "dinas") updateData.verifikator_dinas_timestamp = new Date();

    if (kategori === "umum") {
      await TrxDokumenUmum.update(updateData, { where: { id: idTrxDokumen } });
    } else if (kategori === "khusus") {
      await TrxDokumenKhusus.update(updateData, { where: { id: idTrxDokumen } });
    }

    return successResponse(res, "Catatan berhasil diperbarui");
  } catch (error) {
    console.log(error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.uploadFileSK = async (req, res) => {
  try {
    if (!req.file) return failResponse(res, "File tidak ditemukan");

    const { idBeasiswa } = req.params;
    const { kode_kab, kode_prov, nama_dinas_kabkota, nama_dinas_provinsi } = req.user;
    
    // ✅ PERBAIKAN: Menyimpan Full Path tanpa .split('/').pop()
    const filename = req.file.filename || req.file.key || null;
    if (!filename) return failResponse(res, "Gagal mendapatkan nama file dari sistem penyimpanan");
    
    const fileUrl = getFileUrl(req, "surat-keputusan", filename);

    await TrxSkDinasKabkota.create({
      id_ref_beasiswa: idBeasiswa,
      kode_dinas_kabkota: kode_kab,
      nama_dinas_kabkota: nama_dinas_kabkota ?? null,
      kode_dinas_provinsi: kode_prov,
      nama_dinas_provinsi: nama_dinas_provinsi ?? null,
      filename,
      uploaded_by: req.user?.nama ?? null,
      created_at: new Date(),
    });

    return successResponse(res, "File berhasil diupload", { filename, file: fileUrl });
  } catch (error) {
    console.error(error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.uploadFileSKProvinsi = async (req, res) => {
  try {
    if (!req.file) return failResponse(res, "File tidak ditemukan");

    const { idBeasiswa } = req.params;
    const { kode_kab, kode_prov, nama_dinas_kabkota, nama_dinas_provinsi } = req.user;
    
    // ✅ PERBAIKAN: Menyimpan Full Path tanpa .split('/').pop()
    const filename = req.file.filename || req.file.key || null;
    if (!filename) return failResponse(res, "Gagal mendapatkan nama file dari sistem penyimpanan");
    
    const fileUrl = getFileUrl(req, "surat-keputusan", filename);

    await TrxSkDinasProvinsi.create({
      id_ref_beasiswa: idBeasiswa,
      kode_dinas_kabkota: kode_kab,
      nama_dinas_kabkota: nama_dinas_kabkota ?? null,
      kode_dinas_provinsi: kode_prov,
      nama_dinas_provinsi: nama_dinas_provinsi ?? null,
      filename,
      uploaded_by: req.user?.nama ?? null,
      created_at: new Date(),
    });

    return successResponse(res, "File berhasil diupload", { filename, file: fileUrl });
  } catch (error) {
    console.error(error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.uploadFileBA = async (req, res) => {
  try {
    if (!req.file) return failResponse(res, "File tidak ditemukan");

    const { idBeasiswa } = req.params;
    const { kode_kab, kode_prov, nama_dinas_kabkota, nama_dinas_provinsi } = req.user;
    
    // ✅ PERBAIKAN: Menyimpan Full Path tanpa .split('/').pop()
    const filename = req.file.filename || req.file.key || null;
    if (!filename) return failResponse(res, "Gagal mendapatkan nama file dari sistem penyimpanan");
    
    const fileUrl = getFileUrl(req, "berita-acara", filename);

    await TrxBaDinasKabkota.create({
      id_ref_beasiswa: idBeasiswa,
      kode_dinas_kabkota: kode_kab,
      nama_dinas_kabkota: nama_dinas_kabkota ?? null,
      kode_dinas_provinsi: kode_prov,
      nama_dinas_provinsi: nama_dinas_provinsi ?? null,
      filename,
      uploaded_by: req.user?.nama ?? null,
      created_at: new Date(),
    });

    return successResponse(res, "File BA berhasil diupload", { filename, file: fileUrl });
  } catch (error) {
    console.error(error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.uploadFileBAProvinsi = async (req, res) => {
  try {
    if (!req.file) return failResponse(res, "File tidak ditemukan");

    const { idBeasiswa } = req.params;
    const { kode_kab, kode_prov, nama_dinas_kabkota, nama_dinas_provinsi } = req.user;
    
    // ✅ PERBAIKAN: Menyimpan Full Path tanpa .split('/').pop()
    const filename = req.file.filename || req.file.key || null;
    if (!filename) return failResponse(res, "Gagal mendapatkan nama file dari sistem penyimpanan");
    
    const fileUrl = getFileUrl(req, "berita-acara", filename);

    await TrxBaDinasProvinsi.create({
      id_ref_beasiswa: idBeasiswa,
      kode_dinas_kabkota: kode_kab,
      nama_dinas_kabkota: nama_dinas_kabkota ?? null,
      kode_dinas_provinsi: kode_prov,
      nama_dinas_provinsi: nama_dinas_provinsi ?? null,
      filename,
      uploaded_by: req.user?.nama ?? null,
      created_at: new Date(),
    });

    return successResponse(res, "File BA Provinsi berhasil diupload", { filename, file: fileUrl });
  } catch (error) {
    console.error(error);
    return errorResponse(res, "Internal Server Error");
  }
};

exports.deletePersyaratanKhususByTrx = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;

    await TrxDokumenKhusus.destroy({
      where: { id_trx_beasiswa: idTrxBeasiswa },
    });

    return successResponse(res, "Dokumen khusus berhasil dihapus");
  } catch (error) {
    console.error(error);
    return errorResponse(res, "Internal Server Error");
  }
};
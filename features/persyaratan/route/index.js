const express = require("express");
const router = express.Router();

const {
  uploadPersyaratan,
  getPersyaratanUploaded,
  updateCatatanPersyaratan,
  uploadFileSK,
  uploadFileSKProvinsi,
  uploadFileBA,
  uploadFileBAProvinsi,
  deletePersyaratanKhususByTrx
} = require("../controller");
const {
  uploadConfigs,
} = require("../../../common/middleware/upload_middleware");

router.post(
  "/upload-persyaratan/:kategori",
  uploadConfigs.persyaratan.single("file"),
  uploadPersyaratan
);
router.get(
  "/get-persyaratan/:kategori/beasiswa/:idTrxBeasiswa",
  getPersyaratanUploaded
);
router.put(
  "/catatan-persyaratan/:kategori/:idTrxDokumen",
  updateCatatanPersyaratan
);
router.post(
  "/upload-file-sk/:idBeasiswa",
  uploadConfigs.persyaratan.single("file"),
  uploadFileSK
);
router.post(
  "/upload-file-sk-provinsi/:idBeasiswa",
  uploadConfigs.persyaratan.single("file"),
  uploadFileSKProvinsi
);

router.post(
  "/upload-file-ba/:idBeasiswa",
  uploadConfigs.berita_acara.single("file"),
  uploadFileBA
);

router.post(
  "/upload-file-ba-provinsi/:idBeasiswa",
  uploadConfigs.berita_acara.single("file"),
  uploadFileBAProvinsi
);

router.delete(
  "/delete-persyaratan-khusus/:idTrxBeasiswa",
  deletePersyaratanKhususByTrx
);

module.exports = router;

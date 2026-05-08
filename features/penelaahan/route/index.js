const express = require("express");
const router = express.Router();
const { uploadConfigs } = require("../../../common/middleware/upload_middleware");

const {
  getPendaftarPenelaahan,
  downloadExcelPenelaahan,
  uploadHasilPerankingan,
  getHasilPerankingan,
  kirimDataPenelaahan,
  resetHasilPerankingan,
  downloadExcelSemuaPenelaahan
} = require("../controller");

router.get("/list", getPendaftarPenelaahan);
router.get("/download-excel", downloadExcelPenelaahan);
router.post("/upload-hasil", uploadConfigs.excel.single("file"), uploadHasilPerankingan);
router.get("/download-excel-semua", downloadExcelSemuaPenelaahan);
router.get("/hasil", getHasilPerankingan);
router.put("/kirim", kirimDataPenelaahan);
router.put("/reset", resetHasilPerankingan);

module.exports = router;
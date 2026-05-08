const express = require("express");
const router = express.Router();
const { uploadConfigs } = require("../../../common/middleware/upload_middleware");

const {
  getPendaftarRekomtek,
  downloadDataRekomtek,
  uploadDokumenRekomtek,
  cekDokumenRekomtek,
  kirimKeFlow14,
  prosesMengundurkanDiri,
  batalMengundurkanDiri,
  getSummaryKuotaRekomtek
} = require("../controller");

router.get("/list", getPendaftarRekomtek);
router.get("/download", downloadDataRekomtek);
router.get("/summary-kuota", getSummaryKuotaRekomtek);
router.get("/cek-dokumen", cekDokumenRekomtek);
router.put("/kirim", kirimKeFlow14);
router.put("/mengundurkan-diri/:id", prosesMengundurkanDiri);
router.put("/batal-mengundurkan-diri/:id", batalMengundurkanDiri);
router.post("/upload-dokumen", uploadConfigs.rekomtek.single("file"), uploadDokumenRekomtek);

module.exports = router;
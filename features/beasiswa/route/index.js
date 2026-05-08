const express = require("express");
const router = express.Router();

const {
  getTransaksiBeasiswaByPagination,
  createInitialTransaksi,
  submitBeasiswa,
  getFullDataBeasiswa,
  updateFlowBeasiswa,
  updateTaggingBeasiswa,
  downloadExcelSeleksiWawancara,
  uploadExcelSeleksiWawancara,
  getTransaksiBeasiswaByPaginationSeleksiAdministrasi,
  getTransaksiBeasiswaByPaginationVerifikasiDinas,
  downloadExcelHasilVerifikasiDinas,
  uploadExcelHasilVerifikasiDinas,
  uploadBeritaAcaraDinas,
  getTransaksiBeasiswaByPaginationSeleksiAdministrasiDaerah,
  getCountByProvinsi,
  getCountByKabkota,
  getPendaftarByKabkota,
  getDetailPendaftar,
  getPilihanProgramStudiWithDetails,
  getPilihanProgramStudiForForm,
  downloadRekapBeasiswaDaerah,
  getTotalTrxBeasiswa,
  getBebanVerifikator,
  getCatatanVerifikasi,
  saveCatatanVerifikasi,
  updateTagDinasKabkota,
  updateTagDinasProvinsi,
  submitTagDinasKabkotaToProvinsi,
  getCountTagSiapKirimKabkota,
  getCountTagSiapKirimProvinsi,
  submitTagDinasProvinsiToDitjenbun,
  getSkKabkotaByProvinsi,
  getPendaftarByProvinsi,
  updateDokumenVerifikasiDinas,
  getCountDataProvByKabkota,
  uploadFileBA,
  getBaKabkotaByProvinsi,
  assignVerifikator,
  getPendaftarForAssignment,
  assignVerifikatorByJumlah,
  getRekapLulusAdministrasi,
  getDetailLulusAdministrasi,
  updateFlagKewilayahan,
  getLastLogKeputusan,
  // updateKlusterBeasiswa,
  // updateKlusterBeasiswaBulk,
  updateKlusterBeasiswa,
  getPendaftarByProvinsiLembagaSeleksi,
  getCountByProvinsiProsesLembagaSeleksi,
  getPendaftarPenetapanByProvinsi,
  getPendaftarPenetapan,
  getDetailPenetapan,
  downloadPendaftarAssignment,
  downloadVerifikasiKabkota,
  downloadVerifikasiProvinsi,
  saveNilaiRapor,
  getNilaiRapor,
  toggleLockSelektorGlobal,
  toggleLockSelektor,
  kembalikanKeAdminDitjenbun,
  downloadPendaftarZip,
  downloadBulkZip,
  downloadRekapProvinsi,
  getStatusVerifikasiKabkota,
  getKoreksiPendaftar,
  checkNikDuplikat,
  downloadPdfHasilVerifikasi
} = require("../controller");
const {
  uploadConfigs,
} = require("../../../common/middleware/upload_middleware");

router.get("/rekap-administrasi", getRekapLulusAdministrasi);
router.get("/rekap-administrasi/log", getLastLogKeputusan);
router.put("/rekap-administrasi/flag", updateFlagKewilayahan);
router.get("/rekap-administrasi/:tinggal_kode_kab", getDetailLulusAdministrasi);

router.get("/", getTransaksiBeasiswaByPagination);
router.get(
  "/trx-seleksi-administrasi/:idBeasiswa",
  getTransaksiBeasiswaByPaginationSeleksiAdministrasi
);
router.get(
  "/trx-seleksi-administrasi-daerah/:idBeasiswa",
  getTransaksiBeasiswaByPaginationSeleksiAdministrasiDaerah
);
router.get(
  "/trx-verifikasi-dinas/:idBeasiswa",
  getTransaksiBeasiswaByPaginationVerifikasiDinas
);
router.get("/full/:idTrxBeasiswa", getFullDataBeasiswa);
router.post("/initial", createInitialTransaksi);
// router.post("/", uploadConfigs.foto.single("foto"), submitBeasiswa);
router.post(
  "/",
  uploadConfigs.foto_semua.fields([
    { name: "foto", maxCount: 1 },
    { name: "foto_depan", maxCount: 1 },
    { name: "foto_samping_kiri", maxCount: 1 },
    { name: "foto_samping_kanan", maxCount: 1 },
    { name: "foto_belakang", maxCount: 1 },
  ]),
  submitBeasiswa
);
router.put("/flow/:idTrxBeasiswa", updateFlowBeasiswa);
router.put("/tagging/:idTrxBeasiswa", updateTaggingBeasiswa);
router.get("/download-excel-seleksi-wawancara", downloadExcelSeleksiWawancara);
router.post(
  "/upload-excel-seleksi-wawancara",
  uploadConfigs.excel.single("file"),
  uploadExcelSeleksiWawancara
);
router.post(
  "/upload-berita-acara-dinas",
  uploadConfigs.berita_acara.single("file"),
  uploadBeritaAcaraDinas
);
router.get(
  "/download-excel-hasil-verifikasi-dinas",
  downloadExcelHasilVerifikasiDinas
);
router.post(
  "/upload-excel-hasil-verifikasi-dinas",
  uploadConfigs.excel.single("file"),
  uploadExcelHasilVerifikasiDinas
);
router.get("/count-by-provinsi/:beasiswaId", getCountByProvinsi);
router.get("/count-by-provinsi-proses-lembaga-seleksi/:beasiswaId", getCountByProvinsiProsesLembagaSeleksi);
router.get("/count-by-kabkota/:beasiswaId/:kodeProvinsi", getCountByKabkota);
router.get("/count-data-by-kabkota/:beasiswaId/:kodeProvinsi", getCountDataProvByKabkota);
router.get("/pendaftar-by-kabkota/:beasiswaId", getPendaftarByKabkota);
router.get("/detail-pendaftar/:idTrxBeasiswa", getDetailPendaftar);
router.get('/pilihan-program-studi/:idTrxBeasiswa', getPilihanProgramStudiWithDetails);
router.get('/pilihan-prodi-form/:idTrxBeasiswa', getPilihanProgramStudiForForm);
router.get('/download-rekap-daerah', downloadRekapBeasiswaDaerah);
router.get('/total', getTotalTrxBeasiswa);
router.get('/verifikator/beban', getBebanVerifikator);
router.get("/:idTrxBeasiswa/catatan-verifikasi", getCatatanVerifikasi);
router.post("/:idTrxBeasiswa/catatan-verifikasi", saveCatatanVerifikasi);

router.put("/:idTrxBeasiswa/tag-kabkota", updateTagDinasKabkota);
router.post("/:idTrxBeasiswa/submit-tag-kabkota", submitTagDinasKabkotaToProvinsi);
router.get("/:idTrxBeasiswa/count-tag-kabkota", getCountTagSiapKirimKabkota);

router.put("/:idTrxBeasiswa/tag-provinsi", updateTagDinasProvinsi);
router.get("/:idTrxBeasiswa/count-tag-provinsi", getCountTagSiapKirimProvinsi);
router.post("/:idTrxBeasiswa/submit-tag-provinsi", submitTagDinasProvinsiToDitjenbun)

router.get("/:idTrxBeasiswa/sk-kabkota", getSkKabkotaByProvinsi)
router.get("/pendaftar-by-provinsi/:beasiswaId", getPendaftarByProvinsi);
router.get("/pendaftar-by-provinsi-lembaga-seleksi/:beasiswaId", getPendaftarByProvinsiLembagaSeleksi);
router.put("/:idTrxBeasiswa/dokumen-verifikasi-dinas", updateDokumenVerifikasiDinas);

router.put("/:idTrxBeasiswa/kluster", updateKlusterBeasiswa);

router.post(
  "/:beasiswaId/upload-ba-kabkota",
  uploadConfigs.berita_acara.single("file"), uploadFileBA,
);
router.post(
  "/assignment/assign", assignVerifikator,
);

router.get(
  "/assignment/pendaftar", getPendaftarForAssignment,
);

router.get(
  "/pendaftar-penetapan-by-provinsi/:beasiswaId",
  getPendaftarPenetapanByProvinsi
);
router.get("/pendaftar-penetapan/:beasiswaId", getPendaftarPenetapan);
router.get("/detail-penetapan/:idTrxBeasiswa", getDetailPenetapan);
router.get("/assignment/download", downloadPendaftarAssignment);
router.post("/download-verifikasi-kabkota", downloadVerifikasiKabkota);
router.post("/download-verifikasi-provinsi", downloadVerifikasiProvinsi);
router.get("/download-rekap-provinsi", downloadRekapProvinsi);

router.get("/:idTrxBeasiswa/ba-kabkota", getBaKabkotaByProvinsi)
router.post(
  "/assignment/assign-by-jumlah", assignVerifikatorByJumlah,
);
router.get("/:idTrxBeasiswa/nilai-rapor", getNilaiRapor);
router.post("/:idTrxBeasiswa/nilai-rapor", saveNilaiRapor);

router.post("/assignment/lock", toggleLockSelektor);
router.post("/assignment/lock-global", toggleLockSelektorGlobal);
router.patch("/:idTrxBeasiswa/kembalikan-ke-admin", kembalikanKeAdminDitjenbun);

router.get("/download/pendaftar-zip/:idTrxBeasiswa", downloadPendaftarZip);
router.post("/download/bulk-zip", downloadBulkZip);
router.get("/:idBeasiswa/status-verifikasi-kabkota", getStatusVerifikasiKabkota);
router.get("/:idTrxBeasiswa/koreksi", getKoreksiPendaftar);
router.get("/check-nik-duplikat/:nik", checkNikDuplikat);
router.get("/download-pdf-verifikasi/:idTrxBeasiswa", downloadPdfHasilVerifikasi);

module.exports = router;

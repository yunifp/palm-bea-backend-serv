const express = require("express");
const router = express.Router();
const controller = require("../controller");

router.get("/paginate", controller.getLaporanPaginated);
router.get("/export", controller.exportLaporanExcel);
router.get("/list-jalur", controller.getJalurList); // Endpoint baru
module.exports = router; 
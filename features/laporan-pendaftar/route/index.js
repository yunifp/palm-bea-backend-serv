const express = require("express");
const router = express.Router();
const controller = require("../controller");

router.get("/paginate", controller.getLaporanPaginated);
router.get("/export", controller.exportLaporanExcel);
router.get("/list-jalur", controller.getJalurList); // Endpoint baru
router.put("/revert-flow-2/:id_trx_beasiswa", controller.revertFlowToDua);
module.exports = router; 
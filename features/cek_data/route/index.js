const express = require("express");
const router = express.Router();

// 1. Import dengan nama yang sama persis seperti di controller
const { cekDataByKeyword } = require("../controller");

// 2. Gunakan fungsi tersebut
router.get("/", cekDataByKeyword);

module.exports = router;
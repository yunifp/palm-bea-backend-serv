const express = require("express");
const router = express.Router();

const { cekDataByKeyword, cekStatusPublic } = require("../controller");

router.get("/public", cekStatusPublic);

router.get("/", cekDataByKeyword);

module.exports = router;
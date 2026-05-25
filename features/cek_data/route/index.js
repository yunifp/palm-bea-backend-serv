const express = require("express");
const router = express.Router();

const { cekDataByKeyword, cekStatusPublic, getCaptcha } = require("../controller");

router.get("/captcha", getCaptcha);

router.get("/public", cekStatusPublic);

router.get("/", cekDataByKeyword);

module.exports = router;
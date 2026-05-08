const express = require("express");
const router = express.Router();
const {
  getPerguruanTinggi,
  getProgramStudi,
  getAllDataEkstrim,
  submitBeasiswaLoadTest
} = require("../controller");

// Endpoint public tanpa auth_middleware
router.get("/perguruan-tinggi", getPerguruanTinggi);
router.get("/program-studi", getProgramStudi);
router.get("/ekstrim-tanpa-limit", getAllDataEkstrim);
router.post("/submit-test", submitBeasiswaLoadTest);

module.exports = router;    
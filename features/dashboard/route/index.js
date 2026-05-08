const express = require("express");
const router = express.Router();
const { getDashboardStats } = require("../controller");

router.get("/stats", getDashboardStats);

module.exports = router;
require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const multerErrorHandler = require("./common/middleware/multerErrorHandler");
const path = require("path");
const checkAuthorization = require("./common/middleware/auth_middleware");
const cekDataController = require("./features/cek_data/controller");
const { verifyApiKey } = require("./common/middleware/apiKey_middleware");
const penetapanController = require("./features/penetapan/controller");
const referensiPublicRoute = require("./features/testing_server/route");
const { serveSecureFileProxy } = require("./common/middleware/upload_middleware");

const app = express();
app.set("trust proxy", true);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors());
app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.use("/uploads", express.static(process.env.FILE_URL || "E:/upload_palma"));

app.get("/api/files/view", serveSecureFileProxy);

app.get(
  "/api/penetapan/external/mahasiswa-final",
  verifyApiKey,
  penetapanController.getExternalMahasiswaFinal
);

app.use(
  "/api/beasiswa/beasiswa",
  checkAuthorization,
  require("./features/beasiswa/route")
);

app.use(
  "/api/beasiswa/persyaratan",
  checkAuthorization,
  require("./features/persyaratan/route")
);

app.use(
  "/api/wawancara",
  checkAuthorization,
  require("./features/wawancara/route")
);

app.use(
  "/api/penelaahan",
  checkAuthorization,
  require("./features/penelaahan/route")
);

app.use("/api/public/referensi", referensiPublicRoute);

app.use(
  "/api/rekomtek",
  checkAuthorization,
  require("./features/rekomtek/route")
);

app.use(
  "/api/penetapan",
  checkAuthorization,
  require("./features/penetapan/route")
);

app.get("/api/cek-data/public", cekDataController.cekStatusPublic);

app.use(
  "/api/dashboard",
  checkAuthorization,
  require("./features/dashboard/route")
);

app.use(
  "/api/laporan/pendaftar",
  checkAuthorization,
  require("./features/laporan-pendaftar/route")
);

app.use(
  "/api/cek-data",
  checkAuthorization,
  require("./features/cek_data/route")
);

app.use(
  "/api/verifikasi-nasional-v2",
  checkAuthorization,
  require("./features/verifikasi_nasional_v2/route")
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(multerErrorHandler);

module.exports = app;
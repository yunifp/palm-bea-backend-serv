// middlewares/multerErrorHandler.js
const multerErrorHandler = (err, req, res, next) => {
  // Hanya tangani error dari multer
  if (err) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        status: "error",
        message: "Ukuran file terlalu besar (maksimal 10MB)",
      });
    }

    if (err.code === "INVALID_FILE_TYPE") {
      return res.status(400).json({
        status: "error",
        message: "Ekstensi tidak sesuai",
      });
    }

    return res.status(400).json({
      status: "error",
      message: err.message || "Gagal mengupload file",
    });
  }

  // Kalau bukan error dari multer, lanjut
  next();
};

module.exports = multerErrorHandler;

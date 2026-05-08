const { errorResponse } = require("../response");

const verifyApiKey = (req, res, next) => {
  // Mengambil API key dari header request
  const apiKey = req.header("x-api-key");
  
  // Mengambil API key valid dari environment variables
  const validApiKey = process.env.EXTERNAL_API_KEY;

  if (!apiKey) {
    return errorResponse(res, "Akses ditolak. Header 'x-api-key' tidak ditemukan.", 401);
  }

  if (apiKey !== validApiKey) {
    return errorResponse(res, "Akses ditolak. API Key tidak valid.", 403);
  }

  // Jika cocok, lanjutkan ke controller
  next();
};

module.exports = { verifyApiKey };
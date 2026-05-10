const jwt = require("jsonwebtoken");

const checkAuthorization = (req, res, next) => {
  // 1. Cek Token dari Header (Untuk API standar & Axios SecureImage)
  const authHeader = req.headers["authorization"] || req.headers["x-palma-auth"];
  let token = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } 
  // 2. Fallback: Cek Token dari URL Query (Untuk tag <img> atau <a> bawaan)
  else if (req.query && req.query.token) {
    token = req.query.token;
  }

  // Jika di header dan di URL sama-sama kosong, tolak akses
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Akses ditolak: Token otentikasi tidak ditemukan" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); 
    req.user = decoded; // simpan payload ke request
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

module.exports = checkAuthorization;
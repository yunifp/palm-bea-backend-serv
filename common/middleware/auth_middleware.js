const jwt = require("jsonwebtoken");

const checkAuthorization = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res
      .status(401)
      .json({ success: false, message: "Authorization header missing" });
  }

  // Format: "Bearer <token>"
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res
      .status(403)
      .json({ success: false, message: "Forbidden: Invalid token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // ✅ validasi token
    req.user = decoded; // simpan payload ke request
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

module.exports = checkAuthorization;

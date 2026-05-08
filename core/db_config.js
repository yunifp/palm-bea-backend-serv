const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");

// Inisialisasi dotenv
dotenv.config({ path: "./config.env" });

// Inisialisasi Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT,
    port: process.env.DB_PORT,
    timezone: "+07:00",
  }
);

// Cek koneksi ke database
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log("Koneksi ke database berhasil.");
  } catch (error) {
    console.error("Tidak dapat terhubung ke database:", error);
  }
};

// Ekspor sequelize dan fungsi testConnection
module.exports = {
  sequelize,
  testConnection,
};

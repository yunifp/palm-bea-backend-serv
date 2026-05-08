const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

// Instance database MASTER
const sequelizeMaster = new Sequelize(
  process.env.DB_MASTER_NAME,
  process.env.DB_MASTER_USER,
  process.env.DB_MASTER_PASSWORD,
  {
    host: process.env.DB_MASTER_HOST,
    dialect: "mysql",
    port: process.env.DB_MASTER_PORT,
  }
);

module.exports = { sequelizeMaster };
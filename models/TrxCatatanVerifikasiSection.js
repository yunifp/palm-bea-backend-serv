const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxCatatanVerifikasiSection = sequelize.define(
  "TrxCatatanVerifikasiSection",
  {
    id: {
      type: DataTypes.INTEGER(10),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    id_trx_beasiswa: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    catatan_verifikasi_verifikator: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    catatan_verifikasi_dinas_kabkota: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    catatan_verifikasi_dinas_provinsi: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    catatan_by_verifikator: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    catatan_by_dinas_kabkota: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    catatan_by_dinas_provinsi: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    tableName: "trx_catatan_verifikasi_section",
    timestamps: false, // karena pakai created_at manual
  },
);

module.exports = TrxCatatanVerifikasiSection;

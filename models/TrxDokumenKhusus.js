const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxDokumenKhusus = sequelize.define(
  "TrxDokumenKhusus",
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
    id_ref_dokumen: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    nama_dokumen_persyaratan: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    file: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status_verifikasi: DataTypes.ENUM("sesuai", "tidak sesuai"),
    verifikator_nama: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    verifikator_catatan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    verifikator_timestamp: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    verifikator_dinas_nama: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    verifikator_dinas_catatan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    verifikator_dinas_timestamp: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "trx_dokumen_khusus",
    timestamps: false,
  }
);

module.exports = TrxDokumenKhusus;

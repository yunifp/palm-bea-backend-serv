const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxDokumenUmum = sequelize.define(
  "TrxDokumenUmum",
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
    verifikator_dinas_is_valid: DataTypes.ENUM("N", "Y"),
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
    is_kabkota: DataTypes.ENUM("N", "Y"),
    is_prov: DataTypes.ENUM("N", "Y"),
  },
  {
    tableName: "trx_dokumen_umum",
    timestamps: false,
  }
);

module.exports = TrxDokumenUmum;

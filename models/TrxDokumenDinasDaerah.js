const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxDokumenDinasDaerah = sequelize.define(
  "TrxDokumenDinasDaerah",
  {
    id: {
      type: DataTypes.INTEGER(10),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
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
    tableName: "trx_document_dinas_daerah",
    timestamps: false,
  }
);

module.exports = TrxDokumenDinasDaerah;

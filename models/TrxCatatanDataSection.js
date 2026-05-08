const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxCatatanDataSection = sequelize.define(
  "TrxCatatanDataSection",
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

    data_pribadi_is_valid: {
      type: DataTypes.ENUM("Y", "N"),
      allowNull: true,
    },
    data_pribadi_catatan: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    data_tempat_tinggal_is_valid: {
      type: DataTypes.ENUM("Y", "N"),
      allowNull: true,
    },
    data_tempat_tinggal_catatan: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    data_tempat_bekerja_is_valid: {
      type: DataTypes.ENUM("Y", "N"),
      allowNull: true,
    },
    data_tempat_bekerja_catatan: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    data_tempat_tinggal_bekerja_is_valid: {
      type: DataTypes.ENUM("Y", "N"),
      allowNull: true,
    },
    data_tempat_tinggal_bekerja_catatan: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    data_orang_tua_is_valid: {
      type: DataTypes.ENUM("Y", "N"),
      allowNull: true,
    },
    data_orang_tua_catatan: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    data_pendidikan_is_valid: {
      type: DataTypes.ENUM("Y", "N"),
      allowNull: true,
    },
    data_pendidikan_catatan: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    data_program_studi_is_valid: {
      type: DataTypes.ENUM("Y", "N"),
      allowNull: true,
    },
    data_program_studi_catatan: {
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
    data_pribadi_revised_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    data_tempat_tinggal_bekerja_revised_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    data_orang_tua_revised_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    data_pendidikan_revised_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "trx_catatan_data_section",
    timestamps: false, // karena pakai created_at manual
  },
);

module.exports = TrxCatatanDataSection;

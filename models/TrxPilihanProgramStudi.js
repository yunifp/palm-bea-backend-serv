const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxPilihanProgramStudi = sequelize.define(
  "TrxPilihanProgramStudi",
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

    id_pt: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },

    nama_pt: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    id_prodi: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },

    nama_prodi: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "trx_pilihan_program_studi",
    timestamps: false,
  }
);

module.exports = TrxPilihanProgramStudi;

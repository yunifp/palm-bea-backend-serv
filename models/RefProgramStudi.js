const { DataTypes } = require("sequelize");
const { sequelizeMaster } = require("../core/db_master_config");
const RefPerguruanTinggi = require("./RefPerguruanTinggi");

const RefProgramStudi = sequelizeMaster.define(
  "RefProgramStudi",
  {
    id_prodi: {
      type: DataTypes.INTEGER(10),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    id_pt: {
      type: DataTypes.INTEGER(10),
      allowNull: false,
      references: {
        model: RefPerguruanTinggi,
        key: "id_pt",
      },
      onDelete: "CASCADE",
      onUpdate: "NO ACTION",
    },
    jenjang: {
      type: DataTypes.ENUM("D1", "D2", "D3", "D4", "S1"),
      allowNull: false,
    },
    nama_prodi: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    kuota: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
      defaultValue: 0,
    },
    boleh_buta_warna: {
      type: DataTypes.ENUM("Y", "N"),
      allowNull: false,
    },
  },
  {
    tableName: "ref_program_studi",
    timestamps: false,
  }
);

module.exports = RefProgramStudi;

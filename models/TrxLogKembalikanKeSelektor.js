const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxLogKembalikanKeSelektor = sequelize.define(
  "TrxLogKembalikanKeSelektor",
  {
    id_log: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    id_trx_beasiswa: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_flow_sebelumnya: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    alasan: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "trx_log_kembalikan_ke_selektor",
    timestamps: false, // Karena kita mengatur 'created_at' secara manual
  }
);

module.exports = TrxLogKembalikanKeSelektor;
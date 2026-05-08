const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxLog = sequelize.define(
  "TrxLog",
  {
    id: {
      type: DataTypes.INTEGER(10),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    id_flow: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    flow: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    users: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    catatan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "trx_log",
    timestamps: false,
  }
);

module.exports = TrxLog;

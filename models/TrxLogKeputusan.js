const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxLogKeputusan = sequelize.define(
  "TrxLogKeputusan",
  {
    id: {
      type: DataTypes.INTEGER(11),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },

    jenis: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    ket: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    timestamp: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "trx_log_keputusan",
    timestamps: false, 
  }
);

module.exports = TrxLogKeputusan;
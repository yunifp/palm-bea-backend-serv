const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const EmailLog = sequelize.define(
  "EmailLog",
  {
    id: {
      type: DataTypes.INTEGER(10),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    id_trx: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
      comment: "ID transaksi pendaftaran beasiswa terkait",
    },
    email_to: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    body_html: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: "sent",
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "email_logs",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    underscored: true,
  }
);

module.exports = EmailLog;
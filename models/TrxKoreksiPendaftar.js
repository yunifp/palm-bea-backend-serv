const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxKoreksiPendaftar = sequelize.define(
    "TrxKoreksiPendaftar",
    {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },

        id_trx_beasiswa: {
            type: DataTypes.INTEGER(11),
            allowNull: false,
        },

        kategori: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },

        label: {
            type: DataTypes.STRING(255),
            allowNull: false,
            comment: "Label tampilan untuk pendaftar",
        },

        catatan: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: "Catatan dari verifikator",
        },

        is_resolved: {
            type: DataTypes.ENUM("Y", "N"),
            allowNull: true,
            defaultValue: "N",
            comment: "Y jika sudah diperbaiki pendaftar",
        },

        resolved_at: {
            type: DataTypes.DATE,
            allowNull: true,
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
        tableName: "trx_koreksi_pendaftar",
        timestamps: false,
    }
);

module.exports = TrxKoreksiPendaftar;
const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const RefNikCekal = sequelize.define(
    "RefNikCekal",
    {
        id: {
            type: DataTypes.INTEGER(11),
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },

        nik: {
            type: DataTypes.STRING(16),
            allowNull: false,
            defaultValue: "Y", // mengikuti struktur tabel
        },

        nama: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },

        keterangan: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },

        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },

        updated_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        tableName: "ref_nik_cekal",
        timestamps: false,
    }
);

module.exports = RefNikCekal;
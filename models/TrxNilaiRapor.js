const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxNilaiRapor = sequelize.define("TrxNilaiRapor", {
    id: { type: DataTypes.INTEGER(11), primaryKey: true, autoIncrement: true },
    id_ref_beasiswa: DataTypes.INTEGER(11),
    id_trx_beasiswa: { type: DataTypes.INTEGER, allowNull: false },
    nilai_semester_1: { type: DataTypes.STRING(50), allowNull: true },
    nilai_semester_2: { type: DataTypes.STRING(50), allowNull: true },
    nilai_semester_3: { type: DataTypes.STRING(50), allowNull: true },
    nilai_semester_4: { type: DataTypes.STRING(50), allowNull: true },
    nilai_semester_5: { type: DataTypes.STRING(50), allowNull: true },
    uploaded_by: DataTypes.STRING(255),
    created_at: DataTypes.DATE,
}, { tableName: "trx_nilai_rapor", timestamps: false });

module.exports = TrxNilaiRapor;
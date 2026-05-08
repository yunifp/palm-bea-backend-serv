const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxSkDinasKabkota = sequelize.define("TrxSkDinasKabkota", {
    id: { type: DataTypes.INTEGER(11), primaryKey: true, autoIncrement: true },
    id_ref_beasiswa: DataTypes.INTEGER(11),
    kode_dinas_kabkota: DataTypes.STRING(50),
    nama_dinas_kabkota: DataTypes.STRING(100),
    kode_dinas_provinsi: DataTypes.STRING(50),
    nama_dinas_provinsi: DataTypes.STRING(100),
    filename: DataTypes.STRING(255),
    uploaded_by: DataTypes.STRING(255),
    created_at: DataTypes.DATE,
}, { tableName: "trx_sk_dinas_kabkota", timestamps: false });

module.exports = TrxSkDinasKabkota;
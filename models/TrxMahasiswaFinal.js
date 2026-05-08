const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxMahasiswaFinal = sequelize.define(
  "TrxMahasiswaFinal",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    id_ref_beasiswa: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    nama: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    nik: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    kode_pendaftaran: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    jenis_kelamin: {
      type: DataTypes.STRING(2),
      allowNull: true,
    },
    id_kluster: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    nama_kluster: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    id_pt: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    pt: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    id_prodi: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    prodi: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    jenjang: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    tahun_angkatan: {
      type: DataTypes.STRING(4),
      allowNull: true,
    },
    tinggal_kode_prov: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    tinggal_prov: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    tinggal_kode_kab: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    tinggal_kab_kota: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    no_hp: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
  },
  {
    tableName: "trx_mahasiswa_final",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = TrxMahasiswaFinal;
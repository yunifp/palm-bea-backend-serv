const { DataTypes } = require("sequelize");
const { sequelizeMaster } = require("../core/db_master_config");

const RefPerguruanTinggi = sequelizeMaster.define(
  "RefPerguruanTinggi",
  {
    id_pt: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },

    kode_pt: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },

    nama_pt: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    singkatan: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    jenis: {
      type: DataTypes.ENUM(
        "Universitas",
        "Institut",
        "Politeknik",
        "Akademi",
        "Sekolah Vokasi",
        "Lainnya",
      ),
      allowNull: false,
      defaultValue: "Lainnya",
    },

    alamat: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    kota: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    kode_pos: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },

    no_telepon_pt: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    fax_pt: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },

    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    logo_path: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Path / filename logo lembaga",
    },

    nama_pimpinan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    jabatan_pimpinan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    no_telepon_pimpinan: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    no_rekening: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    nama_bank: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    nama_penerima_transfer: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    npwp: {
      type: DataTypes.STRING(25),
      allowNull: true,
    },

    status_aktif: {
      type: DataTypes.INTEGER(1),
      allowNull: false,
      defaultValue: true,
    },

    nama_pimpinan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    has_pengajuan_perubahan: {
      type: DataTypes.INTEGER(1),
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "ref_perguruan_tinggi",
    timestamps: false,
  },
);

module.exports = RefPerguruanTinggi;

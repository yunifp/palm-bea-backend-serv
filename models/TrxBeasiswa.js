const { DataTypes } = require("sequelize");
const { sequelize } = require("../core/db_config");

const TrxBeasiswa = sequelize.define(
  "TrxBeasiswa",
  {
    id_trx_beasiswa: {
      type: DataTypes.INTEGER(10),
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },

    id_ref_beasiswa: {
      type: DataTypes.INTEGER(10),
      allowNull: false,
      defaultValue: 0,
    },

    nama_beasiswa: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    id_flow: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },

    flow: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    id_users: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },

    foto: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    foto_depan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    foto_belakang: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    foto_samping_kiri: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    foto_samping_kanan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    nama_lengkap: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    nik: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },

    status_undur_diri: {
      type: DataTypes.ENUM("Y", "N"),
      allowNull: true,
      defaultValue: "N",
    },

    nkk: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },

    jenis_kelamin: {
      type: DataTypes.ENUM("L", "P"),
      allowNull: true,
    },

    no_hp: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    tanggal_lahir: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    tempat_lahir: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    agama: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    suku: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    id_pekerjaan: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },

    pekerjaan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    id_instansi_pekerjaan: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },

    instansi_pekerjaan: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    berat_badan: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },

    tinggi_badan: {
      type: DataTypes.INTEGER(10),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.INTEGER(1),
      allowNull: true,
      defaultValue: 1
    },

    // ===== Alamat Tinggal =====
    tinggal_kode_prov: DataTypes.STRING(2),
    tinggal_prov: DataTypes.STRING(255),
    tinggal_kode_kab: DataTypes.STRING(4),
    tinggal_kab_kota: DataTypes.STRING(255),
    tinggal_kode_kec: DataTypes.STRING(6),
    tinggal_kec: DataTypes.STRING(255),
    tinggal_kode_kel: DataTypes.STRING(10),
    tinggal_kel: DataTypes.STRING(255),
    tinggal_kode_dusun: DataTypes.STRING(20),
    tinggal_dusun: DataTypes.STRING(255),
    tinggal_kode_pos: DataTypes.STRING(5),
    tinggal_rt: DataTypes.STRING(5),
    tinggal_rw: DataTypes.STRING(5),
    tinggal_alamat: DataTypes.TEXT,

    // ===== Alamat Kerja =====
    kerja_kode_prov: DataTypes.STRING(2),
    kerja_prov: DataTypes.STRING(255),
    kerja_kode_kab: DataTypes.STRING(4),
    kerja_kab_kota: DataTypes.STRING(255),
    kerja_kode_kec: DataTypes.STRING(6),
    kerja_kec: DataTypes.STRING(255),
    kerja_kode_kel: DataTypes.STRING(10),
    kerja_kel: DataTypes.STRING(255),
    kerja_kode_dusun: DataTypes.STRING(20),
    kerja_dusun: DataTypes.STRING(255),
    kerja_kode_pos: DataTypes.STRING(5),
    kerja_rt: DataTypes.STRING(5),
    kerja_rw: DataTypes.STRING(5),
    kerja_alamat: DataTypes.TEXT,

    alamat_kerja_sama_dengan_tinggal: DataTypes.BOOLEAN,

    // ===== Data Orang Tua =====
    ayah_nama: DataTypes.STRING(255),
    ayah_nik: DataTypes.STRING(16),
    ayah_jenjang_pendidikan: DataTypes.STRING(10),
    ayah_pekerjaan: DataTypes.STRING(255),
    ayah_penghasilan: DataTypes.STRING(50),
    ayah_id_status_hidup: DataTypes.INTEGER(10),
    ayah_status_hidup: DataTypes.STRING(255),
    ayah_id_status_kekerabatan: DataTypes.INTEGER(10),
    ayah_status_kekerabatan: DataTypes.STRING(255),
    ayah_tempat_lahir: DataTypes.STRING(255),
    ayah_tanggal_lahir: DataTypes.DATEONLY,
    ayah_no_hp: DataTypes.STRING(13),
    ayah_email: DataTypes.STRING(255),
    ayah_alamat: DataTypes.TEXT,

    ibu_nama: DataTypes.STRING(255),
    ibu_nik: DataTypes.STRING(16),
    ibu_jenjang_pendidikan: DataTypes.STRING(10),
    ibu_pekerjaan: DataTypes.STRING(255),
    ibu_penghasilan: DataTypes.STRING(50),
    ibu_id_status_hidup: DataTypes.INTEGER(10),
    ibu_status_hidup: DataTypes.STRING(255),
    ibu_id_status_kekerabatan: DataTypes.INTEGER(10),
    ibu_status_kekerabatan: DataTypes.STRING(255),
    ibu_tempat_lahir: DataTypes.STRING(255),
    ibu_tanggal_lahir: DataTypes.DATEONLY,
    ibu_no_hp: DataTypes.STRING(13),
    ibu_email: DataTypes.STRING(255),
    ibu_alamat: DataTypes.TEXT,

    wali_nama: DataTypes.STRING(255),
    wali_nik: DataTypes.STRING(16),
    wali_jenjang_pendidikan: DataTypes.STRING(10),
    wali_pekerjaan: DataTypes.STRING(255),
    wali_penghasilan: DataTypes.STRING(50),
    wali_id_status_hidup: DataTypes.INTEGER(10),
    wali_status_hidup: DataTypes.STRING(255),
    wali_id_status_kekerabatan: DataTypes.INTEGER(10),
    wali_status_kekerabatan: DataTypes.STRING(255),
    wali_tempat_lahir: DataTypes.STRING(255),
    wali_tanggal_lahir: DataTypes.DATEONLY,
    wali_no_hp: DataTypes.STRING(13),
    wali_email: DataTypes.STRING(255),
    wali_alamat: DataTypes.TEXT,

    // ===== Data Sekolah =====
    sekolah_kode_prov: DataTypes.STRING(2),
    sekolah_prov: DataTypes.STRING(255),
    sekolah_kode_kab: DataTypes.STRING(4),
    sekolah_kab_kota: DataTypes.STRING(255),
    id_jenjang_sekolah: DataTypes.STRING(255),
    jenjang_sekolah: DataTypes.STRING(255),
    sekolah: DataTypes.STRING(255),
    nisn_sekolah: DataTypes.STRING(50),
    jurusan: DataTypes.STRING(255),
    tahun_lulus: DataTypes.STRING(4),
    nama_jurusan_sekolah: DataTypes.STRING(100),

    kondisi_buta_warna: {
      type: DataTypes.ENUM("Y", "N"),
      allowNull: true,
    },

    id_jalur: DataTypes.INTEGER(10),
    jalur: DataTypes.STRING(255),
    id_verifikator: DataTypes.INTEGER(11),
    verifikator_nama: DataTypes.STRING(50),

    status_lulus_administrasi: DataTypes.ENUM("Y", "N"),
    status_lulus_wawancara_akademik: DataTypes.ENUM("Y", "N"),
    status_dari_verifikator_dinas: DataTypes.ENUM("Y", "N"),
    berita_acara_verifikator_dinas: DataTypes.STRING(255),
    status_hasil_analisa_rasio: DataTypes.ENUM("Y", "N"),
    file_rekomendasi_teknis: DataTypes.STRING(255),
    file_keputusan_kabkot: DataTypes.STRING(255),
    status_undur_diri: DataTypes.ENUM("Y", "N"),
    status_akhir_kelulusan: DataTypes.ENUM("Y", "N"),

    kode_dinas_provinsi: DataTypes.STRING(50),
    kode_dinas_kabkota: DataTypes.STRING(50),
    nama_dinas_provinsi: DataTypes.STRING(100),
    nama_dinas_kabkota: DataTypes.STRING(100),

    verifikator_catatan: DataTypes.TEXT,
    verifikator_dinas_catatan: DataTypes.TEXT,

    timestamp_dinas_provinsi: DataTypes.DATE(),
    timestamp_dinas_kabkota: DataTypes.DATE(),

    // nama_verifikator_dinas_kabkota: DataTypes.STRING(255),
    // nama_verifikator_dinas_provinsi: DataTypes.STRING(255),
    tag_dinas_kabkot: DataTypes.ENUM("Y", "N"),
    tag_dinas_provinsi: DataTypes.ENUM("Y", "N"),
    hasil_dinas_kabkot: DataTypes.ENUM("0", "1", "2"),
    hasil_dinas_provinsi: DataTypes.ENUM("0", "1", "2"),

    tag_sktm: DataTypes.ENUM("Y", "N"),

    // Tambahkan 3 kolom ini dengan tipe ENUM
    tag_daerah_3T: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
    },
    tag_daerah_perbatasan: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
    },
    tag_papua_nusa_tenggara: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
    },
    tag_lock_selektor: {
      type: DataTypes.ENUM("1", "0"),
      allowNull: true,
      defaultValue: "0",
    },
    timestamp_lock_selektor: DataTypes.DATE(),
    id_pt_final: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    pt_final: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    id_prodi_final: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    prodi_final: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    urutan_ranking: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    jenjang_final: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    id_kluster: {
      type: DataTypes.TINYINT,
      allowNull: true,
    },
    nama_kluster: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    status_wawancara: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    sequence: DataTypes.INTEGER(255),
    kode_pendaftaran: DataTypes.STRING(100),
    flag_kewilayahn: {
      type: DataTypes.INTEGER(1),
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "trx_beasiswa",
    timestamps: false,
  }
);

module.exports = TrxBeasiswa;

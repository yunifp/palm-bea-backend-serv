const TrxBeasiswa = require("./TrxBeasiswa");
const TrxCatatanDataSection = require("./TrxCatatanDataSection");
const TrxDokumenDinasDaerah = require("./TrxDokumenDinasDaerah");
const TrxDokumenKhusus = require("./TrxDokumenKhusus");
const TrxDokumenUmum = require("./TrxDokumenUmum");
const TrxLog = require("./TrxLog");
const TrxPilihanProgramStudi = require("./TrxPilihanProgramStudi");
const TrxCatatanVerifikasiSection = require("./TrxCatatanVerifikasiSection");
const TrxSkDinasKabkota = require("./TrxSkDinasKabkota");
const TrxSkDinasProvinsi = require("./TrxSkDinasProvinsi");
const TrxBaDinasKabkota = require("./TrxBaDinasKabkota");
const TrxBaDinasProvinsi = require("./TrxBaDinasProvinsi");
const TrxLogKeputusan = require("./TrxLogKeputusan");
const TrxNilaiRapor = require("./TrxNilaiRapor");
const { sequelize } = require("../core/db_config");
const RefProgramStudi = require("./RefProgramStudi");
const EmailLog = require("./EmailLog");
const TrxMahasiswaFinal = require("./TrxMahasiswaFinal");
const TrxKoreksiPendaftar = require("./TrxKoreksiPendaftar");
const RefNikCekal = require("./RefNikCekal");

// Buat object models supaya gampang akses
const models = {
  TrxBeasiswa,
  TrxDokumenKhusus,
  TrxDokumenUmum,
  TrxDokumenDinasDaerah,
  TrxLog,
  TrxPilihanProgramStudi,
  TrxCatatanDataSection,
  TrxCatatanVerifikasiSection,
  TrxSkDinasKabkota,
  TrxSkDinasProvinsi,
  TrxBaDinasKabkota,
  TrxBaDinasProvinsi,
  TrxLogKeputusan,
  sequelize,
  RefProgramStudi,
  TrxNilaiRapor,
  sequelize,
  EmailLog,
  TrxMahasiswaFinal,
  TrxKoreksiPendaftar,
  RefNikCekal
};

// Relasi RoleMenu ↔ Menu
module.exports = models;

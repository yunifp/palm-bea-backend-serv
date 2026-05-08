const { Op } = require("sequelize");
const { TrxBeasiswa, User, TrxMahasiswaFinal, sequelize } = require("../../../models");
const RefProgramStudi = require("../../../models/RefProgramStudi");
const RefPerguruanTinggi = require("../../../models/RefPerguruanTinggi");
const { successResponse, errorResponse } = require("../../../common/response");
const ExcelJS = require("exceljs");
const jwt = require("jsonwebtoken");
const { sequelizeMaster } = require("../../../core/db_master_config");
const { getFileUrl } = require("../../../common/middleware/upload_middleware");

const getUserContext = async (req) => {
  const authHeader = req.headers["authorization"];
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      let roleIds = [];
      if (Array.isArray(decoded.role)) {
        roleIds = decoded.role.map(r => typeof r === "object" ? Number(r.id) : Number(r));
      } else if (decoded.role) {
        roleIds = [Number(decoded.role)];
      }
      
      let namaKampus = null;

      if (roleIds.includes(111) || roleIds.includes(113)) {
        if (decoded.id_lembaga_pendidikan) {
          const pt = await RefPerguruanTinggi.findByPk(decoded.id_lembaga_pendidikan);
          if (pt) {
            namaKampus = pt.nama_pt;
          }
        }
        
        if (!namaKampus && decoded.id) {
          const userData = await User.findByPk(decoded.id);
          if (userData) {
            namaKampus = userData.perguruan_tinggi || userData.lembaga_pendidikan;
          }
        }
      }

      return {
        roles: roleIds,
        nama_kampus: namaKampus,
      };
    } catch (error) {
      return null;
    }
  }
  return null;
};

const buildWhereCondition = async (req) => {
  const { search, jenjang, perguruan_tinggi } = req.query;
  const whereCondition = { id_flow: 12 };

  const userCtx = await getUserContext(req);
  
  if (userCtx && (userCtx.roles.includes(111) || userCtx.roles.includes(113))) {
    if (userCtx.nama_kampus) {
      whereCondition.pt_final = { [Op.like]: `%${userCtx.nama_kampus}%` };
    } else {
      whereCondition.pt_final = "TIDAK_ADA_KAMPUS_DI_DATABASE";
    }
  }

  if (perguruan_tinggi) {
    whereCondition.pt_final = { [Op.like]: `%${perguruan_tinggi}%` };
  }

  if (search) {
    whereCondition[Op.or] = [
      { nama_lengkap: { [Op.like]: `%${search}%` } },
      { nik: { [Op.like]: `%${search}%` } },
      { pt_final: { [Op.like]: `%${search}%` } },
      { prodi_final: { [Op.like]: `%${search}%` } },
      { kode_pendaftaran: { [Op.like]: `%${search}%` } }
    ];
  }

  if (jenjang) {
    const prodis = await RefProgramStudi.findAll({
      where: { jenjang },
      attributes: ["id_prodi", "nama_prodi"]
    });
    const prodiIds = prodis.map(p => p.id_prodi);
    const prodiNames = prodis.map(p => p.nama_prodi);
    
    whereCondition[Op.or] = [
      { id_prodi_final: { [Op.in]: prodiIds.length ? prodiIds : [0] } },
      { prodi_final: { [Op.in]: prodiNames.length ? prodiNames : ["TIDAK_ADA_PRODI"] } }
    ];
  }

  return whereCondition;
};

exports.getPendaftarRekomtek = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const whereCondition = await buildWhereCondition(req);

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [["urutan_ranking", "ASC"]],
    });

    const results = await Promise.all(rows.map(async (row) => {
      const plainRow = row.get({ plain: true });
      let prodiMaster = null;

      if (plainRow.id_prodi_final) {
        prodiMaster = await RefProgramStudi.findByPk(plainRow.id_prodi_final, { attributes: ["kuota", "jenjang"] });
      }

      if (!prodiMaster && plainRow.prodi_final) {
        prodiMaster = await RefProgramStudi.findOne({
          where: { nama_prodi: { [Op.like]: `%${plainRow.prodi_final.trim()}%` } },
          attributes: ["kuota", "jenjang"]
        });
      }

      const jenjang_diterima = plainRow.jenjang_final || (prodiMaster ? prodiMaster.jenjang : "-");

      return {
        ...plainRow,
        sisa_kuota: prodiMaster ? prodiMaster.kuota : 0,
        jenjang_pendidikan_diterima: jenjang_diterima
      };
    }));

    return successResponse(res, "Data rekomtek berhasil dimuat", {
      result: results,
      total: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
    });
  } catch (error) {
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
};

exports.prosesMengundurkanDiri = async (req, res) => {
  try {
    const { id } = req.params; 

    const pendaftar = await TrxBeasiswa.findByPk(id);
    if (!pendaftar) return errorResponse(res, "Data pendaftar tidak ditemukan", 404);
    if (pendaftar.status_undur_diri === "Y") return errorResponse(res, "Siswa ini sudah berstatus mengundurkan diri", 400);

    let prodi = null;
    if (pendaftar.id_prodi_final) {
      prodi = await RefProgramStudi.findByPk(pendaftar.id_prodi_final);
    } else {
      const namaPT = pendaftar.pt_final ? pendaftar.pt_final.trim() : "";
      const namaProdi = pendaftar.prodi_final ? pendaftar.prodi_final.trim() : "";
      const ptMaster = await RefPerguruanTinggi.findOne({ where: { nama_pt: { [Op.like]: `%${namaPT}%` } } });
      if (ptMaster) {
        prodi = await RefProgramStudi.findOne({
          where: { id_pt: ptMaster.id_pt, nama_prodi: { [Op.like]: `%${namaProdi}%` } }
        });
      }
    }

    if (!prodi) return errorResponse(res, `Prodi tidak ditemukan di master.`, 404);

    await pendaftar.update({ status_undur_diri: "Y" });

    await RefProgramStudi.update(
      { kuota: prodi.kuota + 1 }, 
      { where: { id_prodi: prodi.id_prodi } }
    );

    return successResponse(res, `Siswa berhasil mundur.`);
  } catch (error) {
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
};

exports.batalMengundurkanDiri = async (req, res) => {
  try {
    const { id } = req.params; 

    const pendaftar = await TrxBeasiswa.findByPk(id);
    if (!pendaftar) return errorResponse(res, "Data pendaftar tidak ditemukan", 404);
    if (pendaftar.status_undur_diri !== "Y") return errorResponse(res, "Siswa ini memang tidak dalam status mundur.", 400);
    
    let prodi = null;
    if (pendaftar.id_prodi_final) {
      prodi = await RefProgramStudi.findByPk(pendaftar.id_prodi_final);
    } else {
      const namaPT = pendaftar.pt_final ? pendaftar.pt_final.trim() : "";
      const namaProdi = pendaftar.prodi_final ? pendaftar.prodi_final.trim() : "";
      const ptMaster = await RefPerguruanTinggi.findOne({ where: { nama_pt: { [Op.like]: `%${namaPT}%` } } });
      if (ptMaster) {
        prodi = await RefProgramStudi.findOne({
          where: { id_pt: ptMaster.id_pt, nama_prodi: { [Op.like]: `%${namaProdi}%` } }
        });
      }
    }

    if (!prodi) return errorResponse(res, `Prodi tidak ditemukan di master.`, 404);

    if (prodi.kuota <= 0) {
      return errorResponse(res, `Gagal batal! Slot kuota prodi ini sudah penuh/habis (0).`, 400);
    }

    await pendaftar.update({ status_undur_diri: "N" });

    await RefProgramStudi.update(
      { kuota: prodi.kuota - 1 },
      { where: { id_prodi: prodi.id_prodi } }
    );

    return successResponse(res, `Berhasil membatalkan undur diri.`);
  } catch (error) {
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
};

exports.downloadDataRekomtek = async (req, res) => {
  try {
    const whereCondition = await buildWhereCondition(req);

    const rows = await TrxBeasiswa.findAll({
      where: whereCondition,
      order: [["urutan_ranking", "ASC"]],
      raw: true
    });

    const enrichedRows = await Promise.all(rows.map(async (row) => {
      let jenjang = "-";
      
      if (row.jenjang_final) {
        jenjang = row.jenjang_final;
      } else if (row.id_prodi_final) {
        const p = await RefProgramStudi.findByPk(row.id_prodi_final, { attributes: ["jenjang"] });
        if (p) jenjang = p.jenjang;
      } else {
        const p = await RefProgramStudi.findOne({
          where: { nama_prodi: { [Op.like]: `%${(row.prodi_final || "").trim()}%` } },
          attributes: ["jenjang"]
        });
        if (p) jenjang = p.jenjang;
      }
      
      return { ...row, jenjang_pendidikan_diterima: jenjang };
    }));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Rekomtek");

    worksheet.columns = [
      { header: "NO", key: "no", width: 6 },
      { header: "KODE PENDAFTARAN", key: "kode_pendaftaran", width: 25 },
      { header: "NAMA", key: "nama", width: 35 },
      { header: "NIK", key: "nik", width: 20 },
      { header: "JENIS KELAMIN (L/P)", key: "jenis_kelamin", width: 20 },
      { header: "NO HP", key: "no_hp", width: 20 },
      { header: "NAMA IBU KANDUNG", key: "ibu_nama", width: 30 },
      { header: "TEMPAT LAHIR", key: "tempat_lahir", width: 20 },
      { header: "TANGGAL LAHIR", key: "tanggal_lahir", width: 15 },
      { header: "JENJANG PENDIDIKAN", key: "jenjang_pendidikan_diterima", width: 25 }, 
      { header: "ASAL SEKOLAH", key: "sekolah", width: 30 },
      { header: "JURUSAN SEKOLAH", key: "jurusan", width: 25 },
      { header: "TANGGAL LULUS SEKOLAH", key: "tahun_lulus", width: 25 },
      { header: "LEMBAGA PENDIDIKAN", key: "lembaga_pendidikan", width: 45 },
      { header: "DESA/KELURAHAN", key: "tinggal_kel", width: 25 },
      { header: "KECAMATAN", key: "tinggal_kec", width: 25 },
      { header: "KABUPATEN/KOTA", key: "tinggal_kab_kota", width: 25 },
      { header: "PROVINSI", key: "tinggal_prov", width: 25 },
      { header: "PERGURUAN TINGGI (DITERIMA)", key: "pt_final", width: 45 },
      { header: "PROGRAM STUDI (DITERIMA)", key: "prodi_final", width: 40 },
      { header: "KATEGORI", key: "kluster", width: 15 },
    ];

    enrichedRows.forEach((row, index) => {
      let tglLahir = row.tanggal_lahir;
      if (tglLahir instanceof Date) {
        tglLahir = tglLahir.toISOString().split("T")[0];
      }

      worksheet.addRow({
        no: index + 1,
        kode_pendaftaran: row.kode_pendaftaran || "-",
        nama: row.nama_lengkap || "-",
        nik: row.nik || "-",
        jenis_kelamin: row.jenis_kelamin || "-",
        no_hp: row.no_hp || "-",
        ibu_nama: row.ibu_nama || "-",
        tempat_lahir: row.tempat_lahir || "-",
        tanggal_lahir: tglLahir || "-",
        jenjang_pendidikan_diterima: row.jenjang_pendidikan_diterima || "-",
        sekolah: row.sekolah || "-",
        jurusan: row.jurusan || "-",
        tahun_lulus: row.tahun_lulus || "-",
        lembaga_pendidikan: row.pt_final || "-",
        tinggal_kel: row.tinggal_kel || "-",
        tinggal_kec: row.tinggal_kec || "-",
        tinggal_kab_kota: row.tinggal_kab_kota || "-",
        tinggal_prov: row.tinggal_prov || "-",
        pt_final: row.pt_final || "-",
        prodi_final: row.prodi_final || "-",
        kluster: row.nama_kluster || "-",
      });
    });

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } }; 
      cell.border = {
        top: {style:"thin"}, left: {style:"thin"},
        bottom: {style:"thin"}, right: {style:"thin"}
      };
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Format_Data_Rekomtek.xlsx");

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    console.error("DOWNLOAD ERROR:", error);
    return errorResponse(res, "Gagal mengunduh file Excel", 500);
  }
};

exports.uploadDokumenRekomtek = async (req, res) => {
  try {
    if (!req.file) return errorResponse(res, "File dokumen tidak ditemukan", 400);
    
    const filename = req.file.filename || req.file.key || null;
    if (!filename) return errorResponse(res, "Gagal mendapatkan nama file dari penyimpanan", 400);

    const whereCondition = { id_flow: { [Op.in]: [12, 14] } };
    const userCtx = await getUserContext(req);
    
    if (userCtx && (userCtx.roles.includes(111) || userCtx.roles.includes(113))) {
      if (userCtx.nama_kampus) {
        whereCondition.pt_final = { [Op.like]: `%${userCtx.nama_kampus}%` };
      } else {
        whereCondition.pt_final = "TIDAK_ADA_KAMPUS_DI_DATABASE";
      }
    }

    const [updatedCount] = await TrxBeasiswa.update(
      { file_rekomendasi_teknis: filename },
      { where: whereCondition }
    );

    return successResponse(res, `Dokumen berhasil diunggah dan ditautkan ke ${updatedCount} pendaftar.`);
  } catch (error) {
    return errorResponse(res, "Gagal mengunggah dokumen", 500);
  }
};

exports.cekDokumenRekomtek = async (req, res) => {
  try {
    const whereCondition = { id_flow: { [Op.in]: [12, 14] }, file_rekomendasi_teknis: { [Op.ne]: null } };
    
    const userCtx = await getUserContext(req);
    if (userCtx && (userCtx.roles.includes(111) || userCtx.roles.includes(113))) {
      if (userCtx.nama_kampus) {
        whereCondition.pt_final = { [Op.like]: `%${userCtx.nama_kampus}%` };
      } else {
        whereCondition.pt_final = "TIDAK_ADA_KAMPUS_DI_DATABASE";
      }
    }

    const data = await TrxBeasiswa.findOne({
      where: whereCondition,
      attributes: ["file_rekomendasi_teknis"]
    });
    
    const fileUrl = data && data.file_rekomendasi_teknis 
      ? getFileUrl(req, "rekomtek", data.file_rekomendasi_teknis) 
      : null;

    return successResponse(res, "Status dokumen", { 
      filename: fileUrl 
    });
  } catch (error) {
    return errorResponse(res, "Gagal mengecek dokumen", 500);
  }
};

exports.kirimKeFlow14 = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const whereBase = { id_flow: 12 };
    const userCtx = await getUserContext(req);
    
    if (userCtx && (userCtx.roles.includes(111) || userCtx.roles.includes(113))) {
      if (userCtx.nama_kampus) {
        whereBase.pt_final = { [Op.like]: `%${userCtx.nama_kampus}%` };
      } else {
        await transaction.rollback();
        return errorResponse(res, "TIDAK_ADA_KAMPUS_DI_DATABASE", 403);
      }
    }

    const pendaftarsAktif = await TrxBeasiswa.findAll({ 
      where: { 
        ...whereBase, 
        [Op.or]: [
          { status_undur_diri: { [Op.ne]: "Y" } },
          { status_undur_diri: { [Op.is]: null } } 
        ]
      }, 
      raw: true,
      transaction
    });

    const pendaftarsMundur = await TrxBeasiswa.findAll({ 
      where: { ...whereBase, status_undur_diri: "Y" }, 
      raw: true,
      transaction
    });

    if (pendaftarsAktif.length === 0 && pendaftarsMundur.length === 0) {
      await transaction.rollback();
      return errorResponse(res, "Tidak ada data yang bisa diproses.", 400);
    }

    const tahunAngkatan = new Date().getFullYear().toString();

    for (const p of pendaftarsAktif) {
      try {
        const existing = await TrxMahasiswaFinal.findOne({ 
          where: { kode_pendaftaran: p.kode_pendaftaran },
          transaction
        });
        
        let jenjang_diterima = p.jenjang_final;
        
        if (!jenjang_diterima) {
          if (p.id_prodi_final) {
             const prodi = await RefProgramStudi.findByPk(p.id_prodi_final, { attributes: ["jenjang"], transaction });
             if (prodi) jenjang_diterima = prodi.jenjang;
          } else if (p.prodi_final) {
             const prodi = await RefProgramStudi.findOne({ 
               where: { nama_prodi: { [Op.like]: `%${p.prodi_final.trim()}%` } },
               attributes: ["jenjang"],
               transaction
             });
             if (prodi) jenjang_diterima = prodi.jenjang;
          }
        }

        if (!jenjang_diterima) jenjang_diterima = "-";

        await TrxBeasiswa.update(
          { jenjang_final: jenjang_diterima },
          { where: { id_trx_beasiswa: p.id_trx_beasiswa }, transaction }
        );

        if (!existing) {
          await TrxMahasiswaFinal.create({
            id_ref_beasiswa: p.id_ref_beasiswa,
            nama: p.nama_lengkap,
            nik: p.nik,
            kode_pendaftaran: p.kode_pendaftaran,
            jenis_kelamin: p.jenis_kelamin,
            id_kluster: p.id_kluster,
            nama_kluster: p.nama_kluster,
            id_pt: p.id_pt_final,
            pt: p.pt_final,
            id_prodi: p.id_prodi_final,
            prodi: p.prodi_final,
            jenjang: jenjang_diterima, 
            tahun_angkatan: tahunAngkatan,
            tinggal_kode_prov: p.tinggal_kode_prov,
            tinggal_prov: p.tinggal_prov,
            tinggal_kode_kab: p.tinggal_kode_kab,
            tinggal_kab_kota: p.tinggal_kab_kota,
            email: p.email,
            no_hp: p.no_hp
          }, { transaction });
        } else {
          const updateData = {};
          
          if (!existing.jenjang || existing.jenjang === "-") {
            updateData.jenjang = jenjang_diterima;
          }
          
          updateData.tinggal_kode_prov = p.tinggal_kode_prov;
          updateData.tinggal_prov = p.tinggal_prov;
          updateData.tinggal_kode_kab = p.tinggal_kode_kab;
          updateData.tinggal_kab_kota = p.tinggal_kab_kota;
          updateData.email = p.email;
          updateData.no_hp = p.no_hp;

          if (Object.keys(updateData).length > 0) {
            await TrxMahasiswaFinal.update(
              updateData,
              { where: { id: existing.id }, transaction }
            );
          }
        }
      } catch (insertError) {
        console.error(insertError.message);
      }
    }

    if (pendaftarsMundur.length > 0) {
      for (const m of pendaftarsMundur) {
        const [existingCekal] = await sequelizeMaster.query(
          "SELECT nik FROM ref_nik_cekal WHERE nik = :nik LIMIT 1",
          { replacements: { nik: m.nik } }
        );

        if (existingCekal.length === 0) {
          await sequelizeMaster.query(
            `INSERT INTO ref_nik_cekal (nik, nama, keterangan, created_at, updated_at) 
             VALUES (:nik, :nama, :alasan, NOW(), NOW())`,
            {
              replacements: {
                nik: m.nik,
                nama: m.nama_lengkap,
                alasan: `Mengundurkan diri pada tahap Rekomtek PT ${m.pt_final}`
              }
            }
          );
        }
      }
    }

    if (pendaftarsAktif.length > 0) {
      await TrxBeasiswa.update(
        { id_flow: 14 },
        { 
          where: { 
            ...whereBase, 
            [Op.or]: [
              { status_undur_diri: { [Op.ne]: "Y" } },
              { status_undur_diri: { [Op.is]: null } } 
            ]
          }, 
          transaction 
        }
      );
    }

    await transaction.commit();
    return successResponse(res, `Berhasil memproses penetapan. Ditetapkan: ${pendaftarsAktif.length}, Daftar Cekal: ${pendaftarsMundur.length}`);
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    return errorResponse(res, "Terjadi Kesalahan: " + error.message, 500);
  }
};

exports.getSummaryKuotaRekomtek = async (req, res) => {
  try {
    const whereCondition = { id_flow: 12 };
    
    const userCtx = await getUserContext(req);
    if (userCtx && (userCtx.roles.includes(111) || userCtx.roles.includes(113))) {
      if (userCtx.nama_kampus) {
        whereCondition.pt_final = { [Op.like]: `%${userCtx.nama_kampus}%` };
      } else {
        whereCondition.pt_final = "TIDAK_ADA_KAMPUS_DI_DATABASE";
      }
    }

    const pendaftar = await TrxBeasiswa.findAll({
      where: whereCondition,
      attributes: ["id_pt_final", "pt_final", "id_prodi_final", "prodi_final"],
      group: ["id_pt_final", "pt_final", "id_prodi_final", "prodi_final"]
    });

    const summary = await Promise.all(pendaftar.map(async (p) => {
      let kuota = 0;
      if (p.id_prodi_final) {
        const prodiMaster = await RefProgramStudi.findByPk(p.id_prodi_final, { attributes: ["kuota"] });
        kuota = prodiMaster ? prodiMaster.kuota : 0;
      } else {
        const ptMaster = await RefPerguruanTinggi.findOne({ where: { nama_pt: { [Op.like]: `%${p.pt_final}%` } } });
        if (ptMaster) {
          const prodiMaster = await RefProgramStudi.findOne({
            where: { id_pt: ptMaster.id_pt, nama_prodi: { [Op.like]: `%${p.prodi_final}%` } }
          });
          kuota = prodiMaster ? prodiMaster.kuota : 0;
        }
      }

      return {
        perguruan_tinggi: p.pt_final,
        program_studi: p.prodi_final,
        sisa_kuota: kuota
      };
    }));

    return successResponse(res, "Summary kuota berhasil dimuat", summary);
  } catch (error) {
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
};
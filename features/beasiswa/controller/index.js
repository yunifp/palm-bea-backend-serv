const {
  successResponse,
  failResponse,
  errorResponse,
} = require("../../../common/response");
const axios = require("axios");
const { Op, where, fn, col, literal, DATE } = require("sequelize");
const { sequelizeMaster } = require("../../../core/db_master_config");
const PDFDocument = require("pdfkit-table");
const {
  TrxBeasiswa,
  TrxDokumenUmum,
  TrxDokumenKhusus,
  TrxPilihanProgramStudi,
  TrxCatatanDataSection,
  TrxDokumenDinasDaerah,
  TrxCatatanVerifikasiSection,
  TrxSkDinasKabkota,
  TrxBaDinasKabkota,
  TrxLogKeputusan,
  TrxNilaiRapor,
  RefProgramStudi,
  sequelize,
  EmailLog,
  TrxKoreksiPendaftar
} = require("../../../models");
const { getFileUrl } = require("../../../common/middleware/upload_middleware");
const ExcelJS = require("exceljs");
const nodemailer = require("nodemailer");
const archiver = require("archiver");
const path = require("path");
const fs = require("fs");
const { sendNotificationToQueue } = require("../../../utils/notification");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const storageType = process.env.DATABASE_PENYIMPANAN || "biasa";

const primaryEndpoint = process.env.S3_ENDPOINT ;
const secondaryEndpoint = process.env.S3_ENDPOINT_SECONDARY ;

let s3Proxy = null;
let currentS3Client = null;
let primaryClient = null;
let secondaryClient = null;
const UPLOAD_BUCKET = process.env.S3_BUCKET_NAME;

if (storageType === "s3") {
  const s3Config = {
    region: process.env.S3_REGION ,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || process.env.access_key,
      secretAccessKey: process.env.S3_SECRET_KEY || process.env.secret_key,
    },
    forcePathStyle: true,
  };

  primaryClient = new S3Client({ ...s3Config, endpoint: primaryEndpoint });
  secondaryClient = new S3Client({ ...s3Config, endpoint: secondaryEndpoint });

  currentS3Client = primaryClient;

  s3Proxy = new Proxy({}, {
    get: (target, prop) => {
      if (typeof currentS3Client[prop] === "function") {
        return currentS3Client[prop].bind(currentS3Client);
      }
      return currentS3Client[prop];
    }
  });
}

let lastEndpointCheck = 0;
const checkAndSwitchEndpoint = async () => {
  if (storageType !== "s3") return;
  
  const now = Date.now();
  if (now - lastEndpointCheck < 30000) return; 

  try {
    await axios.get(primaryEndpoint, { timeout: 3000 });
    currentS3Client = primaryClient;
    lastEndpointCheck = now;
  } catch (error) {
    currentS3Client = secondaryClient;
    lastEndpointCheck = now;
  }
};

const baseUploadDir = process.env.FILE_URL;

const FOLDER_MAP = {
  foto: "foto",
  foto_depan: "foto_depan",
  foto_samping_kiri: "foto_samping_kiri",
  foto_samping_kanan: "foto_samping_kanan",
  foto_belakang: "foto_belakang",
  persyaratan: "persyaratan",
  berita_acara: "berita_acara",
};

const resolveFilePath = (folderKey, filename) => {
  const folder = FOLDER_MAP[folderKey] ?? folderKey;
  return path.join(baseUploadDir, folder, filename);
};

const addFileToArchive = async (archive, folderKey, filename, archivePath) => {
  if (!filename) return;

  if (storageType === "s3") {
    try {
      await checkAndSwitchEndpoint();

      const folder = FOLDER_MAP[folderKey] ?? folderKey;
      let key = filename;
      
      if (key.startsWith("http")) {
        try {
          const urlObj = new URL(key);
          if (urlObj.pathname.includes('/api/files/view')) {
              key = decodeURIComponent(urlObj.searchParams.get('file'));
              const f = decodeURIComponent(urlObj.searchParams.get('folder'));
              if (!key.includes("/")) {
                  key = `${f}/${key}`;
              }
          } else {
              const pathParts = urlObj.pathname.split('/').filter(Boolean);
              if (pathParts[0] === UPLOAD_BUCKET) {
                  pathParts.shift();
              }
              key = pathParts.join('/');
          }
        } catch (e) {}
      } else if (!key.includes("/")) {
         key = `${folder}/${filename}`;
      }
      
      const command = new GetObjectCommand({
        Bucket: UPLOAD_BUCKET,
        Key: key,
      });
      const response = await s3Proxy.send(command); 
      archive.append(response.Body, { name: archivePath });
    } catch (error) {
    }
  } else {
    const fullPath = resolveFilePath(folderKey, filename);
    if (fs.existsSync(fullPath)) {
      archive.file(fullPath, { name: archivePath });
    }
  }
};

const safeFolderName = (data) =>
  (data.kode_pendaftaran || `trx_${data.id_trx_beasiswa}`)
    .replace(/[^a-zA-Z0-9_\-]/g, "_");

const safeDocName = (nama, id, maxLen = 50) =>
  (nama || `dok_${id}`)
    .replace(/[^a-zA-Z0-9_\- ]/g, "_")
    .substring(0, maxLen)
    .trim();

const FOTO_FIELDS = [
  { field: "foto", label: "foto_wajah" },
  { field: "foto_depan", label: "foto_depan" },
  { field: "foto_samping_kiri", label: "foto_samping_kiri" },
  { field: "foto_samping_kanan", label: "foto_samping_kanan" },
  { field: "foto_belakang", label: "foto_belakang" },
];

const addFotoToArchive = async (archive, data, folderPrefix) => {
  const kodePendaftaran = data.kode_pendaftaran || "Tanpa-No";
  for (const { field, label } of FOTO_FIELDS) {
    if (data[field]) {
      const ext = path.extname(data[field]) || ".jpg";
      await addFileToArchive(
        archive,
        field,                                  
        data[field],                            
        `${folderPrefix}/foto/${kodePendaftaran} - ${label}${ext}` 
      );
    }
  }
};  

const addDokumenUmumToArchive = async (archive, idTrxBeasiswa, folderPrefix, mapRefUmum = {}, kodePendaftaran = "Tanpa-No") => {
  const dokList = await TrxDokumenUmum.findAll({
    where: { id_trx_beasiswa: idTrxBeasiswa },
    attributes: ["id", "id_ref_dokumen", "nama_dokumen_persyaratan", "file"],
  });

  for (const dok of dokList) {
    if (!dok.file) continue;
    const ext = path.extname(dok.file) || ".pdf";
    
    let rawName = mapRefUmum[dok.id_ref_dokumen] || dok.nama_dokumen_persyaratan;
    
    if (rawName && rawName.includes('.')) {
        rawName = rawName.split('.').slice(0, -1).join('.');
    }

    const nameSafe = safeDocName(rawName, dok.id);
    await addFileToArchive(
      archive,
      "persyaratan",                                         
      dok.file,
      `${folderPrefix}/dokumen_umum/${kodePendaftaran} - ${nameSafe}${ext}` 
    );
  }
};

const addDokumenKhususToArchive = async (archive, idTrxBeasiswa, folderPrefix, mapRefKhusus = {}, kodePendaftaran = "Tanpa-No") => {
  const dokList = await TrxDokumenKhusus.findAll({
    where: { id_trx_beasiswa: idTrxBeasiswa },
    attributes: ["id", "id_ref_dokumen", "nama_dokumen_persyaratan", "file"],
  });

  for (const dok of dokList) {
    if (!dok.file) continue;
    const ext = path.extname(dok.file) || ".pdf";

    let rawName = mapRefKhusus[dok.id_ref_dokumen] || dok.nama_dokumen_persyaratan;
    if (rawName && rawName.includes('.')) {
        rawName = rawName.split('.').slice(0, -1).join('.');
    }

    const nameSafe = safeDocName(rawName, dok.id);
    await addFileToArchive(
      archive,
      "persyaratan",
      dok.file,
      `${folderPrefix}/dokumen_khusus/${kodePendaftaran} - ${nameSafe}${ext}` 
    );
  }
};

const addDokumenByKategori = async (archive, data, folderPrefix, kategori, mapRefUmum = {}, mapRefKhusus = {}) => {
  const k = kategori || "all";
  const kodePendaftaran = data.kode_pendaftaran || "Tanpa-No";
  
  if (k === "all" || k === "dokumen_umum") {
    await addHasilSeleksiPdfToArchive(archive, data, folderPrefix, mapRefUmum, mapRefKhusus);
  }

  if (k === "all" || k === "foto") {
    await addFotoToArchive(archive, data, folderPrefix);
  }

  if (k === "all" || k === "dokumen_umum") {
    await addDokumenUmumToArchive(archive, data.id_trx_beasiswa, folderPrefix, mapRefUmum, kodePendaftaran);
  }

  if (k === "all" || k === "dokumen_khusus") {
    await addDokumenKhususToArchive(archive, data.id_trx_beasiswa, folderPrefix, mapRefKhusus, kodePendaftaran);
  }
};

const createZipResponse = (res, filename) => {
  res.setTimeout(0);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(filename)}"`
  );

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(res);

  res.on('close', () => {
  });

  archive.on("warning", (err) => {
  });

  archive.on("error", (err) => {
    if (!res.headersSent) res.status(500).end("Archive error");
  });

  return archive;
};


const buildWilayahFilter = ({ kode_prov, kode_kab }) => {
  const filter = {};
  if (kode_prov) filter.tinggal_kode_prov = kode_prov;
  if (kode_kab) filter.tinggal_kode_kab = kode_kab;
  return filter;
};

exports.getRekapLulusAdministrasi = async (req, res) => {
  try {
    const { flag, page = 1, limit = 10, search = "" } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const whereCondition = {
      id_flow: 13
    };

    if (flag !== undefined && flag !== 'all') {
      whereCondition.flag_kewilayahn = parseInt(flag);
    }

    if (search) {
      whereCondition[Op.or] = [
        { tinggal_kab_kota: { [Op.like]: `%${search}%` } },
        { tinggal_prov: { [Op.like]: `%${search}%` } }
      ];
    }

    const rekap = await TrxBeasiswa.findAll({
      where: whereCondition,
      attributes: [
        "tinggal_prov",
        "tinggal_kab_kota",
        "tinggal_kode_kab",
        [
          sequelize.literal(`SUM(CASE WHEN id_flow = 13 THEN 1 ELSE 0 END)`),
          "jml_ktp"
        ],
        [
          sequelize.literal(`SUM(CASE WHEN kerja_kode_kab = tinggal_kode_kab AND id_flow = 13 THEN 1 ELSE 0 END)`),
          "jml_bekerja" 
        ]
      ],
      group: ["tinggal_kode_kab", "tinggal_prov", "tinggal_kab_kota"],
      order: [
        ["tinggal_prov", "ASC"],
        ["tinggal_kab_kota", "ASC"]
      ],
      limit: limitNum,
      offset: offset,
      raw: true
    });

    const totalData = await TrxBeasiswa.count({
      where: whereCondition,
      distinct: true,
      col: 'tinggal_kode_kab'
    });

    const totalPages = Math.ceil(totalData / limitNum);

    const responseData = {
      data: rekap,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRows: totalData,
        totalPages: totalPages
      }
    };

    return successResponse(res, "Berhasil memuat rekapitulasi pendaftar", responseData);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getDetailLulusAdministrasi = async (req, res) => {
  try {
    const { tinggal_kode_kab } = req.params;

    const detail = await TrxBeasiswa.findAll({
      where: {
        tinggal_kode_kab: tinggal_kode_kab,
        id_flow: 13
      },
      attributes: [
        "id_trx_beasiswa",
        "nama_lengkap",
        "nama_beasiswa",
        ["tinggal_kab_kota", "ktp"],
        "kerja_kab_kota",
        ["flag_kewilayahn", "flag_kewilayahan"]
      ],
      raw: true
    });

    return successResponse(res, "Berhasil memuat detail pendaftar", detail);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.updateFlagKewilayahan = async (req, res) => {
  try {
    const { id_trx_beasiswa, flag_kewilayahan, is_global } = req.body;

    if (flag_kewilayahan === undefined) {
      return failResponse(res, "Data tidak lengkap. flag_kewilayahan wajib diisi.");
    }

    let logKeterangan = "";
    const flagVal = parseInt(flag_kewilayahan);

    let updatePayload = {
      flag_kewilayahn: flagVal,
    };

    if (flagVal === 0) {
      updatePayload.kode_dinas_provinsi = literal('tinggal_kode_prov');
      updatePayload.nama_dinas_provinsi = literal('tinggal_prov');
      updatePayload.kode_dinas_kabkota = literal('tinggal_kode_kab');
      updatePayload.nama_dinas_kabkota = literal('tinggal_kab_kota');
    } else if (flagVal === 1) {
      updatePayload.kode_dinas_provinsi = literal('kerja_kode_prov');
      updatePayload.nama_dinas_provinsi = literal('kerja_prov');
      updatePayload.kode_dinas_kabkota = literal('kerja_kode_kab');
      updatePayload.nama_dinas_kabkota = literal('kerja_kab_kota');
    }

    if (is_global) {
      await TrxBeasiswa.update(
        updatePayload,
        { where: { id_flow: 13 } }
      );
      logKeterangan = `Update massal kewilayahan ke ${flagVal === 1 ? 'ALAMAT BEKERJA' : 'ALAMAT KTP'}`;
    }
    else if (Array.isArray(id_trx_beasiswa)) {
      if (id_trx_beasiswa.length === 0) return failResponse(res, "Tidak ada data yang dipilih.");
      await TrxBeasiswa.update(
        updatePayload,
        { where: { id_trx_beasiswa: { [Op.in]: id_trx_beasiswa } } }
      );
      logKeterangan = `Update kewilayahan ${id_trx_beasiswa.length} pendaftar menjadi ${flagVal === 1 ? 'SESUAI BEKERJA' : 'SESUAI KTP'}`;
    }
    else if (id_trx_beasiswa) {
      await TrxBeasiswa.update(
        updatePayload,
        { where: { id_trx_beasiswa: id_trx_beasiswa } }
      );
      logKeterangan = `Update kewilayahan 1 pendaftar menjadi ${flagVal === 1 ? 'SESUAI BEKERJA' : 'SESUAI KTP'}`;
    } else {
      return failResponse(res, "Target update tidak valid.");
    }

    await TrxLogKeputusan.create({
      jenis: "PEMBAGIAN_WILAYAH",
      ket: logKeterangan,
      timestamp: new Date()
    });

    return successResponse(res, "Kewilayahan dan kode dinas berhasil diubah");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getLastLogKeputusan = async (req, res) => {
  try {
    const log = await TrxLogKeputusan.findOne({
      where: { jenis: "PEMBAGIAN_WILAYAH" },
      order: [["timestamp", "DESC"]]
    });
    return successResponse(res, "Berhasil memuat log", log);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getTransaksiBeasiswaByPagination = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    const baseCondition = {};

    const whereCondition = search
      ? {
        ...baseCondition,
        [Op.or]: [
          { nama_beasiswa: { [Op.like]: `%${search}%` } },
          { nama_lengkap: { [Op.like]: `%${search}%` } },
        ],
      }
      : baseCondition;

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [["id_trx_beasiswa", "ASC"]],
    });

    return successResponse(res, "Data berhasil dimuat", {
      result: rows,
      total: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
    });
  } catch (error) {
    return errorResponse(res, "Internal server error");
  }
};

exports.getTransaksiBeasiswaByPaginationSeleksiAdministrasi = async (req, res) => {
  try {
    const { idBeasiswa } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const provinsi = req.query.kodeProvinsi || "";
    const kabkota = req.query.kodeKabkota || "";

    const idFlow = req.query.idFlow || "all";
    const idJalur = req.query.idJalur || "all";

    const baseCondition = {
      id_ref_beasiswa: idBeasiswa,
      id_verifikator: req.user.id,
    };

    if (idFlow !== "all") {
      if (idFlow === "lulus") {
        const ADMIN_LULUS_FLOWS = [6, 7, 9, 10, 11, 12, 13, 17];
        baseCondition.id_flow = { [Op.in]: ADMIN_LULUS_FLOWS };
      } else {
        baseCondition.id_flow = Number(idFlow);
      }
    } else {
      baseCondition.id_flow = { [Op.notIn]: [0, 1] };
    }

    if (idJalur !== "all") {
      baseCondition.id_jalur = Number(idJalur);
    }

    if (provinsi) baseCondition.tinggal_kode_prov = provinsi;
    if (kabkota) baseCondition.tinggal_kode_kab = kabkota;

    const whereCondition = search
      ? {
        ...baseCondition,
        [Op.or]: [
          { nama_beasiswa: { [Op.like]: `%${search}%` } },
          { nama_lengkap: { [Op.like]: `%${search}%` } },
          { kode_pendaftaran: { [Op.like]: `%${search}%` } },
        ],
      }
      : baseCondition;

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      // ✅ SORTING FIFO BERDASARKAN WAKTU LOCKING
      order: [
        ["timestamp_lock_selektor", "ASC"], 
        ["id_trx_beasiswa", "ASC"]
      ],
    });

    const mappedRows = rows.map((item) => {
      const json = item.toJSON();
      return {
        ...json,
        foto: json.foto ? getFileUrl(req, "foto", json.foto) : null,
        foto_depan: json.foto_depan ? getFileUrl(req, "foto_depan", json.foto_depan) : null,
        foto_samping_kiri: json.foto_samping_kiri ? getFileUrl(req, "foto_samping_kiri", json.foto_samping_kiri) : null,
        foto_samping_kanan: json.foto_samping_kanan ? getFileUrl(req, "foto_samping_kanan", json.foto_samping_kanan) : null,
        foto_belakang: json.foto_belakang ? getFileUrl(req, "foto_belakang", json.foto_belakang) : null,
      };
    });

    return successResponse(res, "Data berhasil dimuat", {
      result: mappedRows,
      total: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
    });
  } catch (error) {
    return errorResponse(res, "Internal server error");
  }
};

exports.getTransaksiBeasiswaByPaginationSeleksiAdministrasiDaerah = async (req, res) => {
  try {
    const { idBeasiswa } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const provinsi = req.query.kodeProvinsi || "";
    const kabkota = req.query.kodeKabkota || "";
    const dinas = req.query.Dinas || "";
    
    const idFlow = req.query.idFlow || "all";
    const idJalur = req.query.idJalur || "all";

    const baseCondition = {
      id_ref_beasiswa: idBeasiswa,
    };

    if (kabkota) {
      baseCondition.kode_dinas_kabkota = kabkota;
    } else if (provinsi) {
      baseCondition.kode_dinas_provinsi = provinsi;
    }

    if (dinas === "kabkota" || dinas === "provinsi") {
      baseCondition.id_flow = { [Op.notIn]: [0, 1, 2] };
    }

    if (idFlow !== "all") {
      const ADMIN_LULUS_FLOWS = [6, 7, 9, 10, 11, 12, 13, 17];
      if (idFlow === "lulus") {
        baseCondition.id_flow = { [Op.in]: ADMIN_LULUS_FLOWS };
      } else if (idFlow === "tidak_lulus") {
        baseCondition.id_flow = { [Op.notIn]: ADMIN_LULUS_FLOWS };
      } else {
        baseCondition.id_flow = Number(idFlow);
      }
    }

    if (idJalur !== "all") {
      baseCondition.id_jalur = Number(idJalur);
    }

    const whereCondition = search
      ? {
        ...baseCondition,
        [Op.or]: [
          { nama_beasiswa: { [Op.like]: `%${search}%` } },
          { nama_lengkap: { [Op.like]: `%${search}%` } },
          { kode_pendaftaran: { [Op.like]: `%${search}%` } },
        ],
      }
      : baseCondition;

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [["id_trx_beasiswa", "ASC"]],
    });

    const mappedRows = rows.map((item) => {
      const json = item.toJSON();
      return {
        ...json,
        foto: json.foto ? getFileUrl(req, "foto", json.foto) : null,
        foto_depan: json.foto_depan ? getFileUrl(req, "foto_depan", json.foto_depan) : null,
        foto_samping_kiri: json.foto_samping_kiri ? getFileUrl(req, "foto_samping_kiri", json.foto_samping_kiri) : null,
        foto_samping_kanan: json.foto_samping_kanan ? getFileUrl(req, "foto_samping_kanan", json.foto_samping_kanan) : null,
        foto_belakang: json.foto_belakang ? getFileUrl(req, "foto_belakang", json.foto_belakang) : null,
      };
    });

    return successResponse(res, "Data berhasil dimuat", {
      result: mappedRows,
      total: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
    });
  } catch (error) {
    return errorResponse(res, "Internal server error");
  }
};

exports.getTransaksiBeasiswaByPaginationVerifikasiDinas = async (req, res) => {
  try {
    const { idBeasiswa } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const { kode_prov, kode_kab } = req.user;

    const wilayahFilter = buildWilayahFilter({ kode_prov, kode_kab });

    const baseCondition = {
      id_ref_beasiswa: idBeasiswa,
      [Op.or]: [{ id_flow: 8 }, { id_flow: 10 }],
      status_lulus_administrasi: "Y",
      status_lulus_wawancara_akademik: "Y",
      kode_prov: kode_prov ?? null,
      kode_kab: kode_kab ?? null,
      ...wilayahFilter,
    };
    const whereCondition = search
      ? {
        ...baseCondition,
        [Op.or]: [
          { nama_beasiswa: { [Op.like]: `%${search}%` } },
          { nama_lengkap: { [Op.like]: `%${search}%` } },
        ],
      }
      : baseCondition;

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [["id_trx_beasiswa", "ASC"]],
    });

    return successResponse(res, "Data berhasil dimuat", {
      result: rows,
      total: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
    });
  } catch (error) {
    return errorResponse(res, "Internal server error");
  }
};

exports.createInitialTransaksi = async (req, res) => {
  try {
    const { id_ref_beasiswa, nama_beasiswa } = req.body;
    const { id: idUser } = req.user;

    let transaksi = await TrxBeasiswa.findOne({
      where: { id_ref_beasiswa, id_users: idUser },
    });

    if (!transaksi) {
      const insertData = {
        id_ref_beasiswa,
        nama_beasiswa,
        id_users: idUser,
        id_flow: 0,
        flow: "Pra Draft",
        created_at: new Date(),
      };
      transaksi = await TrxBeasiswa.create(insertData);
    }

    if (transaksi.foto) {
      transaksi.foto = getFileUrl(req, "foto", transaksi.foto);
    }
    if (transaksi.foto_depan) {
      transaksi.foto_depan = getFileUrl(req, "foto_depan", transaksi.foto_depan);
    }
    if (transaksi.foto_belakang) {
      transaksi.foto_belakang = getFileUrl(req, "foto_belakang", transaksi.foto_belakang);
    }
    if (transaksi.foto_samping_kanan) {
      transaksi.foto_samping_kanan = getFileUrl(req, "foto_samping_kanan", transaksi.foto_samping_kanan);
    }
    if (transaksi.foto_samping_kiri) {
      transaksi.foto_samping_kiri = getFileUrl(req, "foto_samping_kiri", transaksi.foto_samping_kiri);
    }

    const pilihanProgramStudi = await TrxPilihanProgramStudi.findAll({
      where: { id_trx_beasiswa: transaksi.id_trx_beasiswa },
    });

    transaksi = transaksi.toJSON();
    transaksi.pilihan_program_studi = pilihanProgramStudi ?? [];

    let sectionData = await TrxCatatanDataSection.findOne({
      where: { id_trx_beasiswa: transaksi.id_trx_beasiswa },
    });

    transaksi.catatan_data_section = sectionData ? sectionData.toJSON() : null;

    return successResponse(res, "Transaksi berhasil dibuat atau ditemukan", transaksi);
  } catch (error) {
    return res.status(500).json(errorResponse("Internal Server Error"));
  }
};


exports.getFullDataBeasiswa = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;

    const trxBeasiswa = await TrxBeasiswa.findOne({
      where: { id_trx_beasiswa: idTrxBeasiswa },
    });

    if (!trxBeasiswa) {
      return errorResponse(res, "Data beasiswa tidak ditemukan", 404);
    }

    const persyaratanUmum = await TrxDokumenUmum.findAll({
      where: { id_trx_beasiswa: idTrxBeasiswa },
    });

    const persyaratanKhusus = await TrxDokumenKhusus.findAll({
      where: { id_trx_beasiswa: idTrxBeasiswa },
    });

    const persyaratanDinas = await TrxDokumenDinasDaerah.findAll({
      where: { id_trx_beasiswa: idTrxBeasiswa },
    });

    const mappedPersyaratanUmum = persyaratanUmum.map((item) => ({
      ...item.toJSON(),
      file: getFileUrl(req, "persyaratan", item.file),
    }));

    const mappedPersyaratanKhusus = persyaratanKhusus.map((item) => ({
      ...item.toJSON(),
      file: getFileUrl(req, "persyaratan", item.file),
    }));

    const mappedPersyaratanDinas = persyaratanDinas.map((item) => ({
      ...item.toJSON(),
      file: getFileUrl(req, "persyaratan", item.file),
    }));

    const pilihanProgramStudi = await TrxPilihanProgramStudi.findAll({
      where: { id_trx_beasiswa: idTrxBeasiswa },
    });

    const beasiswaData = trxBeasiswa.toJSON();

    if (beasiswaData.foto) {
      beasiswaData.foto = getFileUrl(req, "foto", beasiswaData.foto);
    }
    if (beasiswaData.foto_depan)
      beasiswaData.foto_depan = getFileUrl(req, "foto_depan", beasiswaData.foto_depan);
    if (beasiswaData.foto_samping_kiri)
      beasiswaData.foto_samping_kiri = getFileUrl(req, "foto_samping_kiri", beasiswaData.foto_samping_kiri);
    if (beasiswaData.foto_samping_kanan)
      beasiswaData.foto_samping_kanan = getFileUrl(req, "foto_samping_kanan", beasiswaData.foto_samping_kanan);
    if (beasiswaData.foto_belakang)
      beasiswaData.foto_belakang = getFileUrl(req, "foto_belakang", beasiswaData.foto_belakang);

    beasiswaData.pilihan_program_studi = pilihanProgramStudi.map((item) => item.toJSON());

    let sectionData = await TrxCatatanDataSection.findOne({
      where: { id_trx_beasiswa: beasiswaData.id_trx_beasiswa },
    });

    beasiswaData.catatan_data_section = sectionData ? sectionData.toJSON() : null;

    const returnData = {
      data_beasiswa: beasiswaData,
      persyaratan_umum: mappedPersyaratanUmum,
      persyaratan_khusus: mappedPersyaratanKhusus,
      persyaratan_dinas: mappedPersyaratanDinas,
    };

    return successResponse(res, "Transaksi berhasil ditemukan", returnData);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.submitBeasiswa = async (req, res) => {
  try {
    const {
      id_trx_beasiswa, is_draft, nama_lengkap, nik, nkk, jenis_kelamin,
      no_hp, email, tanggal_lahir, tempat_lahir, agama, suku,
      pekerjaan, instansi_pekerjaan, berat_badan, tinggi_badan,
      tinggal_provinsi, tinggal_kabkot, tinggal_kecamatan, tinggal_kelurahan, tinggal_dusun, tinggal_kode_pos, tinggal_rt, tinggal_rw, tinggal_alamat,
      kerja_provinsi, kerja_kabkot, kerja_kecamatan, kerja_kelurahan, kerja_dusun, kerja_kode_pos, kerja_rt, kerja_rw, kerja_alamat,
      alamat_kerja_sama_dengan_tinggal,
      ayah_nama, ayah_nik, ayah_jenjang_pendidikan, ayah_pekerjaan, ayah_penghasilan, ayah_status_hidup, ayah_status_kekerabatan, ayah_tempat_lahir, ayah_tanggal_lahir, ayah_no_hp, ayah_email, ayah_alamat,
      ibu_nama, ibu_nik, ibu_jenjang_pendidikan, ibu_pekerjaan, ibu_penghasilan, ibu_status_hidup, ibu_status_kekerabatan, ibu_tempat_lahir, ibu_tanggal_lahir, ibu_no_hp, ibu_email, ibu_alamat,
      wali_nama, wali_nik, wali_jenjang_pendidikan, wali_pekerjaan, wali_penghasilan, wali_status_hidup, wali_status_kekerabatan, wali_tempat_lahir, wali_tanggal_lahir, wali_no_hp, wali_email, wali_alamat,
      sekolah_provinsi, sekolah_kabkot, jenjang_sekolah, sekolah, nisn_sekolah, jurusan, tahun_lulus, nama_jurusan_sekolah, id_verifikator,
      kondisi_buta_warna, pilihan_program_studi, kode_dinas_provinsi, kode_dinas_kabkota, jalur,
    } = req.body;

    const files = req.files || {};
    const fotoFile = files["foto"]?.[0];
    const fotoDepanFile = files["foto_depan"]?.[0];
    const fotoKiriFile = files["foto_samping_kiri"]?.[0];
    const fotoKananFile = files["foto_samping_kanan"]?.[0];
    const fotoBelakangFile = files["foto_belakang"]?.[0];

    const getSafeFilename = (f) => f ? (f.filename || f.key || null) : null;

    const safeSplit = (value = "", delimiter = "#") => {
      if (typeof value !== "string" || !value.includes(delimiter)) {
        return [null, null];
      }
      const parts = value.split(delimiter).map((v) => (v === "" || v === "null" ? null : v));
      return [parts[0], parts[1]];
    };

    const normalize = (val) => {
      if (val === "" || val === "null" || val === undefined) return null;
      return val;
    };

    const [idPekerjaan, namaPekerjaan] = safeSplit(pekerjaan);
    const [idInstansiPekerjaan, namaInstansiPekerjaan] = safeSplit(instansi_pekerjaan);
    const [tinggalKodeProv, tinggalNamaProv] = safeSplit(tinggal_provinsi);
    const [tinggalKodeKab, tinggalNamaKab] = safeSplit(tinggal_kabkot);
    const [tinggalKodeKec, tinggalNamaKec] = safeSplit(tinggal_kecamatan);
    const [tinggalKodeKel, tinggalNamaKel] = safeSplit(tinggal_kelurahan);
    const [tinggalKodeDusun, tinggalNamaDusun] = safeSplit(tinggal_dusun);
    const [kerjaKodeProv, kerjaNamaProv] = safeSplit(kerja_provinsi);
    const [kerjaKodeKab, kerjaNamaKab] = safeSplit(kerja_kabkot);
    const [kerjaKodeKec, kerjaNamaKec] = safeSplit(kerja_kecamatan);
    const [kerjaKodeKel, kerjaNamaKel] = safeSplit(kerja_kelurahan);
    const [kerjaKodeDusun, kerjaNamaDusun] = safeSplit(kerja_dusun);
    const [ayahStatusHidup, ayahNamaStatusHidup] = safeSplit(ayah_status_hidup);
    const [ayahStatusKekerabatan, ayahNamaStatusKekerabatan] = safeSplit(ayah_status_kekerabatan);
    const [ibuStatusHidup, ibuNamaStatusHidup] = safeSplit(ibu_status_hidup);
    const [ibuStatusKekerabatan, ibuNamaStatusKekerabatan] = safeSplit(ibu_status_kekerabatan);
    const [waliStatusHidup, waliNamaStatusHidup] = safeSplit(wali_status_hidup);
    const [waliStatusKekerabatan, waliNamaStatusKekerabatan] = safeSplit(wali_status_kekerabatan);
    const [sekolahKodeProv, sekolahNamaProv] = safeSplit(sekolah_provinsi);
    const [sekolahKodeKab, sekolahNamaKab] = safeSplit(sekolah_kabkot);
    const [idJenjangSekolah, jenjangSekolah] = safeSplit(jenjang_sekolah);
    const [idJalur, namaJalur] = safeSplit(jalur);
    const [idDinasprov, namaDinasprov] = safeSplit(kode_dinas_provinsi);
    const [idDinaskabkota, namaDinaskabkota] = safeSplit(kode_dinas_kabkota);

    const updateData = {
      nama_lengkap: normalize(nama_lengkap), nik: normalize(nik), nkk: normalize(nkk), jenis_kelamin: normalize(jenis_kelamin),
      no_hp: normalize(no_hp), email: normalize(email), tanggal_lahir: normalize(tanggal_lahir), tempat_lahir: normalize(tempat_lahir),
      agama: normalize(agama), suku: normalize(suku), id_pekerjaan: normalize(idPekerjaan), pekerjaan: normalize(namaPekerjaan),
      id_instansi_pekerjaan: normalize(idInstansiPekerjaan), instansi_pekerjaan: normalize(namaInstansiPekerjaan),
      berat_badan: normalize(berat_badan), tinggi_badan: normalize(tinggi_badan),
      tinggal_kode_prov: normalize(tinggalKodeProv), tinggal_prov: normalize(tinggalNamaProv), tinggal_kode_kab: normalize(tinggalKodeKab),
      tinggal_kab_kota: normalize(tinggalNamaKab), tinggal_kode_kec: normalize(tinggalKodeKec), tinggal_kec: normalize(tinggalNamaKec),
      tinggal_kode_kel: normalize(tinggalKodeKel), tinggal_kel: normalize(tinggalNamaKel), tinggal_kode_dusun: normalize(tinggalKodeDusun),
      tinggal_dusun: normalize(tinggalNamaDusun), tinggal_kode_pos: normalize(tinggal_kode_pos), tinggal_rt: normalize(tinggal_rt),
      tinggal_rw: normalize(tinggal_rw), tinggal_alamat: normalize(tinggal_alamat),
      kerja_kode_prov: normalize(kerjaKodeProv), kerja_prov: normalize(kerjaNamaProv), kerja_kode_kab: normalize(kerjaKodeKab),
      kerja_kab_kota: normalize(kerjaNamaKab), kerja_kode_kec: normalize(kerjaKodeKec), kerja_kec: normalize(kerjaNamaKec),
      kerja_kode_kel: normalize(kerjaKodeKel), kerja_kel: normalize(kerjaNamaKel), kerja_kode_dusun: normalize(kerjaKodeDusun),
      kerja_dusun: normalize(kerjaNamaDusun), kerja_kode_pos: normalize(kerja_kode_pos), kerja_rt: normalize(kerja_rt),
      kerja_rw: normalize(kerja_rw), kerja_alamat: normalize(kerja_alamat),
      alamat_kerja_sama_dengan_tinggal: normalize(alamat_kerja_sama_dengan_tinggal),
      ayah_nama: normalize(ayah_nama), ayah_nik: normalize(ayah_nik), ayah_jenjang_pendidikan: normalize(ayah_jenjang_pendidikan),
      ayah_pekerjaan: normalize(ayah_pekerjaan), ayah_penghasilan: normalize(ayah_penghasilan), ayah_id_status_hidup: normalize(ayahStatusHidup),
      ayah_status_hidup: normalize(ayahNamaStatusHidup), ayah_id_status_kekerabatan: normalize(ayahStatusKekerabatan),
      ayah_status_kekerabatan: normalize(ayahNamaStatusKekerabatan), ayah_tempat_lahir: normalize(ayah_tempat_lahir),
      ayah_tanggal_lahir: normalize(ayah_tanggal_lahir), ayah_no_hp: normalize(ayah_no_hp), ayah_email: normalize(ayah_email),
      ayah_alamat: normalize(ayah_alamat),
      ibu_nama: normalize(ibu_nama), ibu_nik: normalize(ibu_nik), ibu_jenjang_pendidikan: normalize(ibu_jenjang_pendidikan),
      ibu_pekerjaan: normalize(ibu_pekerjaan), ibu_penghasilan: normalize(ibu_penghasilan), ibu_id_status_hidup: normalize(ibuStatusHidup),
      ibu_status_hidup: normalize(ibuNamaStatusHidup), ibu_id_status_kekerabatan: normalize(ibuStatusKekerabatan),
      ibu_status_kekerabatan: normalize(ibuNamaStatusKekerabatan), ibu_tempat_lahir: normalize(ibu_tempat_lahir),
      ibu_tanggal_lahir: normalize(ibu_tanggal_lahir), ibu_no_hp: normalize(ibu_no_hp), ibu_email: normalize(ibu_email),
      ibu_alamat: normalize(ibu_alamat),
      wali_nama: normalize(wali_nama), wali_nik: normalize(wali_nik), wali_jenjang_pendidikan: normalize(wali_jenjang_pendidikan),
      wali_pekerjaan: normalize(wali_pekerjaan), wali_penghasilan: normalize(wali_penghasilan), wali_id_status_hidup: normalize(waliStatusHidup),
      wali_status_hidup: normalize(waliNamaStatusHidup), wali_id_status_kekerabatan: normalize(waliStatusKekerabatan),
      wali_status_kekerabatan: normalize(waliNamaStatusKekerabatan), wali_tempat_lahir: normalize(wali_tempat_lahir),
      wali_tanggal_lahir: normalize(wali_tanggal_lahir), wali_no_hp: normalize(wali_no_hp), wali_email: normalize(wali_email),
      wali_alamat: normalize(wali_alamat),
      sekolah_kode_prov: normalize(sekolahKodeProv), sekolah_prov: normalize(sekolahNamaProv), sekolah_kode_kab: normalize(sekolahKodeKab),
      sekolah_kab_kota: normalize(sekolahNamaKab), id_jenjang_sekolah: normalize(idJenjangSekolah), jenjang_sekolah: normalize(jenjangSekolah),
      sekolah: normalize(sekolah), nisn_sekolah: normalize(nisn_sekolah), jurusan: normalize(jurusan), tahun_lulus: normalize(tahun_lulus),
      nama_jurusan_sekolah: normalize(nama_jurusan_sekolah), kondisi_buta_warna: normalize(kondisi_buta_warna),
      kode_dinas_provinsi: normalize(idDinasprov), kode_dinas_kabkota: normalize(idDinaskabkota),
      id_jalur: normalize(idJalur), jalur: normalize(namaJalur), updated_at: new Date(),
    };

    if (fotoFile) updateData.foto = getSafeFilename(fotoFile);
    if (fotoDepanFile) updateData.foto_depan = getSafeFilename(fotoDepanFile);
    if (fotoKiriFile) updateData.foto_samping_kiri = getSafeFilename(fotoKiriFile);
    if (fotoKananFile) updateData.foto_samping_kanan = getSafeFilename(fotoKananFile);
    if (fotoBelakangFile) updateData.foto_belakang = getSafeFilename(fotoBelakangFile);

    const trxBeasiswa = await TrxBeasiswa.findOne({
      where: { id_trx_beasiswa },
      attributes: ["id_flow", "kode_pendaftaran"],
    });

    const currentFlow = trxBeasiswa?.id_flow;
    const is_draftx = is_draft === "true";

    if (!is_draftx) {
      if (currentFlow === 0) {
        updateData.id_flow = 1;
        updateData.is_active = 1;
        updateData.flow = "Draft";
        updateData.created_at = new Date();

        if (!trxBeasiswa.kode_pendaftaran) {
          const kodePendaftaran = await generateKodePendaftaran(idJalur);
          updateData.kode_pendaftaran = kodePendaftaran;
        }
      }
      if (currentFlow === 1) {
        updateData.id_flow = 2;
        updateData.flow = "Verifikasi";
      } else if (currentFlow === 4) {
        updateData.id_flow = 5;
        updateData.flow = "Verifikasi Hasil Perbaikan";

        const existingSection = await TrxCatatanDataSection.findOne({
          where: { id_trx_beasiswa: id_trx_beasiswa },
        });

        if (existingSection) {
          const sectionUpdate = {};
          const now = new Date();

          if (existingSection.data_pribadi_is_valid === "N") sectionUpdate.data_pribadi_revised_at = now;
          if (existingSection.data_tempat_tinggal_bekerja_is_valid === "N") sectionUpdate.data_tempat_tinggal_bekerja_revised_at = now;
          if (existingSection.data_orang_tua_is_valid === "N") sectionUpdate.data_orang_tua_revised_at = now;
          if (existingSection.data_pendidikan_is_valid === "N") sectionUpdate.data_pendidikan_revised_at = now;

          if (Object.keys(sectionUpdate).length > 0) {
            await TrxCatatanDataSection.update(sectionUpdate, { where: { id_trx_beasiswa: id_trx_beasiswa } });
          }
        }

        await TrxDokumenUmum.update(
          { peserta_revised_at: new Date() },
          { where: { id_trx_beasiswa: id_trx_beasiswa, status_verifikasi: "tidak sesuai" } }
        );
        await TrxDokumenKhusus.update(
          { peserta_revised_at: new Date() },
          { where: { id_trx_beasiswa: id_trx_beasiswa, status_verifikasi: "tidak sesuai" } }
        );
      } else if (currentFlow === 9) {
        updateData.id_flow = 10;
        updateData.flow = "Verifikasi Hasil Perbaikan";
      }
    }

    if (!is_draftx) {
      const existingTrx = await TrxBeasiswa.findOne({
        where: { id_trx_beasiswa },
        attributes: ["sequence"],
      });

      if (!existingTrx?.sequence) {
        const lastSeq = await TrxBeasiswa.findOne({
          where: { id_jalur: normalize(idJalur), sequence: { [Op.ne]: null } },
          order: [["sequence", "DESC"]],
          attributes: ["sequence"],
        });
        updateData.sequence = lastSeq ? lastSeq.sequence + 1 : 1;
      }
    }

    const sktmDoc = await TrxDokumenUmum.findOne({
      where: { id_trx_beasiswa, id_ref_dokumen: 13 },
      attributes: ["id"],
    });
    updateData.tag_sktm = sktmDoc ? "1" : "0";

    await TrxBeasiswa.update(updateData, { where: { id_trx_beasiswa } });

    if (!is_draftx) {
      const aktifKoreksi = await TrxKoreksiPendaftar.findAll({
        where: { id_trx_beasiswa, is_resolved: 'N' },
        attributes: ['id', 'kategori'],
      });

      for (const koreksi of aktifKoreksi) {
        const fieldName = koreksi.kategori;
        const newValue = updateData[fieldName];
        if (newValue !== null && newValue !== undefined && newValue !== '') {
          await TrxKoreksiPendaftar.update(
            { is_resolved: 'Y', resolved_at: new Date() },
            { where: { id: koreksi.id } }
          );
        }
      }
    }

    await TrxPilihanProgramStudi.destroy({ where: { id_trx_beasiswa } });
    const pilihan_program_studix = JSON.parse(req.body.pilihan_program_studi);

    const insertDataPilihanProgramSudi = pilihan_program_studix.map((item) => {
      const [id_pt, nama_pt] = safeSplit(item.perguruan_tinggi);
      const [id_prodi, nama_prodi] = safeSplit(item.program_studi);
      return { id_trx_beasiswa, id_pt: id_pt ? Number(id_pt) : null, nama_pt, id_prodi: id_prodi ? Number(id_prodi) : null, nama_prodi };
    });

    if (insertDataPilihanProgramSudi.length > 0) {
      await TrxPilihanProgramStudi.bulkCreate(insertDataPilihanProgramSudi);
    }

    if (!is_draftx && normalize(email)) {
      const finalKodePendaftaran = updateData.kode_pendaftaran || trxBeasiswa.kode_pendaftaran || "Sedang Diproses";
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #2e7d32; text-align: center;">Pendaftaran Berhasil Disubmit</h2>
          <p>Halo <b>${normalize(nama_lengkap)}</b>,</p>
          <p>Selamat! Data pendaftaran beasiswa Anda telah berhasil kami terima dan saat ini telah masuk ke tahap verifikasi.</p>
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><b>Kode Pendaftaran:</b> ${finalKodePendaftaran}</p>
            <p style="margin: 5px 0;"><b>Jalur Pendaftaran:</b> ${normalize(namaJalur) || '-'}</p>
          </div>
          <p>Anda telah men-submit data pada beasiswa ini. Mohon tunggu proses seleksi.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.BASE_URL || 'https://beasiswa.dev-palma.my.id'}" style="background-color: #2e7d32; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Masuk ke Dashboard</a>
          </div>
          <hr style="border: 0; border-top: 1px solid #eee; margin-top: 30px;" />
          <p style="font-size: 12px; color: #888; text-align: center;">&copy; ${new Date().getFullYear()} Aplikasi Palma Beasiswa. All rights reserved.</p>
        </div>
      `;
      sendNotificationToQueue("daftar", normalize(email), htmlContent);
    }

    return successResponse(res, "Transaksi berhasil diperbarui");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

async function generateKodePendaftaran(idJalur) {
  try {
    const tahun = new Date().getFullYear().toString().slice(-2);
    const kodeJalur = String(idJalur || '00').padStart(2, '0');
    const prefix = `${tahun}${kodeJalur}`;

    const lastRecord = await TrxBeasiswa.findOne({
      where: { kode_pendaftaran: { [Op.like]: `${prefix}%` } },
      order: [['kode_pendaftaran', 'DESC']],
      attributes: ['kode_pendaftaran']
    });

    let nextSequence = 1;

    if (lastRecord && lastRecord.kode_pendaftaran) {
      const lastSequence = parseInt(lastRecord.kode_pendaftaran.slice(-6));
      if (!isNaN(lastSequence)) nextSequence = lastSequence + 1;
    }

    const sequence = String(nextSequence).padStart(6, '0');
    const kodePendaftaran = `${prefix}${sequence}`;
    return kodePendaftaran;

  } catch (error) {
    throw error;
  }
}

exports.updateFlowBeasiswa = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const { id_flow, catatan, verifikator, verifikasi_data } = req.body;

    const safeSplit = (value = "", delimiter = "#") => {
      if (typeof value !== "string" || !value.includes(delimiter)) return [null, null];
      const parts = value.split(delimiter).map((v) => (v === "" || v === "null" ? null : v));
      return [parts[0], parts[1]];
    };

    const pendaftar = await TrxBeasiswa.findOne({
      where: { id_trx_beasiswa: idTrxBeasiswa },
      attributes: ["email", "nama_lengkap", "kode_pendaftaran"]
    });

    let idDinasprov = null, namaDinasprov = null;
    let idDinaskabkota = null, namaDinaskabkota = null;

    if (verifikasi_data) {
      [idDinasprov, namaDinasprov] = safeSplit(verifikasi_data.kode_dinas_provinsi);
      [idDinaskabkota, namaDinaskabkota] = safeSplit(verifikasi_data.kode_dinas_kabkota);
    }

    if (id_flow == 4 && verifikasi_data) {
      await TrxKoreksiPendaftar.destroy({ where: { id_trx_beasiswa: idTrxBeasiswa } });

      const koreksiList = [];
      const now = new Date();
      const fieldKoreksi = verifikasi_data.koreksi_fields || [];

      for (const item of fieldKoreksi) {
        koreksiList.push({
          id_trx_beasiswa: idTrxBeasiswa,
          kategori: item.field,
          label: item.label,
          catatan: item.catatan || null,
          is_resolved: 'N',
          created_at: now,
          updated_at: now,
        });
      }

      if (koreksiList.length > 0) await TrxKoreksiPendaftar.bulkCreate(koreksiList);
    }
    const updateData = {};

    if (verifikator == "ditjenbun") {
      updateData.verifikator_catatan = catatan;
    } else if (verifikator == "dinas") {
      updateData.verifikator_dinas_catatan = catatan;
    }

    if (id_flow == 3) {
      updateData.id_flow = 3;
      updateData.flow = "Tolak";
      updateData.is_active = 0;

      if (pendaftar && pendaftar.email) {
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <h2 style="color: #d32f2f; text-align: center;">Pemberitahuan Verifikasi Administrasi</h2>
            <p>Halo <b>${pendaftar.nama_lengkap}</b>,</p>
            <p>Terima kasih atas partisipasi Anda dalam pendaftaran Beasiswa. Setelah melakukan verifikasi dan penelaahan terhadap berkas pendaftaran Anda (Kode Pendaftaran: <b>${pendaftar.kode_pendaftaran || '-'}</b>), dengan berat hati kami sampaikan bahwa pendaftaran Anda <b>TIDAK LULUS</b> (Ditolak).</p>
            <div style="background-color: #fff3f3; border-left: 4px solid #d32f2f; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #d32f2f; font-size: 14px;"><b>Alasan Penolakan / Catatan Verifikator:</b></p>
              <p style="margin: 5px 0 0 0; color: #333;"><i>"${catatan || 'Tidak ada catatan tambahan.'}"</i></p>
            </div>
            <p>Jangan patah semangat dan teruslah berusaha. Terima kasih atas ketertarikan Anda pada program beasiswa kami.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin-top: 30px;" />
            <p style="font-size: 12px; color: #888; text-align: center;">&copy; ${new Date().getFullYear()} Aplikasi Palma Beasiswa. All rights reserved.</p>
          </div>
        `;

        try {
          await EmailLog.create({
            id_trx: idTrxBeasiswa,
            email_to: pendaftar.email,
            subject: "Pemberitahuan Hasil Verifikasi Administrasi - Aplikasi Palma",
            body_html: htmlContent,
            status: "queued"
          });
        } catch (logErr) {
        }
        sendNotificationToQueue("beasiswa-ditolak", pendaftar.email, htmlContent);
      }
    } else if (id_flow == 4) {
      updateData.id_flow = 4;
      updateData.flow = "Perlu Perbaikan";
    } else if (id_flow == 7) {
      updateData.id_flow = 7;
      updateData.flow = "Verifikasi Dinas Provinsi";
      updateData.status_lulus_administrasi = "Y";
      updateData.kode_dinas_provinsi = idDinasprov;
      updateData.kode_dinas_kabkota = idDinaskabkota;
      updateData.nama_dinas_provinsi = namaDinasprov;
      updateData.nama_dinas_kabkota = namaDinaskabkota;
      updateData.timestamp_dinas_provinsi = new Date();
    } else if (id_flow == 6) {
      updateData.id_flow = 6;
      updateData.flow = "Verifikasi Dinas Kabupaten/Kota";
      updateData.status_lulus_administrasi = "Y";
      updateData.kode_dinas_provinsi = idDinasprov;
      updateData.kode_dinas_kabkota = idDinaskabkota;
      updateData.nama_dinas_provinsi = namaDinasprov;
      updateData.nama_dinas_kabkota = namaDinaskabkota;
      updateData.timestamp_dinas_kabkota = new Date();
    } else if (id_flow == 9) {
      updateData.id_flow = 9;
      updateData.flow = "Proses Analisa Rasio";
    } else if (id_flow == 10) {
      updateData.id_flow = 10;
      updateData.flow = "Proses Wawancara & Test Akademik";
    } else if (id_flow == 72) {
      updateData.status_dari_verifikator_dinas = "Y";
    } else if (id_flow == 13) {
      updateData.id_flow = 13;
      updateData.flow = "Lulus Administrasi - Pembagian Wilayah";
    } else if (id_flow == 11) {
      updateData.id_flow = 11;
      updateData.flow = "Analisa dan Penelaahan";
    }

    await TrxBeasiswa.update(updateData, { where: { id_trx_beasiswa: idTrxBeasiswa } });

    if (verifikasi_data) {
      const insertDataSection = {
        id_trx_beasiswa: idTrxBeasiswa,
        data_pribadi_is_valid: verifikasi_data.data_pribadi_is_valid,
        data_pribadi_catatan: verifikasi_data.data_pribadi_catatan,
        data_tempat_tinggal_is_valid: verifikasi_data.data_tempat_tinggal_is_valid,
        data_tempat_tinggal_catatan: verifikasi_data.data_tempat_tinggal_catatan,
        data_tempat_bekerja_is_valid: verifikasi_data.data_tempat_bekerja_is_valid,
        data_tempat_bekerja_catatan: verifikasi_data.data_tempat_bekerja_catatan,
        data_tempat_tinggal_bekerja_is_valid: verifikasi_data.data_tempat_tinggal_bekerja_is_valid,
        data_tempat_tinggal_bekerja_catatan: verifikasi_data.data_tempat_tinggal_bekerja_catatan,
        data_orang_tua_is_valid: verifikasi_data.data_orang_tua_is_valid,
        data_orang_tua_catatan: verifikasi_data.data_orang_tua_catatan,
        data_pendidikan_is_valid: verifikasi_data.data_pendidikan_is_valid,
        data_pendidikan_catatan: verifikasi_data.data_pendidikan_catatan,
        data_program_studi_is_valid: verifikasi_data.data_program_studi_is_valid,
        data_program_studi_catatan: verifikasi_data.data_program_studi_catatan,
        created_at: new Date(),
        created_by: req.user.nama,
      };

      const existingRecord = await TrxCatatanDataSection.findOne({ where: { id_trx_beasiswa: idTrxBeasiswa } });

      if (existingRecord) {
        await TrxCatatanDataSection.update(insertDataSection, { where: { id_trx_beasiswa: idTrxBeasiswa } });
      } else {
        await TrxCatatanDataSection.create(insertDataSection);
      }
    }

    const semuaPersyaratan = [
      ...(req.body.verifikasi_data?.data_persyaratan_umum || []),
      ...(req.body.verifikasi_data?.data_persyaratan_khusus || []),
    ];

    for (const item of semuaPersyaratan) {
      const { id: idTrxDokumen, kategori, catatan, is_valid } = item;
      const updatePersyaratanData = {};
      const kategoriUpper = kategori.toUpperCase();

      if (verifikator === "ditjenbun") {
        updatePersyaratanData.status_verifikasi = is_valid === "Y" ? "sesuai" : "tidak sesuai";
        if (catatan) updatePersyaratanData.verifikator_catatan = catatan;
        if (req.user?.nama) updatePersyaratanData.verifikator_nama = req.user.nama;
        updatePersyaratanData.verifikator_timestamp = new Date();
      } else if (verifikator === "dinas") {
        updatePersyaratanData.verifikator_dinas_is_valid = is_valid;
        if (catatan) updatePersyaratanData.verifikator_dinas_catatan = catatan;
        if (req.user?.nama) updatePersyaratanData.verifikator_dinas_nama = req.user.nama;
        updatePersyaratanData.verifikator_dinas_timestamp = new Date();
      }

      if (kategoriUpper === "UMUM") {
        await TrxDokumenUmum.update(updatePersyaratanData, { where: { id: idTrxDokumen } });
      } else if (kategoriUpper === "KHUSUS") {
        await TrxDokumenKhusus.update(updatePersyaratanData, { where: { id: idTrxDokumen } });
      }
    }

    return successResponse(res, "Berhasil melakukan verifikasi");
  } catch (error) {
    return errorResponse("Internal Server Error");
  }
};

exports.updateTaggingBeasiswa = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const { tagging_alamat_kebun, tagging_alamat_bekerja } = req.body;

    const updateData = { tagging_alamat_kebun, tagging_alamat_bekerja };

    await TrxBeasiswa.update(updateData, { where: { id_trx_beasiswa: idTrxBeasiswa } });

    return successResponse(res, "Berhasil melakukan perubahan data");
  } catch (error) {
    return errorResponse("Internal Server Error");
  }
};

exports.downloadExcelSeleksiWawancara = async (req, res) => {
  try {
    const rows = await TrxBeasiswa.findAll({
      where: { id_flow: 7, status_lulus_administrasi: "Y" },
      order: [["id_trx_beasiswa", "ASC"]],
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Seleksi");

    worksheet.mergeCells("A1:R1");
    const noteCell1 = worksheet.getCell("A1");
    noteCell1.value = 'Ubah status lulus wawancara di kolom paling kanan: "Y" Jika lulus dan "N" jika tidak lulus';
    noteCell1.font = { color: { argb: "FF000000" } };
    noteCell1.alignment = { horizontal: "left", vertical: "middle" };
    noteCell1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFE0" } };

    worksheet.mergeCells("A2:R2");
    const noteCell2 = worksheet.getCell("A2");
    noteCell2.value = "Jangan ubah data lain!";
    noteCell2.font = { color: { argb: "FFFF0000" } };
    noteCell2.alignment = { horizontal: "left", vertical: "middle" };
    noteCell2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFE0" } };

    worksheet.getRow(4).values = [
      "No", "NIK", "Nama Lengkap", "Email", "No HP", "Provinsi", "Kabupaten/Kota", "Kecamatan", "Kelurahan",
      "Alamat", "Jalur", "Tagging Alamat Kebun", "Tagging Alamat Bekerja", "Jenjang Sekolah", "Nama Sekolah",
      "Perguruan Tinggi", "Program Studi", "Status Lulus Wawancara",
    ];

    worksheet.columns = [
      { key: "no", width: 6 }, { key: "nik", width: 25 }, { key: "nama_lengkap", width: 25 }, { key: "email", width: 25 },
      { key: "no_hp", width: 25 }, { key: "prov", width: 25 }, { key: "kab_kota", width: 25 }, { key: "kec", width: 25 },
      { key: "kel", width: 25 }, { key: "alamat", width: 25 }, { key: "jalur", width: 25 }, { key: "tagging_alamat_kebun", width: 25 },
      { key: "tagging_alamat_bekerja", width: 25 }, { key: "jenjang_sekolah", width: 25 }, { key: "nama_sekolah", width: 25 },
      { key: "perguruan_tinggi", width: 25 }, { key: "program_studi", width: 25 }, { key: "status_lulus_wawancara", width: 25 },
    ];

    rows.forEach((row, index) => {
      worksheet.addRow({
        no: index + 1, nik: row.nik || "-", nama_lengkap: row.nama_lengkap || "-", email: row.email || "-",
        no_hp: row.no_hp || "-", prov: row.prov || "-", kab_kota: row.kab_kota || "-", kec: row.kec || "-",
        kel: row.kel || "-", alamat: row.alamat || "-", jalur: row.jalur || "-", tagging_alamat_kebun: row.tagging_alamat_kebun || "-",
        tagging_alamat_bekerja: row.tagging_alamat_bekerja || "-", jenjang_sekolah: row.jenjang_sekolah || "-",
        nama_sekolah: row.nama_sekolah || "-", perguruan_tinggi: row.perguruan_tinggi || "-", program_studi: row.program_studi || "-",
        status_lulus_wawancara: "",
      });
    });

    worksheet.getRow(4).eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F0FF" } };
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=data_seleksi.xlsx");

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    return errorResponse(res, "Gagal mengunduh file Excel");
  }
};

exports.uploadExcelSeleksiWawancara = async (req, res) => {
  try {
    if (!req.file) return errorResponse(res, "File Excel tidak ditemukan");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet("Data Seleksi");

    if (!worksheet) return errorResponse(res, "Sheet 'Data Seleksi' tidak ditemukan");

    let successCount = 0;
    let failedCount = 0;
    const errors = [];

    for (let i = 5; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (!row.getCell(2).value) continue;

      const nik = row.getCell(2).value?.toString().trim();
      const statusLulusWawancara = row.getCell(18).value?.toString().trim().toUpperCase();

      if (!statusLulusWawancara || (statusLulusWawancara !== "Y" && statusLulusWawancara !== "N")) {
        failedCount++;
        errors.push({ row: i, nik: nik, message: `Status lulus wawancara harus diisi dengan "Y" atau "N"` });
        continue;
      }

      try {
        const trxBeasiswa = await TrxBeasiswa.findOne({
          where: { nik: nik, id_flow: 7, status_lulus_administrasi: "Y" },
        });

        if (!trxBeasiswa) {
          failedCount++;
          errors.push({ row: i, nik: nik, message: "Data tidak ditemukan atau tidak lolos administrasi" });
          continue;
        }

        await trxBeasiswa.update({
          id_flow: 8,
          flow: "Proses Verifikasi Dinas",
          status_lulus_wawancara_akademik: statusLulusWawancara,
        });

        successCount++;
      } catch (error) {
        failedCount++;
        errors.push({ row: i, nik: nik, message: error.message });
      }
    }

    return successResponse(res, "Berhasil mengupload file Excel");
  } catch (error) {
    return errorResponse(res, "Gagal mengupload file Excel");
  }
};

exports.downloadExcelHasilVerifikasiDinas = async (req, res) => {
  try {
    const rows = await TrxBeasiswa.findAll({
      where: { id_flow: 11, status_lulus_administrasi: "Y" },
      order: [["id_trx_beasiswa", "ASC"]],
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Seleksi");

    worksheet.mergeCells("A1:R1");
    const noteCell1 = worksheet.getCell("A1");
    noteCell1.value = 'Ubah status hasil analisa rasio di kolom paling kanan: "Y" Jika lulus dan "N" jika tidak lulus';
    noteCell1.font = { color: { argb: "FF000000" } };
    noteCell1.alignment = { horizontal: "left", vertical: "middle" };
    noteCell1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFE0" } };

    worksheet.mergeCells("A2:R2");
    const noteCell2 = worksheet.getCell("A2");
    noteCell2.value = "Jangan ubah data lain!";
    noteCell2.font = { color: { argb: "FFFF0000" } };
    noteCell2.alignment = { horizontal: "left", vertical: "middle" };
    noteCell2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFE0" } };

    worksheet.getRow(4).values = [
      "No", "NIK", "Nama Lengkap", "Email", "No HP", "Provinsi", "Kabupaten/Kota", "Kecamatan", "Kelurahan",
      "Alamat", "Jalur", "Tagging Alamat Kebun", "Tagging Alamat Bekerja", "Jenjang Sekolah", "Nama Sekolah",
      "Perguruan Tinggi", "Program Studi", "Status Hasil Analisa Rasio",
    ];

    worksheet.columns = [
      { key: "no", width: 6 }, { key: "nik", width: 25 }, { key: "nama_lengkap", width: 25 }, { key: "email", width: 25 },
      { key: "no_hp", width: 25 }, { key: "prov", width: 25 }, { key: "kab_kota", width: 25 }, { key: "kec", width: 25 },
      { key: "kel", width: 25 }, { key: "alamat", width: 25 }, { key: "jalur", width: 25 }, { key: "tagging_alamat_kebun", width: 25 },
      { key: "tagging_alamat_bekerja", width: 25 }, { key: "jenjang_sekolah", width: 25 }, { key: "nama_sekolah", width: 25 },
      { key: "perguruan_tinggi", width: 25 }, { key: "program_studi", width: 25 }, { key: "status_hasil_analisa_rasio", width: 25 },
    ];

    rows.forEach((row, index) => {
      worksheet.addRow({
        no: index + 1, nik: row.nik || "-", nama_lengkap: row.nama_lengkap || "-", email: row.email || "-",
        no_hp: row.no_hp || "-", prov: row.prov || "-", kab_kota: row.kab_kota || "-", kec: row.kec || "-",
        kel: row.kel || "-", alamat: row.alamat || "-", jalur: row.jalur || "-", tagging_alamat_kebun: row.tagging_alamat_kebun || "-",
        tagging_alamat_bekerja: row.tagging_alamat_bekerja || "-", jenjang_sekolah: row.jenjang_sekolah || "-",
        nama_sekolah: row.nama_sekolah || "-", perguruan_tinggi: row.perguruan_tinggi || "-", program_studi: row.program_studi || "-",
        status_hasil_analisa_rasio: "",
      });
    });

    worksheet.getRow(4).eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F0FF" } };
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=data_seleksi.xlsx");

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    return errorResponse(res, "Gagal mengunduh file Excel");
  }
};

exports.uploadExcelHasilVerifikasiDinas = async (req, res) => {
  try {
    if (!req.file) return errorResponse(res, "File Excel tidak ditemukan");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet("Data Seleksi");

    if (!worksheet) return errorResponse(res, "Sheet 'Data Seleksi' tidak ditemukan");

    let successCount = 0;
    let failedCount = 0;
    const errors = [];

    for (let i = 5; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (!row.getCell(2).value) continue;

      const nik = row.getCell(2).value?.toString().trim();
      const statusHasilAnalisaRasio = row.getCell(18).value?.toString().trim().toUpperCase();

      if (!statusHasilAnalisaRasio || (statusHasilAnalisaRasio !== "Y" && statusHasilAnalisaRasio !== "N")) {
        failedCount++;
        errors.push({ row: i, nik: nik, message: `Status hasil analisa rasio harus diisi dengan "Y" atau "N"` });
        continue;
      }

      try {
        const trxBeasiswa = await TrxBeasiswa.findOne({
          where: { nik: nik, id_flow: 11, status_dari_verifikator_dinas: "Y" },
        });

        if (!trxBeasiswa) {
          failedCount++;
          errors.push({ row: i, nik: nik, message: "Data tidak ditemukan atau tidak lolos administrasi" });
          continue;
        }

        await trxBeasiswa.update({
          id_flow: 11,
          status_hasil_analisa_rasio: statusHasilAnalisaRasio,
        });

        successCount++;
      } catch (error) {
        failedCount++;
        errors.push({ row: i, nik: nik, message: error.message });
      }
    }

    return successResponse(res, "Berhasil mengupload file Excel");
  } catch (error) {
    return errorResponse(res, "Gagal mengupload file Excel");
  }
};

exports.uploadBeritaAcaraDinas = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, "File Excel tidak ditemukan");
    }

    const filename = req.file.filename || req.file.key || null;
    if (!filename) return errorResponse(res, "Gagal mendapatkan nama file dari sistem penyimpanan");

    const trxBeasiswaList = await TrxBeasiswa.findAll({
      where: {
        id_flow: 8,
        status_dari_verifikator_dinas: "Y",
      },
    });

    for (const item of trxBeasiswaList) {
      await item.update({
        id_flow: 11,
        flow: "Proses Analisa Rasio",
        berita_acara_verifikator_dinas: filename,
      });
    }

    return successResponse(res, "Berhasil mengupload file Excel");
  } catch (error) {
    return errorResponse(res, "Gagal mengupload file Excel");
  }
};

exports.getTransaksiBeasiswaByWilayah = async (req, res) => {
  try {
    const { beasiswaId } = req.params;
    const { page = 1, search = "", kodeProvinsi, kodeKabkota } = req.query;

    const limit = 10;
    const offset = (page - 1) * limit;

    const whereCondition = {
      beasiswa_id: beasiswaId,
      status_aktif: true, 
    };

    const userWhere = {};
    if (search) {
      userWhere[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { nim: { [Op.like]: `%${search}%` } },
      ];
    }
    if (kodeProvinsi) userWhere.kode_pro = kodeProvinsi;
    if (kodeKabkota) userWhere.kode_kab = kodeKabkota;

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: User,
          as: "user",
          where: userWhere,
          attributes: ["id", "name", "email", "nim", "kode_pro", "kode_kab", "kode_kec", "kode_kel"],
          include: [
            { model: RefWilayah, as: "provinsi", foreignKey: "kode_pro", attributes: ["wilayah_id", "nama_wilayah"], required: false },
            { model: RefWilayah, as: "kabkota", foreignKey: "kode_kab", attributes: ["wilayah_id", "nama_wilayah"], required: false },
          ],
        },
        { model: Beasiswa, as: "beasiswa", attributes: ["id", "nama_beasiswa", "tahun_ajaran"] },
      ],
      limit,
      offset,
      order: [["created_at", "DESC"]],
      distinct: true,
    });

    const result = {
      result: rows,
      total: count,
      total_pages: Math.ceil(count / limit),
      current_page: parseInt(page),
    };

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getCountByProvinsi = async (req, res) => {
  try {
    const { beasiswaId } = req.params;

    const result = await TrxBeasiswa.findAll({
      where: {
        id_ref_beasiswa: beasiswaId,
        kode_dinas_provinsi: { [Op.ne]: null },
      },
      attributes: [
        "kode_dinas_provinsi",
        [fn("COUNT", col("id_trx_beasiswa")), "jumlah_pendaftar"],
      ],
      group: ["kode_dinas_provinsi"],
      order: [[literal("jumlah_pendaftar"), "DESC"]],
      raw: true,
    });

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getCountByProvinsiProsesLembagaSeleksi = async (req, res) => {
  try {
    const { beasiswaId } = req.params;

    const result = await TrxBeasiswa.findAll({
      where: {
        id_ref_beasiswa: beasiswaId,
        id_flow: 10,
        kode_dinas_provinsi: { [Op.ne]: null },
      },
      attributes: [
        "kode_dinas_provinsi",
        [fn("COUNT", col("id_trx_beasiswa")), "jumlah_pendaftar"],
      ],
      group: ["kode_dinas_provinsi"],
      order: [[literal("jumlah_pendaftar"), "DESC"]],
      raw: true,
    });

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getCountByKabkota = async (req, res) => {
  try {
    const { beasiswaId, kodeProvinsi } = req.params;

    const result = await TrxBeasiswa.findAll({
      where: {
        id_ref_beasiswa: beasiswaId,
        kode_dinas_provinsi: kodeProvinsi,
        kode_dinas_kabkota: { [Op.ne]: null },
      },
      attributes: [
        "kode_dinas_kabkota",
        [fn("COUNT", col("id_trx_beasiswa")), "jumlah_pendaftar"],
      ],
      group: ["kode_dinas_kabkota"],
      order: [[literal("jumlah_pendaftar"), "DESC"]],
      raw: true,
    });

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getCountDataProvByKabkota = async (req, res) => {
  try {
    const { beasiswaId, kodeProvinsi } = req.params;

    const result = await TrxBeasiswa.findAll({
      where: {
        id_ref_beasiswa: beasiswaId,
        kode_dinas_provinsi: kodeProvinsi,
        kode_dinas_kabkota: { [Op.ne]: null },
        id_flow: 7,
      },
      attributes: [
        "kode_dinas_kabkota",
        [fn("COUNT", col("id_trx_beasiswa")), "jumlah_pendaftar"],
      ],
      group: ["kode_dinas_kabkota"],
      order: [[literal("jumlah_pendaftar"), "DESC"]],
      raw: true,
    });

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getPendaftarByKabkota = async (req, res) => {
  try {
    const { beasiswaId } = req.params;
    const { page = 1, search = "", kodeKabkota } = req.query;

    const limit = 10;
    const offset = (page - 1) * limit;

    const whereCondition = {
      id_ref_beasiswa: beasiswaId,
      kode_dinas_kabkota: kodeKabkota,
    };

    if (search) {
      whereCondition[Op.or] = [
        { nama_lengkap: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { nik: { [Op.like]: `%${search}%` } },
        { no_hp: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa", "nama_lengkap", "nik", "email", "no_hp", "tanggal_lahir", "tempat_lahir", "jenis_kelamin",
        "tinggal_kode_prov", "tinggal_kode_kab", "tinggal_kode_kec", "tinggal_kode_kel", "tinggal_alamat", "sekolah",
        "jurusan", "tahun_lulus", "jalur", "status_lulus_administrasi", "status_dari_verifikator_dinas", "verifikator_catatan",
      ],
      limit,
      offset,
      order: [["id_trx_beasiswa", "DESC"]],
    });

    const result = {
      result: rows,
      total: count,
      total_pages: Math.ceil(count / limit),
      current_page: parseInt(page),
    };

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getDetailPendaftar = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;

    const pendaftar = await TrxBeasiswa.findOne({
      where: { id_trx_beasiswa: idTrxBeasiswa },
    });

    if (!pendaftar) return errorResponse(res, "Data pendaftar tidak ditemukan", 404);

    return successResponse(res, "Data berhasil dimuat", pendaftar);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getPilihanProgramStudiForForm = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;

    const pilihan = await TrxPilihanProgramStudi.findAll({
      where: { id_trx_beasiswa: idTrxBeasiswa },
      order: [["id", "ASC"]],
    });

    if (!pilihan.length) return successResponse(res, "Data berhasil dimuat", []);

    const prodiIds = pilihan.map((p) => p.id_prodi).filter(Boolean);

    const prodiList = prodiIds.length
      ? await RefProgramStudi.findAll({
        where: { id_prodi: { [Op.in]: prodiIds } },
        attributes: ["id_prodi", "jenjang"],
        raw: true,
      })
      : [];

    const jenjangMap = new Map(prodiList.map((p) => [p.id_prodi, p.jenjang]));
    const ptD1D2Count = new Map();

    const formatted = pilihan.map((item) => {
      const jenjang = jenjangMap.get(item.id_prodi) ?? null;
      const isD1D2 = ["D1", "D2"].includes(jenjang);

      let slot_type;
      if (isD1D2) {
        slot_type = "d1d2";
      } else {
        const ptIdKey = item.id_pt;
        const ptHasD1D2Row = pilihan.some(
          (other) => other.id_pt === ptIdKey && other.id !== item.id && ["D1", "D2"].includes(jenjangMap.get(other.id_prodi) ?? "")
        );
        slot_type = ptHasD1D2Row ? "non_d1d2" : "all";
      }

      return {
        perguruan_tinggi: item.id_pt && item.nama_pt ? `${item.id_pt}#${item.nama_pt}` : "",
        program_studi: item.id_prodi && item.nama_prodi ? `${item.id_prodi}#${item.nama_prodi}` : "",
        slot_type,
      };
    });

    return successResponse(res, "Data berhasil dimuat", formatted);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getPilihanProgramStudiWithDetails = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;

    const pilihanProgramStudi = await TrxPilihanProgramStudi.findAll({
      where: { id_trx_beasiswa: idTrxBeasiswa },
      order: [["id", "ASC"]],
    });

    const formattedData = pilihanProgramStudi.map((item) => ({
      perguruan_tinggi: item.id_pt && item.nama_pt ? `${item.id_pt}#${item.nama_pt}` : "",
      program_studi: item.id_prodi && item.nama_prodi ? `${item.id_prodi}#${item.nama_prodi}` : "",
      id_pt: item.id_pt,
      id_prodi: item.id_prodi,
    }));

    return successResponse(res, "Data pilihan program studi berhasil dimuat", formattedData);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.downloadRekapBeasiswaDaerah = async (req, res) => {
  try {
    const rows = await TrxBeasiswa.findAll({
      where: { id_flow: 15 },
      attributes: ['nama_lengkap', 'kode_dinas_provinsi', 'nama_dinas_provinsi', 'kode_dinas_kabkota', 'nama_dinas_kabkota'],
      order: [['kode_dinas_provinsi', 'ASC'], ['kode_dinas_kabkota', 'ASC'], ['nama_lengkap', 'ASC']],
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Rekap Data Beasiswa");

    worksheet.getRow(1).values = ["No", "Provinsi", "Kabupaten/Kota", "Nama Lengkap"];
    worksheet.columns = [
      { key: "no", width: 6 }, { key: "provinsi", width: 30 }, { key: "kabkota", width: 30 }, { key: "nama", width: 40 }
    ];

    rows.forEach((row, index) => {
      worksheet.addRow({
        no: index + 1, provinsi: row.nama_dinas_provinsi || "-", kabkota: row.nama_dinas_kabkota || "-", nama: row.nama_lengkap || "-"
      });
    });

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F0FF" } };
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=rekap_beasiswa_daerah.xlsx");

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    return errorResponse(res, "Gagal mengunduh file Excel");
  }
};

exports.getTotalTrxBeasiswa = async (req, res) => {
  try {
    const total = await TrxBeasiswa.count();
    return successResponse(res, "Data berhasil dimuat", { total });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getBebanVerifikator = async (req, res) => {
  try {
    const result = await TrxBeasiswa.findAll({
      attributes: ["id_verifikator", [fn("COUNT", col("id_trx_beasiswa")), "total_beban"]],
      where: { id_verifikator: { [Op.ne]: null } },
      group: ["id_verifikator"],
      raw: true,
    });
    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.saveCatatanVerifikasi = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const { catatan_verifikasi_verifikator, catatan_verifikasi_dinas_kabkota, catatan_verifikasi_dinas_provinsi, verifikator } = req.body;

    const existing = await TrxCatatanVerifikasiSection.findOne({ where: { id_trx_beasiswa: idTrxBeasiswa } });
    const data = {};

    if (verifikator === "ditjenbun" && catatan_verifikasi_verifikator != null) {
      data.catatan_verifikasi_verifikator = catatan_verifikasi_verifikator;
    }
    if (verifikator === "dinas_kabkota" && catatan_verifikasi_dinas_kabkota != null) {
      data.catatan_verifikasi_dinas_kabkota = catatan_verifikasi_dinas_kabkota;
      data.catatan_by_dinas_kabkota = req.user?.nama ?? null;
    }
    if (verifikator === "dinas_provinsi" && catatan_verifikasi_dinas_provinsi != null) {
      data.catatan_verifikasi_dinas_provinsi = catatan_verifikasi_dinas_provinsi;
      data.catatan_by_provinsi = req.user?.nama ?? null;
    }

    if (existing) {
      await TrxCatatanVerifikasiSection.update(data, { where: { id_trx_beasiswa: idTrxBeasiswa } });
    } else {
      await TrxCatatanVerifikasiSection.create({
        ...data, id_trx_beasiswa: idTrxBeasiswa, created_at: new Date(), created_by: req.user?.nama ?? null,
      });
    }

    return successResponse(res, "Catatan verifikasi berhasil disimpan");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getCatatanVerifikasi = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const catatan = await TrxCatatanVerifikasiSection.findOne({ where: { id_trx_beasiswa: idTrxBeasiswa } });

    if (!catatan) return successResponse(res, "Belum ada catatan verifikasi", null);

    return successResponse(res, "Data berhasil dimuat", catatan);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.updateTagDinasKabkota = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const { tag } = req.body; 

    if (!tag || !["Y", "N"].includes(tag)) return failResponse(res, "Nilai tag tidak valid");

    const updatePayload = {
      tag_dinas_kabkot: "Y",
      nama_verifikator_dinas_kabkota: req.user?.nama ?? null,
      timestamp_dinas_kabkota: new Date(),
      hasil_dinas_kabkot: tag === "Y" ? "1" : "2"
    };

    await TrxBeasiswa.update(updatePayload, { where: { id_trx_beasiswa: idTrxBeasiswa } });

    return successResponse(res, "Tag dinas kabupaten/kota berhasil diperbarui");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.updateTagDinasProvinsi = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const { tag } = req.body;

    if (!tag || !["Y", "N"].includes(tag)) return failResponse(res, "Nilai tag tidak valid");

    const updatePayload = {
      tag_dinas_provinsi: "Y",
      nama_verifikator_dinas_provinsi: req.user?.nama ?? null,
      timestamp_dinas_provinsi: new Date(),
      hasil_dinas_provinsi: tag === "Y" ? "1" : "2"
    };

    await TrxBeasiswa.update(updatePayload, { where: { id_trx_beasiswa: idTrxBeasiswa } });

    return successResponse(res, "Tag dinas provinsi berhasil diperbarui");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.submitTagDinasKabkotaToProvinsi = async (req, res) => {
  try {
    const { idBeasiswa } = req.params;
    const { kode_kab, kode_prov } = req.user;

    const [updatedCount] = await TrxBeasiswa.update(
      { id_flow: 6, flow: "Verifikasi Dinas Provinsi" },
      {
        where: {
          id_flow: 6, tag_dinas_kabkot: "Y", kode_dinas_kabkota: kode_kab, kode_dinas_provinsi: kode_prov,
        },
      },
    );

    return successResponse(res, `Berhasil mengirim ${updatedCount} data ke provinsi`, { updated: updatedCount });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.submitTagDinasProvinsiToDitjenbun = async (req, res) => {
  try {
    const { idBeasiswa } = req.params;
    const { kode_kab, kode_prov } = req.user;

    const [updatedCount] = await TrxBeasiswa.update(
      { id_flow: 9, flow: "Proses Analisa Rasio" },
      {
        where: {
          id_flow: 6, tag_dinas_provinsi: "Y", tag_dinas_kabkot: "Y", kode_dinas_provinsi: kode_prov,
        },
      },
    );

    return successResponse(res, `Berhasil mengirim ${updatedCount} data ke ditjenbun`, { updated: updatedCount });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getCountTagSiapKirimKabkota = async (req, res) => {
  try {
    const { idBeasiswa } = req.params;
    const { kode_kab } = req.user;

    const count = await TrxBeasiswa.count({
      where: { id_flow: 6, tag_dinas_kabkot: "Y", kode_dinas_kabkota: kode_kab },
    });

    return successResponse(res, "Data berhasil dimuat", { count });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getCountTagSiapKirimProvinsi = async (req, res) => {
  try {
    const { idBeasiswa } = req.params;
    const { kode_prov } = req.user;

    const count = await TrxBeasiswa.count({
      where: { id_flow: 6, tag_dinas_provinsi: "Y", kode_dinas_provinsi: kode_prov },
    });

    return successResponse(res, "Data berhasil dimuat", { count });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getSkKabkotaByProvinsi = async (req, res) => {
  try {
    const { idBeasiswa } = req.params;
    const { kode_prov } = req.user;

    const skList = await TrxSkDinasKabkota.findAll({
      where: { kode_dinas_provinsi: kode_prov },
      order: [["created_at", "DESC"]],
    });

    return successResponse(res, "Data berhasil dimuat", skList);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getPendaftarByProvinsi = async (req, res) => {
  try {
    const { beasiswaId } = req.params;
    const { page = 1, search = "", kodeProvinsi } = req.query;

    const limit = 10;
    const offset = (page - 1) * limit;

    const whereCondition = { id_ref_beasiswa: beasiswaId, kode_dinas_provinsi: kodeProvinsi, id_flow: 9 };

    if (search) {
      whereCondition[Op.or] = [
        { nama_lengkap: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } },
        { nik: { [Op.like]: `%${search}%` } }, { no_hp: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa", "nama_lengkap", "nik", "email", "no_hp", "tanggal_lahir", "tempat_lahir", "jenis_kelamin",
        "tinggal_kode_prov", "tinggal_kode_kab", "tinggal_kode_kec", "tinggal_kode_kel", "tinggal_alamat", "sekolah",
        "jurusan", "tahun_lulus", "jalur", "kode_dinas_provinsi", "nama_dinas_provinsi", "kode_dinas_kabkota", "nama_dinas_kabkota",
        "status_lulus_administrasi", "status_dari_verifikator_dinas", "verifikator_catatan", "tag_sktm",
      ],
      limit, offset, order: [["id_trx_beasiswa", "DESC"]],
    });

    const result = { result: rows, total: count, total_pages: Math.ceil(count / limit), current_page: parseInt(page) };

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.updateDokumenVerifikasiDinas = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const { data_persyaratan_umum } = req.body;

    for (const item of (data_persyaratan_umum || [])) {
      const { id, is_valid, catatan } = item;

      await TrxDokumenUmum.update(
        {
          verifikator_dinas_is_valid: is_valid,
          verifikator_dinas_catatan: catatan ?? null,
          verifikator_dinas_nama: req.user?.nama ?? null,
          verifikator_dinas_timestamp: new Date(),
        },
        { where: { id } }
      );
    }

    return successResponse(res, "Dokumen verifikasi dinas berhasil diperbarui");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.uploadFileBA = async (req, res) => {
  try {
    const { beasiswaId } = req.params;

    if (!req.file) {
      return errorResponse(res, "File tidak ditemukan");
    }

    const filename = req.file.filename || req.file.key || null;
    if (!filename) return errorResponse(res, "Gagal mendapatkan nama file dari sistem penyimpanan");

    const user = req.user;

    await TrxBaDinasKabkota.create({
      id_ref_beasiswa: beasiswaId,
      kode_dinas_kabkota: user?.kode_kab ?? null,
      nama_dinas_kabkota: user?.nama_dinas ?? null,
      kode_dinas_provinsi: user?.kode_prov ?? null,
      nama_dinas_provinsi: user?.nama_provinsi ?? null,
      filename: filename,
      uploaded_by: user?.nama ?? null,
      created_at: new Date(),
    });

    return successResponse(res, "Berita acara berhasil diupload", {
      filename: filename,
    });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getBAKabkota = async (req, res) => {
  try {
    const { beasiswaId } = req.params;
    const user = req.user;

    const result = await TrxBaDinasKabkota.findAll({
      where: { id_ref_beasiswa: beasiswaId, kode_dinas_kabkota: user?.kode_kab ?? null },
      order: [["created_at", "DESC"]],
    });

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getBaKabkotaByProvinsi = async (req, res) => {
  try {
    const { idBeasiswa } = req.params;
    const { kode_prov } = req.user;

    const skList = await TrxBaDinasKabkota.findAll({
      where: { kode_dinas_provinsi: kode_prov },
      order: [["created_at", "DESC"]],
    });

    return successResponse(res, "Data berhasil dimuat", skList);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getPendaftarForAssignment = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const filter = req.query.filter || "all"; 
    const id_verifikator = req.query.id_verifikator || null;
    const status_filter = req.query.status_filter || "all";

    const baseCondition = { id_ref_beasiswa: 1 };

    if (filter === "assigned" || filter === "filter-assigned") {
      baseCondition.id_verifikator = id_verifikator ? Number(id_verifikator) : { [Op.ne]: null };
      baseCondition.id_flow = { [Op.ne]: 0 };
    } else if (filter === "unassigned" || filter === "filter-unassigned") {
      baseCondition.id_verifikator = null;
      baseCondition.id_flow = { [Op.or]: [1] };
    } else if (filter === "locked") {
      baseCondition.id_verifikator = null;
      baseCondition.id_flow = { [Op.or]: [1] };
      baseCondition.tag_lock_selektor = "1";
    } else if (filter === "unlocked") {
      baseCondition.id_verifikator = null;
      baseCondition.id_flow = { [Op.or]: [1] };
      baseCondition.tag_lock_selektor = { [Op.ne]: "1" };
    }

    if (status_filter !== "all") {
      baseCondition.id_flow = status_filter;
    }

    const whereCondition = search
      ? {
        ...baseCondition,
        [Op.or]: [
          { nama_lengkap: { [Op.like]: `%${search}%` } },
          { nik: { [Op.like]: `%${search}%` } },
          { kode_pendaftaran: { [Op.like]: `%${search}%` } },
        ],
      }
      : baseCondition;

   const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa", "nama_lengkap", "nik", "kode_pendaftaran", "jalur", "id_verifikator", "verifikator_nama",
        "id_flow", "flow", "status_lulus_administrasi", "tinggal_kode_prov", "tinggal_prov", "tinggal_kode_kab",
        "tinggal_kab_kota", "created_at", "updated_at", "timestamp_lock_selektor" // <--- DITAMBAHKAN DI SINI
      ],
      limit, offset, order: [
        ["timestamp_lock_selektor", "ASC"],
        ["id_trx_beasiswa", "ASC"]
      ],
    });

    const idList = rows.map(r => r.id_trx_beasiswa);

    const [dokUmumAll, dokKhususAll] = await Promise.all([
      TrxDokumenUmum.findAll({
        where: { id_trx_beasiswa: { [Op.in]: idList } },
        attributes: ["id", "id_trx_beasiswa", "nama_dokumen_persyaratan", "file", "status_verifikasi"],
      }),
      TrxDokumenKhusus.findAll({
        where: { id_trx_beasiswa: { [Op.in]: idList } },
        attributes: ["id", "id_trx_beasiswa", "nama_dokumen_persyaratan", "file", "status_verifikasi"],
      }),
    ]);

    const umumMap = {};
    const khususMap = {};
    for (const d of dokUmumAll) {
      if (!umumMap[d.id_trx_beasiswa]) umumMap[d.id_trx_beasiswa] = [];
      umumMap[d.id_trx_beasiswa].push({
        id: d.id, nama_dokumen_persyaratan: d.nama_dokumen_persyaratan, file: getFileUrl(req, "persyaratan", d.file), status_verifikasi: d.status_verifikasi,
      });
    }
    for (const d of dokKhususAll) {
      if (!khususMap[d.id_trx_beasiswa]) khususMap[d.id_trx_beasiswa] = [];
      khususMap[d.id_trx_beasiswa].push({
        id: d.id, nama_dokumen_persyaratan: d.nama_dokumen_persyaratan, file: getFileUrl(req, "persyaratan", d.file), status_verifikasi: d.status_verifikasi,
      });
    }

    const enrichedRows = rows.map(r => ({
      ...r.toJSON(),
      dokumen_umum: umumMap[r.id_trx_beasiswa] ?? [],
      dokumen_khusus: khususMap[r.id_trx_beasiswa] ?? [],
    }));

    const [summaryFoto, summaryDokUmum, summaryDokKhusus] = await Promise.all([
      TrxBeasiswa.count({ where: { ...whereCondition, foto: { [Op.ne]: null } } }),
      TrxDokumenUmum.count({ where: { id_trx_beasiswa: { [Op.in]: rows.map((r) => r.id_trx_beasiswa) } } }),
      TrxDokumenKhusus.count({ where: { id_trx_beasiswa: { [Op.in]: rows.map((r) => r.id_trx_beasiswa) } } }),
    ]);

    return successResponse(res, "Data berhasil dimuat", {
      result: enrichedRows,
      total: count,
      current_page: page,
      total_pages: Math.ceil(count / limit),
      summary: { total_foto: summaryFoto, total_dok_umum: summaryDokUmum, total_dok_khusus: summaryDokKhusus },
    });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.assignVerifikator = async (req, res) => {
  try {
    const { id_verifikator, ids } = req.body;

    if (!id_verifikator) return failResponse(res, "id_verifikator wajib diisi");
    if (!Array.isArray(ids) || ids.length === 0) return failResponse(res, "ids wajib diisi dan tidak boleh kosong");

    const validIds = ids.filter((id) => Number.isInteger(Number(id))).map(Number);
    if (validIds.length === 0) return failResponse(res, "Tidak ada id yang valid");

    const [updatedCount] = await TrxBeasiswa.update(
      { id_verifikator: Number(id_verifikator), updated_at: new Date() },
      { where: { id_trx_beasiswa: { [Op.in]: validIds }, id_ref_beasiswa: 1, id_flow: { [Op.ne]: 1 } } },
    );

    return successResponse(res, `Berhasil mengassign ${updatedCount} pendaftar ke verifikator`, { updated: updatedCount });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.assignVerifikatorByJumlah = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { assignments } = req.body;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      await t.rollback();
      return failResponse(res, "assignments wajib diisi dan tidak boleh kosong");
    }

    for (const item of assignments) {
      if (!item.id_verifikator || !Number.isInteger(Number(item.id_verifikator))) {
        await t.rollback();
        return failResponse(res, `id_verifikator tidak valid: ${item.id_verifikator}`);
      }
      if (!item.jumlah || Number(item.jumlah) <= 0) {
        await t.rollback();
        return failResponse(res, `jumlah harus lebih dari 0 untuk verifikator ${item.id_verifikator}`);
      }
    }

    const totalDiminta = assignments.reduce((acc, item) => acc + Number(item.jumlah), 0);

    const pool = await TrxBeasiswa.findAll({
      where: { id_ref_beasiswa: 1, id_flow: { [Op.or]: [1] }, id_verifikator: { [Op.is]: null } },
      attributes: ["id_trx_beasiswa"],
      order: sequelize.literal("RAND()"),
      limit: totalDiminta,
      transaction: t,
    });

    if (pool.length < totalDiminta) {
      await t.rollback();
      return failResponse(res, `Hanya tersedia ${pool.length} pendaftar yang sudah di-lock dan belum assign, tetapi total yang diminta ${totalDiminta}.`);
    }

    let cursor = 0;
    let totalUpdated = 0;

    for (const item of assignments) {
      const jumlah = Number(item.jumlah);
      const idVerifikator = Number(item.id_verifikator);
      const verifikator_nama = String(item.verifikator_nama);
      const slice = pool.slice(cursor, cursor + jumlah);
      cursor += jumlah;

      if (slice.length === 0) continue;

      const ids = slice.map((p) => p.id_trx_beasiswa);

      const [updatedCount] = await TrxBeasiswa.update(
        { id_verifikator: idVerifikator, verifikator_nama: verifikator_nama, updated_at: new Date(), id_flow: 2, flow: "Verifikasi" },
        { where: { id_trx_beasiswa: { [Op.in]: ids }, tag_lock_selektor: 1 }, transaction: t },
      );

      totalUpdated += updatedCount;
    }

    await t.commit();
    return successResponse(res, `Berhasil mengassign ${totalUpdated} pendaftar ke ${assignments.length} verifikator`, { total_assigned: totalUpdated, verifikator_assigned: assignments.length });
  } catch (error) {
    await t.rollback();
    return errorResponse(res, "Internal Server Error");
  }
};

exports.updateKlusterBeasiswa = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const { id_kluster } = req.body;

    const idInt = parseInt(idTrxBeasiswa);
    if (isNaN(idInt) || idInt <= 0) return failResponse(res, "id_trx_beasiswa tidak valid.");

    const klusterInt = parseInt(id_kluster);
    if (![1, 2].includes(klusterInt)) return failResponse(res, "id_kluster tidak valid. Gunakan 1 (Reguler) atau 2 (Afirmasi).");

    const namaKluster = klusterInt === 1 ? "Reguler" : "Afirmasi";

    const [result] = await sequelize.query(
      `UPDATE trx_beasiswa SET id_kluster = :id_kluster, nama_kluster = :nama_kluster, updated_at = NOW() WHERE id_trx_beasiswa = :id`,
      { replacements: { id_kluster: klusterInt, nama_kluster: namaKluster, id: idInt }, type: sequelize.QueryTypes.UPDATE }
    );

    if (result === 0) return failResponse(res, "Data tidak ditemukan.");

    return successResponse(res, `Kluster berhasil diubah menjadi ${namaKluster}`, { id_kluster: klusterInt, nama_kluster: namaKluster });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getPendaftarByProvinsiLembagaSeleksi = async (req, res) => {
  try {
    const { beasiswaId } = req.params;
    const { page = 1, search = "", kodeProvinsi } = req.query;

    const limit = 10;
    const offset = (page - 1) * limit;

    const whereCondition = { id_ref_beasiswa: beasiswaId, kode_dinas_provinsi: kodeProvinsi, id_flow: 10 };

    if (search) {
      whereCondition[Op.or] = [
        { nama_lengkap: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } },
        { nik: { [Op.like]: `%${search}%` } }, { no_hp: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa", "nama_lengkap", "nik", "email", "no_hp", "tanggal_lahir", "tempat_lahir", "jenis_kelamin",
        "tinggal_kode_prov", "tinggal_kode_kab", "tinggal_kode_kec", "tinggal_kode_kel", "tinggal_alamat", "sekolah",
        "jurusan", "tahun_lulus", "jalur", "kode_dinas_provinsi", "nama_dinas_provinsi", "kode_dinas_kabkota", "nama_dinas_kabkota",
        "status_lulus_administrasi", "status_dari_verifikator_dinas", "verifikator_catatan",
      ],
      limit, offset, order: [["id_trx_beasiswa", "DESC"]],
    });

    const result = { result: rows, total: count, total_pages: Math.ceil(count / limit), current_page: parseInt(page) };

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getPendaftarPenetapanByProvinsi = async (req, res) => {
  try {
    const { beasiswaId } = req.params;
    const { page = 1, search = "", kodeProvinsi } = req.query;

    const limit = 10;
    const offset = (parseInt(page) - 1) * limit;

    const whereCondition = { id_ref_beasiswa: beasiswaId, kode_dinas_provinsi: kodeProvinsi, id_flow: 11 };

    if (search) {
      whereCondition[Op.or] = [
        { nama_lengkap: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } },
        { nik: { [Op.like]: `%${search}%` } }, { no_hp: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa", "kode_pendaftaran", "nama_lengkap", "nik", "email", "no_hp", "tanggal_lahir", "tempat_lahir", "jenis_kelamin",
        "jalur", "kode_dinas_provinsi", "nama_dinas_provinsi", "kode_dinas_kabkota", "nama_dinas_kabkota", "status_lulus_administrasi",
        "status_hasil_analisa_rasio", "status_dari_verifikator_dinas", "verifikator_catatan", "id_flow", "flow",
      ],
      limit, offset, order: [["id_trx_beasiswa", "DESC"]],
    });

    return successResponse(res, "Data berhasil dimuat", {
      result: rows, total: count, total_pages: Math.ceil(count / limit), current_page: parseInt(page),
    });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getPendaftarPenetapan = async (req, res) => {
  try {
    const { beasiswaId } = req.params;
    const { page = 1, search = "" } = req.query;

    const limit = 10;
    const offset = (parseInt(page) - 1) * limit;

    const whereCondition = { id_ref_beasiswa: beasiswaId, id_flow: 11 };

    if (search) {
      whereCondition[Op.or] = [
        { nama_lengkap: { [Op.like]: `%${search}%` } }, { nik: { [Op.like]: `%${search}%` } },
        { no_hp: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await TrxBeasiswa.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa", "kode_pendaftaran", "nama_lengkap", "nik", "email", "no_hp", "jenis_kelamin", "tanggal_lahir", "jalur",
        "id_jalur", "kode_dinas_provinsi", "nama_dinas_provinsi", "kode_dinas_kabkota", "nama_dinas_kabkota", "status_lulus_administrasi",
        "status_hasil_analisa_rasio", "id_kluster", "nama_kluster", "id_flow", "flow",
      ],
      limit, offset, order: [["kode_dinas_provinsi", "ASC"], ["kode_dinas_kabkota", "ASC"], ["nama_lengkap", "ASC"]],
    });

    return successResponse(res, "Data berhasil dimuat", {
      result: rows, total: count, total_pages: Math.ceil(count / limit), current_page: parseInt(page),
    });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getDetailPenetapan = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;

    const trxBeasiswa = await TrxBeasiswa.findOne({
      where: { id_trx_beasiswa: idTrxBeasiswa, id_flow: 11 },
    });

    if (!trxBeasiswa) return failResponse(res, "Data tidak ditemukan atau belum berada pada tahap penetapan.", 404);

    const beasiswaData = trxBeasiswa.toJSON();

    if (beasiswaData.foto) beasiswaData.foto = getFileUrl(req, "foto", beasiswaData.foto);
    if (beasiswaData.foto_depan) beasiswaData.foto_depan = getFileUrl(req, "foto_depan", beasiswaData.foto_depan);
    if (beasiswaData.foto_samping_kiri) beasiswaData.foto_samping_kiri = getFileUrl(req, "foto_samping_kiri", beasiswaData.foto_samping_kiri);
    if (beasiswaData.foto_samping_kanan) beasiswaData.foto_samping_kanan = getFileUrl(req, "foto_samping_kanan", beasiswaData.foto_samping_kanan);
    if (beasiswaData.foto_belakang) beasiswaData.foto_belakang = getFileUrl(req, "foto_belakang", beasiswaData.foto_belakang);

    const pilihanProdi = await TrxPilihanProgramStudi.findAll({
      where: { id_trx_beasiswa: idTrxBeasiswa }, order: [["id", "ASC"]],
    });
    beasiswaData.pilihan_program_studi = pilihanProdi.map((p) => p.toJSON());

    const [dokUmum, dokKhusus, dokDinas] = await Promise.all([
      TrxDokumenUmum.findAll({ where: { id_trx_beasiswa: idTrxBeasiswa } }),
      TrxDokumenKhusus.findAll({ where: { id_trx_beasiswa: idTrxBeasiswa } }),
      TrxDokumenDinasDaerah.findAll({ where: { id_trx_beasiswa: idTrxBeasiswa } }),
    ]);

    const mapDok = (list) => list.map((item) => ({
      ...item.toJSON(), file: item.file ? getFileUrl(req, "persyaratan", item.file) : null,
    }));

    return successResponse(res, "Data berhasil dimuat", {
      data_beasiswa: beasiswaData, persyaratan_umum: mapDok(dokUmum), persyaratan_khusus: mapDok(dokKhusus), persyaratan_dinas: mapDok(dokDinas),
    });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.downloadPendaftarAssignment = async (req, res) => {
  try {
    const { filter = "all", search = "", id_verifikator } = req.query;

    const baseCondition = { id_ref_beasiswa: 1 };

    if (filter === "filter-assigned" || filter === "assigned") {
      baseCondition.id_verifikator = id_verifikator ? Number(id_verifikator) : { [Op.ne]: null };
      baseCondition.id_flow = { [Op.ne]: 0 };
    } else if (filter === "filter-unassigned" || filter === "unassigned") {
      baseCondition.id_verifikator = null;
      baseCondition.id_flow = { [Op.or]: [1] };
    }

    const whereCondition = search
      ? {
        ...baseCondition,
        [Op.or]: [
          { nama_lengkap: { [Op.like]: `%${search}%` } }, { nik: { [Op.like]: `%${search}%` } }, { kode_pendaftaran: { [Op.like]: `%${search}%` } },
        ],
      }
      : baseCondition;

    const rows = await TrxBeasiswa.findAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa", "nama_lengkap", "nik", "nkk", "no_hp", "jenis_kelamin", "tanggal_lahir", "tempat_lahir", "tahun_lulus", "kondisi_buta_warna",
        "kode_pendaftaran", "jalur", "id_verifikator", "verifikator_nama", "id_flow", "flow", "tinggal_prov", "tinggal_kab_kota", "created_at",
        "timestamp_lock_selektor" // ✅ Wajib di-load atributnya
      ],
      // ✅ SORTING EXCEL SECARA FIFO
      order: [
        ["timestamp_lock_selektor", "ASC"],
        ["id_trx_beasiswa", "ASC"]
      ],
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Data Pendaftar");

    // ✅ Header Excel diupdate (Tanggal & Waktu diganti Waktu Kunci)
    worksheet.getRow(1).values = [
      "No", "Waktu Kunci", "Kode Peserta", "Nama Peserta", "Jalur", "NIK", "NKK", "No HP", "L/P (Jenis Kelamin)",
      "Tanggal Lahir", "Tempat Lahir", "Tahun Lulus", "Buta Warna", "Status", "Nama Selektor",
    ];

    // ✅ Kolom Excel diupdate
    worksheet.columns = [
      { key: "no", width: 6 }, 
      { key: "waktu_kunci", width: 22 }, 
      { key: "kode_pendaftaran", width: 20 },
      { key: "nama_lengkap", width: 30 }, { key: "jalur", width: 20 }, { key: "nik", width: 20 }, { key: "nkk", width: 25 },
      { key: "no_hp", width: 25 }, { key: "jenis_kelamin", width: 25 }, { key: "tanggal_lahir", width: 25 }, { key: "tempat_lahir", width: 25 },
      { key: "tahun_lulus", width: 25 }, { key: "buta_warna", width: 25 }, { key: "flow", width: 25 }, { key: "selektor", width: 25 },
    ];

    rows.forEach((row, index) => {
      // ✅ Logika format Waktu Kunci 
      let waktuKunciStr = "-";
      if (row.timestamp_lock_selektor) {
        const d = new Date(row.timestamp_lock_selektor);
        const pad = (n) => String(n).padStart(2, '0');
        waktuKunciStr = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }

      worksheet.addRow({
        no: index + 1, 
        waktu_kunci: waktuKunciStr, // ✅ Memasukkan waktu_kunci ke Excel
        kode_pendaftaran: row.kode_pendaftaran || "-", 
        nama_lengkap: row.nama_lengkap || "-",
        nik: row.nik || "-", 
        nkk: row.nkk || "-", 
        no_hp: row.no_hp || "-", 
        jenis_kelamin: row.jenis_kelamin || "-", 
        tanggal_lahir: row.tanggal_lahir || "-",
        tempat_lahir: row.tempat_lahir || "-", 
        tahun_lulus: row.tahun_lulus || "-", 
        buta_warna: row.kondisi_buta_warna || "-", 
        jalur: row.jalur || "-",
        prov: row.tinggal_prov || "-", 
        kabkota: row.tinggal_kab_kota || "-", 
        flow: row.flow || "-", 
        selektor: row.verifikator_nama || "Belum ada",
      });
    });

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F0FF" } };
    });

    const label = filter === "filter-unassigned" || filter === "unassigned" ? "belum_assign" : filter === "filter-assigned" || filter === "assigned" ? "sudah_assign" : "semua";

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=pendaftar_${label}.xlsx`);

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

const buildVerifikasiDaerahWhere = ({ idBeasiswa, kodeProvinsi, kodeKabkota, dinas, search, idFlow, idJalur, statusLulus }) => {
  const baseCondition = { id_ref_beasiswa: idBeasiswa };

  if (kodeKabkota) {
    baseCondition.kode_dinas_kabkota = kodeKabkota;
  } else if (kodeProvinsi) {
    baseCondition.kode_dinas_provinsi = kodeProvinsi;
  }

  if (idJalur) baseCondition.id_jalur = Number(idJalur);

  if (statusLulus === "Y" || statusLulus === "N") {
    const ADMIN_LULUS_FLOWS = [6, 7, 9, 10, 11, 12, 13];
    if (statusLulus === "Y") {
      baseCondition.id_flow = { [Op.in]: ADMIN_LULUS_FLOWS };
    } else {
      baseCondition.id_flow = { [Op.notIn]: ADMIN_LULUS_FLOWS };
    }
  }

  if (!search) return baseCondition;

  return {
    ...baseCondition,
    [Op.or]: [
      { nama_lengkap: { [Op.like]: `%${search}%` } }, { nik: { [Op.like]: `%${search}%` } }, { kode_pendaftaran: { [Op.like]: `%${search}%` } },
    ],
  };
};

const generateExcelVerifikasiDaerah = async (res, rows, filename) => {
  const ADMIN_LULUS_FLOWS = [6, 7, 9, 10, 11, 12, 13];

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Data Verifikasi");

  worksheet.getRow(1).values = [
    "No", "Kode Pendaftaran", "Nama Lengkap", "NIK", "Jalur", "Provinsi Tinggal", "Kabupaten/Kota Tinggal", "Dinas Kabupaten/Kota", "Dinas Provinsi",
    "Status Flow", "Lulus Administrasi", "Tanggal Daftar",
  ];

  worksheet.columns = [
    { key: "no", width: 6 }, { key: "kode_pendaftaran", width: 22 }, { key: "nama_lengkap", width: 30 }, { key: "nik", width: 20 },
    { key: "jalur", width: 20 }, { key: "tinggal_prov", width: 25 }, { key: "tinggal_kab_kota", width: 25 }, { key: "nama_dinas_kabkota", width: 30 },
    { key: "nama_dinas_provinsi", width: 30 }, { key: "flow", width: 30 }, { key: "lulus_administrasi", width: 20 }, { key: "tanggal_daftar", width: 20 },
  ];

  rows.forEach((row, index) => {
    const isLulus = ADMIN_LULUS_FLOWS.includes(row.id_flow);
    worksheet.addRow({
      no: index + 1, kode_pendaftaran: row.kode_pendaftaran || "-", nama_lengkap: row.nama_lengkap || "-", nik: row.nik || "-",
      jalur: row.jalur || "-", tinggal_prov: row.tinggal_prov || "-", tinggal_kab_kota: row.tinggal_kab_kota || "-", nama_dinas_kabkota: row.nama_dinas_kabkota || "-",
      nama_dinas_provinsi: row.nama_dinas_provinsi || "-", flow: row.flow || "-", lulus_administrasi: isLulus ? "Lulus" : "Tidak Lulus",
      tanggal_daftar: row.created_at ? new Date(row.created_at).toLocaleDateString("id-ID") : "-",
    });
  });

  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F0FF" } };
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}.xlsx`);

  await workbook.xlsx.write(res);
  res.status(200).end();
};

exports.downloadVerifikasiKabkota = async (req, res) => {
  try {
    const {
      idBeasiswa, kodeProvinsi, kodeKabkota, search = "", idFlow, idJalur, statusLulus, refDokumenUmum = [], refDokumenKhusus = [],
    } = req.body;

    const whereCondition = buildVerifikasiDaerahWhere({
      idBeasiswa, kodeProvinsi, kodeKabkota, dinas: "kabkota", search, idFlow, idJalur, statusLulus,
    });

    const rows = await TrxBeasiswa.findAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa", "kode_pendaftaran", "nama_lengkap", "nik", "nkk", "no_hp", "jalur", "id_flow", "verifikator_nama",
      ],
      order: [["id_trx_beasiswa", "ASC"]],
    });

    const idTrxList = rows.map((r) => r.id_trx_beasiswa);

    const trxDokumenUmum = await TrxDokumenUmum.findAll({
      where: { id_trx_beasiswa: { [Op.in]: idTrxList } },
      attributes: ["id_trx_beasiswa", "id_ref_dokumen", "verifikator_dinas_is_valid", "status_verifikasi"],
    });

    const trxDokumenKhusus = await TrxDokumenKhusus.findAll({
      where: { id_trx_beasiswa: { [Op.in]: idTrxList } },
      attributes: ["id_trx_beasiswa", "id_ref_dokumen", "verifikasi_kabkota_is_valid", "status_verifikasi"],
    });

    const umumMap = {};
    trxDokumenUmum.forEach((d) => {
      if (!umumMap[d.id_trx_beasiswa]) umumMap[d.id_trx_beasiswa] = {};
      umumMap[d.id_trx_beasiswa][d.id_ref_dokumen] =
        d.verifikator_dinas_is_valid === "Y" ? "Sesuai"
          : d.verifikator_dinas_is_valid === "N" ? "Tidak Sesuai"
            : d.status_verifikasi || "-";
    });

    const khususMap = {};
    trxDokumenKhusus.forEach((d) => {
      if (!khususMap[d.id_trx_beasiswa]) khususMap[d.id_trx_beasiswa] = {};
      khususMap[d.id_trx_beasiswa][d.id_ref_dokumen] =
        d.verifikasi_kabkota_is_valid || d.status_verifikasi || "-";
    });

    const COLOR = {
      headerFixed: "FF1F4E79", headerDokUmum: "FF2E75B6", headerDokKhus: "FF2F5597", headerRight: "FF833C00",
      rowEven: "FFD6E4F0", rowOdd: "FFFFFFFF", borderColor: "FFB8CCE4",
    };

    const borderStyle = {
      top: { style: "thin", color: { argb: COLOR.borderColor } }, left: { style: "thin", color: { argb: COLOR.borderColor } },
      bottom: { style: "thin", color: { argb: COLOR.borderColor } }, right: { style: "thin", color: { argb: COLOR.borderColor } },
    };

    const makeHeaderCell = (ws, rowNum, colNum, value, bgColor) => {
      const cell = ws.getCell(rowNum, colNum);
      cell.value = value;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = borderStyle;
      return cell;
    };

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Verifikasi Kabkota");
    worksheet.properties.defaultRowHeight = 20;

    const fixedHeaders = ["No", "ID Pendaftar", "Nama Lengkap", "NIK", "Nomor KK", "No Handphone"];
    const umumHeaders = refDokumenUmum.map((d) => d.persyaratan);
    const khususHeaders = refDokumenKhusus.map((d) => d.persyaratan);
    const rightHeaders = ["Catatan Hasil Verifikasi *)", "Nama Verifikator"];

    const totalFixed = fixedHeaders.length;
    const totalUmum = umumHeaders.length;
    const totalKhusus = khususHeaders.length;

    const colDokStart = totalFixed + 1;
    const colUmumEnd = totalFixed + totalUmum;
    const colKhusStart = colUmumEnd + 1;
    const colKhusEnd = totalFixed + totalUmum + totalKhusus;
    const colRightStart = colKhusEnd + 1;

    fixedHeaders.forEach((h, i) => {
      worksheet.mergeCells(1, i + 1, 2, i + 1);
      makeHeaderCell(worksheet, 1, i + 1, h, COLOR.headerFixed);
    });

    if (totalUmum > 0) {
      if (totalUmum > 1) worksheet.mergeCells(1, colDokStart, 1, colUmumEnd);
      makeHeaderCell(worksheet, 1, colDokStart, "Dokumen Persyaratan Umum", COLOR.headerDokUmum);
      umumHeaders.forEach((h, i) => makeHeaderCell(worksheet, 2, colDokStart + i, h, COLOR.headerDokUmum));
    }

    if (totalKhusus > 0) {
      if (totalKhusus > 1) worksheet.mergeCells(1, colKhusStart, 1, colKhusEnd);
      makeHeaderCell(worksheet, 1, colKhusStart, "Dokumen Persyaratan Khusus", COLOR.headerDokKhus);
      khususHeaders.forEach((h, i) => makeHeaderCell(worksheet, 2, colKhusStart + i, h, COLOR.headerDokKhus));
    }

    rightHeaders.forEach((h, i) => {
      worksheet.mergeCells(1, colRightStart + i, 2, colRightStart + i);
      makeHeaderCell(worksheet, 1, colRightStart + i, h, COLOR.headerRight);
    });

    worksheet.getRow(1).height = 28;
    worksheet.getRow(2).height = 60;

    const colWidths = [5, 18, 28, 18, 18, 16, 8, ...umumHeaders.map(() => 22), ...khususHeaders.map(() => 22), 35, 22];
    colWidths.forEach((w, i) => { worksheet.getColumn(i + 1).width = w; });

    rows.forEach((row, index) => {
      const trxId = row.id_trx_beasiswa;
      const isEven = index % 2 === 1;
      const rowFill = { type: "pattern", pattern: "solid", fgColor: { argb: isEven ? COLOR.rowEven : COLOR.rowOdd } };

      const excelRow = worksheet.addRow([
        index + 1, row.kode_pendaftaran || "-", row.nama_lengkap || "-", row.nik || "-", row.nkk || "-", row.no_hp || "-",
        ...refDokumenUmum.map((d) => umumMap[trxId]?.[d.id] || "-"),
        ...refDokumenKhusus.map((d) => khususMap[trxId]?.[d.id] || "-"),
        row.verifikator_catatan || "-", row.verifikator_nama || "-",
      ]);

      excelRow.height = 18;
      excelRow.eachCell((cell, colNumber) => {
        cell.fill = rowFill; cell.border = borderStyle; cell.font = { name: "Arial", size: 10 };
        cell.alignment = { horizontal: colNumber === 3 ? "left" : "center", vertical: "middle", wrapText: false };
      });
    });

    worksheet.views = [{ state: "frozen", xSplit: totalFixed, ySplit: 2 }];

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=verifikasi_kabkota_${kodeKabkota || "semua"}.xlsx`);
    await workbook.xlsx.write(res);
    res.status(200).end();

  } catch (error) {
    return errorResponse(res, "Gagal mengunduh file Excel");
  }
};

exports.downloadVerifikasiProvinsi = async (req, res) => {
  try {
    const {
      idBeasiswa, kodeProvinsi, kodeKabkota, search = "", idFlow, idJalur, statusLulus, refDokumenUmum = [], refDokumenKhusus = [],
    } = req.body; 

    const whereCondition = buildVerifikasiDaerahWhere({
      idBeasiswa, kodeProvinsi, kodeKabkota, dinas: "provinsi", search, idFlow, idJalur, statusLulus,
    });

    const rows = await TrxBeasiswa.findAll({
      where: whereCondition,
      attributes: [
        "id_trx_beasiswa", "kode_pendaftaran", "nama_lengkap", "nik", "nkk", "no_hp", "jalur", "tinggal_kab_kota", "id_flow", "verifikator_nama",
      ],
      order: [["kode_dinas_kabkota", "ASC"], ["id_trx_beasiswa", "ASC"]],
    });

    const idTrxList = rows.map((r) => r.id_trx_beasiswa);

    const trxDokumenUmum = await TrxDokumenUmum.findAll({
      where: { id_trx_beasiswa: { [Op.in]: idTrxList } },
      attributes: ["id_trx_beasiswa", "id_ref_dokumen", "is_verifed_dinas", "status_verifikasi"],
    });

    const trxDokumenKhusus = await TrxDokumenKhusus.findAll({
      where: { id_trx_beasiswa: { [Op.in]: idTrxList } },
      attributes: ["id_trx_beasiswa", "id_ref_dokumen", "verifikasi_prov_is_valid", "status_verifikasi"],
    });

    const umumMap = {};
    trxDokumenUmum.forEach((d) => {
      if (!umumMap[d.id_trx_beasiswa]) umumMap[d.id_trx_beasiswa] = {};
      umumMap[d.id_trx_beasiswa][d.id_ref_dokumen] = d.is_verifed_dinas || d.status_verifikasi || "-";
    });

    const khususMap = {};
    trxDokumenKhusus.forEach((d) => {
      if (!khususMap[d.id_trx_beasiswa]) khususMap[d.id_trx_beasiswa] = {};
      khususMap[d.id_trx_beasiswa][d.id_ref_dokumen] = d.verifikasi_prov_is_valid || d.status_verifikasi || "-";
    });

    const COLOR = {
      headerFixed: "FF1F4E79", headerKabkota: "FF1F4E79", headerDokUmum: "FF2E75B6", headerDokKhus: "FF2F5597",
      headerRight: "FF833C00", rowEven: "FFD6E4F0", rowOdd: "FFFFFFFF", borderColor: "FFB8CCE4",
    };

    const borderStyle = {
      top: { style: "thin", color: { argb: COLOR.borderColor } }, left: { style: "thin", color: { argb: COLOR.borderColor } },
      bottom: { style: "thin", color: { argb: COLOR.borderColor } }, right: { style: "thin", color: { argb: COLOR.borderColor } },
    };

    const makeHeaderCell = (ws, rowNum, colNum, value, bgColor) => {
      const cell = ws.getCell(rowNum, colNum);
      cell.value = value;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = borderStyle;
      return cell;
    };

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Verifikasi Provinsi");
    worksheet.properties.defaultRowHeight = 20;

    const fixedHeaders = ["No", "ID Pendaftar", "Nama Lengkap", "NIK", "Nomor KK", "No Handphone", "Kabupaten", "Kategori Pendaftar : *)"];
    const umumHeaders = refDokumenUmum.map((d) => d.persyaratan);
    const khususHeaders = refDokumenKhusus.map((d) => d.persyaratan);
    const rightHeaders = ["Catatan Hasil Verifikasi **)", "Nama Verifikator"];

    const totalFixed = fixedHeaders.length;
    const totalUmum = umumHeaders.length;
    const totalKhusus = khususHeaders.length;

    const colUmumStart = totalFixed + 1;
    const colUmumEnd = totalFixed + totalUmum;
    const colKhusStart = colUmumEnd + 1;
    const colKhusEnd = totalFixed + totalUmum + totalKhusus;
    const colRightStart = colKhusEnd + 1;

    fixedHeaders.forEach((h, i) => {
      worksheet.mergeCells(1, i + 1, 2, i + 1);
      makeHeaderCell(worksheet, 1, i + 1, h, COLOR.headerFixed);
    });

    if (totalUmum > 0) {
      worksheet.mergeCells(1, colUmumStart, 1, colUmumEnd);
      makeHeaderCell(worksheet, 1, colUmumStart, "Jika berasal dari pendidikan menengah", COLOR.headerDokUmum);
      umumHeaders.forEach((h, i) => makeHeaderCell(worksheet, 2, colUmumStart + i, h, COLOR.headerDokUmum));
    }

    if (totalKhusus > 0) {
      worksheet.mergeCells(1, colKhusStart, 1, colKhusEnd);
      makeHeaderCell(worksheet, 1, colKhusStart, "Jika berasal dari pendidikan tinggi", COLOR.headerDokKhus);
      khususHeaders.forEach((h, i) => makeHeaderCell(worksheet, 2, colKhusStart + i, h, COLOR.headerDokKhus));
    }

    rightHeaders.forEach((h, i) => {
      worksheet.mergeCells(1, colRightStart + i, 2, colRightStart + i);
      makeHeaderCell(worksheet, 1, colRightStart + i, h, COLOR.headerRight);
    });

    worksheet.getRow(1).height = 40;
    worksheet.getRow(2).height = 60;

    const colWidths = [5, 18, 28, 18, 18, 16, 20, 30, ...umumHeaders.map(() => 22), ...khususHeaders.map(() => 22), 35, 22];
    colWidths.forEach((w, i) => { worksheet.getColumn(i + 1).width = w; });

    rows.forEach((row, index) => {
      const trxId = row.id_trx_beasiswa;
      const isEven = index % 2 === 1;
      const rowFill = { type: "pattern", pattern: "solid", fgColor: { argb: isEven ? COLOR.rowEven : COLOR.rowOdd } };

      const excelRow = worksheet.addRow([
        index + 1, row.kode_pendaftaran || "-", row.nama_lengkap || "-", row.nik || "-", row.nkk || "-",
        row.no_hp || "-", row.tinggal_kab_kota || "-", row.jalur || "-",
        ...refDokumenUmum.map((d) => umumMap[trxId]?.[d.id] || "-"),
        ...refDokumenKhusus.map((d) => khususMap[trxId]?.[d.id] || "-"),
        "", row.verifikator_nama || "-",
      ]);

      excelRow.height = 18;
      excelRow.eachCell((cell, colNumber) => {
        cell.fill = rowFill; cell.border = borderStyle; cell.font = { name: "Arial", size: 10 };
        cell.alignment = { horizontal: colNumber === 3 ? "left" : "center", vertical: "middle", wrapText: false };
      });
    });

    worksheet.views = [{ state: "frozen", xSplit: totalFixed, ySplit: 2 }];

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=verifikasi_provinsi_${kodeProvinsi || "semua"}.xlsx`);
    await workbook.xlsx.write(res);
    res.status(200).end();

  } catch (error) {
    return errorResponse(res, "Gagal mengunduh file Excel");
  }
};

exports.downloadRekapProvinsi = async (req, res) => {
  try {
    const { idBeasiswa, kodeProvinsi } = req.query;

    if (!kodeProvinsi) return failResponse(res, "kodeProvinsi wajib diisi");

    const rows = await TrxBeasiswa.findAll({
      where: { id_ref_beasiswa: idBeasiswa, kode_dinas_provinsi: kodeProvinsi },
      attributes: [
        "id_trx_beasiswa", "kode_pendaftaran", "nama_lengkap", "nik", "no_hp", "email", "jenis_kelamin", "tanggal_lahir", "tempat_lahir",
        "jalur", "id_flow", "flow", "kode_dinas_kabkota", "nama_dinas_kabkota", "kode_dinas_provinsi", "nama_dinas_provinsi",
        "tinggal_prov", "tinggal_kab_kota", "created_at",
      ],
      order: [["kode_dinas_kabkota", "ASC"], ["nama_lengkap", "ASC"]],
    });

    const ADMIN_LULUS_FLOWS = [6, 7, 9, 10, 11, 12, 13, 17];
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Rekap Provinsi");

    worksheet.getRow(1).values = [
      "No", "Kabupaten/Kota Dinas", "Kode Pendaftaran", "Nama Lengkap", "NIK", "No HP", "Email", "Jenis Kelamin",
      "Tanggal Lahir", "Tempat Lahir", "Jalur", "Status Flow", "Lulus Administrasi", "Tanggal Daftar",
    ];

    worksheet.columns = [
      { key: "no", width: 6 }, { key: "nama_dinas_kabkota", width: 30 }, { key: "kode_pendaftaran", width: 22 }, { key: "nama_lengkap", width: 30 },
      { key: "nik", width: 20 }, { key: "no_hp", width: 18 }, { key: "email", width: 30 }, { key: "jenis_kelamin", width: 15 },
      { key: "tanggal_lahir", width: 18 }, { key: "tempat_lahir", width: 22 }, { key: "jalur", width: 20 }, { key: "flow", width: 30 },
      { key: "lulus_administrasi", width: 20 }, { key: "tanggal_daftar", width: 20 },
    ];

    let currentKabkota = null;
    let fillColor = "FFFFFFFF";
    let no = 1;

    for (const row of rows) {
      if (row.kode_dinas_kabkota !== currentKabkota) {
        currentKabkota = row.kode_dinas_kabkota;
        fillColor = fillColor === "FFFFFFFF" ? "FFF0F7FF" : "FFFFFFFF";
      }

      const isLulus = ADMIN_LULUS_FLOWS.includes(row.id_flow);
      const excelRow = worksheet.addRow({
        no: no++, nama_dinas_kabkota: row.nama_dinas_kabkota || "-", kode_pendaftaran: row.kode_pendaftaran || "-", nama_lengkap: row.nama_lengkap || "-",
        nik: row.nik || "-", no_hp: row.no_hp || "-", email: row.email || "-", jenis_kelamin: row.jenis_kelamin || "-", tanggal_lahir: row.tanggal_lahir || "-",
        tempat_lahir: row.tempat_lahir || "-", jalur: row.jalur || "-", flow: row.flow || "-", lulus_administrasi: isLulus ? "Lulus" : "Tidak Lulus",
        tanggal_daftar: row.created_at ? new Date(row.created_at).toLocaleDateString("id-ID") : "-",
      });

      excelRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
      });
    }

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E7D32" } };
    });

    worksheet.getRow(1).height = 20;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=rekap_provinsi_${kodeProvinsi}.xlsx`);

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    return errorResponse(res, "Gagal mengunduh file Excel");
  }
};

exports.saveNilaiRapor = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const { id_ref_beasiswa, nilai_semester_1, nilai_semester_2, nilai_semester_3, nilai_semester_4, nilai_semester_5 } = req.body;

    if (!id_ref_beasiswa) return failResponse(res, "id_ref_beasiswa wajib diisi");

    const normalize = (val) => {
      if (val === "" || val === "null" || val === undefined) return null;
      return val;
    };

    const data = {
      id_ref_beasiswa, id_trx_beasiswa: idTrxBeasiswa, nilai_semester_1: normalize(nilai_semester_1), nilai_semester_2: normalize(nilai_semester_2),
      nilai_semester_3: normalize(nilai_semester_3), nilai_semester_4: normalize(nilai_semester_4), nilai_semester_5: normalize(nilai_semester_5),
      uploaded_by: req.user?.nama ?? null,
    };

    const existing = await TrxNilaiRapor.findOne({ where: { id_trx_beasiswa: idTrxBeasiswa } });

    if (existing) {
      await TrxNilaiRapor.update(data, { where: { id_trx_beasiswa: idTrxBeasiswa } });
    } else {
      await TrxNilaiRapor.create({ ...data, created_at: new Date() });
    }

    return successResponse(res, "Nilai rapor berhasil disimpan");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getNilaiRapor = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const data = await TrxNilaiRapor.findOne({ where: { id_trx_beasiswa: idTrxBeasiswa } });

    return successResponse(res, "Data berhasil dimuat", data ?? null);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.toggleLockSelektor = async (req, res) => {
  try {
    const { id_trx_beasiswa, lock } = req.body;

    if (!id_trx_beasiswa) return failResponse(res, "id_trx_beasiswa wajib diisi");

    const tagValue = lock ? "1" : "0";
    const timestampValue = lock ? new Date() : null;

    const whereClause = Array.isArray(id_trx_beasiswa) ? { id_trx_beasiswa: { [Op.in]: id_trx_beasiswa } } : { id_trx_beasiswa };

    const [updatedCount] = await TrxBeasiswa.update(
      { tag_lock_selektor: tagValue, timestamp_lock_selektor: timestampValue, updated_at: new Date() },
      { where: whereClause }
    );

    return successResponse(res, `Berhasil ${lock ? "mengunci" : "membuka kunci"} ${updatedCount} pendaftar`, { updated: updatedCount, locked: lock });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.toggleLockSelektorGlobal = async (req, res) => {
  try {
    const { lock } = req.body;

    const tagValue = lock ? "1" : "0";
    const timestampValue = lock ? new Date() : null;

    const [updatedCount] = await TrxBeasiswa.update(
      { tag_lock_selektor: tagValue, timestamp_lock_selektor: timestampValue, updated_at: new Date() },
      { where: { id_ref_beasiswa: 1, id_flow: { [Op.or]: [1] }, id_verifikator: null } }
    );

    return successResponse(res, `Berhasil ${lock ? "menguncis" : "membuka kuncis"} ${updatedCount} pendaftar`, { updated: updatedCount, locked: lock });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.kembalikanKeAdminDitjenbun = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;

    const trx = await TrxBeasiswa.findOne({
      where: { id_trx_beasiswa: idTrxBeasiswa }, attributes: ["id_trx_beasiswa", "id_flow"],
    });

    if (!trx) return failResponse(res, "Data tidak ditemukan");

    await TrxBeasiswa.update(
      { id_flow: 13, flow: "Dikembalikan - Pembagian Wilayah", updated_at: new Date() },
      { where: { id_trx_beasiswa: idTrxBeasiswa } }
    );

    return successResponse(res, "Berhasil dikembalikan ke admin Ditjenbun");
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.downloadPendaftarZip = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;
    const kategori = req.query.kategori || "all";

    const trx = await TrxBeasiswa.findOne({
      where: { id_trx_beasiswa: idTrxBeasiswa },
    });

    if (!trx) return res.status(404).json({ message: "Data tidak ditemukan" });

    const [refUmum] = await sequelizeMaster.query("SELECT id, nama_file_unduh FROM ref_syarat_umum_beasiswa");
    const [refKhusus] = await sequelizeMaster.query("SELECT id, nama_file_unduh FROM ref_syarat_khusus_beasiswa");
    
    const mapRefUmum = refUmum.reduce((acc, curr) => { acc[curr.id] = curr.nama_file_unduh; return acc; }, {});
    const mapRefKhusus = refKhusus.reduce((acc, curr) => { acc[curr.id] = curr.nama_file_unduh; return acc; }, {});

    const data = trx.toJSON();
    const folderName = safeFolderName(data);
    const zipFilename = `dokumen_${folderName}_${kategori}.zip`;

    const archive = createZipResponse(res, zipFilename);
    
    await addDokumenByKategori(archive, data, folderName, kategori, mapRefUmum, mapRefKhusus); 
    
    await archive.finalize();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
};

exports.downloadBulkZip = async (req, res) => {
  try {
    const { id_trx_beasiswa_list, kategori = "all", id_jalur } = req.body;

    if (!Array.isArray(id_trx_beasiswa_list) || id_trx_beasiswa_list.length === 0) {
      return res.status(400).json({ message: "id_trx_beasiswa_list wajib diisi dan tidak boleh kosong" });
    }

    const MAX = 200;
    const ids = id_trx_beasiswa_list.slice(0, MAX).map(Number);

    const rows = await TrxBeasiswa.findAll({
      where: { id_trx_beasiswa: { [Op.in]: ids } },
    });

    if (rows.length === 0) return res.status(404).json({ message: "Tidak ada data ditemukan" });

    const [refUmum] = await sequelizeMaster.query("SELECT id, nama_file_unduh FROM ref_syarat_umum_beasiswa");
    const [refKhusus] = await sequelizeMaster.query("SELECT id, nama_file_unduh FROM ref_syarat_khusus_beasiswa");
    
    const mapRefUmum = refUmum.reduce((acc, curr) => { acc[curr.id] = curr.nama_file_unduh; return acc; }, {});
    const mapRefKhusus = refKhusus.reduce((acc, curr) => { acc[curr.id] = curr.nama_file_unduh; return acc; }, {});

    const jalurLabel = id_jalur ? `_jalur${id_jalur}` : "";
    const catLabel = kategori !== "all" ? `_${kategori}` : "";
    const ts = new Date().toISOString().slice(0, 10);
    const zipFilename = `bulk_dokumen${jalurLabel}${catLabel}_${ts}.zip`;

    const archive = createZipResponse(res, zipFilename);

    for (const trx of rows) {
      const data = trx.toJSON();
      const folderPrefix = safeFolderName(data);
      await addDokumenByKategori(archive, data, folderPrefix, kategori, mapRefUmum, mapRefKhusus); 
    }

    await archive.finalize();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
};

exports.getStatusVerifikasiKabkota = async (req, res) => {
  try {
    const { idBeasiswa } = req.params;
    const { kode_prov } = req.user;

    const totalPerKabkota = await TrxBeasiswa.findAll({
      where: { id_ref_beasiswa: idBeasiswa, kode_dinas_provinsi: kode_prov, kode_dinas_kabkota: { [Op.ne]: null } },
      attributes: ["kode_dinas_kabkota", [fn("COUNT", col("id_trx_beasiswa")), "total"]],
      group: ["kode_dinas_kabkota"],
      raw: true,
    });

    const sudahTagPerKabkota = await TrxBeasiswa.findAll({
      where: { id_ref_beasiswa: idBeasiswa, kode_dinas_provinsi: kode_prov, kode_dinas_kabkota: { [Op.ne]: null }, tag_dinas_kabkot: "Y" },
      attributes: ["kode_dinas_kabkota", [fn("COUNT", col("id_trx_beasiswa")), "sudah_tag"]],
      group: ["kode_dinas_kabkota"],
      raw: true,
    });

    const sudahTagMap = sudahTagPerKabkota.reduce((acc, item) => {
      acc[item.kode_dinas_kabkota] = Number(item.sudah_tag);
      return acc;
    }, {});

    const result = totalPerKabkota.map((item) => ({
      kode_dinas_kabkota: item.kode_dinas_kabkota,
      total: Number(item.total),
      sudah_tag: sudahTagMap[item.kode_dinas_kabkota] ?? 0,
      selesai: (sudahTagMap[item.kode_dinas_kabkota] ?? 0) === Number(item.total),
    }));

    return successResponse(res, "Data berhasil dimuat", result);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.getKoreksiPendaftar = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;

    const koreksi = await TrxKoreksiPendaftar.findAll({
      where: { id_trx_beasiswa: idTrxBeasiswa },
      order: [['kategori', 'ASC']],
    });

    return successResponse(res, "Data berhasil dimuat", koreksi);
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};

exports.downloadPdfHasilVerifikasi = async (req, res) => {
  try {
    const { idTrxBeasiswa } = req.params;

    const beasiswa = await TrxBeasiswa.findOne({
      where: { id_trx_beasiswa: idTrxBeasiswa }
    });

    if (!beasiswa) {
      return errorResponse(res, "Data pendaftar tidak ditemukan", 404);
    }

    const dokUmum = await TrxDokumenUmum.findAll({ where: { id_trx_beasiswa: idTrxBeasiswa } });
    const dokKhusus = await TrxDokumenKhusus.findAll({ where: { id_trx_beasiswa: idTrxBeasiswa } });

    const [refUmum] = await sequelizeMaster.query("SELECT id, nama_file_unduh FROM ref_syarat_umum_beasiswa");
    const [refKhusus] = await sequelizeMaster.query("SELECT id, nama_file_unduh FROM ref_syarat_khusus_beasiswa");

    const mapRefUmum = refUmum.reduce((acc, curr) => { acc[curr.id] = curr.nama_file_unduh; return acc; }, {});
    const mapRefKhusus = refKhusus.reduce((acc, curr) => { acc[curr.id] = curr.nama_file_unduh; return acc; }, {});

    const doc = new PDFDocument({ 
      margins: { top: 50, bottom: 50, left: 50, right: 50 }, 
      size: 'A4' 
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Hasil_Verifikasi_${beasiswa.kode_pendaftaran || idTrxBeasiswa}.pdf"`
    );

    doc.pipe(res);

    const logoPath = path.join(__dirname, '../../../assets/Ditjenbun.png');
    
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { width: 120 });
    } else {
      doc.rect(50, 40, 120, 50).dash(5, {space: 5}).stroke(); 
      doc.undash();
    }

    doc.font('Helvetica-Bold').fontSize(11)
       .text("BEASISWA PENGEMBANGAN SUMBER DAYA MANUSIA", 180, 45, { align: 'center', width: 365 })
       .text("PERKEBUNAN KELAPA SAWIT", { align: 'center', width: 365 })
       .text("2026", { align: 'center', width: 365 });

    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(12)
       .text("HASIL SELEKSI ADMINISTRASI", 50, doc.y, { align: 'center', width: 495 });
    
    doc.moveDown(1.5);

    doc.fontSize(9);

    const startX1 = 50;
    const col1LabelW = 100;
    const col1ValX = startX1 + col1LabelW + 10;
    const col1ValW = 140;

    const startX2 = 310;
    const col2LabelW = 90;
    const col2ValX = startX2 + col2LabelW + 10;
    const col2ValW = 135;

    const printRow2Col = (label1, val1, label2, val2) => {
      const y = doc.y;
      const textVal1 = val1 || '-';
      const textVal2 = val2 || '-';
      
      const h1 = Math.max(doc.heightOfString(label1, {width: col1LabelW}), doc.heightOfString(textVal1, {width: col1ValW}));
      const h2 = label2 ? Math.max(doc.heightOfString(label2, {width: col2LabelW}), doc.heightOfString(textVal2, {width: col2ValW})) : 0;
      const maxH = Math.max(h1, h2);

      doc.font('Helvetica-Bold').text(label1, startX1, y, { width: col1LabelW, align: 'left' });
      doc.font('Helvetica-Bold').text(':', startX1 + col1LabelW, y, { width: 10, align: 'center' });
      doc.font('Helvetica').text(textVal1, col1ValX, y, { width: col1ValW, align: 'left' });

      if (label2) {
        doc.font('Helvetica-Bold').text(label2, startX2, y, { width: col2LabelW, align: 'left' });
        doc.font('Helvetica-Bold').text(':', startX2 + col2LabelW, y, { width: 10, align: 'center' });
        doc.font('Helvetica').text(textVal2, col2ValX, y, { width: col2ValW, align: 'left' });
      }

      doc.y = y + maxH + 5; 
    };

    printRow2Col("Kode Pendaftar", beasiswa.kode_pendaftaran, "Nama Ayah", beasiswa.ayah_nama);
    printRow2Col("Nama Pendaftar", beasiswa.nama_lengkap, "No. Telepon Ayah", beasiswa.ayah_no_hp);
    printRow2Col("NIK", beasiswa.nik, "Nama Ibu", beasiswa.ibu_nama);
    printRow2Col("Periode", beasiswa.nama_beasiswa, "No. Telepon Ibu", beasiswa.ibu_no_hp);
    printRow2Col("Kategori Pendaftaran", beasiswa.jalur, null, null);
    printRow2Col("Nomor Telepon", beasiswa.no_hp, null, null);
    printRow2Col("Alamat KTP", beasiswa.tinggal_alamat, null, null);
    printRow2Col("Alamat Kerja / Kebun", beasiswa.kerja_alamat, null, null);

    doc.moveDown(1.5);
    doc.x = 50; 

    const tableData = [];
    let no = 1;

    const processDokumen = (dokList, isKhusus = false) => {
      dokList.forEach(dok => {
        let status = dok.status_verifikasi || "Belum Diverifikasi";
        
        let namaFileRef = isKhusus ? mapRefKhusus[dok.id_ref_dokumen] : mapRefUmum[dok.id_ref_dokumen];
        
        let namaFileAsli = dok.file ? String(dok.file).split('/').pop() : "-";
        let ekstensiAsli = dok.file ? path.extname(dok.file) : ""; 

        let namaFinal = "-";

        if (namaFileRef) {
          if (!namaFileRef.includes('.')) {
            namaFinal = `${namaFileRef}${ekstensiAsli}`;
          } else {
            namaFinal = namaFileRef;
          }
        } else {
          namaFinal = namaFileAsli;
        }
        
        tableData.push([
          String(no++),
          dok.nama_dokumen_persyaratan || "-",
          namaFinal,
          status.toUpperCase()
        ]);
      });
    };

    processDokumen(dokUmum, false);
    processDokumen(dokKhusus, true);

    const table = {
      headers: [
        { label: "No.", property: "no", width: 25, align: "center" },
        { label: "Syarat", property: "syarat", width: 260 },
        { label: "Dokumen", property: "dokumen", width: 130 },
        { label: "Hasil", property: "status", width: 80, align: "center" }
      ],
      rows: tableData
    };

    await doc.table(table, {
      x: 50, 
      width: 495, 
      prepareHeader: () => doc.font("Helvetica-Bold").fontSize(9),
      prepareRow: () => doc.font("Helvetica").fontSize(8),
      padding: 5,
      divider: {
        header: { disabled: false, width: 1, opacity: 1 },
        horizontal: { disabled: false, width: 0.5, opacity: 0.5 }
      }
    });

    doc.moveDown(2);
    const dateStr = new Date().toLocaleDateString('id-ID', { 
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    
    doc.x = 50;
    doc.font('Helvetica-Oblique').fontSize(8)
       .text(`Dicetak secara otomatis dari sistem pada: ${dateStr} WIB`, 50, doc.y, { align: "left", width: 495 });

    doc.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Gagal menghasilkan PDF" });
    }
  }
};

const addHasilSeleksiPdfToArchive = async (archive, data, folderPrefix, mapRefUmum, mapRefKhusus) => {
  try {
    const idTrxBeasiswa = data.id_trx_beasiswa;
    const kodePendaftaran = data.kode_pendaftaran || "Tanpa-No";

    const dokUmum = await TrxDokumenUmum.findAll({ where: { id_trx_beasiswa } });
    const dokKhusus = await TrxDokumenKhusus.findAll({ where: { id_trx_beasiswa } });

    const doc = new PDFDocument({ 
      margins: { top: 50, bottom: 50, left: 50, right: 50 }, 
      size: 'A4' 
    });

    archive.append(doc, { name: `${folderPrefix}/${kodePendaftaran} - Hasil Seleksi Administrasi.pdf` });

    const logoPath = path.join(__dirname, '../../../assets/Ditjenbun.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { width: 120 });
    } else {
      doc.rect(50, 40, 120, 50).dash(5, {space: 5}).stroke(); 
      doc.undash();
    }

    doc.font('Helvetica-Bold').fontSize(11)
       .text("BEASISWA PENGEMBANGAN SUMBER DAYA MANUSIA", 180, 45, { align: 'center', width: 365 })
       .text("PERKEBUNAN KELAPA SAWIT", { align: 'center', width: 365 })
       .text("2026", { align: 'center', width: 365 });

    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(12)
       .text("HASIL SELEKSI ADMINISTRASI", 50, doc.y, { align: 'center', width: 495 });
    
    doc.moveDown(1.5);

    doc.fontSize(9);
    const startX1 = 50, col1ValX = 160, col1ValW = 140;
    const startX2 = 310, col2ValX = 410, col2ValW = 135;

    const printRow2Col = (label1, val1, label2, val2) => {
      const y = doc.y;
      const h1 = doc.heightOfString(val1 || '-', {width: col1ValW});
      const h2 = label2 ? doc.heightOfString(val2 || '-', {width: col2ValW}) : 0;
      const maxH = Math.max(h1, h2, 10);

      doc.font('Helvetica-Bold').text(label1, startX1, y, { width: 100 });
      doc.text(':', col1ValX - 10, y, { width: 10, align: 'center' });
      doc.font('Helvetica').text(val1 || '-', col1ValX, y, { width: col1ValW });

      if (label2) {
        doc.font('Helvetica-Bold').text(label2, startX2, y, { width: 90 });
        doc.text(':', col2ValX - 10, y, { width: 10, align: 'center' });
        doc.font('Helvetica').text(val2 || '-', col2ValX, y, { width: col2ValW });
      }
      doc.y = y + maxH + 5; 
    };

    printRow2Col("Kode Pendaftar", data.kode_pendaftaran, "Nama Ayah", data.ayah_nama);
    printRow2Col("Nama Pendaftar", data.nama_lengkap, "No. Telepon Ayah", data.ayah_no_hp);
    printRow2Col("NIK", data.nik, "Nama Ibu", data.ibu_nama);
    printRow2Col("Periode", data.nama_beasiswa, "No. Telepon Ibu", data.ibu_no_hp);
    printRow2Col("Kategori", data.jalur, null, null);
    printRow2Col("Nomor Telepon", data.no_hp, null, null);
    printRow2Col("Alamat KTP", data.tinggal_alamat, null, null);
    printRow2Col("Alamat Kerja", data.kerja_alamat, null, null);

    doc.moveDown(1.5);

    const tableData = [];
    let no = 1;
    const processRows = (list, isKhusus) => {
      list.forEach(dok => {
        let status = (dok.status_verifikasi || "Belum Diverifikasi").toUpperCase();
        let refName = isKhusus ? mapRefKhusus[dok.id_ref_dokumen] : mapRefUmum[dok.id_ref_dokumen];
        let ext = path.extname(dok.file || "");
        let nameFinal = refName ? (refName.includes('.') ? refName : `${refName}${ext}`) : (dok.file ? String(dok.file).split('/').pop() : "-");
        tableData.push([String(no++), dok.nama_dokumen_persyaratan || "-", nameFinal, status]);
      });
    };
    processRows(dokUmum, false);
    processRows(dokKhusus, true);

    await doc.table({
      headers: [
        { label: "No.", property: "no", width: 25 }, 
        { label: "Syarat", property: "s", width: 260 }, 
        { label: "Dokumen", property: "d", width: 130 }, 
        { label: "Hasil", property: "h", width: 80 }
      ],
      rows: tableData
    }, { x: 50, width: 495, prepareHeader: () => doc.font("Helvetica-Bold").fontSize(9), prepareRow: () => doc.font("Helvetica").fontSize(8), padding: 5 });

    doc.moveDown(2);
    const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.font('Helvetica-Oblique').fontSize(8).text(`Dicetak secara otomatis pada: ${dateStr} WIB`, 50, doc.y, { align: "left" });

    doc.end();

  } catch (err) {
  }
};


exports.checkNikDuplikat = async (req, res) => {
  try {
    const { nik } = req.params;
    const { id_trx_beasiswa } = req.query;

    if (!nik || nik.length !== 16) return failResponse(res, "NIK tidak valid");

    const whereClause = { nik };

    if (id_trx_beasiswa) {
      whereClause.id_trx_beasiswa = { [Op.ne]: Number(id_trx_beasiswa), id_flow: 4 };
    }

    const existing = await TrxBeasiswa.findOne({
      where: whereClause,
      attributes: ["id_trx_beasiswa", "nik", "nama_lengkap", "id_flow"],
    });

    return successResponse(res, "Pengecekan NIK duplikat selesai", {
      is_duplikat: !!existing, data: existing ?? null,
    });
  } catch (error) {
    return errorResponse(res, "Internal Server Error");
  }
};
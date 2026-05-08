const axios = require("axios");

exports.sendNotificationToQueue = async (jenis, email, isi_email) => {
  try {
    if (!process.env.NOTIFICATION_SERVICE_URL || !process.env.INTERNAL_API_KEY) {
      console.warn("[Notification Queue] Variabel env NOTIFICATION_SERVICE_URL atau INTERNAL_API_KEY belum diatur.");
      return;
    }

    await axios.post(
      `${process.env.NOTIFICATION_SERVICE_URL}/api/notifications/queue`,
      {
        jenis,
        email,
        isi_email,
      },
      {
        headers: {
          "x-api-key": process.env.INTERNAL_API_KEY,
        },
      }
    );
    console.log(`[Notification Queue] Sukses menambahkan antrean '${jenis}' ke ${email}`);
  } catch (error) {
    console.error(`[Notification Queue] Gagal menambahkan antrean '${jenis}' ke ${email}:`, error.message);
  }
};
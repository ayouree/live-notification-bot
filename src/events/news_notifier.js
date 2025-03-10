const { EmbedBuilder, ButtonBuilder, ActionRowBuilder } = require("discord.js");
const axios = require("axios");
const db = require("../db");
const config = require("../main/config");

let isProcessing = false; // Tambahkan flag untuk mencegah proses duplikasi

async function fetchNews() {
  try {
    const response = await axios.get(
      `${config.ipAddress}:${config.port}/api/news`
    );
    return response.data.berita;
  } catch (error) {
    console.error("❗ Error fetching news");
    return null;
  }
}

function truncateString(str, maxLength) {
  return str.length > maxLength ? str.substring(0, maxLength - 3) + "..." : str;
}

async function sendNewsNotifications(client) {
  if (isProcessing) {
    console.log("❗ Proses sedang berjalan, abaikan pengiriman berikutnya.");
    return;
  }

  isProcessing = true; // Set flag saat proses dimulai

  try {
    const news = await fetchNews();

    if (!news || news.length === 0) {
      isProcessing = false;
      return;
    }

    const latestNews = news[0]; // Berita terbaru
    const beritaId = latestNews.berita_id;

    // Periksa apakah berita sudah ada di database
    const exists = await new Promise((resolve, reject) => {
      db.get(
        `SELECT 1 FROM news WHERE berita_id = ?`,
        [beritaId],
        (err, row) => {
          if (err) {
            console.error("❗ Error checking news ID existence:", err.message);
            return reject(err);
          }
          resolve(!!row); // Resolusi true jika berita ditemukan
        }
      );
    });

    if (exists) {
      isProcessing = false; // Reset flag jika berita sudah ada
      return;
    }

    // Jika berita belum ada, ambil detail berita
    const newsDetailResponse = await axios.get(
      `${config.ipAddress}:${config.port}/api/news/detail/${beritaId}`
    );
    const newsDetail = newsDetailResponse.data.data;

    const avatar =
      "https://res.cloudinary.com/dag7esigq/image/upload/v1731258674/Profile_Picture_BOT_epmcfl.png";
    const description = truncateString(newsDetail.konten, 4096);

    const embed = new EmbedBuilder()
      .setAuthor({
        name: `JKT48 Live Notification`,
        iconURL: avatar,
      })
      .setTitle(newsDetail.judul)
      .setDescription(description)
      .setFooter({ text: "News JKT48 | JKT48 Live Notification" })
      .setColor("#ff0000");

    const newsButton = new ButtonBuilder()
      .setLabel("Baca Selengkapnya")
      .setURL(`https://48intens.com/news/${beritaId}`)
      .setStyle(5);

    const buttons = new ActionRowBuilder().addComponents(newsButton);

    // Send to Discord channels
    db.all("SELECT guild_id, channel_id FROM schedule_id", async (err, scheduleRows) => {
      if (err) {
        console.error("❗ Error retrieving schedule channels:", err);
        return;
      }

      const handledGuilds = new Set();

      for (const { guild_id, channel_id } of scheduleRows) {
        try {
          const channel = await client.channels.fetch(channel_id);
          if (channel) {
            await channel.send({
              embeds: [embed],
              components: [buttons],
            });
            handledGuilds.add(guild_id);
          } else {
            console.log(`❗ Channel dengan ID ${channel_id} tidak ditemukan.`);
          }
        } catch (error) {
          console.error(`❗ Gagal mengirim pengumuman ke channel ${channel_id}: ${error.message}`);
        }
      }

      // Send to whitelisted channels
      db.all("SELECT channel_id FROM whitelist", async (err, whitelistRows) => {
        if (err) {
          console.error("❗ Error retrieving whitelist channels:", err);
          return;
        }

        for (const { channel_id } of whitelistRows) {
          try {
            const channel = await client.channels.fetch(channel_id);
            if (channel && !handledGuilds.has(channel.guild.id)) {
              await channel.send({
                embeds: [embed],
                components: [buttons],
              });
            }
          } catch (error) {
            console.error(`❗ Gagal mengirim pengumuman ke channel ${channel_id}: ${error.message}`);
          }
        }
      });
    });

    // Send to webhooks
    db.all("SELECT url FROM webhook", async (err, webhookRows) => {
      if (err) {
        console.error("❗ Error retrieving webhook URLs:", err.message);
        return;
      }

      if (webhookRows.length === 0) {
        return null;
      }

      for (const webhook of webhookRows) {
        try {
          await axios.post(webhook.url, {
            content: null,
            embeds: [embed.toJSON()],
            components: [buttons.toJSON()],
            username: config.webhook.name,
            avatar_url: config.webhook.avatar,
          });
        } catch (error) {
          console.error(`❗ Gagal mengirim notifikasi ke webhook ${webhook.url}: ${error.message}`);
        }
      }
    });

    // Simpan berita ke database setelah berhasil dikirim
    db.run(`INSERT INTO news (berita_id) VALUES (?)`, [beritaId], (err) => {
      if (err) {
        console.error("❗ Failed to insert new news ID into database:", err);
      } else {
        console.log(`❗ Berita ${beritaId} berhasil disimpan di database!`);
      }
    });
  } catch (error) {
    console.error("❗ Error during news notification process:", error.message);
  } finally {
    isProcessing = false; // Reset flag setelah proses selesai
  }
}

// Fungsi untuk mendapatkan semua channel schedule dari semua server
async function getAllScheduleChannels() {
  return new Promise((resolve, reject) => {
    db.all("SELECT guild_id, channel_id FROM schedule_id", (err, rows) => {
      if (err) {
        console.error("Failed to retrieve schedule channels:", err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

// Fungsi untuk mendapatkan channel whitelist dari whitelist.db
async function getWhitelistedChannels() {
  return new Promise((resolve, reject) => {
    db.all("SELECT channel_id FROM whitelist", (err, rows) => {
      if (err) {
        console.error("Failed to retrieve whitelisted channels:", err);
        return reject(err);
      }
      resolve(rows.map((row) => row.channel_id));
    });
  });
}

module.exports = (client) => {
  setInterval(() => sendNewsNotifications(client), 30000);
};

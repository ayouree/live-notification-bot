const axios = require("axios");
const cheerio = require("cheerio");

const fetchNewsData = async () => {
  const url = "https://jkt48.com/news/list?lang=id";

  try {
    const response = await axios.get(url);
    const data = response.data;

    if (typeof data !== "string") {
      throw new Error("Expected a string response from the server");
    }

    return data; // Kembalikan HTML ke pemanggil
  } catch (error) {
    console.error("Error fetching or parsing news data:", error.message);
    return null; // Kembalikan null jika terjadi kesalahan
  }
};

const parseNewsData = (html) => {
  if (typeof html !== "string") {
    throw new Error("Invalid HTML content passed to parseNewsData");
  }

  const $ = cheerio.load(html);
  const data = {};
  const list_berita_mentah = $(".entry-news__list");
  const data_list_berita = [];
  const size_of_berita = list_berita_mentah.length;
  let position_berita = 0;

  while (position_berita < size_of_berita) {
    const model = {};
    const berita_mentah = list_berita_mentah.eq(position_berita);

    const badge_div = berita_mentah.find(".entry-news__list--label");
    const badge_img = badge_div.find("img");
    if (badge_img.attr("src")) {
      model["badge_url"] = badge_img.attr("src");
    }

    const title_div = berita_mentah.find(".entry-news__list--item");

    const waktu = title_div.find("time").text();
    model["waktu"] = waktu;

    const judul = title_div.find("h3").text();
    model["judul"] = judul;

    const url_berita_full = title_div.find("h3").find("a").attr("href");
    if (url_berita_full) {
      const url_berita_full_rplc = url_berita_full.replace("?lang=id", "");
      const url_berita_full_rplc_2 = url_berita_full_rplc.replace(
        "/news/detail/id/",
        ""
      );
      model["berita_id"] = url_berita_full_rplc_2;
    }

    data_list_berita.push(model);
    position_berita += 1;
  }

  data["berita"] = data_list_berita;
  return data;
};

module.exports = {
  fetchNewsData,
  parseNewsData,
};

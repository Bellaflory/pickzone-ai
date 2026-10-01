export default async function handler(req, res) {

  const query = String(req.query.q || "")
    .trim();

  if (!query) {
    return res.status(400).json({
      error: "Suchbegriff fehlt."
    });
  }

  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "FMP_API_KEY fehlt."
    });
  }

  try {

    const url =
      "https://financialmodelingprep.com/stable/search-symbol" +
      "?query=" + encodeURIComponent(query) +
      "&limit=10" +
      "&apikey=" + encodeURIComponent(apiKey);

    const response = await fetch(url);

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      data = rawText;
    }

    return res.status(200).json({

      debug: true,

      query: query,

      fmpStatus: response.status,

      fmpOK: response.ok,

      response: data

    });

  } catch (error) {

    return res.status(500).json({

      error: "Verbindung zu FMP fehlgeschlagen.",

      details: String(error.message || error)

    });

  }

}

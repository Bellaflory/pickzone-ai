export default async function handler(req, res) {

  const query = String(req.query.q || "")
    .trim();

  if (!query) {
    return res.status(200).json([]);
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
      "?query=" +
      encodeURIComponent(query) +
      "&limit=10" +
      "&apikey=" +
      encodeURIComponent(apiKey);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `FMP Fehler ${response.status}`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return res.status(200).json([]);
    }

    const results = data
      .filter(item =>
        item &&
        item.symbol &&
        item.name
      )
      .slice(0, 10)
      .map(item => ({
        symbol: item.symbol,
        name: item.name,
        exchange:
          item.exchangeShortName ||
          item.exchange ||
          ""
      }));

    return res.status(200).json(results);

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error:
        "Die Aktiensuche konnte nicht geladen werden."
    });

  }
}

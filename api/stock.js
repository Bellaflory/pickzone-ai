export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "AAPL")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");

  if (!symbol) {
    return res.status(400).json({ error: "Aktien-Symbol fehlt." });
  }

  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "FMP_API_KEY ist auf dem Server nicht konfiguriert."
    });
  }

  try {
    const url =
      `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}` +
      `&apikey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(502).json({
        error: "FMP konnte nicht erreicht werden."
      });
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({
        error: `Keine Daten für ${symbol} gefunden.`
      });
    }

    const stock = data[0];

    return res.status(200).json({
      symbol: stock.symbol,
      name: stock.name,
      price: stock.price,
      change: stock.change,
      changePercentage: stock.changePercentage,
      marketCap: stock.marketCap,
      volume: stock.volume,
      timestamp: Date.now()
    });

  } catch (error) {
    return res.status(500).json({
      error: "Beim Laden der Börsendaten ist ein Fehler aufgetreten."
    });
  }
}

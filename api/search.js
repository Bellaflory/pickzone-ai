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

  const base =
    "https://financialmodelingprep.com/stable";

  async function request(endpoint) {

    const url =
      `${base}/${endpoint}` +
      `?query=${encodeURIComponent(query)}` +
      `&limit=10` +
      `&apikey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    return Array.isArray(data)
      ? data
      : [];
  }

  try {

    /*
     * Nach Symbol suchen.
     * Beispiel: AAPL, TSLA, AMD
     */
    const symbolResults =
      await request("search-symbol");


    /*
     * Zusätzlich nach Firmenname suchen.
     * Beispiel: Apple, Tesla, Netflix
     */
    const nameResults =
      await request("search-name");


    /*
     * Beide Ergebnislisten verbinden.
     */
    const combined = [
      ...symbolResults,
      ...nameResults
    ];


    /*
     * Doppelte Aktien entfernen.
     */
    const unique = new Map();

    for (const item of combined) {

      if (!item?.symbol) {
        continue;
      }

      const symbol =
        String(item.symbol)
          .toUpperCase();


      /*
       * Nur Ergebnisse mit Symbol
       * übernehmen.
       */
      if (!unique.has(symbol)) {

        unique.set(symbol, {

          symbol,

          name:
            item.name ||
            symbol,

          exchange:
            item.exchangeShortName ||
            item.exchange ||
            "",

          currency:
            item.currency ||
            ""

        });

      }

    }


    /*
     * Maximal 10 Treffer
     */
    const results =
      Array.from(
        unique.values()
      ).slice(0, 10);


    return res
      .status(200)
      .json(results);


  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error:
        "Die Aktiensuche konnte nicht geladen werden."
    });

  }

}

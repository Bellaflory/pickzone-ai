export default async function handler(req, res) {

  const query = String(req.query.q || "").trim();

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

  async function search(endpoint) {

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
     * Gleichzeitig nach Firmenname
     * und Börsensymbol suchen.
     */
    const [
      nameResults,
      symbolResults
    ] = await Promise.all([

      search("search-name"),

      search("search-symbol")

    ]);


    /*
     * Ergebnisse zusammenführen.
     */
    const combined = [
      ...nameResults,
      ...symbolResults
    ];


    /*
     * Doppelte Symbole entfernen.
     */
    const unique = new Map();

    for (const item of combined) {

      if (!item?.symbol) {
        continue;
      }

      if (!unique.has(item.symbol)) {

        unique.set(
          item.symbol,
          {
            symbol:
              item.symbol,

            name:
              item.name ||
              item.symbol,

            exchange:
              item.exchangeShortName ||
              item.exchange ||
              ""
          }
        );

      }

    }


    /*
     * Maximal 10 Ergebnisse
     * an PickZone senden.
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

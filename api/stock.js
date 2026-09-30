export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "AAPL")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");

  if (!symbol) {
    return res.status(400).json({
      error: "Aktien-Symbol fehlt."
    });
  }

  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "FMP_API_KEY fehlt."
    });
  }

  const base =
    "https://financialmodelingprep.com/stable";

  async function fmp(endpoint) {
    const separator =
      endpoint.includes("?") ? "&" : "?";

    const url =
      `${base}${endpoint}${separator}` +
      `apikey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `FMP Fehler ${response.status}`
      );
    }

    return response.json();
  }

  try {
    /*
     * Aktueller Kurs
     */
    const quoteData =
      await fmp(
        `/quote?symbol=${encodeURIComponent(symbol)}`
      );

    if (
      !Array.isArray(quoteData) ||
      quoteData.length === 0
    ) {
      return res.status(404).json({
        error: `Keine Daten für ${symbol} gefunden.`
      });
    }

    const quote = quoteData[0];


    /*
     * Weitere Daten parallel laden.
     *
     * Falls der kostenlose FMP-Tarif einen
     * Datensatz nicht freigibt, soll die
     * komplette Aktie trotzdem funktionieren.
     */
    const [
      ratiosResult,
      incomeResult,
      historyResult
    ] = await Promise.allSettled([

      fmp(
        `/ratios?symbol=${encodeURIComponent(symbol)}&limit=1`
      ),

      fmp(
        `/income-statement?symbol=${encodeURIComponent(symbol)}&limit=2&period=annual`
      ),

      fmp(
        `/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}`
      )

    ]);


    const ratios =
      ratiosResult.status === "fulfilled" &&
      Array.isArray(ratiosResult.value)
        ? ratiosResult.value[0] || null
        : null;


    const income =
      incomeResult.status === "fulfilled" &&
      Array.isArray(incomeResult.value)
        ? incomeResult.value
        : [];


    const history =
      historyResult.status === "fulfilled" &&
      Array.isArray(historyResult.value)
        ? historyResult.value
        : [];


    /*
     * Umsatzwachstum aus den letzten
     * zwei verfügbaren Jahresberichten.
     */
    let revenueGrowth = null;

    if (
      income.length >= 2 &&
      Number(income[0]?.revenue) &&
      Number(income[1]?.revenue)
    ) {
      revenueGrowth =
        (
          Number(income[0].revenue) /
          Number(income[1].revenue)
          - 1
        ) * 100;
    }


    /*
     * Gewinnwachstum
     */
    let earningsGrowth = null;

    if (
      income.length >= 2 &&
      Number(income[0]?.netIncome) &&
      Number(income[1]?.netIncome)
    ) {
      const previous =
        Number(income[1].netIncome);

      if (previous !== 0) {
        earningsGrowth =
          (
            Number(income[0].netIncome) /
            previous
            - 1
          ) * 100;
      }
    }


    /*
     * Momentum:
     * ungefähr 6 Monate / 126 Handelstage.
     */
    let momentum6m = null;

    if (history.length >= 2) {
      const sorted =
        [...history].sort(
          (a, b) =>
            new Date(b.date) -
            new Date(a.date)
        );

      const latest =
        Number(sorted[0]?.close);

      const oldIndex =
        Math.min(
          125,
          sorted.length - 1
        );

      const old =
        Number(sorted[oldIndex]?.close);

      if (
        Number.isFinite(latest) &&
        Number.isFinite(old) &&
        old > 0
      ) {
        momentum6m =
          (latest / old - 1) * 100;
      }
    }


    /*
     * Volatilität aus täglichen Renditen.
     * Hier zunächst ca. 3 Monate.
     */
    let volatility = null;

    if (history.length >= 20) {
      const sorted =
        [...history]
          .sort(
            (a, b) =>
              new Date(b.date) -
              new Date(a.date)
          )
          .slice(0, 63)
          .reverse();

      const returns = [];

      for (
        let i = 1;
        i < sorted.length;
        i++
      ) {
        const previous =
          Number(sorted[i - 1]?.close);

        const current =
          Number(sorted[i]?.close);

        if (
          previous > 0 &&
          current > 0
        ) {
          returns.push(
            current / previous - 1
          );
        }
      }

      if (returns.length > 1) {
        const mean =
          returns.reduce(
            (sum, value) =>
              sum + value,
            0
          ) / returns.length;

        const variance =
          returns.reduce(
            (sum, value) =>
              sum +
              Math.pow(
                value - mean,
                2
              ),
            0
          ) /
          (returns.length - 1);

        /*
         * Annualisierte Volatilität
         */
        volatility =
          Math.sqrt(variance) *
          Math.sqrt(252) *
          100;
      }
    }


    return res.status(200).json({

      symbol: quote.symbol,
      name: quote.name,

      price: quote.price,

      change: quote.change,

      changePercentage:
        quote.changePercentage,

      marketCap:
        quote.marketCap,

      volume:
        quote.volume,


      /*
       * Fundamentaldaten
       */
      fundamentals: {

        peRatio:
          ratios?.priceToEarningsRatio ??
          ratios?.priceEarningsRatio ??
          null,

        priceToBook:
          ratios?.priceToBookRatio ??
          null,

        returnOnEquity:
          ratios?.returnOnEquity ??
          null,

        netMargin:
          ratios?.netProfitMargin ??
          null,

        debtToEquity:
          ratios?.debtToEquityRatio ??
          null,

        currentRatio:
          ratios?.currentRatio ??
          null,

        revenueGrowth,

        earningsGrowth

      },


      /*
       * Marktfaktoren
       */
      marketFactors: {

        momentum6m,

        volatility

      },


      /*
       * Zeigt uns, welche Daten der
       * aktuelle FMP-Tarif bereitstellt.
       */
      availability: {

        ratios:
          ratios !== null,

        incomeStatements:
          income.length > 0,

        historicalPrices:
          history.length > 0

      },


      timestamp:
        Date.now()

    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error:
        "PickZone konnte die Finanzdaten nicht laden."
    });

  }
}

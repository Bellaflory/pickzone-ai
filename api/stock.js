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


  /*
   * Hilfsfunktionen für Scores
   */

  function clamp(value, min = 0, max = 100) {
    return Math.min(
      max,
      Math.max(min, value)
    );
  }


  function linearScore(
    value,
    bad,
    good,
    reverse = false
  ) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return null;
    }

    if (bad === good) {
      return 50;
    }

    let score;

    if (reverse) {

      score =
        100 *
        (bad - number) /
        (bad - good);

    } else {

      score =
        100 *
        (number - bad) /
        (good - bad);

    }

    return clamp(score);
  }


  function averageAvailable(values) {

    const valid =
      values.filter(
        value =>
          Number.isFinite(value)
      );

    if (!valid.length) {
      return null;
    }

    return (
      valid.reduce(
        (sum, value) =>
          sum + value,
        0
      ) / valid.length
    );
  }


  function roundScore(value) {

    if (!Number.isFinite(value)) {
      return null;
    }

    return Math.round(
      clamp(value)
    );
  }


  try {

    /*
     * 1. Aktueller Kurs
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
        error:
          `Keine Daten für ${symbol} gefunden.`
      });

    }

    const quote =
      quoteData[0];


    /*
     * 2. Fundamentaldaten +
     * historische Kurse
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
     * 3. Fundamentale Kennzahlen
     */

    const peRatio =
      ratios?.priceToEarningsRatio ??
      ratios?.priceEarningsRatio ??
      null;


    const priceToBook =
      ratios?.priceToBookRatio ??
      null;


    const returnOnEquity =
      ratios?.returnOnEquity ??
      null;


    const netMargin =
      ratios?.netProfitMargin ??
      null;


    const debtToEquity =
      ratios?.debtToEquityRatio ??
      null;


    const currentRatio =
      ratios?.currentRatio ??
      null;


    /*
     * 4. Umsatzwachstum
     */

    let revenueGrowth = null;

    if (
      income.length >= 2 &&
      Number.isFinite(
        Number(income[0]?.revenue)
      ) &&
      Number.isFinite(
        Number(income[1]?.revenue)
      ) &&
      Number(income[1]?.revenue) !== 0
    ) {

      revenueGrowth =
        (
          Number(income[0].revenue) /
          Number(income[1].revenue)
          - 1
        ) * 100;

    }


    /*
     * 5. Gewinnwachstum
     */

    let earningsGrowth = null;

    if (
      income.length >= 2 &&
      Number.isFinite(
        Number(income[0]?.netIncome)
      ) &&
      Number.isFinite(
        Number(income[1]?.netIncome)
      ) &&
      Number(income[1]?.netIncome) !== 0
    ) {

      earningsGrowth =
        (
          Number(income[0].netIncome) /
          Number(income[1].netIncome)
          - 1
        ) * 100;

    }


    /*
     * 6. Historische Kurse sortieren
     */

    const sortedHistory =
      [...history].sort(
        (a, b) =>
          new Date(b.date) -
          new Date(a.date)
      );


    /*
     * 7. 6-Monats-Momentum
     */

    let momentum6m = null;

    if (sortedHistory.length >= 2) {

      const latest =
        Number(
          sortedHistory[0]?.close
        );

      const oldIndex =
        Math.min(
          125,
          sortedHistory.length - 1
        );

      const old =
        Number(
          sortedHistory[oldIndex]?.close
        );

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
     * 8. Annualisierte Volatilität
     */

    let volatility = null;

    if (sortedHistory.length >= 20) {

      const recent =
        sortedHistory
          .slice(0, 63)
          .reverse();

      const returns = [];

      for (
        let i = 1;
        i < recent.length;
        i++
      ) {

        const previous =
          Number(
            recent[i - 1]?.close
          );

        const current =
          Number(
            recent[i]?.close
          );

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


        volatility =
          Math.sqrt(variance) *
          Math.sqrt(252) *
          100;

      }

    }


    /*
     * ===================================
     * PICKZONE 5-FAKTOR-SCORING
     * ===================================
     *
     * 0 = schwächer nach diesem Modell
     * 100 = stärker nach diesem Modell
     */


    /*
     * VALUE
     *
     * Niedrigeres KGV und KBV
     * erhalten höhere Teil-Scores.
     */

    const peScore =
      Number(peRatio) > 0
        ? linearScore(
            peRatio,
            45,
            10,
            true
          )
        : null;


    const pbScore =
      Number(priceToBook) > 0
        ? linearScore(
            priceToBook,
            10,
            1,
            true
          )
        : null;


    const valueScore =
      roundScore(
        averageAvailable([
          peScore,
          pbScore
        ])
      );


    /*
     * QUALITY
     *
     * Profitabilität,
     * Verschuldung und Liquidität.
     *
     * FMP liefert einige Ratios
     * als Dezimalzahl.
     */

    const roePercent =
      Number.isFinite(
        Number(returnOnEquity)
      )
        ? Number(returnOnEquity) * 100
        : null;


    const marginPercent =
      Number.isFinite(
        Number(netMargin)
      )
        ? Number(netMargin) * 100
        : null;


    const roeScore =
      linearScore(
        roePercent,
        0,
        30
      );


    const marginScore =
      linearScore(
        marginPercent,
        0,
        30
      );


    const debtScore =
      Number(debtToEquity) >= 0
        ? linearScore(
            debtToEquity,
            3,
            0.3,
            true
          )
        : null;


    const liquidityScore =
      linearScore(
        currentRatio,
        0.5,
        2
      );


    const qualityScore =
      roundScore(
        averageAvailable([
          roeScore,
          marginScore,
          debtScore,
          liquidityScore
        ])
      );


    /*
     * GROWTH
     */

    const revenueGrowthScore =
      linearScore(
        revenueGrowth,
        -5,
        25
      );


    const earningsGrowthScore =
      linearScore(
        earningsGrowth,
        -10,
        30
      );


    const growthScore =
      roundScore(
        averageAvailable([
          revenueGrowthScore,
          earningsGrowthScore
        ])
      );


    /*
     * MOMENTUM
     */

    const momentumScore =
      roundScore(
        linearScore(
          momentum6m,
          -20,
          30
        )
      );


    /*
     * RISK
     *
     * Hier bedeutet ein hoher Score:
     * geringeres historisches Risiko.
     */

    const riskScore =
      roundScore(
        linearScore(
          volatility,
          60,
          15,
          true
        )
      );


    /*
     * Gesamt-Score.
     *
     * Nur vorhandene Faktoren werden
     * berücksichtigt.
     */

    const totalScore =
      roundScore(
        averageAvailable([
          valueScore,
          qualityScore,
          growthScore,
          momentumScore,
          riskScore
        ])
      );


    /*
     * 9. Antwort an PickZone
     */

    return res.status(200).json({

      symbol:
        quote.symbol,

      name:
        quote.name,

      price:
        quote.price,

      change:
        quote.change,

      changePercentage:
        quote.changePercentage,

      marketCap:
        quote.marketCap,

      volume:
        quote.volume,


      scores: {

        total:
          totalScore,

        value:
          valueScore,

        quality:
          qualityScore,

        growth:
          growthScore,

        momentum:
          momentumScore,

        risk:
          riskScore

      },


      fundamentals: {

        peRatio,
        priceToBook,
        returnOnEquity,
        netMargin,
        debtToEquity,
        currentRatio,
        revenueGrowth,
        earningsGrowth

      },


      marketFactors: {

        momentum6m,
        volatility

      },


      availability: {

        ratios:
          ratios !== null,

        incomeStatements:
          income.length > 0,

        historicalPrices:
          history.length > 0

      },


      methodology: {

        version:
          "PickZone Score v1",

        scale:
          "0-100",

        factors: [
          "Value",
          "Quality",
          "Growth",
          "Momentum",
          "Risk"
        ]

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

// Part 3 text. Written for the Submitted Run below; if the data changes (a new seed), rewrite this text.
const FINDINGS_RUN_ID = "RUN-1791958945117";

const FINDINGS = [
  {
    title: "Two categories carry the result, and the profit shown is before overheads",
    observation: "Drinks and Ready-to-eat produced most of the sales and gross profit.",
    evidence:
      "Together they made A$140,876.00 of A$220,073.50 revenue (64.0%) and A$78,500.90 of A$115,106.80 gross profit (68.2%). " +
      "Ready-to-eat was 20.4% of units but 30.8% of revenue.",
    links: [
      { label: "Business Performance: category table", page: "business" },
      { label: "Model Declaration: assumptions", page: "declaration" },
    ],
    recorded: "The next-largest category, Snacks & Confectionery, made A$32,868.10.",
    assumed:
      "The concentration most likely comes from the assumed lunch and snack shopping missions and assumed prices, not observed behaviour.",
    implication:
      "Keeping these lines in stock matters most. Closing cash of A$163,193.50 is before rent, wages and utilities, so it does not show the store is viable.",
    recommendation:
      "Secure dependable daily supply for drinks and ready-to-eat lines, then compare real trial sales with these category shares and add overhead costs before judging viability.",
    limitation: "Prices, costs and demand are assumed; overheads are outside the model.",
  },
  {
    title: "Short-life food lines both run out and get written off",
    observation: "Short-life food lines sold out and expired in the same run.",
    evidence:
      "All A$695.60 of write-offs came from Ready-to-eat (A$552.80) and Fresh & Bakery (A$142.80). " +
      "Butter Croissant accounted for 12 of the 25 sold-out events and turned customers away on 10 days, yet 44 croissants (A$57.20) still expired.",
    links: [
      { label: "Inventory & Operations: material cases", page: "operations" },
      { label: "Day 3: first croissant sell-out", day: 3 },
    ],
    recorded:
      "Croissant sold out again the next day after 6 of its 12 sell-outs, even though orders were placed (12 units after the first, on Day 3).",
    assumed: "Orders sized from a 7-day average and capped by shelf life likely cannot follow daily swings.",
    implication:
      "Write-offs are small (under 1% of A$104,966.70 COGS), but the value of lost sales is not totalled; only 15 product-days of unmet demand are counted.",
    recommendation:
      "Raise the order target for fast short-life lines, starting with croissants, and trial a late-day markdown on batches flagged for expiry; then compare write-offs and unmet-demand days.",
    limitation: "No substitution or markdown is modelled.",
  },
  {
    title: "A few specialty lines sell almost nothing",
    observation: "Four specialty lines barely sold, and the Store Brain flagged them nearly every week.",
    evidence:
      "Rice Crackers (35 units sold), Olive Oil (12), Sunscreen (20) and Truffle Salt (22) earned A$748.00 revenue and A$358.00 gross profit, " +
      "were flagged slow-moving 7-8 times each, and left 171 units on hand.",
    links: [
      { label: "Inventory & Operations: slow movers", page: "operations" },
      { label: "Business Performance: weakest products", page: "business" },
      { label: "Day 7: first slow-mover flags", day: 7 },
    ],
    recorded: "13 of 16 flagged products were first flagged on Day 7, but only these four stayed flagged; none was reordered.",
    assumed: "Short-lived flags likely reflect generous opening stock being sold down; these four likely reflect weak demand.",
    implication: "Unsold stock ties up working capital and shelf space for about 0.3% of revenue.",
    recommendation:
      "Delist these four or cut them to a small display quantity, trial a markdown to clear the 171 units, and set opening quantities for slow lines from real sales data.",
    limitation: "Shelf space is not modelled and demand for these items is assumed.",
  },
];

export default function Findings({ runId, goToDay, goToPage }) {
  const open = (link) => (link.day ? goToDay(link.day) : goToPage(link.page));

  return (
    <section>
      <h2>Findings &amp; Recommendations</h2>
      <p>What should the client consider next? Three findings from the Business Performance and Inventory &amp; Operations reports.</p>
      {runId !== FINDINGS_RUN_ID && (
        <p className="error">
          These findings were written for {FINDINGS_RUN_ID}. You are viewing {runId}, so the figures quoted may not match this run.
        </p>
      )}

      {FINDINGS.map((f, i) => (
        <div className="panel" key={i}>
          <h3>Finding {i + 1}: {f.title}</h3>
          <p><strong>Observation:</strong> {f.observation}</p>
          <p>
            <strong>Evidence:</strong> {f.evidence}
            <br />
            <span className="small">
              Trace it:{" "}
              {f.links.map((l, j) => (
                <span key={j}>
                  {j > 0 && " | "}
                  <button className="link" onClick={() => open(l)}>{l.label}</button>
                </span>
              ))}
            </span>
          </p>
          <p><strong>Diagnosis:</strong></p>
          <ul>
            <li><em>What the recorded data shows:</em> {f.recorded}</li>
            <li><em>What is assumed or inferred:</em> {f.assumed}</li>
          </ul>
          <p><strong>Business implication:</strong> {f.implication}</p>
          <p><strong>Recommendation:</strong> {f.recommendation}</p>
          <p className="small"><strong>Model limitation:</strong> {f.limitation}</p>
        </div>
      ))}
    </section>
  );
}

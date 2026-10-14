import { useEffect, useState } from "react";
import { fetchJson } from "../api.js";

const money = (x) =>
  "A$" + Number(x).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The six declaration sections: heading and key in config.declaration.
const SECTIONS = [
  ["1. Customer activity", "customerGeneration"],
  ["2. Shopping behaviour and product demand", "shoppingBehaviour"],
  ["3. Perishable stock and shelf life", "perishables"],
  ["4. How the Store Brain identifies stock, expiry and slow-moving conditions", "storeBrain"],
  ["5. Replenishment under the cash constraint", "replenishment"],
  ["6. Other assumptions", "otherAssumptions"],
];

// Store Brain rules: [key in config.storeBrain, label, how to show the value].
const RULES = [
  ["avgSalesWindowDays", "Average daily sales are measured over", (v) => `${v} days`],
  ["lowStockCoverDays", "Low stock if days of cover is below", (v) => `${v} days`],
  ["expiryWarningDays", "Expiry warning if a batch expires within", (v) => `${v} days`],
  ["slowMoverCoverDays", "Slow mover if days of cover is above", (v) => `${v} days`],
  ["minDaysOfData", "Slow-mover check needs at least", (v) => `${v} days of sales`],
  ["slowReviewEveryDays", "Slow movers are reviewed every", (v) => `${v} days`],
  ["targetCoverDays", "Replenishment target", (v) => `${v} days of average sales`],
  ["perishableMaxCoverFraction", "Perishable target is capped at", (v) => `${v * 100}% of shelf life`],
  ["minOrderQty", "Minimum order", (v) => `${v} units`],
  ["lastDay", "No order is placed at the end of day", (v) => `${v}`],
];

export default function ModelDeclaration({ runId }) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchJson(`/api/runs/${runId}`).then(setRun).catch((e) => setError(e.message));
  }, [runId]);

  if (error) return <p className="error">Could not load the run: {error}</p>;
  if (!run) return <p className="loading">Loading...</p>;

  const { config, products } = run;
  const openingCost = products.reduce((sum, p) => sum + p.unit_cost * p.initial_qty, 0);
  const budget = config.inventoryBudget;

  return (
    <section>
      <h2>Model Declaration</h2>

      <h3>Run</h3>
      <table>
        <tbody>
          <tr><th>Run ID</th><td>{run.run_id}</td></tr>
          <tr><th>Status</th><td>{run.status}</td></tr>
          <tr><th>Created</th><td>{new Date(run.created_at).toLocaleString()}</td></tr>
          <tr><th>Submitted Run</th><td>{run.is_submitted === 1 ? "Yes" : "No"}</td></tr>
          <tr><th>Simulated days</th><td>{config.days}</td></tr>
          <tr><th>Random seed</th><td>{config.model.seed}</td></tr>
        </tbody>
      </table>

      <h3>Budget and cash</h3>
      <table>
        <tbody>
          <tr><th>Opening inventory cost (calculated from the product list)</th><td className="num">{money(openingCost)}</td></tr>
          <tr><th>Opening inventory budget (maximum)</th><td className="num">{money(budget)}</td></tr>
          <tr><th>Unused inventory budget</th><td className="num">{money(budget - openingCost)}</td></tr>
          <tr><th>Within budget</th><td>{openingCost <= budget ? "Yes" : "No"}</td></tr>
          <tr><th>Opening operating cash (available for replenishment from Day 1)</th><td className="num">{money(run.opening_cash)}</td></tr>
        </tbody>
      </table>
      <p>
        Unused inventory budget does not become operating cash. Opening inventory is paid for from the inventory
        budget, not from operating cash. Rent, wages, utilities, fit-out and other overheads are outside the model.
      </p>

      {SECTIONS.map(([title, key]) => (
        <div key={key}>
          <h3>{title}</h3>
          <p>{config.declaration[key]}</p>
          {key === "perishables" && <p><strong>Expiry rule:</strong> {config.expiryRule}</p>}
          {key === "replenishment" && (
            <>
              <h4>Store Brain rule values (frozen for this run)</h4>
              <table>
                <thead><tr><th>Rule</th><th>Value</th></tr></thead>
                <tbody>
                  {RULES.map(([k, label, show]) => (
                    <tr key={k}><td>{label}</td><td>{show(config.storeBrain[k])}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ))}

      <h3>Product data ({products.length} products)</h3>
      <table>
        <thead>
          <tr>
            <th>ID</th><th>Name</th><th>Category</th>
            <th className="num">Unit cost</th><th className="num">Unit price</th>
            <th className="num">Opening qty</th><th>Perishable</th><th className="num">Shelf life (days)</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.product_id}>
              <td>{p.product_id}</td>
              <td>{p.name}</td>
              <td>{p.category}</td>
              <td className="num">{p.unit_cost.toFixed(2)}</td>
              <td className="num">{p.unit_price.toFixed(2)}</td>
              <td className="num">{p.initial_qty.toLocaleString()}</td>
              <td>{p.is_perishable ? "Yes" : "No"}</td>
              <td className="num">{p.shelf_life_days ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Status of this model</h3>
      <p>
        This is a pre-operational prototype. The store does not exist yet, so every customer, demand, price and cost
        figure here is a modelling assumption, not observed data. Real operating data would be needed to calibrate and
        validate the model before relying on it commercially.
      </p>
    </section>
  );
}

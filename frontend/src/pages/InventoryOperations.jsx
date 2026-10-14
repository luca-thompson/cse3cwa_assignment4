import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { fetchJson } from "../api.js";
import { money, int } from "../format.js";
import ProductHistory from "../ProductHistory.jsx";

// Every event type the Store Brain can record, with what it does about it.
const EVENT_ROWS = [
  ["low_stock", "Low stock", "Orders up to the target cover"],
  ["sold_out", "Sold out", "Orders up to the target cover; sold-out products are ranked first"],
  ["expiry_warning", "Expiry warning", "Flags the batch; sold earliest-expiry first (no markdown)"],
  ["expired_removed", "Expired stock removed", "Removed from sale and written off at cost"],
  ["slow_mover", "Slow mover", "Not reordered; reviewed weekly"],
  ["replenishment", "Replenishment order", "Paid from operating cash; arrives before opening next day"],
  ["cash_constrained", "Cash-constrained order", "Order reduced or skipped to stay within available cash"],
  ["stockout_demand", "Customer demand unmet", "Customer wanted an unavailable product; sale lost, no substitution"],
];

const None = () => <p className="small">None recorded in this run.</p>;
const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);

export default function InventoryOperations({ runId, goToDay }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [productId, setProductId] = useState(null);

  useEffect(() => {
    fetchJson(`/api/runs/${runId}/report/operations`).then(setData).catch((e) => setError(e.message));
  }, [runId]);

  if (error) return <p className="error">Could not load the report: {error}</p>;
  if (!data) return <p className="loading">Loading...</p>;

  const { eventCounts, stockouts, expiredByCategory, expiredByProduct, slowMovers, replenishment, closingByCategory, materialCases } = data;
  const productLink = (id, name) => <button className="link" onClick={() => setProductId(id)}>{name}</button>;

  return (
    <section>
      <h2>Inventory &amp; Operations</h2>
      <p>What operational problems occurred, and what did the Store Brain do?</p>

      <h3>1. Inventory health</h3>
      <table>
        <tbody>
          <tr><th>Sold-out conditions at close of day</th><td className="num">{int(stockouts.count)}</td></tr>
          <tr><th>Days on which customers were turned away (product-days)</th><td className="num">{int(eventCounts.stockout_demand)}</td></tr>
          <tr><th>Low-stock events</th><td className="num">{int(eventCounts.low_stock)}</td></tr>
          <tr><th>Units expired and written off</th><td className="num">{int(sum(expiredByCategory, "units"))}</td></tr>
          <tr><th>Write-off value (at cost)</th><td className="num">{money(sum(expiredByCategory, "value"), 2)}</td></tr>
          <tr><th>Replenishment orders placed</th><td className="num">{int(replenishment.total.orders)}</td></tr>
          <tr><th>Units replenished</th><td className="num">{int(replenishment.total.units)}</td></tr>
          <tr><th>Replenishment spending</th><td className="num">{money(replenishment.total.spend)}</td></tr>
          <tr><th>Closing inventory (units, at cost)</th><td className="num">{int(sum(closingByCategory, "units"))} units, {money(sum(closingByCategory, "value"), 2)}</td></tr>
        </tbody>
      </table>

      <h3>Stockouts: products most often sold out at close</h3>
      {stockouts.topProducts.length === 0 ? <None /> : (
        <table>
          <thead><tr><th>Product</th><th className="num">Days sold out</th></tr></thead>
          <tbody>
            {stockouts.topProducts.map((p) => (
              <tr key={p.product_id}><td>{productLink(p.product_id, p.name)}</td><td className="num">{p.daysSoldOut}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Expired stock and write-offs</h3>
      {expiredByCategory.length === 0 ? <None /> : (
        <>
          <table>
            <thead><tr><th>Category</th><th className="num">Units expired</th><th className="num">Write-off value</th></tr></thead>
            <tbody>
              {expiredByCategory.map((c) => (
                <tr key={c.name}><td>{c.name}</td><td className="num">{int(c.units)}</td><td className="num">{money(c.value, 2)}</td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={expiredByCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                <YAxis tickFormatter={(v) => "$" + v} />
                <Tooltip formatter={(v) => money(v, 2)} />
                <Bar dataKey="value" name="Write-off value" fill="#e8a33d" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <h4>Top products by write-off value</h4>
          <table>
            <thead><tr><th>Product</th><th className="num">Units expired</th><th className="num">Write-off value</th></tr></thead>
            <tbody>
              {expiredByProduct.slice(0, 10).map((p) => (
                <tr key={p.name}><td>{p.name}</td><td className="num">{int(p.units)}</td><td className="num">{money(p.value, 2)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>Slow-moving products</h3>
      {slowMovers.length === 0 ? <None /> : (
        <table>
          <thead><tr><th>Product</th><th className="num">Weekly flags</th><th className="num">First flagged (day)</th><th className="num">Closing units</th></tr></thead>
          <tbody>
            {slowMovers.map((p) => (
              <tr key={p.product_id}>
                <td>{productLink(p.product_id, p.name)}</td>
                <td className="num">{p.flags}</td>
                <td className="num"><button className="link" onClick={() => goToDay(p.firstFlaggedDay)}>{p.firstFlaggedDay}</button></td>
                <td className="num">{int(p.closingUnits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Replenishment by category</h3>
      <table>
        <thead><tr><th>Category</th><th className="num">Orders</th><th className="num">Units</th><th className="num">Spending</th></tr></thead>
        <tbody>
          {replenishment.byCategory.map((c) => (
            <tr key={c.name}><td>{c.name}</td><td className="num">{int(c.orders)}</td><td className="num">{int(c.units)}</td><td className="num">{money(c.spend)}</td></tr>
          ))}
        </tbody>
      </table>

      <h3>Closing inventory by category</h3>
      <table>
        <thead><tr><th>Category</th><th className="num">Units</th><th className="num">Value at cost</th></tr></thead>
        <tbody>
          {closingByCategory.map((c) => (
            <tr key={c.category}><td>{c.category}</td><td className="num">{int(c.units)}</td><td className="num">{money(c.value, 2)}</td></tr>
          ))}
        </tbody>
      </table>

      <h3>2. Store Brain operations</h3>
      <table>
        <thead><tr><th>Event type</th><th className="num">Count</th><th>Store Brain response</th></tr></thead>
        <tbody>
          {EVENT_ROWS.map(([key, label, response]) => (
            <tr key={key}><td>{label}</td><td className="num">{int(eventCounts[key])}</td><td>{response}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="small">
        A count of zero means that event never occurred in this run. Orders reduced because of insufficient cash: {data.constrainedOrders}.
      </p>

      <h3>3. Material cases: condition, action, outcome</h3>
      {materialCases.length === 0 ? <None /> : (
        <table>
          <thead><tr><th>Type</th><th>Product</th><th>Condition detected</th><th>Action taken</th><th>Recorded outcome</th><th>Daily Report</th></tr></thead>
          <tbody>
            {materialCases.map((c, i) => (
              <tr key={i}>
                <td>{c.type}</td>
                <td>{productLink(c.product_id, c.name || c.product_id)}</td>
                <td>{c.condition}</td>
                <td>{c.action}</td>
                <td>{c.outcome}</td>
                <td><button className="link" onClick={() => goToDay(c.day)}>Day {c.day}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small">For write-off and stockout cases, the link opens the first day the problem occurred.</p>

      {productId && <ProductHistory runId={runId} productId={productId} onClose={() => setProductId(null)} onDay={goToDay} />}
    </section>
  );
}

import { useEffect, useState } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";
import { fetchJson } from "../api.js";
import { money, int, pct } from "../format.js";
import ProductHistory from "../ProductHistory.jsx";

export default function BusinessPerformance({ runId, goToDay }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [productId, setProductId] = useState(null);

  useEffect(() => {
    fetchJson(`/api/runs/${runId}/report/business`).then(setData).catch((e) => setError(e.message));
  }, [runId]);

  if (error) return <p className="error">Could not load the report: {error}</p>;
  if (!data) return <p className="loading">Loading...</p>;

  const { totals: t, averages: a, weekdayWeekend, daily, byCategory, topByRevenue, weakest } = data;
  const margin = t.grossProfit / t.revenue;
  const weekday = weekdayWeekend.find((r) => r.kind === "weekday");
  const weekend = weekdayWeekend.find((r) => r.kind === "weekend");
  const weakestShare = weakest.reduce((s, p) => s + p.revenue, 0) / t.revenue;
  const topTwoShare = (byCategory[0].revenue + byCategory[1].revenue) / t.revenue;

  const kpis = [
    ["Customers", int(t.customers)],
    ["Transactions", int(t.transactions)],
    ["Units sold", int(t.unitsSold)],
    ["Revenue", money(t.revenue)],
    ["COGS", money(t.cogs)],
    ["Gross profit", `${money(t.grossProfit)} (${pct(margin)})`],
    ["Write-off value", money(t.writeOffValue)],
    ["Closing cash", money(t.closingCash)],
    ["Closing inventory (at cost)", money(t.closingInventoryValue)],
  ];

  return (
    <section>
      <h2>Business Performance</h2>
      <p>What happened to the business over the {daily.length} days?</p>

      <ul>
        <li>
          The store served {int(t.customers)} customers and took {money(t.revenue)} in sales, for a gross profit of{" "}
          {money(t.grossProfit)} ({pct(margin)} margin) before overheads, which are outside the model.
        </li>
        <li>
          {byCategory[0].category} and {byCategory[1].category} together brought in {pct(topTwoShare)} of revenue, while the ten
          slowest-selling products brought in only {pct(weakestShare)}.
        </li>
        <li>
          An average weekday had {weekday.avgCustomers.toFixed(0)} customers and {money(weekday.avgRevenue)} in sales, against{" "}
          {weekend.avgCustomers.toFixed(0)} customers and {money(weekend.avgRevenue)} at weekends ({pct(1 - weekend.avgCustomers / weekday.avgCustomers)} fewer customers).
        </li>
      </ul>

      <div className="kpis">
        {kpis.map(([label, value]) => (
          <div className="kpi" key={label}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{value}</div>
          </div>
        ))}
      </div>

      <h3>Shoppers and baskets</h3>
      <table>
        <tbody>
          <tr><th>Average customers per day</th><td className="num">{a.customersPerDay.toFixed(1)}</td></tr>
          <tr><th>Average basket size (units per transaction)</th><td className="num">{a.basketSizeUnits.toFixed(2)}</td></tr>
          <tr><th>Average transaction value</th><td className="num">{money(a.transactionValue, 2)}</td></tr>
        </tbody>
      </table>
      <table>
        <thead>
          <tr><th>Day type</th><th className="num">Days</th><th className="num">Avg customers per day</th><th className="num">Avg revenue per day</th></tr>
        </thead>
        <tbody>
          {weekdayWeekend.map((r) => (
            <tr key={r.kind}>
              <td>{r.kind === "weekday" ? "Weekday (Mon-Fri)" : "Weekend (Sat-Sun)"}</td>
              <td className="num">{r.days}</td>
              <td className="num">{r.avgCustomers.toFixed(1)}</td>
              <td className="num">{money(r.avgRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">The weekend average includes the one-off Town Hall festival Saturday, which lifts it.</p>

      <h3>Customers and revenue by day</h3>
      <p className="small">Click a bar to open that day's Daily Report.</p>
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <ComposedChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis yAxisId="left" tickFormatter={(v) => "$" + v / 1000 + "k"} />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip formatter={(v, name) => (name === "Revenue" ? money(v, 2) : v)} labelFormatter={(d) => "Day " + d} />
            <Legend />
            <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#93b4f0" cursor="pointer" onClick={(d) => goToDay(d.payload.day)} />
            <Line yAxisId="right" dataKey="customers" name="Customers" stroke="#d9480f" dot={false} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <h3>Performance by category</h3>
      <table>
        <thead>
          <tr><th>Category</th><th className="num">Units</th><th className="num">Revenue</th><th className="num">Gross profit</th><th className="num">Margin</th></tr>
        </thead>
        <tbody>
          {byCategory.map((c) => (
            <tr key={c.category}>
              <td>{c.category}</td>
              <td className="num">{int(c.units)}</td>
              <td className="num">{money(c.revenue)}</td>
              <td className="num">{money(c.grossProfit)}</td>
              <td className="num">{pct(c.grossProfit / c.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Top 10 products by revenue</h3>
      <ProductTable rows={topByRevenue} onProduct={setProductId} />

      <h3>Bottom 10 products by units sold (weak sellers)</h3>
      <ProductTable rows={weakest} onProduct={setProductId} />

      {productId && <ProductHistory runId={runId} productId={productId} onClose={() => setProductId(null)} onDay={goToDay} />}
    </section>
  );
}

function ProductTable({ rows, onProduct }) {
  return (
    <table>
      <thead>
        <tr><th>Product</th><th>Category</th><th className="num">Units</th><th className="num">Revenue</th><th className="num">Gross profit</th></tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.product_id}>
            <td><button className="link" onClick={() => onProduct(p.product_id)}>{p.name}</button></td>
            <td>{p.category}</td>
            <td className="num">{int(p.units)}</td>
            <td className="num">{money(p.revenue)}</td>
            <td className="num">{money(p.grossProfit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

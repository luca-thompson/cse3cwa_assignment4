import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { fetchJson } from "../api.js";
import { money, int } from "../format.js";
import ProductHistory from "../ProductHistory.jsx";

const DAYS = 60;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const weekdayName = (d) => WEEKDAYS[(d - 1) % 7]; // Day 1 is a Monday (as in the model configuration)

export default function DailyReport({ runId, day, setDay }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [txn, setTxn] = useState(null);
  const [txnError, setTxnError] = useState(null);
  const [productId, setProductId] = useState(null);

  useEffect(() => {
    let current = true; // ignore a slow response if the day has changed again
    setData(null);
    setError(null);
    setTxn(null);
    fetchJson(`/api/runs/${runId}/daily/${day}`)
      .then((d) => current && setData(d))
      .catch((e) => current && setError(e.message));
    return () => { current = false; };
  }, [runId, day]);

  function openTxn(id) {
    setTxnError(null);
    fetchJson(`/api/runs/${runId}/transactions/${id}`).then(setTxn).catch((e) => setTxnError(e.message));
  }

  const selector = (
    <div className="day-bar">
      <button onClick={() => setDay(day - 1)} disabled={day <= 1}>Previous</button>
      <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
        {Array.from({ length: DAYS }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>Day {d}</option>
        ))}
      </select>
      <button onClick={() => setDay(day + 1)} disabled={day >= DAYS}>Next</button>
    </div>
  );

  if (error) return <section><h2>Daily Report</h2>{selector}<p className="error">Could not load day {day}: {error}</p></section>;
  if (!data) return <section><h2>Daily Report</h2>{selector}<p className="loading">Loading...</p></section>;

  const { summary: s, hourly, products, brainEvents, orders, transactions } = data;
  const names = Object.fromEntries(products.map((p) => [p.product_id, p.name]));
  const soldOut = new Set(brainEvents.filter((e) => e.event_type === "sold_out").map((e) => e.product_id));
  const lowStock = new Set(brainEvents.filter((e) => e.event_type === "low_stock").map((e) => e.product_id));
  const rowClass = (id) => (soldOut.has(id) ? "soldout" : lowStock.has(id) ? "low" : "");

  const kpis = [
    ["Customers", int(s.customers)],
    ["Transactions", int(s.transactions)],
    ["Units sold", int(s.units_sold)],
    ["Revenue", money(s.revenue, 2)],
    ["COGS", money(s.cogs, 2)],
    ["Expired units", `${int(s.expired_units)} (${money(s.expired_value, 2)})`],
    ["Closing cash", money(s.closing_cash, 2)],
    ["Closing inventory (at cost)", money(s.closing_inventory_value, 2)],
  ];

  return (
    <section>
      <h2>Daily Report</h2>
      {selector}
      <h3>Day {day}: {weekdayName(day)} ({(day - 1) % 7 >= 5 ? "weekend" : "weekday"})</h3>

      <div className="kpis">
        {kpis.map(([label, value]) => (
          <div className="kpi" key={label}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{value}</div>
          </div>
        ))}
      </div>

      <h3>Customers by hour</h3>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={hourly}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" />
            <YAxis allowDecimals={false} />
            <Tooltip labelFormatter={(h) => `${h}:00`} />
            <Bar dataKey="customers" name="Customers" fill="#93b4f0" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3>Product movement</h3>
      <p className="small">
        <span className="swatch soldout" /> sold out at close &nbsp; <span className="swatch low" /> low stock at close (Store Brain alert).
        Closing = opening + received - sold - expired.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Product</th><th className="num">Opening</th><th className="num">Received</th>
              <th className="num">Sold</th><th className="num">Expired</th><th className="num">Closing</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.product_id} className={rowClass(p.product_id)}>
                <td><button className="link" onClick={() => setProductId(p.product_id)}>{p.name}</button></td>
                <td className="num">{p.opening}</td>
                <td className="num">{p.received}</td>
                <td className="num">{p.sold}</td>
                <td className="num">{p.expired}</td>
                <td className="num">{p.closing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Store Brain events ({brainEvents.length})</h3>
      {brainEvents.length === 0 ? <p className="small">No events recorded on this day.</p> : (
        <div className="scroll">
          <table>
            <thead><tr><th>Event</th><th>Product</th><th>Detail</th><th>Action taken</th></tr></thead>
            <tbody>
              {brainEvents.map((e) => (
                <tr key={e.event_id}>
                  <td>{e.event_type}</td>
                  <td><button className="link" onClick={() => setProductId(e.product_id)}>{names[e.product_id] || e.product_id}</button></td>
                  <td>{e.detail}</td>
                  <td>{e.action_taken}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Orders placed this day ({orders.length})</h3>
      {orders.length === 0 ? <p className="small">No orders placed on this day{day === DAYS ? " (no orders are placed after the final day)" : ""}.</p> : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th><th className="num">Requested</th><th className="num">Ordered</th><th className="num">Cost</th>
                <th className="num">Cash before</th><th className="num">Cash after</th><th>Limited by cash</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.order_id}>
                  <td><button className="link" onClick={() => setProductId(o.product_id)}>{o.name}</button></td>
                  <td className="num">{o.requested_qty}</td>
                  <td className="num">{o.qty}</td>
                  <td className="num">{money(o.cost, 2)}</td>
                  <td className="num">{money(o.cash_before, 2)}</td>
                  <td className="num">{money(o.cash_after, 2)}</td>
                  <td>{o.was_constrained ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Transactions ({transactions.length})</h3>
      <p className="small">Click a transaction number to see its line items.</p>
      {txnError && <p className="error">Could not load the transaction: {txnError}</p>}
      {txn && (
        <div className="panel">
          <strong>Transaction {txn.transaction.txn_id}</strong>: day {txn.transaction.day}, {txn.transaction.hour}:00, customer {txn.transaction.customer_id}{" "}
          ({txn.transaction.customer_type}, {txn.transaction.mission})
          <table>
            <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Line total</th></tr></thead>
            <tbody>
              {txn.lines.map((l) => (
                <tr key={l.product_id}>
                  <td>{l.name}</td>
                  <td className="num">{l.qty}</td>
                  <td className="num">{money(l.unit_price, 2)}</td>
                  <td className="num">{money(l.line_total, 2)}</td>
                </tr>
              ))}
              <tr><th colSpan={3}>Total</th><th className="num">{money(txn.transaction.total, 2)}</th></tr>
            </tbody>
          </table>
          <button onClick={() => setTxn(null)}>Close</button>
        </div>
      )}
      <div className="scroll">
        <table>
          <thead><tr><th>Transaction</th><th className="num">Hour</th><th className="num">Total</th></tr></thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.txn_id}>
                <td><button className="link" onClick={() => openTxn(t.txn_id)}>{t.txn_id}</button></td>
                <td className="num">{t.hour}:00</td>
                <td className="num">{money(t.total, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {productId && <ProductHistory runId={runId} productId={productId} onClose={() => setProductId(null)} onDay={setDay} />}
    </section>
  );
}

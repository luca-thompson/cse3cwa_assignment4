import { useEffect, useState } from "react";
import { fetchJson } from "../api.js";
import { money, int } from "../format.js";

const Status = ({ value }) => <strong className={value === "PASS" ? "pass" : "fail"}>{value}</strong>;
const countType = (exceptions, ...types) => exceptions.filter((e) => types.includes(e.type)).length;

export default function Assurance({ runId, goToDay }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchJson(`/api/runs/${runId}/assurance`).then(setData).catch((e) => setError(e.message));
  }, [runId]);

  if (error) return <p className="error">Could not load the assurance checks: {error}</p>;
  if (!data) return <p className="loading">Loading...</p>;

  const { completeness: c, inventory, revenue, cash, immutability, exceptions, disclosures } = data;
  const t = inventory.totals;
  const failedChecks = [c, inventory, revenue, cash, immutability].filter((x) => x.status !== "PASS").length;
  const dayLink = (d) => <button className="link" onClick={() => goToDay(d)}>{d}</button>;

  return (
    <section>
      <h2>Commercial Assurance</h2>
      <p>Can the client trust the report? Every check below is recomputed from the stored history of this run.</p>

      <div className={data.overall === "PASS" ? "banner submitted" : "banner fail-banner"}>
        Overall: <Status value={data.overall} />{" "}
        {data.overall === "PASS"
          ? "All checks passed with no exceptions."
          : `${failedChecks} check(s) failed, ${exceptions.length} exception(s) listed below.`}
      </div>

      <h3>1. History completeness <Status value={c.status} /></h3>
      <table>
        <tbody>
          <tr><th>Run ID</th><td>{data.runId}</td></tr>
          <tr><th>Run status</th><td>{c.runStatus}</td></tr>
          <tr><th>Days retained</th><td>{c.daysRetained}/{c.expectedDays}</td></tr>
          {Object.entries(c.counts).map(([name, n]) => (
            <tr key={name}><th>{name.replace("_", " ")} retained</th><td className="num">{int(n)}</td></tr>
          ))}
        </tbody>
      </table>

      <h3>2. Inventory reconciliation <Status value={inventory.status} /></h3>
      <p>
        Opening stock {int(t.opening)} + replenishment received {int(t.replenished)} - units sold {int(t.sold)} - units expired{" "}
        {int(t.expired)} = closing stock <strong>{int(t.opening + t.replenished - t.sold - t.expired)}</strong> units
        (reported closing stock: {int(t.closing)}; value at cost {money(t.closingValue, 2)}).
      </p>
      <table>
        <tbody>
          <tr><th>Negative stock events</th><td className="num">{countType(exceptions, "negative_stock", "negative_closing_stock")}</td></tr>
          <tr><th>Overselling (units sold beyond stock available)</th><td className="num">{countType(exceptions, "overselling")}</td></tr>
          <tr><th>Sales of expired products</th><td className="num">{countType(exceptions, "expired_sale")}</td></tr>
        </tbody>
      </table>
      <p className="small">
        Each product's closing stock is also checked against its batch (lot) records, its units sold against the transaction lines,
        and its units received against the orders.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Product</th><th className="num">Opening</th><th className="num">+ Received</th><th className="num">- Sold</th>
              <th className="num">- Expired</th><th className="num">= Closing</th><th className="num">Closing per batches</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {inventory.products.map((p) => (
              <tr key={p.product_id} className={p.ok ? "" : "fail-row"}>
                <td>{p.name}</td>
                <td className="num">{p.opening}</td>
                <td className="num">{p.replenished}</td>
                <td className="num">{p.sold}</td>
                <td className="num">{p.expired}</td>
                <td className="num">{p.closing}</td>
                <td className="num">{p.closingFromLots}</td>
                <td><Status value={p.ok ? "PASS" : "FAIL"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>3. Revenue reconciliation <Status value={revenue.status} /></h3>
      <table>
        <tbody>
          <tr><th>60-day revenue: sum of the daily revenue figures</th><td className="num">{money(revenue.totalFromDaily, 2)}</td></tr>
          <tr><th>60-day revenue: sum of all recorded transaction totals</th><td className="num">{money(revenue.totalFromTransactions, 2)}</td></tr>
        </tbody>
      </table>
      <p className="small">For each day: daily revenue = sum of that day's transaction totals = sum of that day's transaction lines. Each transaction total is also checked against its own lines.</p>
      <details>
        <summary>Show the per-day revenue check</summary>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Day</th><th className="num">Daily summary revenue</th><th className="num">Sum of transactions</th><th className="num">Sum of lines</th><th>Status</th></tr>
            </thead>
            <tbody>
              {revenue.days.map((d) => (
                <tr key={d.day} className={d.ok ? "" : "fail-row"}>
                  <td>{dayLink(d.day)}</td>
                  <td className="num">{money(d.summary_revenue, 2)}</td>
                  <td className="num">{money(d.transaction_total, 2)}</td>
                  <td className="num">{money(d.line_total, 2)}</td>
                  <td><Status value={d.ok ? "PASS" : "FAIL"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <h3>4. Operating-cash reconciliation <Status value={cash.status} /></h3>
      <p>
        Opening cash {money(cash.openingCash, 2)} + sales revenue {money(cash.salesRevenue, 2)} - replenishment spending{" "}
        {money(cash.replenishmentSpend, 2)} = <strong>{money(cash.expectedClosing, 2)}</strong>.
      </p>
      <table>
        <tbody>
          <tr><th>Closing cash per cash ledger</th><td className="num">{money(cash.ledgerClosing, 2)}</td></tr>
          <tr><th>Closing cash per Day 60 summary</th><td className="num">{money(cash.summaryClosing, 2)}</td></tr>
          <tr><th>Orders checked against cash available when placed</th><td className="num">{int(cash.ordersChecked)}</td></tr>
          <tr><th>Orders that exceeded the cash available</th><td className="num">{cash.failingOrders.length}</td></tr>
        </tbody>
      </table>
      {cash.failingOrders.length > 0 && (
        <table>
          <thead><tr><th>Order</th><th>Day</th><th>Product</th><th>Problem</th></tr></thead>
          <tbody>
            {cash.failingOrders.map((o) => (
              <tr key={o.order_id} className="fail-row"><td>{o.order_id}</td><td>{dayLink(o.day)}</td><td>{o.product_id}</td><td>{o.problem}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>5. Exceptions</h3>
      {exceptions.length === 0 ? <p><strong className="pass">No exceptions.</strong> No integrity failures or unexplained movements were found.</p> : (
        <div className="scroll">
          <table>
            <thead><tr><th>Check</th><th>Type</th><th>Day</th><th>Product / item</th><th>Details</th></tr></thead>
            <tbody>
              {exceptions.map((e, i) => (
                <tr key={i} className="fail-row">
                  <td>{e.check}</td>
                  <td>{e.type || "-"}</td>
                  <td>{e.day ? dayLink(e.day) : "-"}</td>
                  <td>{e.product_id || e.lot_id || e.txn_id || "-"}</td>
                  <td>{e.value !== undefined ? String(e.value) : e.detail || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>6. Business outcomes disclosed (not integrity failures)</h3>
      <p className="small">
        Stockouts, expiry, slow movers and low cash are legitimate simulated outcomes. They are recorded correctly and discussed in the
        commercial analysis; they do not mean the history is unreliable.
      </p>
      <table>
        <thead><tr><th>Outcome</th><th className="num">Count</th></tr></thead>
        <tbody>
          {disclosures.map((d) => (
            <tr key={d.key}><td>{d.text}</td><td className="num">{int(d.count)}</td></tr>
          ))}
        </tbody>
      </table>

      <h3>7. History cannot be edited <Status value={immutability.status} /></h3>
      <table>
        <tbody>
          <tr><th>Protection triggers present</th><td>{immutability.triggersExpected - immutability.missingTriggers.length} of {immutability.triggersExpected}</td></tr>
          <tr><th>Frozen configuration stored for this run</th><td>{immutability.configPresent ? "Yes" : "No"}</td></tr>
          {immutability.missingTriggers.length > 0 && <tr><th>Missing triggers</th><td>{immutability.missingTriggers.join(", ")}</td></tr>}
        </tbody>
      </table>
      <p>
        Transactions, inventory movements, orders, cash and Store Brain records, and the run's products and configuration, are protected by
        database triggers that reject any UPDATE or DELETE. The application has no feature that edits or deletes history: it only reads it,
        or creates a new run. Only a run's status and its Submitted flag can change.
      </p>
    </section>
  );
}

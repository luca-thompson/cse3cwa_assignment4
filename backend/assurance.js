// Commercial assurance: integrity checks computed from the stored history of one run.
// Everything is recomputed from the history tables; daily_summary is only cross-checked.
const db = require("./db");

const TOL = 0.005; // money tolerance (half a cent)
const q1 = (sql, ...p) => db.prepare(sql).get(...p);
const qAll = (sql, ...p) => db.prepare(sql).all(...p);
const r2 = (x) => Math.round(x * 100) / 100;
const verdict = (ok) => (ok ? "PASS" : "FAIL");

// Must match the triggers created in db.js.
const HISTORY_TABLES = ["stock_lots", "inventory_events", "customers", "transactions", "transaction_lines",
  "orders", "cash_ledger", "brain_events", "daily_summary"];

function checkRun(runId) {
  const run = q1("SELECT * FROM runs WHERE run_id = ?", runId);
  if (!run) throw new Error("Run not found: " + runId);
  let config = null;
  try { config = JSON.parse(run.config_json); } catch (e) { /* reported below */ }
  const expectedDays = (config && config.days) || 60;
  const exceptions = [];
  const addException = (check, detail) => exceptions.push({ check, ...detail });
  const failed = (check) => exceptions.some((e) => e.check === check);

  // ---- 1. History completeness ----
  const counts = {};
  for (const t of ["transactions", "transaction_lines", "inventory_events", "orders", "brain_events", "cash_ledger", "customers"]) {
    counts[t] = q1(`SELECT COUNT(*) AS n FROM ${t} WHERE run_id = ?`, runId).n;
  }
  const d = q1("SELECT COUNT(DISTINCT day) AS n, MIN(day) AS first, MAX(day) AS last FROM daily_summary WHERE run_id = ?", runId);
  if (!(run.status === "completed" && d.n === expectedDays && d.first === 1 && d.last === expectedDays &&
        counts.transactions > 0 && counts.transaction_lines > 0 && counts.inventory_events > 0 && counts.cash_ledger > 0 && counts.customers > 0)) {
    addException("completeness", { detail: `status ${run.status}, ${d.n}/${expectedDays} days retained, counts ${JSON.stringify(counts)}` });
  }

  // ---- 2. Inventory reconciliation (from inventory_events, cross-checked against lots, sales lines and orders) ----
  const lineUnits = {}, orderUnits = {}, lotClosing = {};
  for (const r of qAll("SELECT product_id, SUM(qty) AS u FROM transaction_lines WHERE run_id = ? GROUP BY product_id", runId)) lineUnits[r.product_id] = r.u;
  for (const r of qAll("SELECT product_id, SUM(qty) AS u FROM orders WHERE run_id = ? GROUP BY product_id", runId)) orderUnits[r.product_id] = r.u;

  const lots = qAll(`SELECT l.lot_id, l.product_id, l.expiry_day, l.qty_received,
      COALESCE(SUM(CASE WHEN e.type IN ('opening','replenishment') THEN e.qty_change END), 0) AS received_events,
      COALESCE(SUM(CASE WHEN e.type IN ('sale','expired') THEN e.qty_change END), 0) AS removed
    FROM stock_lots l LEFT JOIN inventory_events e ON e.lot_id = l.lot_id
    WHERE l.run_id = ? GROUP BY l.lot_id`, runId);
  for (const l of lots) {
    const remaining = l.qty_received + l.removed; // removed is negative
    lotClosing[l.product_id] = (lotClosing[l.product_id] || 0) + remaining;
    if (remaining < 0) addException("inventory", { type: "overselling", product_id: l.product_id, lot_id: l.lot_id, value: remaining });
    if (l.received_events !== l.qty_received) addException("inventory", { type: "lot_receipt_mismatch", product_id: l.product_id, lot_id: l.lot_id, value: `${l.received_events} vs ${l.qty_received}` });
    if (remaining > 0 && l.expiry_day !== null && l.expiry_day <= expectedDays) addException("inventory", { type: "expired_stock_still_held", product_id: l.product_id, lot_id: l.lot_id, value: remaining });
  }

  const products = qAll(`SELECT p.product_id, p.name, p.unit_cost, p.initial_qty,
      COALESCE(SUM(CASE WHEN e.type = 'opening' THEN e.qty_change END), 0) AS opening,
      COALESCE(SUM(CASE WHEN e.type = 'replenishment' THEN e.qty_change END), 0) AS replenished,
      COALESCE(-SUM(CASE WHEN e.type = 'sale' THEN e.qty_change END), 0) AS sold,
      COALESCE(-SUM(CASE WHEN e.type = 'expired' THEN e.qty_change END), 0) AS expired
    FROM run_products p LEFT JOIN inventory_events e ON e.run_id = p.run_id AND e.product_id = p.product_id
    WHERE p.run_id = ? GROUP BY p.product_id ORDER BY p.product_id`, runId);
  const totals = { opening: 0, replenished: 0, sold: 0, expired: 0, closing: 0, closingValue: 0 };
  for (const p of products) {
    p.closing = p.opening + p.replenished - p.sold - p.expired;
    p.closingFromLots = lotClosing[p.product_id] || 0;
    const bad = (type, value) => addException("inventory", { type, product_id: p.product_id, value });
    if (p.closing !== p.closingFromLots) bad("closing_vs_lots", `${p.closing} vs ${p.closingFromLots}`);
    if (p.closing < 0) bad("negative_closing_stock", p.closing);
    if (p.opening !== p.initial_qty) bad("opening_vs_run_products", `${p.opening} vs ${p.initial_qty}`);
    if (p.sold !== (lineUnits[p.product_id] || 0)) bad("sold_vs_transaction_lines", `${p.sold} vs ${lineUnits[p.product_id] || 0}`);
    if (p.replenished !== (orderUnits[p.product_id] || 0)) bad("received_vs_orders", `${p.replenished} vs ${orderUnits[p.product_id] || 0}`);
    p.ok = !exceptions.some((e) => e.check === "inventory" && e.product_id === p.product_id);
    for (const k of ["opening", "replenished", "sold", "expired", "closing"]) totals[k] += p[k];
    totals.closingValue += p.closing * p.unit_cost;
  }
  totals.closingValue = r2(totals.closingValue);

  // Running balance after every event: negative stock at any point (first 100 shown).
  for (const n of qAll(`SELECT day, product_id, running FROM (
      SELECT day, product_id, SUM(qty_change) OVER (PARTITION BY product_id ORDER BY event_id) AS running
      FROM inventory_events WHERE run_id = ?) WHERE running < 0 LIMIT 100`, runId)) {
    addException("inventory", { type: "negative_stock", day: n.day, product_id: n.product_id, value: n.running });
  }
  // Sale of an expired lot: a sale event on or after the lot's expiry day.
  for (const s of qAll(`SELECT e.day, e.product_id, e.lot_id, l.expiry_day, -e.qty_change AS units
      FROM inventory_events e JOIN stock_lots l ON l.lot_id = e.lot_id
      WHERE e.run_id = ? AND e.type = 'sale' AND l.expiry_day IS NOT NULL AND e.day >= l.expiry_day LIMIT 100`, runId)) {
    addException("inventory", { type: "expired_sale", day: s.day, product_id: s.product_id, lot_id: s.lot_id, value: `${s.units} units, expiry day ${s.expiry_day}` });
  }
  // Cross-check against daily_summary.
  const last = q1("SELECT closing_inventory_value, closing_cash FROM daily_summary WHERE run_id = ? ORDER BY day DESC LIMIT 1", runId);
  const summaryExpired = q1("SELECT COALESCE(SUM(expired_units), 0) AS n FROM daily_summary WHERE run_id = ?", runId).n;
  if (last && Math.abs(last.closing_inventory_value - totals.closingValue) > 0.01) addException("inventory", { type: "closing_value_vs_summary", value: `${totals.closingValue} vs ${last.closing_inventory_value}` });
  if (summaryExpired !== totals.expired) addException("inventory", { type: "expired_units_vs_summary", value: `${totals.expired} vs ${summaryExpired}` });

  // ---- 3. Revenue reconciliation ----
  const days = qAll(`SELECT d.day, d.revenue AS summary_revenue,
      (SELECT COALESCE(SUM(t.total), 0) FROM transactions t WHERE t.run_id = d.run_id AND t.day = d.day) AS transaction_total,
      (SELECT COALESCE(SUM(l.line_total), 0) FROM transaction_lines l JOIN transactions t ON t.txn_id = l.txn_id
        WHERE t.run_id = d.run_id AND t.day = d.day) AS line_total
    FROM daily_summary d WHERE d.run_id = ? ORDER BY d.day`, runId);
  let dailySum = 0;
  for (const r of days) {
    dailySum += r.summary_revenue;
    r.ok = Math.abs(r.summary_revenue - r.transaction_total) <= TOL && Math.abs(r.transaction_total - r.line_total) <= TOL;
    if (!r.ok) addException("revenue", { type: "daily_revenue_mismatch", day: r.day, value: `summary ${r.summary_revenue}, transactions ${r.transaction_total}, lines ${r.line_total}` });
  }
  const txnSum = q1("SELECT COALESCE(SUM(total), 0) AS v FROM transactions WHERE run_id = ?", runId).v;
  if (Math.abs(dailySum - txnSum) > TOL) addException("revenue", { type: "total_revenue_mismatch", value: `daily sum ${r2(dailySum)} vs transactions ${r2(txnSum)}` });
  for (const t of qAll(`SELECT t.txn_id, t.day, t.total, COALESCE(SUM(l.line_total), 0) AS lines
      FROM transactions t LEFT JOIN transaction_lines l ON l.txn_id = t.txn_id WHERE t.run_id = ?
      GROUP BY t.txn_id HAVING ABS(t.total - COALESCE(SUM(l.line_total), 0)) > ${TOL} LIMIT 100`, runId)) {
    addException("revenue", { type: "transaction_total_mismatch", day: t.day, txn_id: t.txn_id, value: `${t.total} vs lines ${t.lines}` });
  }

  // ---- 4. Operating-cash reconciliation ----
  const spend = q1("SELECT COALESCE(SUM(cost), 0) AS v FROM orders WHERE run_id = ?", runId).v;
  const ledger = qAll(`SELECT day, type, amount, balance_after, SUM(amount) OVER (ORDER BY rowid) AS running
    FROM cash_ledger WHERE run_id = ? ORDER BY rowid`, runId);
  const ledgerClosing = ledger.length ? ledger[ledger.length - 1].balance_after : null;
  const expectedClosing = r2(run.opening_cash + txnSum - spend);
  if (ledgerClosing === null || Math.abs(ledgerClosing - expectedClosing) > TOL) addException("cash", { type: "closing_cash_vs_ledger", value: `expected ${expectedClosing}, ledger ${ledgerClosing}` });
  if (last && Math.abs(last.closing_cash - expectedClosing) > TOL) addException("cash", { type: "closing_cash_vs_summary", value: `expected ${expectedClosing}, summary ${last.closing_cash}` });
  const openRow = ledger.find((r) => r.type === "opening");
  if (!openRow || Math.abs(openRow.amount - run.opening_cash) > TOL) addException("cash", { type: "opening_cash_mismatch", value: openRow ? openRow.amount : "missing" });
  for (const r of ledger) { // every ledger balance must equal the running total of movements
    if (Math.abs(r.balance_after - r.running) > TOL) addException("cash", { type: "unexplained_cash_movement", day: r.day, value: `${r.type}: balance ${r.balance_after} vs running ${r2(r.running)}` });
    if (r.balance_after < -TOL) addException("cash", { type: "negative_cash", day: r.day, value: r.balance_after });
  }
  const ledgerSales = r2(ledger.filter((r) => r.type === "sales").reduce((s, r) => s + r.amount, 0));
  const ledgerSpend = r2(-ledger.filter((r) => r.type === "replenishment").reduce((s, r) => s + r.amount, 0));
  if (Math.abs(ledgerSales - txnSum) > TOL) addException("cash", { type: "ledger_sales_vs_transactions", value: `${ledgerSales} vs ${r2(txnSum)}` });
  if (Math.abs(ledgerSpend - spend) > TOL) addException("cash", { type: "ledger_spend_vs_orders", value: `${ledgerSpend} vs ${r2(spend)}` });

  // Each order must be affordable: cash available = ledger balance just before its payment row.
  const failingOrders = [];
  const orderRows = qAll(`WITH o AS (SELECT order_id, day_placed, product_id, cost, cash_before, ROW_NUMBER() OVER (ORDER BY order_id) AS n
        FROM orders WHERE run_id = ?),
      c AS (SELECT amount, balance_after, ROW_NUMBER() OVER (ORDER BY rowid) AS n FROM cash_ledger WHERE run_id = ? AND type = 'replenishment')
    SELECT o.*, c.amount AS ledger_amount, c.balance_after AS ledger_after FROM o LEFT JOIN c ON c.n = o.n ORDER BY o.order_id`, runId, runId);
  for (const o of orderRows) {
    let problem = null;
    if (o.ledger_amount === null) problem = "no matching cash ledger row";
    else {
      const available = r2(o.ledger_after - o.ledger_amount); // balance before the payment
      if (o.cost > available + TOL) problem = `cost ${o.cost} > cash available ${available}`;
      else if (Math.abs(o.cost + o.ledger_amount) > TOL) problem = `cost ${o.cost} vs ledger ${o.ledger_amount}`;
      else if (Math.abs(o.cash_before - available) > TOL) problem = `recorded cash_before ${o.cash_before} vs ledger ${available}`;
    }
    if (problem) {
      failingOrders.push({ order_id: o.order_id, day: o.day_placed, product_id: o.product_id, problem });
      addException("cash", { type: "order_vs_cash", day: o.day_placed, product_id: o.product_id, value: problem });
    }
  }

  // ---- 6. Immutability: triggers exist and the frozen configuration is stored ----
  const expectedTriggers = [
    ...HISTORY_TABLES.flatMap((t) => [`${t}_no_update`, `${t}_no_delete`]),
    "run_products_no_update", "run_products_no_delete", "runs_config_no_update", "runs_no_delete",
  ];
  const have = new Set(qAll("SELECT name FROM sqlite_master WHERE type = 'trigger'").map((r) => r.name));
  const missingTriggers = expectedTriggers.filter((n) => !have.has(n));
  const configPresent = !!config && typeof config === "object";
  for (const n of missingTriggers) addException("immutability", { type: "missing_trigger", value: n });
  if (!configPresent) addException("immutability", { type: "config_json_missing_or_invalid" });

  // ---- 5. Results ----
  const result = {
    runId,
    completeness: { status: verdict(!failed("completeness")), runStatus: run.status, daysRetained: d.n, expectedDays, counts },
    inventory: { status: verdict(!failed("inventory")), totals, products },
    revenue: { status: verdict(!failed("revenue")), totalFromDaily: r2(dailySum), totalFromTransactions: r2(txnSum), days },
    cash: { status: verdict(!failed("cash")), openingCash: run.opening_cash, salesRevenue: r2(txnSum), replenishmentSpend: r2(spend),
      expectedClosing, ledgerClosing, summaryClosing: last ? last.closing_cash : null, ordersChecked: orderRows.length, failingOrders },
    immutability: { status: verdict(!failed("immutability")), triggersExpected: expectedTriggers.length, missingTriggers, configPresent },
    exceptions,
  };
  result.overall = ["completeness", "inventory", "revenue", "cash", "immutability"].every((k) => result[k].status === "PASS") ? "PASS" : "FAIL";
  return result;
}

// Business outcomes that are NOT integrity failures, with counts (zero is reported, not omitted).
function getDisclosures(runId) {
  const ev = (type) => q1("SELECT COUNT(*) AS n, COUNT(DISTINCT product_id) AS p FROM brain_events WHERE run_id = ? AND event_type = ?", runId, type);
  const out = [];
  const add = (key, count, text) => out.push({ key, count, text });

  let e = ev("sold_out");
  add("sold_out", e.n, `${e.n} sold-out conditions at close of day (${e.p} products).`);
  e = ev("stockout_demand");
  add("stockout_demand", e.n, `Customers wanted an unavailable product on ${e.n} product-days (${e.p} products); those sales were lost.`);
  e = ev("low_stock");
  add("low_stock", e.n, `${e.n} low-stock alerts (${e.p} products); each triggered a replenishment decision.`);
  e = ev("expiry_warning");
  add("expiry_warning", e.n, `${e.n} expiry warnings (${e.p} products).`);
  const x = q1(`SELECT COALESCE(-SUM(e.qty_change), 0) AS units, COALESCE(-SUM(e.qty_change * p.unit_cost), 0) AS value, COUNT(DISTINCT e.product_id) AS p
    FROM inventory_events e JOIN run_products p ON p.run_id = e.run_id AND p.product_id = e.product_id
    WHERE e.run_id = ? AND e.type = 'expired'`, runId);
  add("expired", x.units, `${x.units} units expired and were written off (A$${r2(x.value).toFixed(2)} at cost, ${x.p} products).`);
  e = ev("slow_mover");
  add("slow_mover", e.n, `${e.n} slow-mover flags (${e.p} products); slow movers were not reordered.`);
  const c = q1("SELECT COUNT(*) AS n FROM orders WHERE run_id = ? AND was_constrained = 1", runId).n;
  const s = ev("cash_constrained").n;
  add("cash_constrained", c + s, c + s === 0
    ? "No replenishment order was constrained by operating cash."
    : `${c} orders were reduced and ${s - c} orders were skipped because of insufficient operating cash.`);
  return out;
}

module.exports = { checkRun, getDisclosures };

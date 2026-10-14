// Reports: everything is computed with SQL from the stored history of one run (no cached numbers).
const db = require("./db");

const q1 = (sql, ...p) => db.prepare(sql).get(...p);
const qAll = (sql, ...p) => db.prepare(sql).all(...p);

// Round every number in the result to 2 decimals (removes floating-point noise).
function clean(x) {
  if (typeof x === "number") return Math.round(x * 100) / 100;
  if (Array.isArray(x)) return x.map(clean);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clean(v)]));
  return x;
}

const EVENT_TYPES = ["low_stock", "sold_out", "expiry_warning", "expired_removed", "slow_mover",
  "replenishment", "cash_constrained", "stockout_demand"];

function getBusinessPerformance(runId) {
  const t = q1(`SELECT COUNT(*) AS days, SUM(customers) AS customers, SUM(transactions) AS transactions, SUM(units_sold) AS units,
      SUM(revenue) AS revenue, SUM(cogs) AS cogs, SUM(expired_value) AS writeOffValue
    FROM daily_summary WHERE run_id = ?`, runId);
  const last = q1("SELECT closing_cash, closing_inventory_value FROM daily_summary WHERE run_id = ? ORDER BY day DESC LIMIT 1", runId);
  const firstDay = JSON.parse(q1("SELECT config_json FROM runs WHERE run_id = ?", runId).config_json).model.firstDayOfWeek;

  const products = qAll(`SELECT p.product_id, p.name, p.category, COALESCE(SUM(l.qty), 0) AS units,
      COALESCE(SUM(l.line_total), 0) AS revenue, COALESCE(SUM(l.line_total - l.qty * l.unit_cost), 0) AS grossProfit
    FROM run_products p LEFT JOIN transaction_lines l ON l.run_id = p.run_id AND l.product_id = p.product_id
    WHERE p.run_id = ? GROUP BY p.product_id`, runId);
  const sortBy = (key, dir) => [...products].sort((a, b) => dir * (b[key] - a[key]));

  return clean({
    totals: {
      customers: t.customers, transactions: t.transactions, unitsSold: t.units, revenue: t.revenue, cogs: t.cogs,
      grossProfit: t.revenue - t.cogs, writeOffValue: t.writeOffValue,
      closingCash: last.closing_cash, closingInventoryValue: last.closing_inventory_value,
    },
    averages: {
      customersPerDay: t.customers / t.days,
      basketSizeUnits: t.units / t.transactions,       // units per transaction
      transactionValue: t.revenue / t.transactions,
    },
    // Weekend = Saturday/Sunday, from the run's frozen first-day-of-week setting.
    weekdayWeekend: qAll(`SELECT CASE WHEN (day - 1 + ?) % 7 >= 5 THEN 'weekend' ELSE 'weekday' END AS kind,
        COUNT(*) AS days, AVG(customers) AS avgCustomers, AVG(revenue) AS avgRevenue
      FROM daily_summary WHERE run_id = ? GROUP BY kind`, firstDay, runId),
    daily: qAll("SELECT day, customers, transactions, revenue FROM daily_summary WHERE run_id = ? ORDER BY day", runId),
    byCategory: qAll(`SELECT p.category, SUM(l.qty) AS units, SUM(l.line_total) AS revenue,
        SUM(l.line_total - l.qty * l.unit_cost) AS grossProfit
      FROM transaction_lines l JOIN run_products p ON p.run_id = l.run_id AND p.product_id = l.product_id
      WHERE l.run_id = ? GROUP BY p.category ORDER BY revenue DESC`, runId),
    topByRevenue: sortBy("revenue", 1).slice(0, 10),
    topByUnits: sortBy("units", 1).slice(0, 10),
    weakest: sortBy("units", -1).slice(0, 10), // lowest units sold
  });
}

function getInventoryOperations(runId) {
  const named = `JOIN run_products p ON p.run_id = b.run_id AND p.product_id = b.product_id`;
  const eventCounts = Object.fromEntries(EVENT_TYPES.map((type) => [type, 0])); // zero if it never occurred
  for (const r of qAll("SELECT event_type, COUNT(*) AS n FROM brain_events WHERE run_id = ? GROUP BY event_type", runId)) eventCounts[r.event_type] = r.n;

  const expiredBy = (col) => qAll(`SELECT p.${col} AS name, -SUM(e.qty_change) AS units, -SUM(e.qty_change * p.unit_cost) AS value
    FROM inventory_events e JOIN run_products p ON p.run_id = e.run_id AND p.product_id = e.product_id
    WHERE e.run_id = ? AND e.type = 'expired' GROUP BY p.${col} ORDER BY value DESC`, runId);
  const closing = `SELECT p.category, SUM(e.qty_change) AS units, SUM(e.qty_change * p.unit_cost) AS value
    FROM inventory_events e JOIN run_products p ON p.run_id = e.run_id AND p.product_id = e.product_id WHERE e.run_id = ? GROUP BY p.category`;
  const orderBy = (col) => qAll(`SELECT p.${col} AS name, COUNT(*) AS orders, SUM(o.qty) AS units, SUM(o.cost) AS spend
    FROM orders o JOIN run_products p ON p.run_id = o.run_id AND p.product_id = o.product_id
    WHERE o.run_id = ? GROUP BY p.${col} ORDER BY spend DESC`, runId);

  return clean({
    eventCounts,
    stockouts: {
      count: eventCounts.sold_out,
      topProducts: qAll(`SELECT p.product_id, p.name, COUNT(*) AS daysSoldOut FROM brain_events b ${named}
        WHERE b.run_id = ? AND b.event_type = 'sold_out' GROUP BY p.product_id ORDER BY daysSoldOut DESC LIMIT 10`, runId),
    },
    lowStockEvents: eventCounts.low_stock,
    expiredByProduct: expiredBy("name"),
    expiredByCategory: expiredBy("category"),
    slowMovers: qAll(`SELECT p.product_id, p.name, COUNT(*) AS flags, MIN(b.day) AS firstFlaggedDay,
        (SELECT SUM(e.qty_change) FROM inventory_events e WHERE e.run_id = b.run_id AND e.product_id = b.product_id) AS closingUnits
      FROM brain_events b ${named} WHERE b.run_id = ? AND b.event_type = 'slow_mover'
      GROUP BY p.product_id ORDER BY flags DESC`, runId),
    replenishment: {
      total: q1("SELECT COUNT(*) AS orders, COALESCE(SUM(qty), 0) AS units, COALESCE(SUM(cost), 0) AS spend FROM orders WHERE run_id = ?", runId),
      byCategory: orderBy("category"),
      byProduct: orderBy("name"),
    },
    closingByCategory: qAll(closing + " ORDER BY value DESC", runId),
    constrainedOrders: q1("SELECT COUNT(*) AS n FROM orders WHERE run_id = ? AND was_constrained = 1", runId).n,
    materialCases: getMaterialCases(runId),
  });
}

// Up to 8 cases: condition detected -> action taken -> recorded outcome.
function getMaterialCases(runId) {
  const cases = [];
  const count = (sql, ...p) => q1(sql, ...p).n;

  // Largest write-offs (top 3).
  for (const p of qAll(`SELECT p.product_id, p.name, -SUM(e.qty_change) AS units, -SUM(e.qty_change * p.unit_cost) AS value, COUNT(*) AS lots, MIN(e.day) AS firstDay
      FROM inventory_events e JOIN run_products p ON p.run_id = e.run_id AND p.product_id = e.product_id
      WHERE e.run_id = ? AND e.type = 'expired' GROUP BY p.product_id ORDER BY value DESC LIMIT 3`, runId)) {
    const warnings = count("SELECT COUNT(*) AS n FROM brain_events WHERE run_id = ? AND product_id = ? AND event_type = 'expiry_warning'", runId, p.product_id);
    cases.push({ type: "write-off", product_id: p.product_id, name: p.name, day: p.firstDay,
      condition: `${warnings} expiry warnings`,
      action: "Units sold earliest-expiry first; no markdown",
      outcome: `${p.units} units from ${p.lots} batches still expired, A$${p.value.toFixed(2)} written off` });
  }

  // Longest stockouts (top 3 products by days sold out at close).
  for (const p of qAll(`SELECT p.product_id, p.name, COUNT(*) AS days, MIN(b.day) AS firstDay FROM brain_events b
      JOIN run_products p ON p.run_id = b.run_id AND p.product_id = b.product_id
      WHERE b.run_id = ? AND b.event_type = 'sold_out' GROUP BY p.product_id ORDER BY days DESC LIMIT 3`, runId)) {
    const first = q1("SELECT action_taken FROM brain_events WHERE run_id = ? AND product_id = ? AND event_type = 'sold_out' ORDER BY day LIMIT 1", runId, p.product_id);
    const again = count(`SELECT COUNT(*) AS n FROM brain_events a WHERE a.run_id = ? AND a.product_id = ? AND a.event_type = 'sold_out'
      AND EXISTS (SELECT 1 FROM brain_events b WHERE b.run_id = a.run_id AND b.product_id = a.product_id AND b.event_type = 'sold_out' AND b.day = a.day + 1)`, runId, p.product_id);
    const lostDays = count("SELECT COUNT(*) AS n FROM brain_events WHERE run_id = ? AND product_id = ? AND event_type = 'stockout_demand'", runId, p.product_id);
    cases.push({ type: "stockout", product_id: p.product_id, name: p.name, day: p.firstDay,
      condition: `Sold out at close on ${p.days} days (first on day ${p.firstDay})`,
      action: first.action_taken,
      outcome: `Sold out again the next day on ${again} of those occasions; customers were turned away on ${lostDays} days` });
  }

  // Constrained orders (first 2), if any.
  for (const e of qAll("SELECT day, product_id, detail, action_taken FROM brain_events WHERE run_id = ? AND event_type = 'cash_constrained' ORDER BY event_id LIMIT 2", runId)) {
    const next = count("SELECT COUNT(*) AS n FROM brain_events WHERE run_id = ? AND product_id = ? AND event_type = 'sold_out' AND day = ?", runId, e.product_id, e.day + 1);
    cases.push({ type: "cash-constrained", product_id: e.product_id, day: e.day, condition: e.detail, action: e.action_taken,
      outcome: next ? "Sold out the next day" : "Not sold out the next day" });
  }
  return cases;
}

function getDaily(runId, day) {
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, customers: 0 }));
  for (const r of qAll("SELECT hour, COUNT(*) AS n FROM customers WHERE run_id = ? AND day = ? GROUP BY hour", runId, day)) hourly[r.hour].customers = r.n;

  const products = qAll(`SELECT p.product_id, p.name, p.category,
      COALESCE(SUM(CASE WHEN e.day < ? THEN e.qty_change END), 0) AS opening,
      COALESCE(SUM(CASE WHEN e.day = ? AND e.type = 'replenishment' THEN e.qty_change END), 0) AS received,
      COALESCE(-SUM(CASE WHEN e.day = ? AND e.type = 'sale' THEN e.qty_change END), 0) AS sold,
      COALESCE(-SUM(CASE WHEN e.day = ? AND e.type = 'expired' THEN e.qty_change END), 0) AS expired
    FROM run_products p LEFT JOIN inventory_events e ON e.run_id = p.run_id AND e.product_id = p.product_id AND e.day <= ?
    WHERE p.run_id = ? GROUP BY p.product_id ORDER BY p.product_id`, day, day, day, day, day, runId);
  for (const p of products) p.closing = p.opening + p.received - p.sold - p.expired;

  return clean({
    summary: q1("SELECT * FROM daily_summary WHERE run_id = ? AND day = ?", runId, day),
    hourly,
    transactions: qAll("SELECT txn_id, hour, customer_id, total FROM transactions WHERE run_id = ? AND day = ? ORDER BY txn_id", runId, day),
    products,
    brainEvents: qAll("SELECT event_id, product_id, event_type, detail, action_taken FROM brain_events WHERE run_id = ? AND day = ? ORDER BY event_id", runId, day),
    orders: qAll(`SELECT o.order_id, o.product_id, p.name, o.requested_qty, o.qty, o.cost, o.cash_before, o.cash_after, o.was_constrained
      FROM orders o JOIN run_products p ON p.run_id = o.run_id AND p.product_id = o.product_id
      WHERE o.run_id = ? AND o.day_placed = ? ORDER BY o.order_id`, runId, day),
  });
}

function getProductHistory(runId, productId) {
  const sum = (cond) => `(SELECT COALESCE(SUM(qty_change), 0) FROM inventory_events e
    WHERE e.run_id = d.run_id AND e.product_id = ? AND ${cond})`;
  return clean({
    product: q1("SELECT * FROM run_products WHERE run_id = ? AND product_id = ?", runId, productId),
    days: qAll(`SELECT d.day,
        ${sum("e.day <= d.day")} AS closing,
        -${sum("e.day = d.day AND e.type = 'sale'")} AS sold,
        ${sum("e.day = d.day AND e.type = 'replenishment'")} AS received,
        -${sum("e.day = d.day AND e.type = 'expired'")} AS expired,
        (SELECT COALESCE(SUM(o.qty), 0) FROM orders o WHERE o.run_id = d.run_id AND o.product_id = ? AND o.day_placed = d.day) AS ordered
      FROM daily_summary d WHERE d.run_id = ? ORDER BY d.day`, productId, productId, productId, productId, productId, runId),
  });
}

function getTransaction(runId, txnId) {
  const transaction = q1(`SELECT t.txn_id, t.day, t.hour, t.customer_id, t.total, c.customer_type, c.mission
    FROM transactions t JOIN customers c ON c.run_id = t.run_id AND c.customer_id = t.customer_id
    WHERE t.run_id = ? AND t.txn_id = ?`, runId, txnId);
  if (!transaction) return null;
  const lines = qAll(`SELECT l.product_id, p.name, l.qty, l.unit_price, l.unit_cost, l.line_total
    FROM transaction_lines l JOIN run_products p ON p.run_id = l.run_id AND p.product_id = l.product_id
    WHERE l.run_id = ? AND l.txn_id = ?`, runId, txnId);
  return clean({ transaction, lines });
}

module.exports = { getBusinessPerformance, getInventoryOperations, getDaily, getProductHistory, getTransaction };

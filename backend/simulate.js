// Simulation engine: creates a run, operates the store for 60 days, stores all history in SQLite.
const db = require("./db");
const products = require("./products");
const model = require("./model");
const { BRAIN_RULES, reviewEndOfDay } = require("./brain");

const DAYS = 60;
const OPENING_CASH = 15000;
const INVENTORY_BUDGET = 40000;
const r2 = (x) => Math.round(x * 100) / 100;

// Expiry rule: a unit received on day d with shelf life s has expiry_day = d + s.
// It is sellable through day d+s-1 and removed at the start of day d+s.
function runSimulation(options = {}) {
  const seed = options.seed ?? model.config.seed;
  const openingCost = products.reduce((s, p) => s + p.unit_cost * p.initial_qty, 0);
  if (openingCost > INVENTORY_BUDGET) throw new Error(`Opening inventory A$${openingCost.toFixed(2)} exceeds A$${INVENTORY_BUDGET}`);

  // 1. Create the run with its frozen configuration (committed before the simulation starts).
  const runId = "RUN-" + Date.now();
  const config = {
    days: DAYS,
    openingCash: OPENING_CASH,
    inventoryBudget: INVENTORY_BUDGET,
    openingInventoryCost: r2(openingCost),
    expiryRule: "expiry_day = received_day + shelf_life_days; sellable through expiry_day - 1; removed at start of expiry_day. Opening stock is treated as received on Day 1.",
    model: { ...model.config, seed },
    storeBrain: BRAIN_RULES,
    products, // includes popularity, which run_products does not store
    declaration: model.declaration,
  };
  db.transaction(() => {
    db.prepare("INSERT INTO runs (run_id, created_at, status, is_submitted, opening_cash, config_json) VALUES (?, ?, 'running', 0, ?, ?)")
      .run(runId, new Date().toISOString(), OPENING_CASH, JSON.stringify(config));
    const ins = db.prepare("INSERT INTO run_products (run_id, product_id, name, category, unit_cost, unit_price, initial_qty, is_perishable, shelf_life_days) VALUES (?,?,?,?,?,?,?,?,?)");
    for (const p of products) ins.run(runId, p.product_id, p.name, p.category, p.unit_cost, p.unit_price, p.initial_qty, p.is_perishable, p.shelf_life_days);
  })();

  // 2-3. Simulate everything in ONE transaction: if it fails, no partial history is kept.
  try {
    db.transaction(() => simulateDays(runId, seed))();
    db.prepare("UPDATE runs SET status = 'completed' WHERE run_id = ?").run(runId);
  } catch (err) {
    db.prepare("UPDATE runs SET status = 'failed' WHERE run_id = ?").run(runId);
    throw err;
  }
  return runId;
}

function simulateDays(runId, seed) {
  const rng = model.createRng(seed);
  const sql = (text) => db.prepare(text);
  const addLot = sql("INSERT INTO stock_lots (run_id, product_id, received_day, expiry_day, qty_received) VALUES (?,?,?,?,?)");
  const addInv = sql("INSERT INTO inventory_events (run_id, day, product_id, lot_id, type, qty_change, note) VALUES (?,?,?,?,?,?,?)");
  const addCash = sql("INSERT INTO cash_ledger (run_id, day, type, amount, balance_after) VALUES (?,?,?,?,?)");
  const addBrain = sql("INSERT INTO brain_events (run_id, day, product_id, event_type, detail, action_taken) VALUES (?,?,?,?,?,?)");
  const addCustomer = sql("INSERT INTO customers (run_id, day, customer_id, customer_type, mission, hour) VALUES (?,?,?,?,?,?)");
  const addTxn = sql("INSERT INTO transactions (run_id, day, hour, customer_id, total) VALUES (?,?,?,?,?)");
  const addLine = sql("INSERT INTO transaction_lines (txn_id, run_id, product_id, qty, unit_price, unit_cost, line_total) VALUES (?,?,?,?,?,?,?)");
  const addOrder = sql("INSERT INTO orders (run_id, day_placed, product_id, qty, unit_cost, cost, cash_before, cash_after, was_constrained, requested_qty) VALUES (?,?,?,?,?,?,?,?,?,?)");
  const addSummary = sql("INSERT INTO daily_summary (run_id, day, customers, transactions, units_sold, revenue, cogs, expired_units, expired_value, closing_cash, closing_inventory_value) VALUES (?,?,?,?,?,?,?,?,?,?,?)");

  const byId = {};
  const lots = {};      // in-memory lots per product, in receipt order (= earliest expiry first)
  const soldByDay = {}; // units sold per day per product, for the Store Brain
  for (const p of products) { byId[p.product_id] = p; lots[p.product_id] = []; soldByDay[p.product_id] = []; }

  // Every stock change goes through here: one lot + one inventory event.
  function receiveStock(p, qty, day, expiryDay, type, note) {
    const lotId = addLot.run(runId, p.product_id, day, expiryDay, qty).lastInsertRowid;
    addInv.run(runId, day, p.product_id, lotId, type, qty, note);
    lots[p.product_id].push({ lot_id: lotId, qty, expiry_day: expiryDay });
  }

  // 2. Opening position (day 0) and opening cash.
  for (const p of products) receiveStock(p, p.initial_qty, 0, p.is_perishable ? 1 + p.shelf_life_days : null, "opening", "Opening stock");
  let cash = OPENING_CASH;
  addCash.run(runId, 0, "opening", OPENING_CASH, cash);

  let pending = [];
  let nextCustomerId = 1;

  for (let day = 1; day <= DAYS; day++) {
    // a. START OF DAY: receive yesterday's orders, then remove expired stock.
    for (const o of pending) {
      const p = byId[o.product_id];
      receiveStock(p, o.qty, day, p.is_perishable ? day + p.shelf_life_days : null, "replenishment", `Order ${o.order_id} placed day ${day - 1}`);
    }
    pending = [];
    let expiredUnits = 0, expiredValue = 0;
    for (const p of products) {
      for (const lot of lots[p.product_id]) {
        if (lot.expiry_day === null || lot.expiry_day > day || lot.qty <= 0) continue;
        const value = r2(lot.qty * p.unit_cost);
        addInv.run(runId, day, p.product_id, lot.lot_id, "expired", -lot.qty, `Lot expired on day ${lot.expiry_day}`);
        addBrain.run(runId, day, p.product_id, "expired_removed", `${p.product_id} ${lot.qty} units reached expiry (day ${lot.expiry_day})`, `Removed from sale; written off at cost A$${value.toFixed(2)}`);
        expiredUnits += lot.qty;
        expiredValue += value;
        lot.qty = 0;
      }
    }

    // b. CUSTOMERS: generate the day's visitors, then serve them in time order.
    const weekend = model.isWeekend(day);
    const visitors = [];
    const count = model.sampleDailyCustomers(rng, day);
    for (let i = 0; i < count; i++) {
      const hour = model.sampleHour(rng, weekend);
      const type = model.sampleCustomerType(rng, hour, weekend);
      visitors.push({ hour, type, mission: model.sampleMission(rng, type) });
    }
    visitors.sort((a, b) => a.hour - b.hour);

    let txnCount = 0, unitsSold = 0, revenueCents = 0, cogsCents = 0;
    const sold = {}, lost = {};
    for (const v of visitors) {
      const customerId = nextCustomerId++;
      addCustomer.run(runId, day, customerId, v.type, v.mission, v.hour);

      const lines = [], moves = [];
      for (const { product: p, qty } of model.pickProducts(rng, v.mission, products)) {
        let need = qty;
        for (const lot of lots[p.product_id]) { // earliest expiry first; expired lots can never be sold
          if (need === 0) break;
          if (lot.qty <= 0 || (lot.expiry_day !== null && lot.expiry_day <= day)) continue;
          const take = Math.min(need, lot.qty);
          lot.qty -= take;
          need -= take;
          moves.push({ product_id: p.product_id, lot_id: lot.lot_id, take });
        }
        if (need > 0) { // demand we could not meet
          const l = (lost[p.product_id] = lost[p.product_id] || { units: 0, revenue: 0 });
          l.units += need;
          l.revenue += need * p.unit_price;
        }
        if (qty - need > 0) lines.push({ p, qty: qty - need, lineTotal: r2((qty - need) * p.unit_price) });
      }
      if (lines.length === 0) continue; // nothing available: no transaction

      const total = r2(lines.reduce((s, l) => s + l.lineTotal, 0));
      const txnId = addTxn.run(runId, day, v.hour, customerId, total).lastInsertRowid;
      for (const l of lines) {
        addLine.run(txnId, runId, l.p.product_id, l.qty, l.p.unit_price, l.p.unit_cost, l.lineTotal);
        unitsSold += l.qty;
        cogsCents += Math.round(l.qty * l.p.unit_cost * 100);
        sold[l.p.product_id] = (sold[l.p.product_id] || 0) + l.qty;
      }
      for (const m of moves) addInv.run(runId, day, m.product_id, m.lot_id, "sale", -m.take, `txn ${txnId}`);
      txnCount++;
      revenueCents += Math.round(total * 100);
    }

    const revenue = revenueCents / 100;
    cash = r2(cash + revenue);
    addCash.run(runId, day, "sales", revenue, cash);
    for (const [pid, l] of Object.entries(lost)) {
      addBrain.run(runId, day, pid, "stockout_demand", `${pid} ${l.units} units wanted but unavailable (A$${l.revenue.toFixed(2)} sales lost)`, "No substitution; sales lost");
    }
    for (const p of products) soldByDay[p.product_id].push(sold[p.product_id] || 0);

    // c. END OF DAY: Store Brain review, then pay for orders (arrive tomorrow).
    const stock = {};
    for (const p of products) {
      stock[p.product_id] = lots[p.product_id].filter((l) => l.qty > 0).map((l) => ({ lot_id: l.lot_id, qty: l.qty, expiry_day: l.expiry_day }));
    }
    const review = reviewEndOfDay({ day, cash, products, stock, sales: soldByDay });
    for (const e of review.events) addBrain.run(runId, day, e.product_id, e.event_type, e.detail, e.action_taken);
    for (const o of review.orders) {
      if (o.cost > cash + 0.001) throw new Error(`Order ${o.product_id} on day ${day} costs more than available cash`);
      const orderId = addOrder.run(runId, day, o.product_id, o.qty, o.unit_cost, o.cost, o.cash_before, o.cash_after, o.was_constrained, o.requested_qty).lastInsertRowid;
      cash = o.cash_after;
      addCash.run(runId, day, "replenishment", -o.cost, cash);
      pending.push({ order_id: orderId, product_id: o.product_id, qty: o.qty });
    }

    // Daily summary. Inventory value is at cost and excludes stock still on order.
    let inventoryValue = 0;
    for (const p of products) {
      lots[p.product_id] = lots[p.product_id].filter((l) => l.qty > 0);
      for (const l of lots[p.product_id]) inventoryValue += l.qty * p.unit_cost;
    }
    addSummary.run(runId, day, visitors.length, txnCount, unitsSold, revenue, cogsCents / 100, expiredUnits, r2(expiredValue), cash, r2(inventoryValue));
  }
}

module.exports = { runSimulation };

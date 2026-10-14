// Creates the Submitted Run: runs one 60-day simulation, marks it as submitted, prints key totals.
const db = require("./db");
const { runSimulation } = require("./simulate");

console.time("simulation");
const runId = runSimulation();
console.timeEnd("simulation");

// makes sure that only one run is 'submitted'
db.prepare("UPDATE runs SET is_submitted = 0 WHERE is_submitted = 1").run();
db.prepare("UPDATE runs SET is_submitted = 1 WHERE run_id = ?").run(runId);

// gets totals back from db
const t = db.prepare(`
  SELECT SUM(customers) AS customers, SUM(transactions) AS transactions, SUM(units_sold) AS units,
         SUM(revenue) AS revenue, SUM(cogs) AS cogs, SUM(expired_value) AS writeoffs
  FROM daily_summary WHERE run_id = ?`).get(runId);
const last = db.prepare("SELECT closing_cash, closing_inventory_value FROM daily_summary WHERE run_id = ? AND day = 60").get(runId);

console.log("Submitted Run:", runId);
console.log("Customers:", t.customers, "| Transactions:", t.transactions, "| Units sold:", t.units);
console.log("Revenue: A$" + t.revenue.toFixed(2));
console.log("COGS: A$" + t.cogs.toFixed(2));
console.log("Gross profit: A$" + (t.revenue - t.cogs).toFixed(2));
console.log("Write-offs: A$" + t.writeoffs.toFixed(2));
console.log("Closing cash: A$" + last.closing_cash.toFixed(2), "| Closing inventory: A$" + last.closing_inventory_value.toFixed(2));

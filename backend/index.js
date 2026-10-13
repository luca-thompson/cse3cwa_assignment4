const express = require("express");
const cors = require("cors");
const db = require("./db");
const { runSimulation } = require("./simulate");
const reports = require("./reports");
const { checkRun, getDisclosures } = require("./assurance");

const app = express();
app.use(cors());
app.use(express.json());

const notFound = (msg) => Object.assign(new Error(msg), { status: 404 });

// Wraps a route: sends the returned value as JSON, 404 for known errors, 500 otherwise.
function handle(fn) {
  return (req, res) => {
    try {
      res.json(fn(req));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  };
}

function getRun(runId) {
  const run = db.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId);
  if (!run) throw notFound(`Run not found: ${runId}`);
  return run;
}

function submittedRunId() {
  const row = db.prepare("SELECT run_id FROM runs WHERE is_submitted = 1").get();
  return row ? row.run_id : null;
}

app.get("/api/health", handle(() => ({ status: "ok", time: new Date().toISOString() })));

app.get("/api/submitted-run", handle(() => {
  const id = submittedRunId();
  if (!id) throw notFound("No submitted run found. Run `npm run seed` first.");
  return { run_id: id };
}));

// ---- Runs ----
app.get("/api/runs", handle(() =>
  db.prepare("SELECT run_id, created_at, status, is_submitted FROM runs ORDER BY created_at DESC").all()));

// The only write route: starts a new run (never touches an existing one). Uses a fresh random seed.
app.post("/api/runs", handle(() => ({ run_id: runSimulation({ seed: Math.floor(Math.random() * 1e9) }) })));

app.get("/api/runs/:runId", handle((req) => {
  const run = getRun(req.params.runId);
  const { config_json, ...details } = run;
  return {
    ...details,
    config: JSON.parse(config_json), // the frozen configuration
    products: db.prepare("SELECT * FROM run_products WHERE run_id = ? ORDER BY product_id").all(run.run_id),
  };
}));

// ---- Reports (read-only) ----
app.get("/api/runs/:runId/report/business", handle((req) =>
  reports.getBusinessPerformance(getRun(req.params.runId).run_id)));

app.get("/api/runs/:runId/report/operations", handle((req) =>
  reports.getInventoryOperations(getRun(req.params.runId).run_id)));

app.get("/api/runs/:runId/daily/:day", handle((req) => {
  const run = getRun(req.params.runId);
  const day = Number(req.params.day);
  if (!db.prepare("SELECT 1 FROM daily_summary WHERE run_id = ? AND day = ?").get(run.run_id, day)) {
    throw notFound(`Day ${req.params.day} not found in ${run.run_id}`);
  }
  return reports.getDaily(run.run_id, day);
}));

app.get("/api/runs/:runId/products/:productId", handle((req) => {
  const run = getRun(req.params.runId);
  if (!db.prepare("SELECT 1 FROM run_products WHERE run_id = ? AND product_id = ?").get(run.run_id, req.params.productId)) {
    throw notFound(`Product ${req.params.productId} not found in ${run.run_id}`);
  }
  return reports.getProductHistory(run.run_id, req.params.productId);
}));

app.get("/api/runs/:runId/transactions/:txnId", handle((req) => {
  const run = getRun(req.params.runId);
  const txn = reports.getTransaction(run.run_id, Number(req.params.txnId));
  if (!txn) throw notFound(`Transaction ${req.params.txnId} not found in ${run.run_id}`);
  return txn;
}));

app.get("/api/runs/:runId/assurance", handle((req) => {
  const run = getRun(req.params.runId);
  return { ...checkRun(run.run_id), disclosures: getDisclosures(run.run_id) };
}));

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!submittedRunId()) console.log("WARNING: no Submitted Run in the database. Run `npm run seed` to create one.");
});

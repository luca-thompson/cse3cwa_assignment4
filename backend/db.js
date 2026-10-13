const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "store.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS runs (
  run_id       TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('running','completed','failed')),
  is_submitted INTEGER NOT NULL DEFAULT 0,
  opening_cash REAL NOT NULL,
  config_json  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_products (
  run_id          TEXT NOT NULL,
  product_id      TEXT NOT NULL,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  unit_cost       REAL NOT NULL,
  unit_price      REAL NOT NULL,
  initial_qty     INTEGER NOT NULL,
  is_perishable   INTEGER NOT NULL,
  shelf_life_days INTEGER,
  PRIMARY KEY (run_id, product_id)
);

CREATE TABLE IF NOT EXISTS stock_lots (
  lot_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL,
  product_id   TEXT NOT NULL,
  received_day INTEGER NOT NULL,   -- 0 = opening stock
  expiry_day   INTEGER,            -- NULL if non-perishable
  qty_received INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_events (
  event_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL,
  day        INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  lot_id     INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('opening','replenishment','sale','expired')),
  qty_change INTEGER NOT NULL,     -- signed: + in, - out
  note       TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  run_id        TEXT NOT NULL,
  day           INTEGER NOT NULL,
  customer_id   INTEGER NOT NULL,
  customer_type TEXT NOT NULL,
  mission       TEXT NOT NULL,
  hour          INTEGER NOT NULL,
  PRIMARY KEY (run_id, customer_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  txn_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL,
  day         INTEGER NOT NULL,
  hour        INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  total       REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_lines (
  txn_id     INTEGER NOT NULL,
  run_id     TEXT NOT NULL,
  product_id TEXT NOT NULL,
  qty        INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  unit_cost  REAL NOT NULL,
  line_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  order_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT NOT NULL,
  day_placed    INTEGER NOT NULL,
  product_id    TEXT NOT NULL,
  qty           INTEGER NOT NULL,   -- quantity actually ordered
  unit_cost     REAL NOT NULL,
  cost          REAL NOT NULL,
  cash_before   REAL NOT NULL,
  cash_after    REAL NOT NULL,
  was_constrained INTEGER NOT NULL DEFAULT 0,
  requested_qty INTEGER NOT NULL    -- what the Brain wanted before the cash limit
);

CREATE TABLE IF NOT EXISTS cash_ledger (
  run_id        TEXT NOT NULL,
  day           INTEGER NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('opening','sales','replenishment')),
  amount        REAL NOT NULL,      -- signed: + in, - out
  balance_after REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS brain_events (
  event_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL,
  day          INTEGER NOT NULL,
  product_id   TEXT,
  event_type   TEXT NOT NULL,
  detail       TEXT,
  action_taken TEXT
);

CREATE TABLE IF NOT EXISTS daily_summary (
  run_id                TEXT NOT NULL,
  day                   INTEGER NOT NULL,
  customers             INTEGER NOT NULL,
  transactions          INTEGER NOT NULL,
  units_sold            INTEGER NOT NULL,
  revenue               REAL NOT NULL,
  cogs                  REAL NOT NULL,
  expired_units         INTEGER NOT NULL,
  expired_value         REAL NOT NULL,
  closing_cash          REAL NOT NULL,
  closing_inventory_value REAL NOT NULL,
  PRIMARY KEY (run_id, day)
);
`);

// Append-only: block UPDATE and DELETE on all history tables.
const historyTables = [
  "stock_lots", "inventory_events", "customers", "transactions",
  "transaction_lines", "orders", "cash_ledger", "brain_events", "daily_summary",
];
for (const t of historyTables) {
  for (const op of ["UPDATE", "DELETE"]) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ${t}_no_${op.toLowerCase()}
      BEFORE ${op} ON ${t}
      BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;
    `);
  }
}

// Frozen configuration: products and the config columns of runs cannot change.
// (runs.status and runs.is_submitted may still be updated.)
db.exec(`
  CREATE TRIGGER IF NOT EXISTS run_products_no_update
  BEFORE UPDATE ON run_products
  BEGIN SELECT RAISE(ABORT, 'run_products is frozen'); END;

  CREATE TRIGGER IF NOT EXISTS run_products_no_delete
  BEFORE DELETE ON run_products
  BEGIN SELECT RAISE(ABORT, 'run_products is frozen'); END;

  CREATE TRIGGER IF NOT EXISTS runs_config_no_update
  BEFORE UPDATE OF run_id, created_at, opening_cash, config_json ON runs
  BEGIN SELECT RAISE(ABORT, 'run configuration is frozen'); END;

  CREATE TRIGGER IF NOT EXISTS runs_no_delete
  BEFORE DELETE ON runs
  BEGIN SELECT RAISE(ABORT, 'runs cannot be deleted'); END;
`);

module.exports = db;

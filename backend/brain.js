// Store Brain: simple rule-based end-of-day review. No database access in here.

const BRAIN_RULES = {
  avgSalesWindowDays: 7,       // average daily sales = last 7 days (fewer if the run is younger)
  lowStockCoverDays: 2,        // low stock if days of cover is below this
  expiryWarningDays: 2,        // warn if a batch expires within this many days
  slowMoverCoverDays: 45,      // slow mover if days of cover is above this
  minDaysOfData: 7,            // slow-mover check needs at least this many days of sales
  slowReviewEveryDays: 7,      // slow movers are reviewed weekly
  targetCoverDays: 4,          // order up to this many days of average sales
  perishableMaxCoverFraction: 0.75, // perishable target cover <= this fraction of shelf life
  minOrderQty: 6,              // smallest order (one supplier pack)
  lastDay: 60,                 // no orders are placed at the end of this day
};
const R = BRAIN_RULES;

const sum = (a) => a.reduce((s, v) => s + v, 0);
const f1 = (x) => x.toFixed(1);
const money = (x) => "A$" + x.toFixed(2);

// state = { day, cash, products, stock, sales }
//   stock[product_id] = [{ lot_id, qty, expiry_day (null if none) }]  (lots with qty > 0)
//   sales[product_id] = units sold on each day so far, oldest first (last item = today)
// Returns { events: [...], orders: [...] }
function reviewEndOfDay(state) {
  const { day, products, stock, sales } = state;
  let cash = state.cash;
  const events = [];
  const candidates = [];

  for (const p of products) {
    const id = p.product_id;
    const lots = stock[id] || [];
    const total = sum(lots.map((l) => l.qty));
    // Usable stock = what is still on sale tomorrow (batches expiring tomorrow are removed before opening).
    const usable = sum(lots.filter((l) => l.expiry_day === null || l.expiry_day > day + 1).map((l) => l.qty));
    const recent = (sales[id] || []).slice(-R.avgSalesWindowDays);
    const avg = recent.length ? sum(recent) / recent.length : 0;
    const cover = avg > 0 ? usable / avg : usable > 0 ? Infinity : 0;

    // Target cover, capped for perishables; reorder point is never above the target.
    const target = p.is_perishable ? Math.min(R.targetCoverDays, p.shelf_life_days * R.perishableMaxCoverFraction) : R.targetCoverDays;
    const reorderCover = Math.min(R.lowStockCoverDays, target);
    const add = (type, detail, action = "") => {
      const e = { day, product_id: id, event_type: type, detail, action_taken: action };
      events.push(e);
      return e;
    };

    const soon = lots.filter((l) => l.expiry_day !== null && l.expiry_day - day <= R.expiryWarningDays);
    if (soon.length > 0) {
      const first = Math.min(...soon.map((l) => l.expiry_day));
      add("expiry_warning", `${id} ${sum(soon.map((l) => l.qty))} units expire within ${R.expiryWarningDays} days (first on day ${first})`,
        "Sold earliest-expiry first; no markdown");
    }

    let main = null;
    if (total === 0) main = add("sold_out", `${id} stock 0`);
    else if (cover < reorderCover) main = add("low_stock", `${id} cover ${f1(cover)} days < ${f1(reorderCover)}`);
    if (main) {
      const qty = Math.max(R.minOrderQty, Math.ceil(target * avg - usable));
      candidates.push({ p, main, cover, qty, soldOut: total === 0, avg, usable, target });
    } else if (day >= R.minDaysOfData && day % R.slowReviewEveryDays === 0 && cover > R.slowMoverCoverDays) {
      add("slow_mover", `${id} cover ${f1(cover)} days > ${R.slowMoverCoverDays}`, "Not reordered; no markdown");
    }
  }

  // Priority under cash: sold out first, then lowest cover, then higher margin per unit.
  const margin = (p) => p.unit_price - p.unit_cost;
  candidates.sort((a, b) => b.soldOut - a.soldOut || a.cover - b.cover || margin(b.p) - margin(a.p));

  const orders = [];
  for (const c of candidates) {
    const id = c.p.product_id;
    if (day >= R.lastDay) { c.main.action_taken = "No order: final day"; continue; }
    const affordable = Math.floor(Math.round(cash * 100) / Math.round(c.p.unit_cost * 100));
    const qty = Math.min(c.qty, affordable);
    if (qty <= 0) {
      c.main.action_taken = "Not ordered: no cash";
      events.push({ day, product_id: id, event_type: "cash_constrained", detail: `${id} wanted ${c.qty}, cash ${money(cash)}`, action_taken: "Order skipped: cash" });
      continue;
    }
    const cost = Math.round(qty * c.p.unit_cost * 100) / 100;
    const constrained = qty < c.qty ? 1 : 0;
    orders.push({ day_placed: day, product_id: id, qty, unit_cost: c.p.unit_cost, cost,
      cash_before: cash, cash_after: Math.round((cash - cost) * 100) / 100, was_constrained: constrained, requested_qty: c.qty });
    cash = Math.round((cash - cost) * 100) / 100;
    c.main.action_taken = constrained ? `Partially ordered: cash (${qty} of ${c.qty})` : `Ordered ${qty} units`;
    events.push({ day, product_id: id, event_type: "replenishment",
      detail: `${id} usable ${c.usable} + order ${qty} for ${f1(c.target)} days at ${f1(c.avg)}/day`, action_taken: `Ordered ${qty} units, ${money(cost)}` });
    if (constrained) {
      events.push({ day, product_id: id, event_type: "cash_constrained", detail: `${id} wanted ${c.qty}, afforded ${qty}`, action_taken: "Partially ordered: cash" });
    }
  }
  return { events, orders };
}

// ---------- Model Declaration text (built from the rules above) ----------
const brainDeclaration = {
  storeBrain:
    `At the end of every day the Store Brain reviews each product. It works out average daily sales over the last ${R.avgSalesWindowDays} days (fewer in the first week) and "days of cover", which is usable stock divided by average daily sales. Usable stock excludes batches that will expire before tomorrow's opening. ` +
    `A product is "sold out" when it has no stock left. It is "low stock" when its cover is under ${R.lowStockCoverDays} days (or under its own target cover, if that is smaller). ` +
    `An expiry warning is raised when any batch expires within ${R.expiryWarningDays} days; those units are sold first, and anything that reaches its expiry day is removed from sale and written off the next morning. ` +
    `Once a week, from Day ${R.minDaysOfData}, a product is flagged "slow-moving" if it holds more than ${R.slowMoverCoverDays} days of cover. Slow movers are not reordered. No markdowns are used. Every alert records the condition found and the action taken.`,

  replenishment:
    `Replenishment is triggered when a product is sold out or low on stock. The Brain then orders enough to bring usable stock up to ${R.targetCoverDays} days of average sales, with a minimum order of ${R.minOrderQty} units. ` +
    `For perishable products the target is limited to ${Math.round(R.perishableMaxCoverFraction * 100)}% of shelf life, so the store does not order more than can sell before it expires. ` +
    `Orders are paid for from operating cash when placed and arrive before opening the next day, so stock on order is never counted. No order is placed after Day ${R.lastDay}. ` +
    `When cash is limited, orders are ranked: sold-out products first, then lowest days of cover, then highest profit per unit. The Brain works down the list and never spends more than the cash available. ` +
    `If it cannot afford the full quantity it orders what it can afford, and the order is marked as constrained with both the requested and actual quantity recorded.`,
};

module.exports = { BRAIN_RULES, reviewEndOfDay, brainDeclaration };

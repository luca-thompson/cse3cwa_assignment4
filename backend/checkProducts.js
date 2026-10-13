// Prints a summary of the product catalogue and any validation errors.
const products = require("./products");

const errors = [];
const ids = new Set();
const perCategory = {};
let totalCost = 0;

for (const p of products) {
  if (ids.has(p.product_id)) errors.push(`Duplicate ID: ${p.product_id}`);
  ids.add(p.product_id);

  if (p.unit_price <= p.unit_cost) errors.push(`${p.product_id} ${p.name}: price <= cost`);
  if (p.is_perishable && !(p.shelf_life_days > 0)) errors.push(`${p.product_id} ${p.name}: perishable with no shelf life`);
  if (!p.is_perishable && p.shelf_life_days !== null) errors.push(`${p.product_id} ${p.name}: non-perishable has a shelf life`);
  if (!(p.initial_qty > 0)) errors.push(`${p.product_id} ${p.name}: initial_qty must be > 0`);
  if (!(p.popularity >= 1 && p.popularity <= 10)) errors.push(`${p.product_id} ${p.name}: popularity must be 1-10`);

  perCategory[p.category] = (perCategory[p.category] || 0) + 1;
  totalCost += p.unit_cost * p.initial_qty;
}

if (totalCost > 40000) errors.push(`Opening inventory cost ${totalCost.toFixed(2)} exceeds 40,000`);

console.log("Products:", products.length);
console.log("Per category:");
for (const [cat, n] of Object.entries(perCategory)) console.log(`  ${cat}: ${n}`);
console.log("Opening inventory cost: A$" + totalCost.toFixed(2));
console.log(errors.length ? "Errors:\n  " + errors.join("\n  ") : "Errors: none");

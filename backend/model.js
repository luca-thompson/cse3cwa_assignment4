const { brainDeclaration } = require("./brain");

// This is the customer demand model used to simuate shoppers

const config = {
  seed: 20260601, // stored in runs.config_json; same seed + same config = same run

  //this value decides how uch better 'top sellers' sell than regular items
  popularityPower: 2,

  // 1=monday, 2=tuesday etc..
  firstDayOfWeek: 0,

  arrivals: {
    baseDailyMean: 260,   // average weekday customers
    weekendMultiplier: 0.8, // CBD is quieter on weekends
    noiseSd: 0.10,        // day-to-day variation (10% standard deviation)
    // One-off event: a street festival at Town Hall on Day 27 (a Saturday).
    eventDay: 27,
    eventMultiplier: 1.6,
    eventName: "Town Hall street festival",
  },

  //weights for each hour
  hourlyProfile: {
    weekday: [0.5, 0.3, 0.2, 0.2, 0.3, 0.8, 2.0, 4.5, 7.0, 5.0, 4.0, 6.0,
              11.0, 10.0, 6.0, 5.0, 5.5, 9.0, 8.5, 5.5, 4.0, 3.0, 1.8, 1.0],
    weekend: [1.0, 0.8, 0.5, 0.3, 0.2, 0.4, 0.8, 1.5, 2.5, 4.0, 6.0, 8.0,
              9.0, 9.0, 8.0, 7.0, 6.5, 6.5, 6.0, 5.0, 4.0, 3.5, 2.5, 1.5],
  },

  // Time-of-day periods, used to make customer types appear at sensible times.
  periods: [
    { name: "morning",   from: 5,  to: 10 },
    { name: "lunch",     from: 11, to: 14 },
    { name: "afternoon", from: 15, to: 16 },
    { name: "evening",   from: 17, to: 21 },
    { name: "late",      from: 22, to: 4 },  // wraps past midnight
  ],

  // --- Customer types ---
  // share: overall share of customers. weekendFactor: multiplies the share on weekends.
  // periodBias: how much more or less likely this type is in each period.
  // missions: how likely each shopping mission is for this type.
  customerTypes: {
    office_worker: {
      share: 0.45, weekendFactor: 0.25,
      periodBias: { morning: 1.5, lunch: 2.0, afternoon: 1.0, evening: 1.0, late: 0.1 },
      missions: { lunch: 0.45, quick_snack_drink: 0.35, dinner_meal: 0.08, top_up_grocery: 0.07, household_errand: 0.05 },
    },
    visitor: {
      share: 0.20, weekendFactor: 1.6,
      periodBias: { morning: 0.8, lunch: 1.2, afternoon: 1.3, evening: 1.0, late: 0.5 },
      missions: { quick_snack_drink: 0.45, lunch: 0.30, household_errand: 0.10, dinner_meal: 0.10, top_up_grocery: 0.05 },
    },
    local_resident: {
      share: 0.20, weekendFactor: 1.5,
      periodBias: { morning: 0.6, lunch: 0.6, afternoon: 1.0, evening: 1.4, late: 0.5 },
      missions: { top_up_grocery: 0.40, quick_snack_drink: 0.20, household_errand: 0.20, dinner_meal: 0.12, lunch: 0.08 },
    },
    evening_shopper: {
      share: 0.15, weekendFactor: 1.0,
      periodBias: { morning: 0.1, lunch: 0.2, afternoon: 0.6, evening: 1.8, late: 3.0 },
      missions: { dinner_meal: 0.40, quick_snack_drink: 0.40, top_up_grocery: 0.15, household_errand: 0.05 },
    },
  },

  // --- Shopping missions ---
  // basket: min/max number of DIFFERENT products. categoryWeights: preference for each category.
  // qtyWeights: relative chance of buying 1, 2 or 3 units of a chosen product.
  missions: {
    quick_snack_drink: {
      basket: [1, 3],
      categoryWeights: { "Drinks": 5, "Snacks & Confectionery": 4, "Ready-to-eat": 1, "Personal Care & Convenience": 0.5, "Fresh & Bakery": 0.5 },
      qtyWeights: { 1: 90, 2: 9, 3: 1 },
    },
    lunch: {
      basket: [2, 4],
      categoryWeights: { "Ready-to-eat": 6, "Drinks": 4, "Snacks & Confectionery": 2, "Fresh & Bakery": 1.5, "Dairy & Chilled": 0.5 },
      qtyWeights: { 1: 92, 2: 7, 3: 1 },
    },
    dinner_meal: {
      basket: [2, 4],
      categoryWeights: { "Ready-to-eat": 5, "Drinks": 3, "Snacks & Confectionery": 2, "Grocery & Pantry": 1.5, "Fresh & Bakery": 1.5, "Dairy & Chilled": 1 },
      qtyWeights: { 1: 85, 2: 12, 3: 3 },
    },
    top_up_grocery: {
      basket: [3, 6],
      categoryWeights: { "Grocery & Pantry": 4, "Dairy & Chilled": 4, "Fresh & Bakery": 4, "Drinks": 1.5, "Snacks & Confectionery": 1, "Household": 1, "Personal Care & Convenience": 1, "Ready-to-eat": 1 },
      qtyWeights: { 1: 60, 2: 30, 3: 10 },
    },
    household_errand: {
      basket: [1, 3],
      categoryWeights: { "Household": 5, "Personal Care & Convenience": 5, "Grocery & Pantry": 1, "Drinks": 0.5, "Snacks & Confectionery": 0.5 },
      qtyWeights: { 1: 75, 2: 20, 3: 5 },
    },
  },
};

// ---------- Random helpers ----------

// Small seeded random number generator (mulberry32). Returns a function giving numbers in [0, 1).
function createRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal random number (Box-Muller).
function normal(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Pick an item from a list using a weight function.
function weightedPick(rng, items, weightOf) {
  let total = 0;
  for (const it of items) total += weightOf(it);
  let r = rng() * total;
  for (const it of items) {
    r -= weightOf(it);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

// Pick a key from { key: weight }.
function pickFromObject(rng, obj) {
  return weightedPick(rng, Object.keys(obj), (k) => obj[k]);
}

// ---------- Calendar helpers ----------

function dayOfWeek(day) {
  return (config.firstDayOfWeek + day - 1) % 7; // 0 = Monday ... 6 = Sunday
}

function isWeekend(day) {
  return dayOfWeek(day) >= 5;
}

function periodOf(hour) {
  for (const p of config.periods) {
    const inside = p.from <= p.to ? hour >= p.from && hour <= p.to : hour >= p.from || hour <= p.to;
    if (inside) return p.name;
  }
  return "late";
}

// ---------- Sampling functions ----------

// How many customers visit on this day.
function sampleDailyCustomers(rng, day) {
  const a = config.arrivals;
  let mean = a.baseDailyMean;
  if (isWeekend(day)) mean *= a.weekendMultiplier;
  if (day === a.eventDay) mean *= a.eventMultiplier;
  const noisy = mean * (1 + a.noiseSd * normal(rng));
  return Math.max(0, Math.round(noisy));
}

// Which hour (0-23) a customer arrives.
function sampleHour(rng, weekend) {
  const profile = weekend ? config.hourlyProfile.weekend : config.hourlyProfile.weekday;
  const hours = profile.map((_, h) => h);
  return weightedPick(rng, hours, (h) => profile[h]);
}

// Which customer type this is. Depends on the hour and whether it is a weekend.
function sampleCustomerType(rng, hour, weekend) {
  const period = periodOf(hour);
  const types = Object.keys(config.customerTypes);
  return weightedPick(rng, types, (t) => {
    const c = config.customerTypes[t];
    return c.share * (weekend ? c.weekendFactor : 1) * c.periodBias[period];
  });
}

// Which shopping mission this customer type is on.
function sampleMission(rng, type) {
  return pickFromObject(rng, config.customerTypes[type].missions);
}

// The products (and quantities) a customer wants to buy for a mission.
// Chance of choosing a product = category preference x popularity^popularityPower.
// Returns [{ product, qty }]. Stock is NOT checked here; the simulation does that.
function pickProducts(rng, mission, products) {
  const m = config.missions[mission];
  const size = m.basket[0] + Math.floor(rng() * (m.basket[1] - m.basket[0] + 1));
  const pool = products.filter((p) => m.categoryWeights[p.category] > 0);
  const basket = [];
  for (let i = 0; i < size && pool.length > 0; i++) {
    const chosen = weightedPick(rng, pool, (p) => m.categoryWeights[p.category] * Math.pow(p.popularity, config.popularityPower));
    pool.splice(pool.indexOf(chosen), 1); // a product appears once per basket
    const qty = Number(pickFromObject(rng, m.qtyWeights));
    basket.push({ product: chosen, qty });
  }
  return basket;
}

// ---------- Model Declaration text (shown in the web app) ----------
// Built from the config so the wording always matches the numbers used.

const pct = (x) => Math.round(x * 100) + "%";

const declaration = {
  customerGeneration:
    `Each simulated day has a random number of customers, averaging about ${config.arrivals.baseDailyMean} on a weekday. ` +
    `Weekends are ${pct(1 - config.arrivals.weekendMultiplier)} quieter, and every day varies by roughly ${pct(config.arrivals.noiseSd)} at random. ` +
    `One special event is built in: a ${config.arrivals.eventName} on Day ${config.arrivals.eventDay} (a Saturday) lifts customer numbers by ${pct(config.arrivals.eventMultiplier - 1)}. ` +
    `Customers arrive through the day following an hourly pattern, with peaks at lunchtime (12-1pm) and after work (5-7pm) on weekdays and a flatter, later pattern on weekends. ` +
    `Each customer is one of four types: office worker, visitor, local resident or evening shopper. Office workers dominate weekday lunchtimes, visitors and locals are more common on weekends, and evening shoppers appear mostly after 5pm and late at night.`,

  shoppingBehaviour:
    `Every customer has a shopping mission: a quick snack or drink, lunch, an evening meal, a top-up grocery shop, or a household errand. ` +
    `The mission decides how many different products go in the basket (for example 1-3 for a quick snack, 3-6 for a grocery top-up) and which categories the customer prefers. ` +
    `Within those categories, popular products are chosen more often than unpopular ones, so a few products (bottled water, cola, sandwiches) sell much more than specialty items (truffle salt, sunscreen). ` +
    `Most products are bought one at a time, with two or three units being occasional, and more common for grocery top-ups. ` +
    `If a product a customer wants is sold out, they simply do not buy it; there is no substitution and no waiting.`,

  perishables:
    `Perishable products carry a shelf life in days, from 2 days for sandwiches and sushi up to 30 days for cheese. ` +
    `Every delivery is recorded as its own batch with its own expiry date. The store sells the batch closest to expiry first, and never sells a product on or after its expiry day. ` +
    `Any stock that reaches its expiry day is removed from sale at the start of that day and recorded as a write-off at cost. ` +
    `Non-perishable products (drinks, snacks, pantry, household and personal care items) never expire.`,

  storeBrain: brainDeclaration.storeBrain,

  replenishment: brainDeclaration.replenishment,

  otherAssumptions:
    `All figures are simulated: the store does not exist yet, so customer numbers, product popularity, prices and costs are modelling assumptions and not real data. ` +
    `Prices are in Australian dollars with no GST modelled. ` +
    `Rent, wages, utilities, fit-out, refrigeration and other overheads are outside the scope of the model. ` +
    `Orders placed at the end of each day arrive before opening the next day (a fixed one-day delivery time), and no order is placed after Day 60. ` +
    `Real trading data would be needed to calibrate and validate these assumptions.`,
};

module.exports = {
  config,
  declaration,
  createRng,
  dayOfWeek,
  isWeekend,
  sampleDailyCustomers,
  sampleHour,
  sampleCustomerType,
  sampleMission,
  pickProducts,
};

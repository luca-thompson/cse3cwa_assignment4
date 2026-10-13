// Product catalogue. popularity (1-10) is used later by the demand model.
// Fields: product_id, name, category, unit_cost, unit_price, initial_qty,
//         is_perishable (0/1), shelf_life_days (null if not perishable), popularity
const products = [
  // --- Grocery & Pantry ---
  { product_id: "P001", name: "Spaghetti 500g", category: "Grocery & Pantry", unit_cost: 1.10, unit_price: 2.20, initial_qty: 380, is_perishable: 0, shelf_life_days: null, popularity: 4 },
  { product_id: "P002", name: "Long Grain Rice 1kg", category: "Grocery & Pantry", unit_cost: 1.60, unit_price: 3.00, initial_qty: 280, is_perishable: 0, shelf_life_days: null, popularity: 3 },
  { product_id: "P003", name: "Chopped Tomatoes 400g", category: "Grocery & Pantry", unit_cost: 0.70, unit_price: 1.40, initial_qty: 510, is_perishable: 0, shelf_life_days: null, popularity: 4 },
  { product_id: "P004", name: "Baked Beans 420g", category: "Grocery & Pantry", unit_cost: 0.90, unit_price: 1.80, initial_qty: 410, is_perishable: 0, shelf_life_days: null, popularity: 4 },
  { product_id: "P005", name: "Tuna in Springwater 95g", category: "Grocery & Pantry", unit_cost: 1.10, unit_price: 2.20, initial_qty: 680, is_perishable: 0, shelf_life_days: null, popularity: 6 },
  { product_id: "P006", name: "Instant Noodles Chicken 85g", category: "Grocery & Pantry", unit_cost: 0.60, unit_price: 1.40, initial_qty: 920, is_perishable: 0, shelf_life_days: null, popularity: 6 },
  { product_id: "P007", name: "Peanut Butter 375g", category: "Grocery & Pantry", unit_cost: 2.30, unit_price: 4.20, initial_qty: 210, is_perishable: 0, shelf_life_days: null, popularity: 3 },
  { product_id: "P008", name: "Cornflakes Cereal 500g", category: "Grocery & Pantry", unit_cost: 3.00, unit_price: 5.00, initial_qty: 230, is_perishable: 0, shelf_life_days: null, popularity: 3 },
  { product_id: "P009", name: "Instant Coffee 100g", category: "Grocery & Pantry", unit_cost: 4.50, unit_price: 7.50, initial_qty: 180, is_perishable: 0, shelf_life_days: null, popularity: 3 },
  { product_id: "P010", name: "Extra Virgin Olive Oil 500ml", category: "Grocery & Pantry", unit_cost: 6.50, unit_price: 10.50, initial_qty: 70, is_perishable: 0, shelf_life_days: null, popularity: 1 },
  { product_id: "P011", name: "Truffle Salt 100g", category: "Grocery & Pantry", unit_cost: 6.00, unit_price: 11.00, initial_qty: 55, is_perishable: 0, shelf_life_days: null, popularity: 1 },

  // --- Drinks ---
  { product_id: "P012", name: "Spring Water 600ml", category: "Drinks", unit_cost: 0.80, unit_price: 2.50, initial_qty: 3280, is_perishable: 0, shelf_life_days: null, popularity: 10 },
  { product_id: "P013", name: "Cola 600ml", category: "Drinks", unit_cost: 1.60, unit_price: 4.00, initial_qty: 1920, is_perishable: 0, shelf_life_days: null, popularity: 9 },
  { product_id: "P014", name: "Zero Sugar Cola 600ml", category: "Drinks", unit_cost: 1.60, unit_price: 4.00, initial_qty: 1440, is_perishable: 0, shelf_life_days: null, popularity: 8 },
  { product_id: "P015", name: "Sparkling Mineral Water 1L", category: "Drinks", unit_cost: 1.30, unit_price: 3.20, initial_qty: 560, is_perishable: 0, shelf_life_days: null, popularity: 5 },
  { product_id: "P016", name: "Energy Drink 500ml", category: "Drinks", unit_cost: 2.20, unit_price: 4.50, initial_qty: 1260, is_perishable: 0, shelf_life_days: null, popularity: 8 },
  { product_id: "P017", name: "Sports Drink 600ml", category: "Drinks", unit_cost: 1.70, unit_price: 3.80, initial_qty: 770, is_perishable: 0, shelf_life_days: null, popularity: 6 },
  { product_id: "P018", name: "Fresh Orange Juice 1L", category: "Drinks", unit_cost: 2.60, unit_price: 5.50, initial_qty: 140, is_perishable: 1, shelf_life_days: 10, popularity: 5 },
  { product_id: "P019", name: "Iced Coffee 500ml", category: "Drinks", unit_cost: 2.00, unit_price: 4.60, initial_qty: 300, is_perishable: 1, shelf_life_days: 14, popularity: 8 },

  // --- Snacks & Confectionery ---
  { product_id: "P020", name: "Potato Chips Original 175g", category: "Snacks & Confectionery", unit_cost: 2.20, unit_price: 4.50, initial_qty: 900, is_perishable: 0, shelf_life_days: null, popularity: 8 },
  { product_id: "P021", name: "Milk Chocolate Block 180g", category: "Snacks & Confectionery", unit_cost: 2.80, unit_price: 5.00, initial_qty: 730, is_perishable: 0, shelf_life_days: null, popularity: 7 },
  { product_id: "P022", name: "Mixed Lollies Bag 200g", category: "Snacks & Confectionery", unit_cost: 1.80, unit_price: 3.80, initial_qty: 620, is_perishable: 0, shelf_life_days: null, popularity: 6 },
  { product_id: "P023", name: "Muesli Bars 6pk", category: "Snacks & Confectionery", unit_cost: 2.50, unit_price: 4.50, initial_qty: 460, is_perishable: 0, shelf_life_days: null, popularity: 6 },
  { product_id: "P024", name: "Salted Mixed Nuts 200g", category: "Snacks & Confectionery", unit_cost: 3.20, unit_price: 5.80, initial_qty: 310, is_perishable: 0, shelf_life_days: null, popularity: 4 },
  { product_id: "P025", name: "Chewing Gum Peppermint 14pc", category: "Snacks & Confectionery", unit_cost: 0.90, unit_price: 2.00, initial_qty: 1000, is_perishable: 0, shelf_life_days: null, popularity: 7 },
  { product_id: "P026", name: "Protein Bar Choc 60g", category: "Snacks & Confectionery", unit_cost: 2.40, unit_price: 4.50, initial_qty: 450, is_perishable: 0, shelf_life_days: null, popularity: 5 },
  { product_id: "P027", name: "Gourmet Rice Crackers 100g", category: "Snacks & Confectionery", unit_cost: 2.00, unit_price: 4.00, initial_qty: 90, is_perishable: 0, shelf_life_days: null, popularity: 1 },

  // --- Dairy & Chilled ---
  { product_id: "P028", name: "Full Cream Milk 2L", category: "Dairy & Chilled", unit_cost: 2.10, unit_price: 3.20, initial_qty: 230, is_perishable: 1, shelf_life_days: 7, popularity: 8 },
  { product_id: "P029", name: "Full Cream Milk 1L", category: "Dairy & Chilled", unit_cost: 1.30, unit_price: 2.20, initial_qty: 180, is_perishable: 1, shelf_life_days: 7, popularity: 7 },
  { product_id: "P030", name: "Greek Yoghurt 1kg", category: "Dairy & Chilled", unit_cost: 3.50, unit_price: 6.00, initial_qty: 120, is_perishable: 1, shelf_life_days: 14, popularity: 4 },
  { product_id: "P031", name: "Tasty Cheese Block 500g", category: "Dairy & Chilled", unit_cost: 5.50, unit_price: 8.50, initial_qty: 110, is_perishable: 1, shelf_life_days: 30, popularity: 4 },
  { product_id: "P032", name: "Free Range Eggs 12pk", category: "Dairy & Chilled", unit_cost: 4.20, unit_price: 6.50, initial_qty: 150, is_perishable: 1, shelf_life_days: 21, popularity: 5 },

  // --- Fresh & Bakery ---
  { product_id: "P033", name: "Sliced White Bread 650g", category: "Fresh & Bakery", unit_cost: 1.60, unit_price: 3.20, initial_qty: 180, is_perishable: 1, shelf_life_days: 4, popularity: 7 },
  { product_id: "P034", name: "Butter Croissant", category: "Fresh & Bakery", unit_cost: 1.30, unit_price: 3.50, initial_qty: 75, is_perishable: 1, shelf_life_days: 2, popularity: 5 },
  { product_id: "P035", name: "Bananas 1kg", category: "Fresh & Bakery", unit_cost: 2.20, unit_price: 3.90, initial_qty: 110, is_perishable: 1, shelf_life_days: 5, popularity: 6 },
  { product_id: "P036", name: "Royal Gala Apples 1kg", category: "Fresh & Bakery", unit_cost: 3.00, unit_price: 5.50, initial_qty: 90, is_perishable: 1, shelf_life_days: 7, popularity: 4 },
  { product_id: "P037", name: "Avocado Hass each", category: "Fresh & Bakery", unit_cost: 1.40, unit_price: 2.80, initial_qty: 110, is_perishable: 1, shelf_life_days: 4, popularity: 4 },

  // --- Ready-to-eat ---
  { product_id: "P038", name: "Chicken Salad Sandwich", category: "Ready-to-eat", unit_cost: 3.20, unit_price: 6.80, initial_qty: 110, is_perishable: 1, shelf_life_days: 2, popularity: 9 },
  { product_id: "P039", name: "Ham & Cheese Toastie", category: "Ready-to-eat", unit_cost: 2.80, unit_price: 6.00, initial_qty: 75, is_perishable: 1, shelf_life_days: 2, popularity: 7 },
  { product_id: "P040", name: "Sushi Pack 8pc", category: "Ready-to-eat", unit_cost: 4.00, unit_price: 8.50, initial_qty: 75, is_perishable: 1, shelf_life_days: 2, popularity: 7 },
  { product_id: "P041", name: "Chicken Caesar Salad Bowl", category: "Ready-to-eat", unit_cost: 4.50, unit_price: 9.00, initial_qty: 60, is_perishable: 1, shelf_life_days: 3, popularity: 6 },
  { product_id: "P042", name: "Beef Lasagne Meal 350g", category: "Ready-to-eat", unit_cost: 4.20, unit_price: 8.50, initial_qty: 60, is_perishable: 1, shelf_life_days: 5, popularity: 4 },
  { product_id: "P043", name: "Sausage Roll", category: "Ready-to-eat", unit_cost: 1.50, unit_price: 4.00, initial_qty: 75, is_perishable: 1, shelf_life_days: 3, popularity: 6 },
  { product_id: "P044", name: "Fresh Fruit Cup 200g", category: "Ready-to-eat", unit_cost: 2.00, unit_price: 4.50, initial_qty: 75, is_perishable: 1, shelf_life_days: 4, popularity: 5 },

  // --- Household ---
  { product_id: "P045", name: "Toilet Paper 12pk", category: "Household", unit_cost: 6.50, unit_price: 10.00, initial_qty: 140, is_perishable: 0, shelf_life_days: null, popularity: 3 },
  { product_id: "P046", name: "Paper Towel 2pk", category: "Household", unit_cost: 2.80, unit_price: 5.00, initial_qty: 120, is_perishable: 0, shelf_life_days: null, popularity: 2 },
  { product_id: "P047", name: "AA Batteries 4pk", category: "Household", unit_cost: 4.50, unit_price: 8.50, initial_qty: 140, is_perishable: 0, shelf_life_days: null, popularity: 3 },

  // --- Personal Care & Convenience ---
  { product_id: "P048", name: "Toothpaste 110g", category: "Personal Care & Convenience", unit_cost: 2.20, unit_price: 4.50, initial_qty: 180, is_perishable: 0, shelf_life_days: null, popularity: 3 },
  { product_id: "P049", name: "Roll-on Deodorant 50ml", category: "Personal Care & Convenience", unit_cost: 2.80, unit_price: 5.50, initial_qty: 140, is_perishable: 0, shelf_life_days: null, popularity: 3 },
  { product_id: "P050", name: "Pocket Tissues 6pk", category: "Personal Care & Convenience", unit_cost: 0.70, unit_price: 1.80, initial_qty: 420, is_perishable: 0, shelf_life_days: null, popularity: 5 },
  { product_id: "P051", name: "Compact Umbrella", category: "Personal Care & Convenience", unit_cost: 7.00, unit_price: 15.00, initial_qty: 50, is_perishable: 0, shelf_life_days: null, popularity: 2 },
  { product_id: "P052", name: "Sunscreen SPF50+ 110ml", category: "Personal Care & Convenience", unit_cost: 5.50, unit_price: 12.00, initial_qty: 45, is_perishable: 0, shelf_life_days: null, popularity: 1 },
];

module.exports = products;

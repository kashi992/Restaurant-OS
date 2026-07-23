/**
 * Seed real menu data for "Sohaib Anwar" restaurant
 * Clears dummy menu data and inserts realistic items
 * Run: npx tsx scripts/seed-real-data.ts
 */

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Look up IDs dynamically so this works on any environment
async function getIds(client: any) {
  const restResult = await client.query(`SELECT id FROM restaurants LIMIT 1`);
  if (restResult.rows.length === 0) throw new Error("No restaurant found. Run seed.ts first.");
  const RESTAURANT_ID = restResult.rows[0].id;

  const menuResult = await client.query(`SELECT id FROM menus WHERE restaurant_id = '${RESTAURANT_ID}' LIMIT 1`);
  if (menuResult.rows.length === 0) throw new Error("No menu found for restaurant.");
  const MENU_ID = menuResult.rows[0].id;

  return { RESTAURANT_ID, MENU_ID };
}

function uid() {
  return crypto.randomUUID();
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { RESTAURANT_ID, MENU_ID } = await getIds(client);

    // ── Clear existing data ───────────────────────────────────────────────────
    console.log("Clearing old data...");
    await client.query(`DELETE FROM menu_item_recipes WHERE restaurant_id = '${RESTAURANT_ID}'`);
    await client.query(`DELETE FROM inventory_items   WHERE restaurant_id = '${RESTAURANT_ID}'`);
    await client.query(`DELETE FROM menu_items        WHERE restaurant_id = '${RESTAURANT_ID}'`);
    await client.query(`DELETE FROM modifier_groups   WHERE restaurant_id = '${RESTAURANT_ID}'`);
    await client.query(`DELETE FROM categories        WHERE restaurant_id = '${RESTAURANT_ID}'`);

    // ── Categories ────────────────────────────────────────────────────────────
    console.log("Inserting categories...");
    const catBurgers = uid();
    const catPizza   = uid();
    const catDrinks  = uid();
    const catSides   = uid();

    await client.query(`
      INSERT INTO categories (id, restaurant_id, menu_id, name, is_active, sort_order) VALUES
      ('${catBurgers}', '${RESTAURANT_ID}', '${MENU_ID}', 'Burgers', true, 1),
      ('${catPizza}',   '${RESTAURANT_ID}', '${MENU_ID}', 'Pizzas',  true, 2),
      ('${catDrinks}',  '${RESTAURANT_ID}', '${MENU_ID}', 'Drinks',  true, 3),
      ('${catSides}',   '${RESTAURANT_ID}', '${MENU_ID}', 'Sides',   true, 4)
    `);

    // ── Modifier Groups & Modifiers ───────────────────────────────────────────
    console.log("Inserting modifier groups...");
    const mgSize    = uid();
    const mgCooking = uid();
    const mgExtras  = uid();
    const mgDrink   = uid();

    await client.query(`
      INSERT INTO modifier_groups (id, restaurant_id, name, is_required, min_selections, max_selections, sort_order) VALUES
      ('${mgSize}',    '${RESTAURANT_ID}', 'Burger Size',    true,  1, 1, 1),
      ('${mgCooking}', '${RESTAURANT_ID}', 'Cooking Level',  false, 0, 1, 2),
      ('${mgExtras}',  '${RESTAURANT_ID}', 'Extra Toppings', false, 0, 5, 3),
      ('${mgDrink}',   '${RESTAURANT_ID}', 'Drink Size',     true,  1, 1, 1)
    `);

    await client.query(`
      INSERT INTO modifiers (id, modifier_group_id, name, price, is_default, is_available, sort_order) VALUES
      ('${uid()}', '${mgSize}',    'Regular (150g)', 0.00,  true,  true, 1),
      ('${uid()}', '${mgSize}',    'Large (200g)',   2.00,  false, true, 2),
      ('${uid()}', '${mgSize}',    'XL (250g)',      4.00,  false, true, 3),
      ('${uid()}', '${mgCooking}', 'Rare',           0.00,  false, true, 1),
      ('${uid()}', '${mgCooking}', 'Medium',         0.00,  true,  true, 2),
      ('${uid()}', '${mgCooking}', 'Well Done',      0.00,  false, true, 3),
      ('${uid()}', '${mgExtras}',  'Extra Cheese',   1.00,  false, true, 1),
      ('${uid()}', '${mgExtras}',  'Bacon',          1.50,  false, true, 2),
      ('${uid()}', '${mgExtras}',  'Avocado',        1.50,  false, true, 3),
      ('${uid()}', '${mgExtras}',  'Fried Egg',      1.00,  false, true, 4),
      ('${uid()}', '${mgDrink}',   'Small (250ml)',  0.00,  true,  true, 1),
      ('${uid()}', '${mgDrink}',   'Medium (400ml)', 0.50,  false, true, 2),
      ('${uid()}', '${mgDrink}',   'Large (600ml)',  1.00,  false, true, 3)
    `);

    // ── Menu Items ────────────────────────────────────────────────────────────
    console.log("Inserting menu items...");
    const iClassicBurger  = uid();
    const iCheeseBurger   = uid();
    const iChickenBurger  = uid();
    const iMargherita     = uid();
    const iPepperoni      = uid();
    const iBBQChicken     = uid();
    const iCola           = uid();
    const iLemonade       = uid();
    const iFries          = uid();
    const iOnionRings     = uid();

    await client.query(`
      INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, cost, is_available, is_popular, preparation_time, sort_order) VALUES
      ('${iClassicBurger}',  '${RESTAURANT_ID}', '${catBurgers}', 'Classic Beef Burger',   'Juicy beef patty with lettuce, tomato and signature sauce',        12.99, NULL, true, true,  10, 1),
      ('${iCheeseBurger}',   '${RESTAURANT_ID}', '${catBurgers}', 'Double Cheeseburger',   'Two beef patties with cheddar cheese, pickles and mustard',        15.99, NULL, true, true,  12, 2),
      ('${iChickenBurger}',  '${RESTAURANT_ID}', '${catBurgers}', 'Crispy Chicken Burger', 'Crispy fried chicken fillet with coleslaw and honey mustard',      13.99, NULL, true, false, 12, 3),
      ('${iMargherita}',     '${RESTAURANT_ID}', '${catPizza}',   'Margherita Pizza',      'Classic tomato base with fresh mozzarella and basil',              13.99, NULL, true, true,  15, 1),
      ('${iPepperoni}',      '${RESTAURANT_ID}', '${catPizza}',   'Pepperoni Pizza',       'Tomato base, mozzarella and generous pepperoni slices',            15.99, NULL, true, true,  15, 2),
      ('${iBBQChicken}',     '${RESTAURANT_ID}', '${catPizza}',   'BBQ Chicken Pizza',     'BBQ sauce base, grilled chicken, red onion and mozzarella',        16.99, NULL, true, false, 15, 3),
      ('${iCola}',           '${RESTAURANT_ID}', '${catDrinks}',  'Coca-Cola',             'Ice cold Coca-Cola served with ice',                               2.99,  NULL, true, false,  2, 1),
      ('${iLemonade}',       '${RESTAURANT_ID}', '${catDrinks}',  'Fresh Lemonade',        'Freshly squeezed lemonade with mint and ice',                      3.99,  NULL, true, false,  5, 2),
      ('${iFries}',          '${RESTAURANT_ID}', '${catSides}',   'Crispy Fries',          'Golden crispy fries seasoned with sea salt',                       3.99,  NULL, true, true,   8, 1),
      ('${iOnionRings}',     '${RESTAURANT_ID}', '${catSides}',   'Onion Rings',           'Beer-battered onion rings served with dipping sauce',              4.49,  NULL, true, false,  8, 2)
    `);

    // ── Inventory Items ───────────────────────────────────────────────────────
    console.log("Inserting inventory items...");
    const invBeefPatty     = uid();
    const invChicken       = uid();
    const invBun           = uid();
    const invCheese        = uid();
    const invLettuce       = uid();
    const invTomato        = uid();
    const invDough         = uid();
    const invTomatoSauce   = uid();
    const invMozzarella    = uid();
    const invPepperoni     = uid();
    const invBBQSauce      = uid();
    const invPotatoes      = uid();
    const invOnion         = uid();
    const invCola          = uid();
    const invLemon         = uid();

    await client.query(`
      INSERT INTO inventory_items (id, restaurant_id, name, unit, current_stock, min_stock_level, max_stock_level, cost_per_unit, category, is_active) VALUES
      ('${invBeefPatty}',   '${RESTAURANT_ID}', 'Beef Patty (150g)',    'pcs',    200, 50,  500, 1.80, 'Meat',      true),
      ('${invChicken}',     '${RESTAURANT_ID}', 'Chicken Fillet',       'pcs',    150, 40,  400, 1.50, 'Meat',      true),
      ('${invBun}',         '${RESTAURANT_ID}', 'Burger Bun',           'pcs',    300, 80,  600, 0.25, 'Bakery',    true),
      ('${invCheese}',      '${RESTAURANT_ID}', 'Cheddar Cheese Slice', 'pcs',    400, 100, 800, 0.20, 'Dairy',     true),
      ('${invLettuce}',     '${RESTAURANT_ID}', 'Lettuce',              'kg',      10,  2,   20, 1.50, 'Produce',   true),
      ('${invTomato}',      '${RESTAURANT_ID}', 'Tomato',               'kg',      15,  3,   30, 1.20, 'Produce',   true),
      ('${invDough}',       '${RESTAURANT_ID}', 'Pizza Dough Ball',     'pcs',    100, 20,  200, 0.60, 'Bakery',    true),
      ('${invTomatoSauce}', '${RESTAURANT_ID}', 'Tomato Sauce',         'litre',   20,  5,   40, 2.00, 'Condiment', true),
      ('${invMozzarella}',  '${RESTAURANT_ID}', 'Mozzarella',           'kg',      15,  3,   30, 6.00, 'Dairy',     true),
      ('${invPepperoni}',   '${RESTAURANT_ID}', 'Pepperoni',            'kg',       8,  2,   15, 8.00, 'Meat',      true),
      ('${invBBQSauce}',    '${RESTAURANT_ID}', 'BBQ Sauce',            'litre',   10,  2,   20, 3.00, 'Condiment', true),
      ('${invPotatoes}',    '${RESTAURANT_ID}', 'Potatoes',             'kg',      25,  5,   50, 0.80, 'Produce',   true),
      ('${invOnion}',       '${RESTAURANT_ID}', 'Onion',                'kg',      10,  2,   20, 0.60, 'Produce',   true),
      ('${invCola}',        '${RESTAURANT_ID}', 'Coca-Cola Can',        'pcs',    200, 50,  400, 1.00, 'Beverage',  true),
      ('${invLemon}',       '${RESTAURANT_ID}', 'Lemon',                'pcs',    100, 20,  200, 0.15, 'Produce',   true)
    `);

    // ── Recipes ───────────────────────────────────────────────────────────────
    console.log("Inserting recipes...");
    const recipes = [
      // Classic Beef Burger
      [iClassicBurger, invBeefPatty,   1.00,  'pcs'],
      [iClassicBurger, invBun,         1.00,  'pcs'],
      [iClassicBurger, invLettuce,     0.05,  'kg'],
      [iClassicBurger, invTomato,      0.05,  'kg'],
      // Double Cheeseburger
      [iCheeseBurger,  invBeefPatty,   2.00,  'pcs'],
      [iCheeseBurger,  invBun,         1.00,  'pcs'],
      [iCheeseBurger,  invCheese,      2.00,  'pcs'],
      [iCheeseBurger,  invTomato,      0.05,  'kg'],
      // Crispy Chicken Burger
      [iChickenBurger, invChicken,     1.00,  'pcs'],
      [iChickenBurger, invBun,         1.00,  'pcs'],
      [iChickenBurger, invLettuce,     0.05,  'kg'],
      // Margherita Pizza
      [iMargherita,    invDough,       1.00,  'pcs'],
      [iMargherita,    invTomatoSauce, 0.10,  'litre'],
      [iMargherita,    invMozzarella,  0.15,  'kg'],
      // Pepperoni Pizza
      [iPepperoni,     invDough,       1.00,  'pcs'],
      [iPepperoni,     invTomatoSauce, 0.10,  'litre'],
      [iPepperoni,     invMozzarella,  0.15,  'kg'],
      [iPepperoni,     invPepperoni,   0.10,  'kg'],
      // BBQ Chicken Pizza
      [iBBQChicken,    invDough,       1.00,  'pcs'],
      [iBBQChicken,    invBBQSauce,    0.10,  'litre'],
      [iBBQChicken,    invMozzarella,  0.15,  'kg'],
      [iBBQChicken,    invChicken,     1.00,  'pcs'],
      [iBBQChicken,    invOnion,       0.05,  'kg'],
      // Coca-Cola
      [iCola,          invCola,        1.00,  'pcs'],
      // Fresh Lemonade
      [iLemonade,      invLemon,       3.00,  'pcs'],
      // Crispy Fries
      [iFries,         invPotatoes,    0.25,  'kg'],
      // Onion Rings
      [iOnionRings,    invOnion,       0.15,  'kg'],
    ];

    for (const [menuItemId, inventoryItemId, quantity, unit] of recipes) {
      await client.query(`
        INSERT INTO menu_item_recipes (id, restaurant_id, menu_item_id, inventory_item_id, quantity, unit)
        VALUES ('${uid()}', '${RESTAURANT_ID}', '${menuItemId}', '${inventoryItemId}', ${quantity}, '${unit}')
      `);
    }

    await client.query("COMMIT");
    console.log("\n✅ Done! Inserted:");
    console.log("   4 categories  — Burgers, Pizzas, Drinks, Sides");
    console.log("   4 modifier groups with 13 modifiers");
    console.log("  10 menu items");
    console.log("  15 inventory items");
    console.log("  27 recipe ingredient links");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();

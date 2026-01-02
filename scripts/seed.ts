import { db } from "../server/db";
import { 
  users, 
  restaurants, 
  roles, 
  restaurantUsers,
  restaurantFeatureAllowlist,
  restaurantSettings,
  menus,
  categories,
  menuItems,
  modifierGroups,
  modifiers,
  menuItemModifierGroups,
  diningTables,
  qrTokens,
} from "../shared/schema";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

// ============================================================================
// SEED SCRIPT
// Creates: 1 Super Admin + 1 Sample Restaurant with menu, tables, and staff
// Run with: npx tsx scripts/seed.ts
// ============================================================================

async function seed() {
  console.log("Starting database seed...\n");

  // --------------------------------------------------------------------------
  // 1. Create Super Admin User
  // --------------------------------------------------------------------------
  console.log("Creating super admin user...");
  const hashedPassword = await bcrypt.hash("admin123", 10);
  
  const [superAdmin] = await db.insert(users).values({
    email: "admin@posqr.com",
    password: hashedPassword,
    firstName: "Super",
    lastName: "Admin",
    isSuperAdmin: true,
    isActive: true,
    emailVerifiedAt: new Date(),
  }).returning();
  
  console.log(`  Created super admin: ${superAdmin.email} (ID: ${superAdmin.id})`);

  // --------------------------------------------------------------------------
  // 2. Create Sample Restaurant
  // --------------------------------------------------------------------------
  console.log("\nCreating sample restaurant...");
  
  const [restaurant] = await db.insert(restaurants).values({
    name: "The Flying Fork",
    slug: "flying-fork",
    address: "123 Main Street",
    city: "San Francisco",
    state: "CA",
    country: "US",
    postalCode: "94102",
    phone: "+1 415-555-0123",
    email: "hello@flyingfork.com",
    timezone: "America/Los_Angeles",
    currency: "USD",
    taxRate: "0.0875", // 8.75% SF tax
    isActive: true,
  }).returning();
  
  console.log(`  Created restaurant: ${restaurant.name} (ID: ${restaurant.id})`);

  // --------------------------------------------------------------------------
  // 3. Create Feature Allowlist (hard permissions)
  // --------------------------------------------------------------------------
  console.log("\nSetting up feature allowlist...");
  
  const features = [
    { featureKey: "pos", isEnabled: true },
    { featureKey: "qr", isEnabled: true },
    { featureKey: "online_ordering", isEnabled: true },
    { featureKey: "qr_ordering", isEnabled: true },
    { featureKey: "split_payments", isEnabled: true },
    { featureKey: "table_reservations", isEnabled: false },
    { featureKey: "kitchen_display", isEnabled: true },
    { featureKey: "inventory_management", isEnabled: false },
    { featureKey: "loyalty_program", isEnabled: false },
  ];

  for (const feature of features) {
    await db.insert(restaurantFeatureAllowlist).values({
      restaurantId: restaurant.id,
      featureKey: feature.featureKey,
      isEnabled: feature.isEnabled,
    });
  }
  console.log(`  Added ${features.length} feature permissions`);

  // --------------------------------------------------------------------------
  // 4. Create Restaurant Settings (soft toggles)
  // --------------------------------------------------------------------------
  console.log("\nConfiguring restaurant settings...");
  
  const settings = [
    { settingKey: "enable_tips", settingValue: { enabled: true, presets: [15, 18, 20, 25] } },
    { settingKey: "split_billing", settingValue: { enabled: true, max_ways: 8 } },
    { settingKey: "require_customer_phone", settingValue: { enabled: false } },
    { settingKey: "auto_accept_orders", settingValue: { enabled: true } },
    { settingKey: "order_ready_notification", settingValue: { enabled: true, method: "sms" } },
    { settingKey: "kitchen_printer", settingValue: { enabled: false } },
    { settingKey: "receipt_footer", settingValue: { text: "Thank you for dining with us!" } },
    { settingKey: "payment_methods", settingValue: { enabled_methods: ["cash", "card", "apple_pay", "google_pay"] } },
  ];

  for (const setting of settings) {
    await db.insert(restaurantSettings).values({
      restaurantId: restaurant.id,
      settingKey: setting.settingKey,
      settingValue: setting.settingValue,
    });
  }
  console.log(`  Added ${settings.length} settings`);

  // --------------------------------------------------------------------------
  // 5. Create Roles
  // --------------------------------------------------------------------------
  console.log("\nCreating staff roles...");
  
  const roleDefinitions = [
    { 
      name: "admin", 
      description: "Full access to all features",
      permissions: ["*"],
      isSystemRole: true,
    },
    { 
      name: "manager", 
      description: "Manage staff, menu, and view reports",
      permissions: ["orders:*", "menu:*", "tables:*", "staff:read", "reports:read"],
      isSystemRole: true,
    },
    { 
      name: "server", 
      description: "Take orders and process payments",
      permissions: ["orders:create", "orders:read", "orders:update", "tables:read", "payments:create"],
      isSystemRole: true,
    },
    { 
      name: "kitchen", 
      description: "View and update order status",
      permissions: ["orders:read", "orders:update:status"],
      isSystemRole: true,
    },
    { 
      name: "cashier", 
      description: "Process payments only",
      permissions: ["orders:read", "payments:*"],
      isSystemRole: true,
    },
  ];

  const createdRoles: Record<string, typeof roles.$inferSelect> = {};
  
  for (const roleDef of roleDefinitions) {
    const [role] = await db.insert(roles).values({
      restaurantId: restaurant.id,
      name: roleDef.name,
      description: roleDef.description,
      permissions: roleDef.permissions,
      isSystemRole: roleDef.isSystemRole,
    }).returning();
    createdRoles[roleDef.name] = role;
  }
  console.log(`  Created ${roleDefinitions.length} roles`);

  // --------------------------------------------------------------------------
  // 6. Create Staff Users and Assign to Restaurant
  // --------------------------------------------------------------------------
  console.log("\nCreating staff users...");
  
  const staffPassword = await bcrypt.hash("staff123", 10);
  
  const staffUsers = [
    { email: "john@flyingfork.com", firstName: "John", lastName: "Manager", role: "manager", pin: "1234" },
    { email: "jane@flyingfork.com", firstName: "Jane", lastName: "Server", role: "server", pin: "2345" },
    { email: "bob@flyingfork.com", firstName: "Bob", lastName: "Kitchen", role: "kitchen", pin: "3456" },
    { email: "alice@flyingfork.com", firstName: "Alice", lastName: "Cashier", role: "cashier", pin: "4567" },
  ];

  for (const staffDef of staffUsers) {
    const [user] = await db.insert(users).values({
      email: staffDef.email,
      password: staffPassword,
      firstName: staffDef.firstName,
      lastName: staffDef.lastName,
      isActive: true,
    }).returning();

    await db.insert(restaurantUsers).values({
      restaurantId: restaurant.id,
      userId: user.id,
      roleId: createdRoles[staffDef.role].id,
      pin: staffDef.pin,
      isActive: true,
      hiredAt: new Date(),
    });
    
    console.log(`  Created ${staffDef.role}: ${staffDef.email}`);
  }

  // --------------------------------------------------------------------------
  // 7. Create Menu
  // --------------------------------------------------------------------------
  console.log("\nCreating menu...");
  
  const [menu] = await db.insert(menus).values({
    restaurantId: restaurant.id,
    name: "Main Menu",
    description: "Our all-day dining menu",
    isActive: true,
    isDefault: true,
    availableFrom: "11:00",
    availableTo: "22:00",
    sortOrder: 0,
  }).returning();
  
  console.log(`  Created menu: ${menu.name}`);

  // --------------------------------------------------------------------------
  // 8. Create Categories
  // --------------------------------------------------------------------------
  console.log("\nCreating menu categories...");
  
  const categoryDefs = [
    { name: "Appetizers", description: "Start your meal right", sortOrder: 0 },
    { name: "Salads", description: "Fresh and healthy options", sortOrder: 1 },
    { name: "Main Courses", description: "Our signature dishes", sortOrder: 2 },
    { name: "Burgers", description: "Handcrafted burgers", sortOrder: 3 },
    { name: "Desserts", description: "Sweet endings", sortOrder: 4 },
    { name: "Beverages", description: "Drinks and refreshments", sortOrder: 5 },
  ];

  const createdCategories: Record<string, typeof categories.$inferSelect> = {};
  
  for (const catDef of categoryDefs) {
    const [category] = await db.insert(categories).values({
      restaurantId: restaurant.id,
      menuId: menu.id,
      name: catDef.name,
      description: catDef.description,
      sortOrder: catDef.sortOrder,
      isActive: true,
    }).returning();
    createdCategories[catDef.name] = category;
  }
  console.log(`  Created ${categoryDefs.length} categories`);

  // --------------------------------------------------------------------------
  // 9. Create Menu Items
  // --------------------------------------------------------------------------
  console.log("\nCreating menu items...");
  
  const menuItemDefs = [
    // Appetizers
    { category: "Appetizers", name: "Crispy Calamari", price: "14.99", description: "Lightly breaded and fried, served with marinara", preparationTime: 12, tags: ["seafood"] },
    { category: "Appetizers", name: "Buffalo Wings", price: "12.99", description: "Tossed in our signature buffalo sauce", preparationTime: 15, tags: ["spicy"], isPopular: true },
    { category: "Appetizers", name: "Spinach Artichoke Dip", price: "11.99", description: "Creamy dip served with tortilla chips", preparationTime: 10, tags: ["vegetarian"] },
    
    // Salads
    { category: "Salads", name: "Caesar Salad", price: "10.99", description: "Romaine, parmesan, croutons, caesar dressing", preparationTime: 8, tags: ["vegetarian"] },
    { category: "Salads", name: "Grilled Chicken Salad", price: "14.99", description: "Mixed greens, grilled chicken, avocado, tomatoes", preparationTime: 12, tags: ["healthy"] },
    
    // Main Courses
    { category: "Main Courses", name: "Grilled Salmon", price: "26.99", description: "Atlantic salmon with lemon butter sauce", preparationTime: 20, tags: ["seafood", "healthy"], isPopular: true },
    { category: "Main Courses", name: "NY Strip Steak", price: "34.99", description: "12oz USDA Choice, grilled to perfection", preparationTime: 25, tags: [] },
    { category: "Main Courses", name: "Chicken Parmesan", price: "22.99", description: "Breaded chicken breast with marinara and mozzarella", preparationTime: 20, tags: [] },
    { category: "Main Courses", name: "Vegetable Stir Fry", price: "16.99", description: "Seasonal vegetables in garlic sauce over rice", preparationTime: 15, tags: ["vegan", "vegetarian"] },
    
    // Burgers
    { category: "Burgers", name: "Classic Cheeseburger", price: "15.99", description: "Half-pound beef patty, cheddar, lettuce, tomato", preparationTime: 15, isPopular: true, tags: [] },
    { category: "Burgers", name: "Bacon BBQ Burger", price: "17.99", description: "Bacon, onion rings, BBQ sauce, cheddar", preparationTime: 15, tags: [] },
    { category: "Burgers", name: "Veggie Burger", price: "14.99", description: "House-made veggie patty with all the fixings", preparationTime: 15, tags: ["vegetarian"] },
    
    // Desserts
    { category: "Desserts", name: "Chocolate Lava Cake", price: "9.99", description: "Warm chocolate cake with molten center", preparationTime: 12, isPopular: true, tags: ["vegetarian"] },
    { category: "Desserts", name: "New York Cheesecake", price: "8.99", description: "Classic cheesecake with berry compote", preparationTime: 5, tags: ["vegetarian"] },
    { category: "Desserts", name: "Ice Cream Sundae", price: "7.99", description: "Three scoops with toppings of your choice", preparationTime: 5, tags: ["vegetarian"] },
    
    // Beverages
    { category: "Beverages", name: "Fresh Lemonade", price: "4.99", description: "House-made with fresh lemons", preparationTime: 2, tags: ["vegan"] },
    { category: "Beverages", name: "Iced Tea", price: "3.99", description: "Freshly brewed, sweetened or unsweetened", preparationTime: 1, tags: ["vegan"] },
    { category: "Beverages", name: "Craft Soda", price: "4.49", description: "Assorted artisan sodas", preparationTime: 1, tags: ["vegan"] },
    { category: "Beverages", name: "Coffee", price: "3.49", description: "Fresh brewed coffee", preparationTime: 2, tags: ["vegan"] },
  ];

  const createdMenuItems: Record<string, typeof menuItems.$inferSelect> = {};
  let itemCount = 0;
  
  for (const itemDef of menuItemDefs) {
    const [item] = await db.insert(menuItems).values({
      restaurantId: restaurant.id,
      categoryId: createdCategories[itemDef.category].id,
      name: itemDef.name,
      description: itemDef.description,
      price: itemDef.price,
      preparationTime: itemDef.preparationTime,
      tags: itemDef.tags,
      isPopular: itemDef.isPopular ?? false,
      isAvailable: true,
      sortOrder: itemCount,
    }).returning();
    createdMenuItems[itemDef.name] = item;
    itemCount++;
  }
  console.log(`  Created ${menuItemDefs.length} menu items`);

  // --------------------------------------------------------------------------
  // 10. Create Modifier Groups and Modifiers
  // --------------------------------------------------------------------------
  console.log("\nCreating modifier groups...");
  
  // Steak Temperature
  const [steakTempGroup] = await db.insert(modifierGroups).values({
    restaurantId: restaurant.id,
    name: "Steak Temperature",
    description: "How would you like it cooked?",
    isRequired: true,
    minSelections: 1,
    maxSelections: 1,
    sortOrder: 0,
  }).returning();

  const steakTemps = ["Rare", "Medium Rare", "Medium", "Medium Well", "Well Done"];
  for (let i = 0; i < steakTemps.length; i++) {
    await db.insert(modifiers).values({
      modifierGroupId: steakTempGroup.id,
      name: steakTemps[i],
      price: "0.00",
      isDefault: steakTemps[i] === "Medium",
      sortOrder: i,
    });
  }

  // Link steak temp to NY Strip
  await db.insert(menuItemModifierGroups).values({
    menuItemId: createdMenuItems["NY Strip Steak"].id,
    modifierGroupId: steakTempGroup.id,
    sortOrder: 0,
  });

  // Burger Add-ons
  const [burgerAddonsGroup] = await db.insert(modifierGroups).values({
    restaurantId: restaurant.id,
    name: "Burger Add-ons",
    description: "Customize your burger",
    isRequired: false,
    minSelections: 0,
    maxSelections: 5,
    sortOrder: 1,
  }).returning();

  const burgerAddons = [
    { name: "Extra Cheese", price: "1.50" },
    { name: "Bacon", price: "2.00" },
    { name: "Avocado", price: "2.50" },
    { name: "Fried Egg", price: "1.50" },
    { name: "Jalapenos", price: "0.75" },
    { name: "Sauteed Mushrooms", price: "1.25" },
  ];

  for (let i = 0; i < burgerAddons.length; i++) {
    await db.insert(modifiers).values({
      modifierGroupId: burgerAddonsGroup.id,
      name: burgerAddons[i].name,
      price: burgerAddons[i].price,
      sortOrder: i,
    });
  }

  // Link burger addons to all burgers
  for (const burgerName of ["Classic Cheeseburger", "Bacon BBQ Burger", "Veggie Burger"]) {
    await db.insert(menuItemModifierGroups).values({
      menuItemId: createdMenuItems[burgerName].id,
      modifierGroupId: burgerAddonsGroup.id,
      sortOrder: 0,
    });
  }

  // Ice Cream Toppings
  const [iceCreamGroup] = await db.insert(modifierGroups).values({
    restaurantId: restaurant.id,
    name: "Ice Cream Toppings",
    description: "Choose your toppings",
    isRequired: false,
    minSelections: 0,
    maxSelections: 3,
    sortOrder: 2,
  }).returning();

  const toppings = ["Hot Fudge", "Caramel Sauce", "Whipped Cream", "Sprinkles", "Nuts", "Cherry"];
  for (let i = 0; i < toppings.length; i++) {
    await db.insert(modifiers).values({
      modifierGroupId: iceCreamGroup.id,
      name: toppings[i],
      price: "0.00",
      sortOrder: i,
    });
  }

  await db.insert(menuItemModifierGroups).values({
    menuItemId: createdMenuItems["Ice Cream Sundae"].id,
    modifierGroupId: iceCreamGroup.id,
    sortOrder: 0,
  });

  console.log("  Created 3 modifier groups with modifiers");

  // --------------------------------------------------------------------------
  // 11. Create Dining Tables
  // --------------------------------------------------------------------------
  console.log("\nCreating dining tables...");
  
  const tableDefs = [
    { number: "1", name: "Window Table", capacity: 2, section: "Main Floor" },
    { number: "2", name: "Booth 1", capacity: 4, section: "Main Floor" },
    { number: "3", name: "Booth 2", capacity: 4, section: "Main Floor" },
    { number: "4", name: "Round Table", capacity: 6, section: "Main Floor" },
    { number: "5", name: "Corner Booth", capacity: 4, section: "Main Floor" },
    { number: "B1", name: "Bar Seat 1", capacity: 2, section: "Bar" },
    { number: "B2", name: "Bar Seat 2", capacity: 2, section: "Bar" },
    { number: "B3", name: "Bar Seat 3", capacity: 2, section: "Bar" },
    { number: "P1", name: "Patio Table 1", capacity: 4, section: "Patio" },
    { number: "P2", name: "Patio Table 2", capacity: 4, section: "Patio" },
  ];

  const createdTables: Array<typeof diningTables.$inferSelect> = [];
  
  for (const tableDef of tableDefs) {
    const [table] = await db.insert(diningTables).values({
      restaurantId: restaurant.id,
      number: tableDef.number,
      name: tableDef.name,
      capacity: tableDef.capacity,
      section: tableDef.section,
      status: "available",
      isActive: true,
    }).returning();
    createdTables.push(table);
  }
  console.log(`  Created ${tableDefs.length} tables`);

  // --------------------------------------------------------------------------
  // 12. Create QR Tokens for Tables
  // --------------------------------------------------------------------------
  console.log("\nCreating QR tokens...");
  
  for (const table of createdTables) {
    const token = `FF-${table.number}-${randomUUID().slice(0, 6).toUpperCase()}`;
    await db.insert(qrTokens).values({
      restaurantId: restaurant.id,
      tableId: table.id,
      token: token,
      tokenType: "table",
      isActive: true,
      scansCount: 0,
    });
  }
  console.log(`  Created ${createdTables.length} QR tokens`);

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  console.log("SEED COMPLETED SUCCESSFULLY!");
  console.log("=".repeat(60));
  console.log("\nCredentials:");
  console.log("  Super Admin: admin@posqr.com / admin123");
  console.log("  Staff (all): [email]@flyingfork.com / staff123");
  console.log("\nRestaurant:");
  console.log(`  Name: ${restaurant.name}`);
  console.log(`  Slug: ${restaurant.slug}`);
  console.log(`  URL: /${restaurant.slug}`);
  console.log("\nData Created:");
  console.log(`  - 1 Super Admin`);
  console.log(`  - 1 Restaurant with ${features.length} features, ${settings.length} settings`);
  console.log(`  - ${Object.keys(createdRoles).length} Roles`);
  console.log(`  - ${staffUsers.length} Staff Users`);
  console.log(`  - 1 Menu with ${Object.keys(createdCategories).length} categories`);
  console.log(`  - ${menuItemDefs.length} Menu Items`);
  console.log(`  - 3 Modifier Groups`);
  console.log(`  - ${createdTables.length} Tables with QR codes`);
  console.log("=".repeat(60) + "\n");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });

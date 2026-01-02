import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  integer, 
  boolean, 
  timestamp, 
  decimal, 
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// MULTI-TENANT RESTAURANT POS + QR ORDERING SAAS - COMPLETE SCHEMA
// ============================================================================
// ERD: See README.md for Entity Relationship Diagram notes
// ============================================================================

// ============================================================================
// RESTAURANTS (Tenants) - Core entity for multi-tenancy
// ============================================================================

export const restaurants = pgTable("restaurants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  country: text("country").default("US"),
  postalCode: text("postal_code"),
  phone: text("phone"),
  email: text("email"),
  timezone: text("timezone").default("UTC"),
  currency: text("currency").default("USD"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 4 }).default("0.0000"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("restaurants_slug_idx").on(table.slug),
  index("restaurants_is_active_idx").on(table.isActive),
]);

// Restaurant custom domains for white-labeling
export const restaurantDomains = pgTable("restaurant_domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().unique(),
  isPrimary: boolean("is_primary").default(false),
  isVerified: boolean("is_verified").default(false),
  sslEnabled: boolean("ssl_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("restaurant_domains_domain_idx").on(table.domain),
  index("restaurant_domains_restaurant_id_idx").on(table.restaurantId),
]);

// Hard permissions - what features a restaurant is allowed to access
export const restaurantFeatureAllowlist = pgTable("restaurant_feature_allowlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(), // e.g., "online_ordering", "table_reservations", "split_payments"
  isEnabled: boolean("is_enabled").default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("restaurant_feature_allowlist_unique_idx").on(table.restaurantId, table.featureKey),
  index("restaurant_feature_allowlist_restaurant_id_idx").on(table.restaurantId),
]);

// Soft toggles - restaurant-controlled settings
export const restaurantSettings = pgTable("restaurant_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  settingKey: text("setting_key").notNull(), // e.g., "enable_tips", "require_phone", "auto_accept_orders"
  settingValue: jsonb("setting_value").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("restaurant_settings_unique_idx").on(table.restaurantId, table.settingKey),
  index("restaurant_settings_restaurant_id_idx").on(table.restaurantId),
]);

// ============================================================================
// USERS & ROLES - Authentication and Authorization
// ============================================================================

// Global users table (can belong to multiple restaurants)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  isSuperAdmin: boolean("is_super_admin").default(false),
  isActive: boolean("is_active").default(true),
  emailVerifiedAt: timestamp("email_verified_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("users_email_idx").on(table.email),
  index("users_is_super_admin_idx").on(table.isSuperAdmin),
  index("users_is_active_idx").on(table.isActive),
]);

// Roles definition per restaurant
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // admin, manager, server, kitchen, cashier
  description: text("description"),
  permissions: jsonb("permissions").default([]), // Array of permission strings
  isSystemRole: boolean("is_system_role").default(false), // Cannot be deleted
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("roles_restaurant_name_idx").on(table.restaurantId, table.name),
  index("roles_restaurant_id_idx").on(table.restaurantId),
]);

// Junction table: Users <-> Restaurants with role
export const restaurantUsers = pgTable("restaurant_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: varchar("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
  pin: text("pin"), // 4-6 digit PIN for quick clock-in
  isActive: boolean("is_active").default(true),
  hiredAt: timestamp("hired_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("restaurant_users_unique_idx").on(table.restaurantId, table.userId),
  index("restaurant_users_restaurant_id_idx").on(table.restaurantId),
  index("restaurant_users_user_id_idx").on(table.userId),
  index("restaurant_users_role_id_idx").on(table.roleId),
]);

// ============================================================================
// MENUS & MENU ITEMS
// ============================================================================

// Menus (a restaurant can have multiple: Breakfast, Lunch, Dinner, Happy Hour)
export const menus = pgTable("menus", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  availableFrom: text("available_from"), // Time of day "11:00"
  availableTo: text("available_to"), // Time of day "14:00"
  availableDays: jsonb("available_days").default([0, 1, 2, 3, 4, 5, 6]), // Days of week
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("menus_restaurant_id_idx").on(table.restaurantId),
  index("menus_is_active_idx").on(table.isActive),
]);

// Categories within a menu
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  menuId: varchar("menu_id").references(() => menus.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("categories_restaurant_id_idx").on(table.restaurantId),
  index("categories_menu_id_idx").on(table.menuId),
  index("categories_sort_order_idx").on(table.sortOrder),
]);

// Menu items (products)
export const menuItems = pgTable("menu_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: decimal("compare_at_price", { precision: 10, scale: 2 }), // For showing discounts
  cost: decimal("cost", { precision: 10, scale: 2 }), // Cost price for margin tracking
  imageUrl: text("image_url"),
  sku: text("sku"),
  barcode: text("barcode"),
  isAvailable: boolean("is_available").default(true),
  isPopular: boolean("is_popular").default(false),
  isNew: boolean("is_new").default(false),
  preparationTime: integer("preparation_time"), // Minutes
  calories: integer("calories"),
  allergens: text("allergens").array(),
  tags: text("tags").array(), // vegetarian, vegan, gluten-free, spicy
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("menu_items_restaurant_id_idx").on(table.restaurantId),
  index("menu_items_category_id_idx").on(table.categoryId),
  index("menu_items_is_available_idx").on(table.isAvailable),
  index("menu_items_sort_order_idx").on(table.sortOrder),
]);

// Modifier groups (e.g., "Size", "Toppings", "Cooking Preference")
export const modifierGroups = pgTable("modifier_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isRequired: boolean("is_required").default(false),
  minSelections: integer("min_selections").default(0),
  maxSelections: integer("max_selections").default(1), // -1 for unlimited
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("modifier_groups_restaurant_id_idx").on(table.restaurantId),
]);

// Individual modifiers
export const modifiers = pgTable("modifiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modifierGroupId: varchar("modifier_group_id").notNull().references(() => modifierGroups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).default("0.00"),
  isDefault: boolean("is_default").default(false),
  isAvailable: boolean("is_available").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("modifiers_modifier_group_id_idx").on(table.modifierGroupId),
]);

// Junction: Menu Items <-> Modifier Groups
export const menuItemModifierGroups = pgTable("menu_item_modifier_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  modifierGroupId: varchar("modifier_group_id").notNull().references(() => modifierGroups.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("menu_item_modifier_groups_unique_idx").on(table.menuItemId, table.modifierGroupId),
  index("menu_item_modifier_groups_menu_item_id_idx").on(table.menuItemId),
]);

// ============================================================================
// DINING TABLES & QR CODES
// ============================================================================

export const diningTables = pgTable("dining_tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  number: text("number").notNull(), // "1", "A1", "Patio-3"
  name: text("name"), // "Window Booth", "Private Room"
  capacity: integer("capacity").default(4),
  section: text("section"), // "Main Floor", "Patio", "Bar"
  status: text("status").default("available"), // available, occupied, reserved, cleaning
  isActive: boolean("is_active").default(true),
  positionX: integer("position_x"), // For floor plan
  positionY: integer("position_y"), // For floor plan
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("dining_tables_restaurant_number_idx").on(table.restaurantId, table.number),
  index("dining_tables_restaurant_id_idx").on(table.restaurantId),
  index("dining_tables_status_idx").on(table.status),
]);

// QR tokens for table ordering
export const qrTokens = pgTable("qr_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  tableId: varchar("table_id").references(() => diningTables.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(), // Short unique token for URL
  qrCodeUrl: text("qr_code_url"), // Generated QR code image URL
  tokenType: text("token_type").default("table"), // table, takeaway, event
  isActive: boolean("is_active").default(true),
  scansCount: integer("scans_count").default(0),
  lastScannedAt: timestamp("last_scanned_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("qr_tokens_token_idx").on(table.token),
  index("qr_tokens_restaurant_id_idx").on(table.restaurantId),
  index("qr_tokens_table_id_idx").on(table.tableId),
]);

// ============================================================================
// ORDERS & ORDER ITEMS
// ============================================================================

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  tableId: varchar("table_id").references(() => diningTables.id, { onDelete: "set null" }),
  serverId: varchar("server_id").references(() => users.id, { onDelete: "set null" }),
  qrTokenId: varchar("qr_token_id").references(() => qrTokens.id, { onDelete: "set null" }),
  orderNumber: text("order_number").notNull(),
  displayNumber: integer("display_number"), // Short number for kitchen display
  status: text("status").default("pending"), // pending, confirmed, preparing, ready, served, completed, cancelled
  orderType: text("order_type").default("dine_in"), // dine_in, takeaway, delivery, pickup
  source: text("source").default("pos"), // pos, qr, online, phone
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00"),
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }).default("0.00"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0.00"),
  paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }).default("0.00"),
  notes: text("notes"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  guestCount: integer("guest_count").default(1),
  estimatedReadyAt: timestamp("estimated_ready_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("orders_restaurant_id_idx").on(table.restaurantId),
  index("orders_table_id_idx").on(table.tableId),
  index("orders_server_id_idx").on(table.serverId),
  index("orders_status_idx").on(table.status),
  index("orders_order_type_idx").on(table.orderType),
  index("orders_created_at_idx").on(table.createdAt),
  uniqueIndex("orders_restaurant_order_number_idx").on(table.restaurantId, table.orderNumber),
]);

// Order items (line items in an order)
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  menuItemId: varchar("menu_item_id").references(() => menuItems.id, { onDelete: "set null" }),
  name: text("name").notNull(), // Denormalized for historical accuracy
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  modifiersPrice: decimal("modifiers_price", { precision: 10, scale: 2 }).default("0.00"),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  modifiers: jsonb("modifiers").default([]), // Array of selected modifiers with prices
  notes: text("notes"),
  status: text("status").default("pending"), // pending, preparing, ready, served, cancelled
  sentToKitchenAt: timestamp("sent_to_kitchen_at"),
  preparedAt: timestamp("prepared_at"),
  servedAt: timestamp("served_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("order_items_order_id_idx").on(table.orderId),
  index("order_items_menu_item_id_idx").on(table.menuItemId),
  index("order_items_status_idx").on(table.status),
]);

// Order status history for audit trail
export const orderStatusHistory = pgTable("order_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("order_status_history_order_id_idx").on(table.orderId),
  index("order_status_history_created_at_idx").on(table.createdAt),
]);

// ============================================================================
// PAYMENTS & SPLIT PAYMENTS
// ============================================================================

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  splitSessionId: varchar("split_session_id").references(() => splitSessions.id, { onDelete: "set null" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }).default("0.00"),
  method: text("method").notNull(), // cash, card, mobile, gift_card, other
  status: text("status").default("pending"), // pending, completed, failed, refunded, partially_refunded
  transactionId: text("transaction_id"), // External payment processor ID
  cardLastFour: text("card_last_four"),
  cardBrand: text("card_brand"),
  receiptUrl: text("receipt_url"),
  refundedAmount: decimal("refunded_amount", { precision: 10, scale: 2 }).default("0.00"),
  metadata: jsonb("metadata").default({}), // Extra payment data
  processedAt: timestamp("processed_at"),
  refundedAt: timestamp("refunded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("payments_order_id_idx").on(table.orderId),
  index("payments_restaurant_id_idx").on(table.restaurantId),
  index("payments_split_session_id_idx").on(table.splitSessionId),
  index("payments_status_idx").on(table.status),
  index("payments_method_idx").on(table.method),
]);

// Split payment sessions
export const splitSessions = pgTable("split_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  splitType: text("split_type").notNull(), // equal, by_item, by_amount, custom
  totalShares: integer("total_shares").default(1),
  status: text("status").default("active"), // active, completed, cancelled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("split_sessions_order_id_idx").on(table.orderId),
]);

// Individual shares in a split session
export const splitShares = pgTable("split_shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  splitSessionId: varchar("split_session_id").notNull().references(() => splitSessions.id, { onDelete: "cascade" }),
  shareNumber: integer("share_number").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }).default("0.00"),
  itemIds: jsonb("item_ids").default([]), // Order item IDs for by_item split
  isPaid: boolean("is_paid").default(false),
  paymentId: varchar("payment_id").references(() => payments.id, { onDelete: "set null" }),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("split_shares_split_session_id_idx").on(table.splitSessionId),
  uniqueIndex("split_shares_session_number_idx").on(table.splitSessionId, table.shareNumber),
]);

// ============================================================================
// REFRESH TOKENS (for JWT refresh token storage)
// ============================================================================

export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenId: varchar("token_id").notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  restaurantId: varchar("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("refresh_tokens_token_id_idx").on(table.tokenId),
  index("refresh_tokens_user_id_idx").on(table.userId),
  index("refresh_tokens_expires_at_idx").on(table.expiresAt),
]);

// ============================================================================
// INSERT SCHEMAS (for validation with Zod)
// ============================================================================

export const insertRestaurantSchema = createInsertSchema(restaurants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRestaurantDomainSchema = createInsertSchema(restaurantDomains).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRestaurantFeatureSchema = createInsertSchema(restaurantFeatureAllowlist).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRestaurantSettingSchema = createInsertSchema(restaurantSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  emailVerifiedAt: true,
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRestaurantUserSchema = createInsertSchema(restaurantUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMenuSchema = createInsertSchema(menus).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMenuItemSchema = createInsertSchema(menuItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertModifierGroupSchema = createInsertSchema(modifierGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertModifierSchema = createInsertSchema(modifiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDiningTableSchema = createInsertSchema(diningTables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQrTokenSchema = createInsertSchema(qrTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastScannedAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  cancelledAt: true,
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sentToKitchenAt: true,
  preparedAt: true,
  servedAt: true,
});

export const insertOrderStatusHistorySchema = createInsertSchema(orderStatusHistory).omit({
  id: true,
  createdAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  processedAt: true,
  refundedAt: true,
});

export const insertSplitSessionSchema = createInsertSchema(splitSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSplitShareSchema = createInsertSchema(splitShares).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  paidAt: true,
});

export const insertRefreshTokenSchema = createInsertSchema(refreshTokens).omit({
  id: true,
  createdAt: true,
  revokedAt: true,
});

// ============================================================================
// TYPES - Export all insert and select types
// ============================================================================

// Restaurants
export type InsertRestaurant = z.infer<typeof insertRestaurantSchema>;
export type Restaurant = typeof restaurants.$inferSelect;

export type InsertRestaurantDomain = z.infer<typeof insertRestaurantDomainSchema>;
export type RestaurantDomain = typeof restaurantDomains.$inferSelect;

export type InsertRestaurantFeature = z.infer<typeof insertRestaurantFeatureSchema>;
export type RestaurantFeature = typeof restaurantFeatureAllowlist.$inferSelect;

export type InsertRestaurantSetting = z.infer<typeof insertRestaurantSettingSchema>;
export type RestaurantSetting = typeof restaurantSettings.$inferSelect;

// Users & Roles
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

export type InsertRestaurantUser = z.infer<typeof insertRestaurantUserSchema>;
export type RestaurantUser = typeof restaurantUsers.$inferSelect;

// Menus
export type InsertMenu = z.infer<typeof insertMenuSchema>;
export type Menu = typeof menus.$inferSelect;

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type MenuItem = typeof menuItems.$inferSelect;

export type InsertModifierGroup = z.infer<typeof insertModifierGroupSchema>;
export type ModifierGroup = typeof modifierGroups.$inferSelect;

export type InsertModifier = z.infer<typeof insertModifierSchema>;
export type Modifier = typeof modifiers.$inferSelect;

// Tables & QR
export type InsertDiningTable = z.infer<typeof insertDiningTableSchema>;
export type DiningTable = typeof diningTables.$inferSelect;

export type InsertQrToken = z.infer<typeof insertQrTokenSchema>;
export type QrToken = typeof qrTokens.$inferSelect;

// Orders
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

export type InsertOrderStatusHistory = z.infer<typeof insertOrderStatusHistorySchema>;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;

// Payments
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export type InsertSplitSession = z.infer<typeof insertSplitSessionSchema>;
export type SplitSession = typeof splitSessions.$inferSelect;

export type InsertSplitShare = z.infer<typeof insertSplitShareSchema>;
export type SplitShare = typeof splitShares.$inferSelect;

export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;
export type RefreshToken = typeof refreshTokens.$inferSelect;

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = insertUserSchema.extend({
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

// ============================================================================
// CONSTANTS - Enums for reference
// ============================================================================

export const ORDER_STATUSES = [
  "pending",
  "confirmed", 
  "preparing",
  "ready",
  "served",
  "completed",
  "cancelled",
] as const;

export const ORDER_TYPES = [
  "dine_in",
  "takeaway",
  "delivery",
  "pickup",
] as const;

export const PAYMENT_METHODS = [
  "cash",
  "card",
  "mobile",
  "gift_card",
  "other",
] as const;

export const PAYMENT_STATUSES = [
  "pending",
  "completed",
  "failed",
  "refunded",
  "partially_refunded",
] as const;

export const TABLE_STATUSES = [
  "available",
  "occupied",
  "reserved",
  "cleaning",
] as const;

export const SPLIT_TYPES = [
  "equal",
  "by_item",
  "by_amount",
  "custom",
] as const;

import { 
  type User, type InsertUser,
  type Restaurant, type InsertRestaurant,
  type RestaurantDomain, type InsertRestaurantDomain,
  type RestaurantFeature, type InsertRestaurantFeature,
  type RestaurantSetting, type InsertRestaurantSetting,
  type Role, type InsertRole,
  type RestaurantUser, type InsertRestaurantUser,
  type Menu, type InsertMenu,
  type Category, type InsertCategory,
  type MenuItem, type InsertMenuItem,
  type ModifierGroup, type InsertModifierGroup,
  type Modifier, type InsertModifier,
  type DiningTable, type InsertDiningTable,
  type QrToken, type InsertQrToken,
  type Order, type InsertOrder,
  type OrderItem, type InsertOrderItem,
  type OrderStatusHistory, type InsertOrderStatusHistory,
  type Payment, type InsertPayment,
  type SplitSession, type InsertSplitSession,
  type SplitShare, type InsertSplitShare,
} from "@shared/schema";
import { randomUUID } from "crypto";
import {
  type InventoryItem, type InsertInventoryItem,
  type InventoryTransaction, type InsertInventoryTransaction,
  type InventoryAlert, type InsertInventoryAlert,
} from "@shared/schema";

// ============================================================================
// STORAGE INTERFACE
// Defines all CRUD operations for the application
// ============================================================================

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  
  // Restaurants
  getRestaurant(id: string): Promise<Restaurant | undefined>;
  getRestaurantBySlug(slug: string): Promise<Restaurant | undefined>;
  getAllRestaurants(): Promise<Restaurant[]>;
  createRestaurant(restaurant: InsertRestaurant): Promise<Restaurant>;
  updateRestaurant(id: string, restaurant: Partial<InsertRestaurant>): Promise<Restaurant | undefined>;
  
  // Restaurant Users (staff)
  getRestaurantUsers(restaurantId: string): Promise<RestaurantUser[]>;
  createRestaurantUser(restaurantUser: InsertRestaurantUser): Promise<RestaurantUser>;
  
  // Roles
  getRole(id: string): Promise<Role | undefined>;
  getRolesByRestaurant(restaurantId: string): Promise<Role[]>;
  createRole(role: InsertRole): Promise<Role>;
  
  // Menus
  getMenu(id: string): Promise<Menu | undefined>;
  getMenusByRestaurant(restaurantId: string): Promise<Menu[]>;
  createMenu(menu: InsertMenu): Promise<Menu>;
  updateMenu(id: string, menu: Partial<InsertMenu>): Promise<Menu | undefined>;
  
  // Categories
  getCategory(id: string): Promise<Category | undefined>;
  getCategoriesByRestaurant(restaurantId: string): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, category: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<boolean>;
  
  // Menu Items
  getMenuItem(id: string): Promise<MenuItem | undefined>;
  getMenuItemsByRestaurant(restaurantId: string): Promise<MenuItem[]>;
  getMenuItemsByCategory(categoryId: string): Promise<MenuItem[]>;
  createMenuItem(item: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: string, item: Partial<InsertMenuItem>): Promise<MenuItem | undefined>;
  deleteMenuItem(id: string): Promise<boolean>;
  
  // Dining Tables
  getDiningTable(id: string): Promise<DiningTable | undefined>;
  getDiningTablesByRestaurant(restaurantId: string): Promise<DiningTable[]>;
  createDiningTable(table: InsertDiningTable): Promise<DiningTable>;
  updateDiningTable(id: string, table: Partial<InsertDiningTable>): Promise<DiningTable | undefined>;
  deleteDiningTable(id: string): Promise<boolean>;
  
  // QR Tokens
  getQrToken(id: string): Promise<QrToken | undefined>;
  getQrTokenByToken(token: string): Promise<QrToken | undefined>;
  createQrToken(qrToken: InsertQrToken): Promise<QrToken>;
  
  // Orders
  getOrder(id: string): Promise<Order | undefined>;
  getOrdersByRestaurant(restaurantId: string): Promise<Order[]>;
  getOrdersByTable(tableId: string): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, order: Partial<InsertOrder>): Promise<Order | undefined>;
  
  // Order Items
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  updateOrderItem(id: string, item: Partial<InsertOrderItem>): Promise<OrderItem | undefined>;
  deleteOrderItem(id: string): Promise<boolean>;
  
  // Payments
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentsByOrder(orderId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, payment: Partial<InsertPayment>): Promise<Payment | undefined>;
    // Inventory Items
  getInventoryItems(restaurantId: string): Promise<InventoryItem[]>;
  getInventoryItem(id: string): Promise<InventoryItem | undefined>;
  createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: string): Promise<boolean>;
  getLowStockItems(restaurantId: string): Promise<InventoryItem[]>;

  // Inventory Transactions
  getInventoryTransactions(restaurantId: string, itemId?: string): Promise<InventoryTransaction[]>;
  createInventoryTransaction(tx: InsertInventoryTransaction): Promise<InventoryTransaction>;

  // Inventory Alerts
  getInventoryAlerts(restaurantId: string, onlyUnresolved?: boolean): Promise<InventoryAlert[]>;
  createInventoryAlert(alert: InsertInventoryAlert): Promise<InventoryAlert>;
  resolveInventoryAlert(id: string, resolvedByUserId: string): Promise<InventoryAlert | undefined>;
}

// ============================================================================
// IN-MEMORY STORAGE IMPLEMENTATION
// For development and testing - can be replaced with DatabaseStorage
// ============================================================================

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private restaurants: Map<string, Restaurant>;
  private restaurantUsers: Map<string, RestaurantUser>;
  private roles: Map<string, Role>;
  private menus: Map<string, Menu>;
  private categories: Map<string, Category>;
  private menuItems: Map<string, MenuItem>;
  private diningTables: Map<string, DiningTable>;
  private qrTokens: Map<string, QrToken>;
  private orders: Map<string, Order>;
  private orderItems: Map<string, OrderItem>;
  private payments: Map<string, Payment>;
    private inventoryItems: Map<string, InventoryItem>;
  private inventoryTransactions: Map<string, InventoryTransaction>;
  private inventoryAlerts: Map<string, InventoryAlert>;

  constructor() {
    this.users = new Map();
        this.inventoryItems = new Map();
    this.inventoryTransactions = new Map();
    this.inventoryAlerts = new Map();
    this.restaurants = new Map();
    this.restaurantUsers = new Map();
    this.roles = new Map();
    this.menus = new Map();
    this.categories = new Map();
    this.menuItems = new Map();
    this.diningTables = new Map();
    this.qrTokens = new Map();
    this.orders = new Map();
    this.orderItems = new Map();
    this.payments = new Map();
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const now = new Date();
    const user: User = { 
      id,
      email: insertUser.email,
      password: insertUser.password,
      firstName: insertUser.firstName ?? null,
      lastName: insertUser.lastName ?? null,
      phone: insertUser.phone ?? null,
      avatarUrl: insertUser.avatarUrl ?? null,
      isSuperAdmin: insertUser.isSuperAdmin ?? false,
      isActive: insertUser.isActive ?? true,
      emailVerifiedAt: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates, updatedAt: new Date() } as User;
    this.users.set(id, updated);
    return updated;
  }

  // Restaurants
  async getRestaurant(id: string): Promise<Restaurant | undefined> {
    return this.restaurants.get(id);
  }

  async getRestaurantBySlug(slug: string): Promise<Restaurant | undefined> {
    return Array.from(this.restaurants.values()).find(r => r.slug === slug);
  }

  async getAllRestaurants(): Promise<Restaurant[]> {
    return Array.from(this.restaurants.values());
  }

  async createRestaurant(insertRestaurant: InsertRestaurant): Promise<Restaurant> {
    const id = randomUUID();
    const now = new Date();
    const restaurant: Restaurant = { 
      id,
      name: insertRestaurant.name,
      slug: insertRestaurant.slug,
      logoUrl: insertRestaurant.logoUrl ?? null,
      address: insertRestaurant.address ?? null,
      city: insertRestaurant.city ?? null,
      state: insertRestaurant.state ?? null,
      country: insertRestaurant.country ?? "US",
      postalCode: insertRestaurant.postalCode ?? null,
      phone: insertRestaurant.phone ?? null,
      email: insertRestaurant.email ?? null,
      description: insertRestaurant.description ?? null,
      openingHours: insertRestaurant.openingHours ?? null,
      timezone: insertRestaurant.timezone ?? "UTC",
      currency: insertRestaurant.currency ?? "USD",
      taxRate: insertRestaurant.taxRate ?? "0.0000",
      isActive: insertRestaurant.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.restaurants.set(id, restaurant);
    return restaurant;
  }

  async updateRestaurant(id: string, updates: Partial<InsertRestaurant>): Promise<Restaurant | undefined> {
    const restaurant = this.restaurants.get(id);
    if (!restaurant) return undefined;
    const updated = { ...restaurant, ...updates, updatedAt: new Date() } as Restaurant;
    this.restaurants.set(id, updated);
    return updated;
  }

  // Restaurant Users
  async getRestaurantUsers(restaurantId: string): Promise<RestaurantUser[]> {
    return Array.from(this.restaurantUsers.values()).filter(ru => ru.restaurantId === restaurantId);
  }

  async createRestaurantUser(insertRU: InsertRestaurantUser): Promise<RestaurantUser> {
    const id = randomUUID();
    const now = new Date();
    const ru: RestaurantUser = {
      id,
      restaurantId: insertRU.restaurantId,
      userId: insertRU.userId,
      roleId: insertRU.roleId,
      pin: insertRU.pin ?? null,
      isActive: insertRU.isActive ?? true,
      hiredAt: insertRU.hiredAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.restaurantUsers.set(id, ru);
    return ru;
  }

  // Roles
  async getRole(id: string): Promise<Role | undefined> {
    return this.roles.get(id);
  }

  async getRolesByRestaurant(restaurantId: string): Promise<Role[]> {
    return Array.from(this.roles.values()).filter(r => r.restaurantId === restaurantId);
  }

  async createRole(insertRole: InsertRole): Promise<Role> {
    const id = randomUUID();
    const now = new Date();
    const role: Role = {
      id,
      restaurantId: insertRole.restaurantId,
      name: insertRole.name,
      description: insertRole.description ?? null,
      permissions: insertRole.permissions ?? [],
      isSystemRole: insertRole.isSystemRole ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.roles.set(id, role);
    return role;
  }

  // Menus
  async getMenu(id: string): Promise<Menu | undefined> {
    return this.menus.get(id);
  }

  async getMenusByRestaurant(restaurantId: string): Promise<Menu[]> {
    return Array.from(this.menus.values())
      .filter(m => m.restaurantId === restaurantId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  async createMenu(insertMenu: InsertMenu): Promise<Menu> {
    const id = randomUUID();
    const now = new Date();
    const menu: Menu = {
      id,
      restaurantId: insertMenu.restaurantId,
      name: insertMenu.name,
      description: insertMenu.description ?? null,
      isActive: insertMenu.isActive ?? true,
      isDefault: insertMenu.isDefault ?? false,
      availableFrom: insertMenu.availableFrom ?? null,
      availableTo: insertMenu.availableTo ?? null,
      availableDays: insertMenu.availableDays ?? [0, 1, 2, 3, 4, 5, 6],
      sortOrder: insertMenu.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.menus.set(id, menu);
    return menu;
  }

  async updateMenu(id: string, updates: Partial<InsertMenu>): Promise<Menu | undefined> {
    const menu = this.menus.get(id);
    if (!menu) return undefined;
    const updated = { ...menu, ...updates, updatedAt: new Date() } as Menu;
    this.menus.set(id, updated);
    return updated;
  }

  // Categories
  async getCategory(id: string): Promise<Category | undefined> {
    return this.categories.get(id);
  }

  async getCategoriesByRestaurant(restaurantId: string): Promise<Category[]> {
    return Array.from(this.categories.values())
      .filter(cat => cat.restaurantId === restaurantId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const id = randomUUID();
    const now = new Date();
    const category: Category = { 
      id,
      restaurantId: insertCategory.restaurantId,
      menuId: insertCategory.menuId ?? null,
      name: insertCategory.name,
      description: insertCategory.description ?? null,
      imageUrl: insertCategory.imageUrl ?? null,
      isActive: insertCategory.isActive ?? true,
      sortOrder: insertCategory.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.categories.set(id, category);
    return category;
  }

  async updateCategory(id: string, updates: Partial<InsertCategory>): Promise<Category | undefined> {
    const category = this.categories.get(id);
    if (!category) return undefined;
    const updated = { ...category, ...updates, updatedAt: new Date() } as Category;
    this.categories.set(id, updated);
    return updated;
  }

  async deleteCategory(id: string): Promise<boolean> {
    return this.categories.delete(id);
  }

  // Menu Items
  async getMenuItem(id: string): Promise<MenuItem | undefined> {
    return this.menuItems.get(id);
  }

  async getMenuItemsByRestaurant(restaurantId: string): Promise<MenuItem[]> {
    return Array.from(this.menuItems.values())
      .filter(item => item.restaurantId === restaurantId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  async getMenuItemsByCategory(categoryId: string): Promise<MenuItem[]> {
    return Array.from(this.menuItems.values())
      .filter(item => item.categoryId === categoryId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  async createMenuItem(insertItem: InsertMenuItem): Promise<MenuItem> {
    const id = randomUUID();
    const now = new Date();
    const item: MenuItem = { 
      id,
      restaurantId: insertItem.restaurantId,
      categoryId: insertItem.categoryId ?? null,
      name: insertItem.name,
      description: insertItem.description ?? null,
      price: insertItem.price,
      compareAtPrice: insertItem.compareAtPrice ?? null,
      cost: insertItem.cost ?? null,
      imageUrl: insertItem.imageUrl ?? null,
      sku: insertItem.sku ?? null,
      barcode: insertItem.barcode ?? null,
      isAvailable: insertItem.isAvailable ?? true,
      isPopular: insertItem.isPopular ?? false,
      isNew: insertItem.isNew ?? false,
      preparationTime: insertItem.preparationTime ?? null,
      calories: insertItem.calories ?? null,
      allergens: insertItem.allergens ?? null,
      tags: insertItem.tags ?? null,
      sortOrder: insertItem.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.menuItems.set(id, item);
    return item;
  }

  async updateMenuItem(id: string, updates: Partial<InsertMenuItem>): Promise<MenuItem | undefined> {
    const item = this.menuItems.get(id);
    if (!item) return undefined;
    const updated = { ...item, ...updates, updatedAt: new Date() } as MenuItem;
    this.menuItems.set(id, updated);
    return updated;
  }

  async deleteMenuItem(id: string): Promise<boolean> {
    return this.menuItems.delete(id);
  }

  // Dining Tables
  async getDiningTable(id: string): Promise<DiningTable | undefined> {
    return this.diningTables.get(id);
  }

  async getDiningTablesByRestaurant(restaurantId: string): Promise<DiningTable[]> {
    return Array.from(this.diningTables.values()).filter(t => t.restaurantId === restaurantId);
  }

  async createDiningTable(insertTable: InsertDiningTable): Promise<DiningTable> {
    const id = randomUUID();
    const now = new Date();
    const table: DiningTable = { 
      id,
      restaurantId: insertTable.restaurantId,
      number: insertTable.number,
      name: insertTable.name ?? null,
      capacity: insertTable.capacity ?? 4,
      section: insertTable.section ?? null,
      status: insertTable.status ?? "available",
      isActive: insertTable.isActive ?? true,
      positionX: insertTable.positionX ?? null,
      positionY: insertTable.positionY ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.diningTables.set(id, table);
    return table;
  }

  async updateDiningTable(id: string, updates: Partial<InsertDiningTable>): Promise<DiningTable | undefined> {
    const table = this.diningTables.get(id);
    if (!table) return undefined;
    const updated = { ...table, ...updates, updatedAt: new Date() } as DiningTable;
    this.diningTables.set(id, updated);
    return updated;
  }

  async deleteDiningTable(id: string): Promise<boolean> {
    return this.diningTables.delete(id);
  }

  // QR Tokens
  async getQrToken(id: string): Promise<QrToken | undefined> {
    return this.qrTokens.get(id);
  }

  async getQrTokenByToken(token: string): Promise<QrToken | undefined> {
    return Array.from(this.qrTokens.values()).find(t => t.token === token);
  }

  async createQrToken(insertToken: InsertQrToken): Promise<QrToken> {
    const id = randomUUID();
    const now = new Date();
    const qrToken: QrToken = {
      id,
      restaurantId: insertToken.restaurantId,
      tableId: insertToken.tableId ?? null,
      token: insertToken.token,
      qrCodeUrl: insertToken.qrCodeUrl ?? null,
      tokenType: insertToken.tokenType ?? "table",
      isActive: insertToken.isActive ?? true,
      scansCount: insertToken.scansCount ?? 0,
      lastScannedAt: null,
      expiresAt: insertToken.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.qrTokens.set(id, qrToken);
    return qrToken;
  }

  // Orders
  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async getOrdersByRestaurant(restaurantId: string): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter(order => order.restaurantId === restaurantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getOrdersByTable(tableId: string): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter(order => order.tableId === tableId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const id = randomUUID();
    const now = new Date();
    const order: Order = { 
      id,
      restaurantId: insertOrder.restaurantId,
      tableId: insertOrder.tableId ?? null,
      serverId: insertOrder.serverId ?? null,
      qrTokenId: insertOrder.qrTokenId ?? null,
      orderNumber: insertOrder.orderNumber,
      displayNumber: insertOrder.displayNumber ?? null,
      status: insertOrder.status ?? "pending",
      orderType: insertOrder.orderType ?? "dine_in",
      source: insertOrder.source ?? "pos",
      subtotal: insertOrder.subtotal ?? "0.00",
      taxAmount: insertOrder.taxAmount ?? "0.00",
      tipAmount: insertOrder.tipAmount ?? "0.00",
      discountAmount: insertOrder.discountAmount ?? "0.00",
      total: insertOrder.total ?? "0.00",
      paidAmount: insertOrder.paidAmount ?? "0.00",
      notes: insertOrder.notes ?? null,
      customerName: insertOrder.customerName ?? null,
      customerPhone: insertOrder.customerPhone ?? null,
      customerEmail: insertOrder.customerEmail ?? null,
      guestCount: insertOrder.guestCount ?? 1,
      estimatedReadyAt: insertOrder.estimatedReadyAt ?? null,
      completedAt: null,
      cancelledAt: null,
      cancelReason: insertOrder.cancelReason ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(id, order);
    return order;
  }

  async updateOrder(id: string, updates: Partial<InsertOrder>): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    const updated = { ...order, ...updates, updatedAt: new Date() } as Order;
    this.orders.set(id, updated);
    return updated;
  }

  // Order Items
  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return Array.from(this.orderItems.values()).filter(item => item.orderId === orderId);
  }

  async createOrderItem(insertItem: InsertOrderItem): Promise<OrderItem> {
    const id = randomUUID();
    const now = new Date();
    const item: OrderItem = { 
      id,
      orderId: insertItem.orderId,
      menuItemId: insertItem.menuItemId ?? null,
      name: insertItem.name,
      quantity: insertItem.quantity ?? 1,
      unitPrice: insertItem.unitPrice,
      modifiersPrice: insertItem.modifiersPrice ?? "0.00",
      totalPrice: insertItem.totalPrice,
      modifiers: insertItem.modifiers ?? [],
      notes: insertItem.notes ?? null,
      status: insertItem.status ?? "pending",
      sentToKitchenAt: null,
      preparedAt: null,
      servedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.orderItems.set(id, item);
    return item;
  }

  async updateOrderItem(id: string, updates: Partial<InsertOrderItem>): Promise<OrderItem | undefined> {
    const item = this.orderItems.get(id);
    if (!item) return undefined;
    const updated = { ...item, ...updates, updatedAt: new Date() } as OrderItem;
    this.orderItems.set(id, updated);
    return updated;
  }

  async deleteOrderItem(id: string): Promise<boolean> {
    return this.orderItems.delete(id);
  }

  // Payments
  async getPayment(id: string): Promise<Payment | undefined> {
    return this.payments.get(id);
  }

  async getPaymentsByOrder(orderId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(payment => payment.orderId === orderId);
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const id = randomUUID();
    const now = new Date();
    const payment: Payment = { 
      id,
      orderId: insertPayment.orderId,
      restaurantId: insertPayment.restaurantId,
      splitSessionId: insertPayment.splitSessionId ?? null,
      amount: insertPayment.amount,
      tipAmount: insertPayment.tipAmount ?? "0.00",
      method: insertPayment.method,
      status: insertPayment.status ?? "pending",
      transactionId: insertPayment.transactionId ?? null,
      cardLastFour: insertPayment.cardLastFour ?? null,
      cardBrand: insertPayment.cardBrand ?? null,
      receiptUrl: insertPayment.receiptUrl ?? null,
      refundedAmount: insertPayment.refundedAmount ?? "0.00",
      metadata: insertPayment.metadata ?? {},
      processedAt: null,
      refundedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.payments.set(id, payment);
    return payment;
  }

  async updatePayment(id: string, updates: Partial<InsertPayment>): Promise<Payment | undefined> {
    const payment = this.payments.get(id);
    if (!payment) return undefined;
    const updated = { ...payment, ...updates, updatedAt: new Date() } as Payment;
    this.payments.set(id, updated);
    return updated;
  }

    // ── Inventory Items ──────────────────────────────────────────────────────────

  async getInventoryItems(restaurantId: string): Promise<InventoryItem[]> {
    return Array.from(this.inventoryItems.values())
      .filter(item => item.restaurantId === restaurantId && item.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getInventoryItem(id: string): Promise<InventoryItem | undefined> {
    return this.inventoryItems.get(id);
  }

  async createInventoryItem(insert: InsertInventoryItem): Promise<InventoryItem> {
    const id = randomUUID();
    const now = new Date();
    const item: InventoryItem = {
      id,
      restaurantId: insert.restaurantId,
      menuItemId: insert.menuItemId ?? null,
      name: insert.name,
      description: insert.description ?? null,
      sku: insert.sku ?? null,
      unit: insert.unit ?? "pcs",
      currentStock: insert.currentStock ?? "0.000",
      minStockLevel: insert.minStockLevel ?? "0.000",
      maxStockLevel: insert.maxStockLevel ?? null,
      costPerUnit: insert.costPerUnit ?? "0.00",
      supplier: insert.supplier ?? null,
      storageLocation: insert.storageLocation ?? null,
      isActive: insert.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.inventoryItems.set(id, item);
    return item;
  }

  async updateInventoryItem(id: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const item = this.inventoryItems.get(id);
    if (!item) return undefined;
    const updated = { ...item, ...updates, updatedAt: new Date() } as InventoryItem;
    this.inventoryItems.set(id, updated);
    return updated;
  }

  async deleteInventoryItem(id: string): Promise<boolean> {
    const item = this.inventoryItems.get(id);
    if (!item) return false;
    // Soft delete
    const updated = { ...item, isActive: false, updatedAt: new Date() };
    this.inventoryItems.set(id, updated);
    return true;
  }

  async getLowStockItems(restaurantId: string): Promise<InventoryItem[]> {
    return Array.from(this.inventoryItems.values()).filter(item => {
      if (item.restaurantId !== restaurantId || !item.isActive) return false;
      const current = parseFloat(item.currentStock ?? "0");
      const min = parseFloat(item.minStockLevel ?? "0");
      return current <= min;
    });
  }

  // ── Inventory Transactions ────────────────────────────────────────────────────

  async getInventoryTransactions(restaurantId: string, itemId?: string): Promise<InventoryTransaction[]> {
    return Array.from(this.inventoryTransactions.values())
      .filter(tx => {
        if (tx.restaurantId !== restaurantId) return false;
        if (itemId && tx.inventoryItemId !== itemId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createInventoryTransaction(insert: InsertInventoryTransaction): Promise<InventoryTransaction> {
    const id = randomUUID();
    const now = new Date();
    const tx: InventoryTransaction = {
      id,
      restaurantId: insert.restaurantId,
      inventoryItemId: insert.inventoryItemId,
      type: insert.type,
      quantity: insert.quantity,
      costPerUnit: insert.costPerUnit ?? null,
      totalCost: insert.totalCost ?? null,
      notes: insert.notes ?? null,
      referenceId: insert.referenceId ?? null,
      performedByUserId: insert.performedByUserId ?? null,
      createdAt: now,
    };
    this.inventoryTransactions.set(id, tx);

    // Update the item's currentStock
    const item = this.inventoryItems.get(insert.inventoryItemId);
    if (item) {
      const delta = parseFloat(insert.quantity);
      const current = parseFloat(item.currentStock ?? "0");
      const newStock = (current + delta).toFixed(3);
      const updatedItem = { ...item, currentStock: newStock, updatedAt: now };
      this.inventoryItems.set(item.id, updatedItem);

      // Auto-create alert if stock drops to/below minimum
      const min = parseFloat(item.minStockLevel ?? "0");
      const newStockNum = parseFloat(newStock);
      if (newStockNum <= 0) {
        await this.createInventoryAlert({
          restaurantId: insert.restaurantId,
          inventoryItemId: item.id,
          alertType: "out_of_stock",
          isResolved: false,
          resolvedByUserId: null,
        });
      } else if (newStockNum <= min) {
        await this.createInventoryAlert({
          restaurantId: insert.restaurantId,
          inventoryItemId: item.id,
          alertType: "low_stock",
          isResolved: false,
          resolvedByUserId: null,
        });
      }
    }

    return tx;
  }

  // ── Inventory Alerts ────────────────────────────────────────────────────���─────

  async getInventoryAlerts(restaurantId: string, onlyUnresolved = false): Promise<InventoryAlert[]> {
    return Array.from(this.inventoryAlerts.values())
      .filter(alert => {
        if (alert.restaurantId !== restaurantId) return false;
        if (onlyUnresolved && alert.isResolved) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createInventoryAlert(insert: InsertInventoryAlert): Promise<InventoryAlert> {
    // Avoid duplicate active alerts for same item + type
    const existing = Array.from(this.inventoryAlerts.values()).find(
      a => a.inventoryItemId === insert.inventoryItemId &&
           a.alertType === insert.alertType &&
           !a.isResolved
    );
    if (existing) return existing;

    const id = randomUUID();
    const now = new Date();
    const alert: InventoryAlert = {
      id,
      restaurantId: insert.restaurantId,
      inventoryItemId: insert.inventoryItemId,
      alertType: insert.alertType,
      isResolved: insert.isResolved ?? false,
      resolvedAt: null,
      resolvedByUserId: insert.resolvedByUserId ?? null,
      createdAt: now,
    };
    this.inventoryAlerts.set(id, alert);
    return alert;
  }

  async resolveInventoryAlert(id: string, resolvedByUserId: string): Promise<InventoryAlert | undefined> {
    const alert = this.inventoryAlerts.get(id);
    if (!alert) return undefined;
    const updated = {
      ...alert,
      isResolved: true,
      resolvedAt: new Date(),
      resolvedByUserId,
    };
    this.inventoryAlerts.set(id, updated);
    return updated;
  }
}

// Export default storage instance
export const storage = new MemStorage();

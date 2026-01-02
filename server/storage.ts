import { 
  type User, type InsertUser,
  type Tenant, type InsertTenant,
  type Category, type InsertCategory,
  type MenuItem, type InsertMenuItem,
  type Table, type InsertTable,
  type Order, type InsertOrder,
  type OrderItem, type InsertOrderItem,
  type Payment, type InsertPayment,
} from "@shared/schema";
import { randomUUID } from "crypto";

// ============================================================================
// STORAGE INTERFACE
// Defines all CRUD operations for the application
// ============================================================================

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByTenant(tenantId: string): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  
  // Tenants
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  getAllTenants(): Promise<Tenant[]>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, tenant: Partial<InsertTenant>): Promise<Tenant | undefined>;
  
  // Categories
  getCategory(id: string): Promise<Category | undefined>;
  getCategoriesByTenant(tenantId: string): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, category: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<boolean>;
  
  // Menu Items
  getMenuItem(id: string): Promise<MenuItem | undefined>;
  getMenuItemsByTenant(tenantId: string): Promise<MenuItem[]>;
  getMenuItemsByCategory(categoryId: string): Promise<MenuItem[]>;
  createMenuItem(item: InsertMenuItem): Promise<MenuItem>;
  updateMenuItem(id: string, item: Partial<InsertMenuItem>): Promise<MenuItem | undefined>;
  deleteMenuItem(id: string): Promise<boolean>;
  
  // Tables
  getTable(id: string): Promise<Table | undefined>;
  getTablesByTenant(tenantId: string): Promise<Table[]>;
  createTable(table: InsertTable): Promise<Table>;
  updateTable(id: string, table: Partial<InsertTable>): Promise<Table | undefined>;
  deleteTable(id: string): Promise<boolean>;
  
  // Orders
  getOrder(id: string): Promise<Order | undefined>;
  getOrdersByTenant(tenantId: string): Promise<Order[]>;
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
}

// ============================================================================
// IN-MEMORY STORAGE IMPLEMENTATION
// For development and testing - can be replaced with DatabaseStorage
// ============================================================================

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private tenants: Map<string, Tenant>;
  private categories: Map<string, Category>;
  private menuItems: Map<string, MenuItem>;
  private tables: Map<string, Table>;
  private orders: Map<string, Order>;
  private orderItems: Map<string, OrderItem>;
  private payments: Map<string, Payment>;

  constructor() {
    this.users = new Map();
    this.tenants = new Map();
    this.categories = new Map();
    this.menuItems = new Map();
    this.tables = new Map();
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

  async getUsersByTenant(tenantId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.tenantId === tenantId);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: new Date(),
      lastLogin: null,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  // Tenants
  async getTenant(id: string): Promise<Tenant | undefined> {
    return this.tenants.get(id);
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    return Array.from(this.tenants.values()).find(tenant => tenant.slug === slug);
  }

  async getAllTenants(): Promise<Tenant[]> {
    return Array.from(this.tenants.values());
  }

  async createTenant(insertTenant: InsertTenant): Promise<Tenant> {
    const id = randomUUID();
    const tenant: Tenant = { 
      ...insertTenant, 
      id,
      createdAt: new Date(),
    };
    this.tenants.set(id, tenant);
    return tenant;
  }

  async updateTenant(id: string, updates: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const tenant = this.tenants.get(id);
    if (!tenant) return undefined;
    const updated = { ...tenant, ...updates };
    this.tenants.set(id, updated);
    return updated;
  }

  // Categories
  async getCategory(id: string): Promise<Category | undefined> {
    return this.categories.get(id);
  }

  async getCategoriesByTenant(tenantId: string): Promise<Category[]> {
    return Array.from(this.categories.values())
      .filter(cat => cat.tenantId === tenantId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const id = randomUUID();
    const category: Category = { ...insertCategory, id };
    this.categories.set(id, category);
    return category;
  }

  async updateCategory(id: string, updates: Partial<InsertCategory>): Promise<Category | undefined> {
    const category = this.categories.get(id);
    if (!category) return undefined;
    const updated = { ...category, ...updates };
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

  async getMenuItemsByTenant(tenantId: string): Promise<MenuItem[]> {
    return Array.from(this.menuItems.values())
      .filter(item => item.tenantId === tenantId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  async getMenuItemsByCategory(categoryId: string): Promise<MenuItem[]> {
    return Array.from(this.menuItems.values())
      .filter(item => item.categoryId === categoryId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  async createMenuItem(insertItem: InsertMenuItem): Promise<MenuItem> {
    const id = randomUUID();
    const item: MenuItem = { 
      ...insertItem, 
      id,
      createdAt: new Date(),
    };
    this.menuItems.set(id, item);
    return item;
  }

  async updateMenuItem(id: string, updates: Partial<InsertMenuItem>): Promise<MenuItem | undefined> {
    const item = this.menuItems.get(id);
    if (!item) return undefined;
    const updated = { ...item, ...updates };
    this.menuItems.set(id, updated);
    return updated;
  }

  async deleteMenuItem(id: string): Promise<boolean> {
    return this.menuItems.delete(id);
  }

  // Tables
  async getTable(id: string): Promise<Table | undefined> {
    return this.tables.get(id);
  }

  async getTablesByTenant(tenantId: string): Promise<Table[]> {
    return Array.from(this.tables.values()).filter(table => table.tenantId === tenantId);
  }

  async createTable(insertTable: InsertTable): Promise<Table> {
    const id = randomUUID();
    const table: Table = { ...insertTable, id };
    this.tables.set(id, table);
    return table;
  }

  async updateTable(id: string, updates: Partial<InsertTable>): Promise<Table | undefined> {
    const table = this.tables.get(id);
    if (!table) return undefined;
    const updated = { ...table, ...updates };
    this.tables.set(id, updated);
    return updated;
  }

  async deleteTable(id: string): Promise<boolean> {
    return this.tables.delete(id);
  }

  // Orders
  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async getOrdersByTenant(tenantId: string): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter(order => order.tenantId === tenantId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async getOrdersByTable(tableId: string): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter(order => order.tableId === tableId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const id = randomUUID();
    const now = new Date();
    const order: Order = { 
      ...insertOrder, 
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(id, order);
    return order;
  }

  async updateOrder(id: string, updates: Partial<InsertOrder>): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    const updated = { ...order, ...updates, updatedAt: new Date() };
    this.orders.set(id, updated);
    return updated;
  }

  // Order Items
  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return Array.from(this.orderItems.values()).filter(item => item.orderId === orderId);
  }

  async createOrderItem(insertItem: InsertOrderItem): Promise<OrderItem> {
    const id = randomUUID();
    const item: OrderItem = { ...insertItem, id };
    this.orderItems.set(id, item);
    return item;
  }

  async updateOrderItem(id: string, updates: Partial<InsertOrderItem>): Promise<OrderItem | undefined> {
    const item = this.orderItems.get(id);
    if (!item) return undefined;
    const updated = { ...item, ...updates };
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
    const payment: Payment = { 
      ...insertPayment, 
      id,
      createdAt: new Date(),
    };
    this.payments.set(id, payment);
    return payment;
  }

  async updatePayment(id: string, updates: Partial<InsertPayment>): Promise<Payment | undefined> {
    const payment = this.payments.get(id);
    if (!payment) return undefined;
    const updated = { ...payment, ...updates };
    this.payments.set(id, updated);
    return updated;
  }
}

// Export default storage instance
export const storage = new MemStorage();

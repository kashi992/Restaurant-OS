import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, X, Menu } from "lucide-react";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  isAvailable?: boolean;
  isPopular?: boolean;
  isNew?: boolean;
  modifierGroups?: { id: string }[];
}

interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

interface ThemeColors {
  bg?: string;
  primary?: string;
  primaryLight?: string;
  primaryDark?: string;
  text?: string;
  surface?: string;
}

// ── DEFAULT COLORS — used when restaurant has not customized ──────────────────
const DEFAULTS: Required<ThemeColors> = {
  bg: "#0D0D0D",
  primary: "#C9A84C",
  primaryLight: "#E2C97E",
  primaryDark: "#0D0D0D",
  text: "#FFF",
  surface: "#1A1A1A",
};

export interface QrThemeProps {
  restaurantName: string;
  tableLabel: string | null;
  categories: Category[];
  currentCategory: Category | undefined;
  selectedCategory: string;
  onCategorySelect: (id: string) => void;
  cartItemCount: number;
  cartTotal: number;
  currency: string;
  onItemClick: (item: MenuItem) => void;
  onQuickAdd: (item: MenuItem) => void;
  onCartOpen: () => void;
  isLoadingMenu: boolean;
  themeColors?: ThemeColors;
  restaurantAddress?: string | null;
  restaurantCity?: string | null;
  restaurantPhone?: string | null;
  restaurantEmail?: string | null;
  restaurantDescription?: string | null;
  openingHours?: { day: string; hours: string }[] | null;
}

export default function LuxeDarkTheme({
  restaurantName,
  tableLabel,
  categories,
  currentCategory,
  selectedCategory,
  onCategorySelect,
  cartItemCount,
  cartTotal,
  currency,
  onItemClick,
  onQuickAdd,
  onCartOpen,
  isLoadingMenu,
  themeColors,
  restaurantAddress,
  restaurantCity,
  restaurantPhone,
  restaurantEmail,
  restaurantDescription,
  openingHours,
}: QrThemeProps) {

  // ── Merge custom colors with defaults ─────────────────────────────────────
  const c: Required<ThemeColors> = {
    bg: themeColors?.bg ?? DEFAULTS.bg,
    primary: themeColors?.primary ?? DEFAULTS.primary,
    primaryLight: themeColors?.primaryLight ?? DEFAULTS.primaryLight,
    primaryDark: themeColors?.primaryDark ?? DEFAULTS.primaryDark,
    text: themeColors?.text ?? DEFAULTS.text,
    surface: themeColors?.surface ?? DEFAULTS.surface,
  };

  // Derived colours (keep consistent feel)
  const surface2 = c.surface + "dd";
  const borderCol = "#2A2A2A";
  const muted = "#7A7A7A";

  const menuSectionRef = useRef<HTMLDivElement>(null);
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setMenuDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const scrollToMenu = () => {
    menuSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    setMenuDropdownOpen(false);
  };
  const scrollToCategory = (catId: string) => {
    onCategorySelect(catId);
    setMenuDropdownOpen(false);
    setTimeout(() => menuSectionRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const items = currentCategory?.items ?? [];
  const featured = items[0];
  const rest = items.slice(1);
  const allItems = categories.flatMap((c) => c.items);

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>

      {/* ── NAVBAR ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: navScrolled ? `${c.bg}f7` : "transparent",
          backdropFilter: navScrolled ? "blur(16px)" : "none",
          borderBottom: navScrolled ? `1px solid ${borderCol}` : "none",
          padding: "0 20px",
        }}
      >
        <div className="flex items-center justify-between h-16 max-w-2xl mx-auto">
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: c.primary, letterSpacing: 1 }}>
            {restaurantName}
          </div>
          <div className="flex items-center gap-3">
            {/* Menu Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setMenuDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border transition-all"
                style={{ borderColor: borderCol, color: c.text, background: c.surface }}
              >
                <Menu className="h-3.5 w-3.5" />
                Menu
                <ChevronDown className="h-3 w-3 transition-transform" style={{ transform: menuDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
              </button>
              {menuDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl overflow-hidden z-50 shadow-2xl"
                  style={{ background: c.surface, border: `1px solid ${borderCol}` }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: borderCol }}>
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: muted }}>Our Menu</span>
                    <button onClick={() => setMenuDropdownOpen(false)}><X className="h-4 w-4" style={{ color: muted }} /></button>
                  </div>
                  <div className="py-2 max-h-64 overflow-y-auto">
                    {categories.map((cat) => (
                      <button key={cat.id} onClick={() => scrollToCategory(cat.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left transition-all hover:bg-white/5">
                        <span className="text-sm font-medium" style={{ color: c.text }}>{cat.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: borderCol, color: muted }}>{cat.items.length}</span>
                      </button>
                    ))}
                  </div>
                  {allItems.filter((i) => i.isPopular).length > 0 && (
                    <div className="border-t px-4 py-3" style={{ borderColor: borderCol }}>
                      <p className="text-xs uppercase tracking-widest mb-2" style={{ color: muted }}>Popular Items</p>
                      <div className="space-y-2">
                        {allItems.filter((i) => i.isPopular).slice(0, 3).map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            {item.imageUrl
                              ? <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                              : <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-sm" style={{ background: borderCol }}>🍽️</div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: c.text }}>{item.name}</p>
                              <p className="text-xs" style={{ color: c.primary }}>{currency}{parseFloat(item.price).toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Order Now */}
            <button onClick={scrollToMenu} className="px-4 py-2 rounded-full text-xs font-bold transition-all hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.primaryLight})`, color: c.bg }}>
              Order Now
            </button>
            {tableLabel && (
              <div className="hidden sm:flex text-xs font-semibold px-3 py-1.5 rounded-full border"
                style={{ borderColor: c.primary, color: c.primary }}>
                {tableLabel}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative flex flex-col items-center justify-center text-center min-h-screen">
        <img src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80" alt="Restaurant"
          className="absolute inset-0 w-full h-full object-cover" style={{ filter: "brightness(0.4)" }} />
        <div className="absolute inset-0" />
        <div className="relative z-10 px-6 max-w-sm mx-auto">
          <p className="text-xs font-semibold tracking-[4px] uppercase mb-6" style={{ color: c.primary }}>Fine Dining Experience</p>
          <h1 className="mb-4" style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(38px,10vw,58px)", fontWeight: 700, color: c.text, lineHeight: 1.1 }}>
            {restaurantName}
          </h1>
          <div className="flex items-center justify-center gap-4 mb-5">
            <div className="h-px w-12" style={{ background: `linear-gradient(to right, transparent, ${c.primary})` }} />
            <span style={{ color: c.primary, fontSize: 12 }}>✦</span>
            <div className="h-px w-12" style={{ background: `linear-gradient(to left, transparent, ${c.primary})` }} />
          </div>
          {tableLabel && <p className="text-sm mb-2 font-medium" style={{ color: c.primary }}>{tableLabel}</p>}
          <p className="text-sm mb-8 leading-relaxed" style={{ color: `${c.text}`, letterSpacing: 1 }}>
            An unforgettable dining experience, crafted with passion and precision.
          </p>
          <div className="flex flex-col gap-3 items-center">
            <button onClick={scrollToMenu} className="w-full px-8 py-4 rounded-full text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-0.5"
              style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.primaryLight})`, color: c.bg }}>
              Explore The Menu
            </button>
            <button onClick={scrollToMenu} className="w-full px-8 py-4 rounded-full text-sm font-semibold border transition-all hover:bg-white/5"
              style={{ borderColor: c.text, color: c.text }}>
              View Tonight's Specials
            </button>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="flex flex-col items-center gap-2 animate-bounce">
            <span className="text-xs tracking-widest uppercase" style={{ color: c.text }}>Scroll</span>
            <ChevronDown className="h-4 w-4" style={{ color: c.primary }} />
          </div>
        </div>

      </section>

      {/* ── MENU SECTION ── */}
      <section ref={menuSectionRef} className="pb-10" style={{ background: c.bg }}>
        <div className="px-5 pt-12 pb-6 text-center">
          <p className="text-xs uppercase tracking-[4px] mb-2" style={{ color: c.primary }}>Dine With Us</p>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: c.text }}>Our Menu</h2>
          <div className="flex items-center justify-center gap-3 mt-3">
            <div className="h-px w-10" style={{ background: borderCol }} />
            <span style={{ color: c.primary, fontSize: 12 }}>✦</span>
            <div className="h-px w-10" style={{ background: borderCol }} />
          </div>
        </div>
        <div className="flex gap-2.5 overflow-x-auto px-5 pb-5" style={{ scrollbarWidth: "none" }}>
          {categories.map((cat) => (
            <button key={cat.id} onClick={() => onCategorySelect(cat.id)}
              className="flex-shrink-0 px-5 py-2 rounded-full text-sm border transition-all"
              style={selectedCategory === cat.id
                ? { borderColor: c.primary, color: c.primary, background: `${c.primary}14` }
                : { borderColor: borderCol, background: c.surface, color: muted }}>
              {cat.name}
            </button>
          ))}
        </div>
        <div className="px-4">
          {isLoadingMenu ? (
            <div className="grid grid-cols-2 gap-3.5">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-52 w-full rounded-2xl" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="text-center py-12" style={{ color: muted }}>No items in this category</p>
          ) : (
            <>
              {featured && (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: c.text }}>Chef's Special</p>
                    <span className="flex-1 h-px" style={{ background: borderCol }} />
                  </div>
                  <div className="relative rounded-2xl overflow-hidden mb-5 border cursor-pointer"
                    style={{ background: c.surface, borderColor: `${c.primary}50` }}
                    onClick={() => onItemClick(featured)}>
                    {featured.imageUrl
                      ? <img src={featured.imageUrl} alt={featured.name} className="w-full h-44 object-cover" style={{ filter: "brightness(0.5)" }} />
                      : <div className="w-full h-44 flex items-center justify-center text-5xl" style={{ background: borderCol }}>🍽️</div>}
                    <div className="absolute inset-0 flex flex-col justify-end p-5"
                      style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)" }}>
                      <p className="text-xs mb-1.5 tracking-widest uppercase" style={{ color: c.primary }}>★ Tonight's Feature</p>
                      <p className="text-xl font-bold mb-2" style={{ fontFamily: "'Playfair Display', serif", color: c.text }}>{featured.name}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-semibold" style={{ color: c.primary }}>{currency}{parseFloat(featured.price).toFixed(2)}</span>
                        <button onClick={(e) => { e.stopPropagation(); featured.modifierGroups?.length ? onItemClick(featured) : onQuickAdd(featured); }}
                          className="px-5 py-2.5 rounded-full text-sm font-bold"
                          style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.primaryLight})`, color: c.bg }}>
                          Add to Order
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {rest.length > 0 && (
                <div className="grid grid-cols-2 gap-3.5">
                  {rest.map((item) => {
                    const available = item.isAvailable !== false;
                    return (
                      <div key={item.id} onClick={() => available && onItemClick(item)}
                        className="rounded-2xl overflow-hidden border transition-all"
                        style={{ background: c.surface, borderColor: borderCol, opacity: available ? 1 : 0.5, cursor: available ? "pointer" : "default" }}>
                        <div className="relative h-32 overflow-hidden">
                          {item.imageUrl
                            ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-3xl" style={{ background: borderCol }}>🍽️</div>}
                          {(item.isNew || item.isPopular) && (
                            <div className="absolute top-2 left-2 text-xs font-bold px-2 py-1 rounded-lg" style={{ background: c.primary, color: c.bg }}>
                              {item.isNew ? "New" : "Popular"}
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-semibold leading-tight mb-1" style={{ fontFamily: "'Playfair Display', serif", color: c.text }}>{item.name}</p>
                          {item.description && <p className="text-xs mb-2.5 line-clamp-2" style={{ color: muted }}>{item.description}</p>}
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold" style={{ color: c.primary }}>{currency}{parseFloat(item.price).toFixed(2)}</span>
                            {available && (
                              <button onClick={(e) => { e.stopPropagation(); item.modifierGroups?.length ? onItemClick(item) : onQuickAdd(item); }}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-xl font-bold"
                                style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.primaryLight})`, color: c.bg }}>+</button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── OUR STORY ── */}
      {restaurantDescription && (
        <section className="px-6 py-16 text-center" style={{ background: c.surface }}>
          <h2 className="mb-4" style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, color: c.text }}>Our Story</h2>
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-10" style={{ background: borderCol }} />
            <span style={{ color: c.primary, fontSize: 12 }}>✦</span>
            <div className="h-px w-10" style={{ background: borderCol }} />
          </div>
          <p className="text-sm leading-relaxed max-w-sm mx-auto" style={{ color: muted }}>
            {restaurantDescription}
          </p>
        </section>
      )}

      {/* ── OPENING HOURS ── */}
      {openingHours && openingHours.length > 0 && (
        <section className="px-6 py-14" style={{ background: c.bg }}>
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-[4px] mb-2" style={{ color: c.primary }}>Visit Us</p>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: c.text }}>Opening Hours</h2>
          </div>
          <div className="max-w-xs mx-auto space-y-3">
            {openingHours.map((row) => (
              <div key={row.day} className="flex items-center justify-between py-3 border-b" style={{ borderColor: borderCol }}>
                <span className="text-sm" style={{ color: muted }}>{row.day}</span>
                <span className="text-sm font-semibold" style={{ color: c.primary }}>{row.hours}</span>
              </div>
            ))}
          </div>
          {(restaurantAddress || restaurantCity || restaurantPhone) && (
            <div className="max-w-xs mx-auto mt-8 space-y-2 text-center">
              {(restaurantAddress || restaurantCity) && (
                <p className="text-sm" style={{ color: muted }}>
                  📍 {[restaurantAddress, restaurantCity].filter(Boolean).join(", ")}
                </p>
              )}
              {restaurantPhone && (
                <p className="text-sm" style={{ color: muted }}>📞 {restaurantPhone}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── GALLERY ── */}
      <section className="py-10 overflow-hidden" style={{ background: c.surface }}>
        <div className="px-5 mb-5 text-center">
          <p className="text-xs uppercase tracking-[4px]" style={{ color: c.primary }}>The Ambiance</p>
        </div>
        <div className="flex gap-3 px-5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {[
            "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=300&q=80",
            "https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=300&q=80",
            "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=300&q=80",
            "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=300&q=80",
            "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=300&q=80",
          ].map((src, i) => (
            <img key={i} src={src} alt="Ambiance" className="flex-shrink-0 w-36 h-44 object-cover rounded-2xl" style={{ filter: "brightness(0.75)" }} />
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="px-6 pt-10 pb-16 text-center" style={{ background: "#080808", borderTop: `1px solid ${borderCol}` }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: c.primary, marginBottom: 8 }}>{restaurantName}</div>
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="h-px w-8" style={{ background: `linear-gradient(to right, transparent, ${c.primary})` }} />
          <span style={{ color: c.primary, fontSize: 10 }}>✦</span>
          <div className="h-px w-8" style={{ background: `linear-gradient(to left, transparent, ${c.primary})` }} />
        </div>
        <p className="text-xs mb-6" style={{ color: muted, letterSpacing: 1 }}>Scan · Order · Experience</p>
        <div className="flex justify-center gap-6 mb-6">
          {["Instagram", "Facebook", "TripAdvisor"].map((s) => (
            <span key={s} className="text-xs cursor-pointer hover:opacity-70 transition-opacity" style={{ color: muted }}>{s}</span>
          ))}
        </div>
        <p className="text-xs" style={{ color: borderCol }}>© {new Date().getFullYear()} {restaurantName}. All rights reserved.</p>
      </footer>

      {/* ── CART BAR ── */}
      {cartItemCount > 0 && (
        <div onClick={onCartOpen}
          className="fixed bottom-5 left-4 right-4 rounded-2xl px-5 py-4 flex items-center justify-between cursor-pointer z-40 transition-transform hover:-translate-y-0.5"
          style={{ background: `linear-gradient(135deg, ${c.primary} 0%, ${c.primaryLight} 100%)`, boxShadow: `0 8px 32px ${c.primary}66` }}>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: c.bg, color: c.primary }}>{cartItemCount}</div>
            <span className="text-sm font-semibold" style={{ color: c.bg }}>View Your Order</span>
          </div>
          <span className="text-base font-bold" style={{ color: c.bg }}>{currency}{cartTotal.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
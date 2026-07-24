import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronDown, X, Menu } from "lucide-react";

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

const DEFAULTS: Required<ThemeColors> = {
  bg:           "#F7F5F0",
  primary:      "#2D6A4F",
  primaryLight: "#52B788",
  primaryDark:  "#1B4332",
  text:         "#1C1C1C",
  surface:      "#FFFFFF",
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

export default function FreshMinimalTheme({
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
  restaurantDescription,
  openingHours,
}: QrThemeProps) {

  const c: Required<ThemeColors> = {
    bg:           themeColors?.bg           ?? DEFAULTS.bg,
    primary:      themeColors?.primary      ?? DEFAULTS.primary,
    primaryLight: themeColors?.primaryLight ?? DEFAULTS.primaryLight,
    primaryDark:  themeColors?.primaryDark  ?? DEFAULTS.primaryDark,
    text:         themeColors?.text         ?? DEFAULTS.text,
    surface:      themeColors?.surface      ?? DEFAULTS.surface,
  };

  const primaryPale = `${c.primary}22`;
  const tagBg       = `${c.primary}14`;
  const border      = "#EBEBEB";
  const muted       = "#8E8E8E";

  const menuSectionRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap";
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

  const scrollToMenu = () => { menuSectionRef.current?.scrollIntoView({ behavior: "smooth" }); setMenuDropdownOpen(false); };
  const scrollToCategory = (catId: string) => {
    onCategorySelect(catId);
    setMenuDropdownOpen(false);
    setTimeout(() => menuSectionRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const items = (currentCategory?.items ?? []).filter(
    (item) => search.trim() === "" || item.name.toLowerCase().includes(search.toLowerCase())
  );
  const allPopular = categories.flatMap((ct) => ct.items).filter((i) => i.isPopular).slice(0, 3);
  const greeting = () => { const h = new Date().getHours(); if (h < 12) return "Good morning!"; if (h < 17) return "Good afternoon!"; return "Good evening!"; };

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: "'DM Sans', sans-serif", minHeight: "100vh" }}>

      {/* ── NAVBAR ── */}
      <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{ background: navScrolled ? `${c.surface}f7` : "transparent", backdropFilter: navScrolled ? "blur(16px)" : "none", borderBottom: navScrolled ? `1px solid ${border}` : "none", padding: "0 20px" }}>
        <div className="flex items-center justify-between h-16 max-w-2xl mx-auto">
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: navScrolled ? c.primary : "#ffffff", transition: "color 0.3s" }}>{restaurantName}</div>
          <div className="flex items-center gap-3">
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setMenuDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border transition-all"
                style={{ borderColor: navScrolled ? border : "rgba(255,255,255,0.3)", color: navScrolled ? c.primary : "#ffffff", background: navScrolled ? c.surface : "rgba(255,255,255,0.1)" }}>
                <Menu className="h-3.5 w-3.5" />Menu
                <ChevronDown className="h-3 w-3 transition-transform" style={{ transform: menuDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
              </button>
              {menuDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl overflow-hidden z-50 shadow-xl"
                  style={{ background: c.surface, border: `1px solid ${border}` }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: border }}>
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: muted }}>Browse Menu</span>
                    <button onClick={() => setMenuDropdownOpen(false)}><X className="h-4 w-4" style={{ color: muted }} /></button>
                  </div>
                  <div className="py-2 max-h-56 overflow-y-auto">
                    {categories.map((cat) => (
                      <button key={cat.id} onClick={() => scrollToCategory(cat.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left transition-all"
                        style={{ borderBottom: `1px solid ${border}` }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = tagBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <span className="text-sm font-medium" style={{ color: c.text }}>{cat.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: tagBg, color: c.primary }}>{cat.items.length}</span>
                      </button>
                    ))}
                  </div>
                  {allPopular.length > 0 && (
                    <div className="border-t px-4 py-3" style={{ borderColor: border }}>
                      <p className="text-xs uppercase tracking-wider mb-2" style={{ color: muted }}>Crowd Favourites</p>
                      <div className="space-y-2">
                        {allPopular.map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded-xl object-cover flex-shrink-0" />
                              : <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-sm" style={{ background: tagBg }}>🌿</div>}
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
            <button onClick={scrollToMenu} className="px-4 py-2 rounded-full text-xs font-bold transition-all hover:opacity-90"
              style={{ background: c.primary, color: "#ffffff" }}>Order Now</button>
            {tableLabel && (
              <div className="hidden sm:flex text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ background: navScrolled ? primaryPale : "rgba(255,255,255,0.15)", color: navScrolled ? c.primary : "#ffffff", transition: "all 0.3s" }}>
                🪑 {tableLabel}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative flex flex-col items-center justify-center text-center" style={{ height: "100vh", minHeight: 600 }}>
        <img src="https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&q=80" alt="Fresh food"
          className="absolute inset-0 w-full h-full object-cover" style={{ filter: "brightness(0.45)" }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${c.primary}80 0%, rgba(0,0,0,0.5) 60%, ${c.bg}f5 100%)` }} />
        <div className="relative z-10 px-6 max-w-sm mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-5" style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}>
            <span className="text-xs font-semibold text-white tracking-wider">{tableLabel ? `🪑 ${tableLabel}` : "🌿 Fresh & Seasonal"}</span>
          </div>
          <h1 className="mb-4 text-white" style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(36px,10vw,54px)", lineHeight: 1.1 }}>{restaurantName}</h1>
          <p className="text-sm mb-8 text-white/80 leading-relaxed">Wholesome food made with love. Fresh ingredients, bold flavours, and a menu that changes with the seasons.</p>
          <div className="flex flex-col gap-3">
            <button onClick={scrollToMenu} className="w-full px-8 py-4 rounded-full text-sm font-bold text-white transition-all hover:opacity-90 hover:-translate-y-0.5"
              style={{ background: c.primary }}>{greeting()} — Start Your Order</button>
            <button onClick={scrollToMenu} className="w-full px-8 py-4 rounded-full text-sm font-semibold border transition-all"
              style={{ borderColor: "rgba(255,255,255,0.4)", color: "white" }}>See Today's Menu</button>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
          <span className="text-xs text-white/60 tracking-widest uppercase">Scroll</span>
          <ChevronDown className="h-4 w-4 text-white/60" />
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <div style={{ background: c.surface, borderBottom: `1px solid ${border}` }}>
        <div className="flex items-center justify-around px-4 py-6 max-w-2xl mx-auto">
          {[
            { value: `${categories.flatMap(ct => ct.items).length}+`, label: "Menu Items" },
            { value: "4.8★", label: "Rating" },
            { value: "8+", label: "Years Open" },
            { value: "30k+", label: "Happy Guests" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1">
              <span className="text-xl font-bold" style={{ fontFamily: "'DM Serif Display', serif", color: c.primary }}>{stat.value}</span>
              <span className="text-xs uppercase tracking-wider" style={{ color: muted }}>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── POPULAR PICKS ── */}
      {allPopular.length > 0 && (
        <section className="py-12 px-4" style={{ background: c.bg }}>
          <div className="text-center mb-6">
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: muted }}>Most Loved</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: c.text }}>Popular Picks</h2>
          </div>
          <div className="flex flex-col gap-3">
            {allPopular.map((item) => (
              <div key={item.id} className="flex gap-4 items-center p-3.5 rounded-2xl border cursor-pointer transition-all"
                style={{ background: c.surface, borderColor: border, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
                onClick={() => onItemClick(item)}>
                {item.imageUrl
                  ? <img src={item.imageUrl} alt={item.name} className="flex-shrink-0 rounded-2xl object-cover" style={{ width: 80, height: 80, borderRadius: 14 }} />
                  : <div className="flex-shrink-0 flex items-center justify-center text-2xl rounded-2xl" style={{ width: 80, height: 80, background: `${c.primary}14`, borderRadius: 14 }}>🌿</div>}
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-xl mb-1 inline-block" style={{ background: "#FFF8ED", color: "#F4A261" }}>⭐ Popular</span>
                  <p className="font-semibold text-base truncate" style={{ color: c.text }}>{item.name}</p>
                  {item.description && <p className="text-xs mt-0.5 line-clamp-1" style={{ color: muted }}>{item.description}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-base font-bold" style={{ color: c.text }}>{currency}{parseFloat(item.price).toFixed(2)}</span>
                    <button onClick={(e) => { e.stopPropagation(); item.modifierGroups?.length ? onItemClick(item) : onQuickAdd(item); }}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xl font-bold border-2 transition-all hover:opacity-80"
                      style={{ borderColor: c.primary, color: c.primary, background: c.surface }}>+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── MENU SECTION ── */}
      <section ref={menuSectionRef} className="pb-10" style={{ background: c.bg }}>
        <div className="px-5 pt-12 pb-4 text-center">
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: muted }}>What's Good Today</p>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: c.text }}>Our Menu</h2>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-full border" style={{ background: c.surface, borderColor: border }}>
            <Search className="h-4 w-4 flex-shrink-0" style={{ color: muted }} />
            <input type="text" placeholder="Search our menu..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border-none outline-none bg-transparent text-sm" style={{ fontFamily: "'DM Sans', sans-serif", color: c.text }} />
          </div>
        </div>
        <div className="flex gap-0 overflow-x-auto px-4 mb-5" style={{ scrollbarWidth: "none" }}>
          {categories.map((cat) => (
            <button key={cat.id} onClick={() => onCategorySelect(cat.id)}
              className="flex-shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap"
              style={selectedCategory === cat.id ? { color: c.primary, borderColor: c.primary } : { color: muted, borderColor: "transparent" }}>
              {cat.name}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 px-4">
          {isLoadingMenu ? [1,2,3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)
            : items.length === 0 ? <p className="text-center py-12" style={{ color: muted }}>{search ? "No results found" : "No items in this category"}</p>
            : items.map((item) => {
                const available = item.isAvailable !== false;
                return (
                  <div key={item.id} onClick={() => available && onItemClick(item)}
                    className="flex gap-3.5 items-center p-3.5 rounded-2xl border transition-all"
                    style={{ background: c.surface, borderColor: border, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", opacity: available ? 1 : 0.55, cursor: available ? "pointer" : "default" }}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} className="flex-shrink-0 rounded-2xl object-cover" style={{ width: 88, height: 88, borderRadius: 14 }} />
                      : <div className="flex-shrink-0 flex items-center justify-center text-2xl rounded-2xl" style={{ width: 88, height: 88, background: tagBg, borderRadius: 14 }}>🌿</div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-1.5 mb-1.5 flex-wrap">
                        {item.isPopular && <span className="text-xs font-semibold px-2 py-0.5 rounded-xl" style={{ background: "#FFF8ED", color: "#F4A261" }}>⭐ Popular</span>}
                        {item.isNew && <span className="text-xs font-semibold px-2 py-0.5 rounded-xl" style={{ background: tagBg, color: c.primary }}>New</span>}
                        {item.modifierGroups && item.modifierGroups.length > 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-xl" style={{ background: tagBg, color: c.primary }}>Customizable</span>}
                      </div>
                      <p className="font-semibold text-base truncate" style={{ color: c.text }}>{item.name}</p>
                      {item.description && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: muted }}>{item.description}</p>}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-base font-bold" style={{ color: c.text }}>{currency}{parseFloat(item.price).toFixed(2)}</span>
                        {available && (
                          <button onClick={(e) => { e.stopPropagation(); item.modifierGroups?.length ? onItemClick(item) : onQuickAdd(item); }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xl font-bold border-2 transition-all hover:opacity-80"
                            style={{ borderColor: c.primary, color: c.primary, background: c.surface }}>+</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>
      </section>

      {/* ── GALLERY STRIP ── */}
      <section className="py-10 overflow-hidden" style={{ background: c.surface }}>
        <div className="px-5 mb-4 text-center">
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: muted }}>Our Kitchen</p>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: c.text }}>A Peek Inside</h2>
        </div>
        <div className="flex gap-3 px-5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {[
            "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=400&q=80",
            "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80",
            "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80",
            "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&q=80",
            "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80",
          ].map((src, i) => (
            <img key={i} src={src} alt="Food" className="flex-shrink-0 object-cover rounded-2xl"
              style={{ width: 140, height: 160, borderRadius: 16, border: `1px solid ${border}` }} />
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-14 px-4" style={{ background: c.bg }}>
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: muted }}>What Our Guests Say</p>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: c.text }}>Reviews</h2>
        </div>
        <div className="flex flex-col gap-4">
          {[
            { name: "Priya K.", stars: 5, text: "The salads here are unlike anything I've had — so fresh and vibrant. You can taste the quality of every ingredient. My new weekly ritual!" },
            { name: "Tom W.", stars: 5, text: "Clean, bright space with food that actually nourishes you. The seasonal menu keeps me coming back to try what's new. Highly recommend." },
            { name: "Amara O.", stars: 5, text: "Incredibly friendly staff and food that feels genuinely wholesome. The grain bowls are outstanding. A gem of a restaurant." },
          ].map((r) => (
            <div key={r.name} className="p-5 rounded-2xl border" style={{ background: c.surface, borderColor: border, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div className="flex items-center gap-0.5 mb-3">
                {Array.from({ length: r.stars }).map((_, i) => (
                  <span key={i} style={{ color: "#F4A261", fontSize: 14 }}>★</span>
                ))}
              </div>
              <p className="text-sm leading-relaxed mb-4" style={{ color: c.text }}>"{r.text}"</p>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: `${c.primary}14`, color: c.primary }}>{r.name[0]}</div>
                <p className="text-xs font-semibold" style={{ color: muted }}>{r.name}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── ABOUT ── */}
      {restaurantDescription && (
        <section className="px-6 py-16" style={{ background: c.surface }}>
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: muted }}>About Us</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: c.text }}>{restaurantName}</h2>
          </div>
          <p className="text-sm leading-relaxed text-center max-w-sm mx-auto" style={{ color: muted }}>
            {restaurantDescription}
          </p>
        </section>
      )}

      {/* ── HOURS & LOCATION ── */}
      {((openingHours && openingHours.length > 0) || restaurantAddress || restaurantCity || restaurantPhone) && (
        <section className="px-6 py-14" style={{ background: c.bg }}>
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: muted }}>Find Us</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: c.text }}>Hours & Location</h2>
          </div>
          {openingHours && openingHours.length > 0 && (
            <div className="rounded-2xl overflow-hidden mb-6" style={{ background: c.surface, border: `1px solid ${border}` }}>
              {openingHours.map((row, i, arr) => (
                <div key={row.day} className="flex justify-between items-center px-5 py-4"
                  style={{ borderBottom: i < arr.length - 1 ? `1px solid ${border}` : "none" }}>
                  <span className="text-sm" style={{ color: c.text }}>{row.day}</span>
                  <span className="text-sm font-semibold" style={{ color: c.primary }}>{row.hours}</span>
                </div>
              ))}
            </div>
          )}
          {(restaurantAddress || restaurantCity || restaurantPhone) && (
            <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: tagBg }}>
              <span className="text-xl">📍</span>
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: c.text }}>Our Location</p>
                {(restaurantAddress || restaurantCity) && (
                  <p className="text-xs leading-relaxed" style={{ color: muted }}>
                    {[restaurantAddress, restaurantCity].filter(Boolean).join(", ")}
                  </p>
                )}
                {restaurantPhone && (
                  <p className="text-xs mt-1" style={{ color: muted }}>📞 {restaurantPhone}</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── FOOTER ── */}
      <footer className="px-6 pt-10 pb-16 text-center" style={{ background: c.primary }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#ffffff", marginBottom: 8 }}>{restaurantName}</div>
        <p className="text-xs mb-6" style={{ color: "rgba(255,255,255,0.6)", letterSpacing: 1 }}>Fresh · Seasonal · Wholesome</p>
        <div className="flex justify-center gap-6 mb-6">
          {["Instagram", "Facebook", "Google"].map((s) => (
            <span key={s} className="text-xs cursor-pointer text-white/60 hover:text-white/90 transition-opacity">{s}</span>
          ))}
        </div>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>© {new Date().getFullYear()} {restaurantName}. All rights reserved.</p>
      </footer>

      {/* ── CART BAR ── */}
      {cartItemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-5 pt-3" style={{ background: `linear-gradient(to top, ${c.bg} 60%, transparent)` }}>
          <div onClick={onCartOpen}
            className="flex items-center justify-between px-5 py-4 rounded-2xl cursor-pointer transition-transform hover:-translate-y-0.5"
            style={{ background: c.primary, boxShadow: `0 8px 24px ${c.primary}66` }}>
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "#ffffff", color: c.primary }}>{cartItemCount}</div>
              <span className="text-sm font-semibold text-white">View Cart</span>
            </div>
            <span className="text-base font-bold text-white">{currency}{cartTotal.toFixed(2)} →</span>
          </div>
        </div>
      )}
    </div>
  );
}
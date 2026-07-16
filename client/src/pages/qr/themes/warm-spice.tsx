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
  tags?: string[];
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
  bg:           "#FDF6EE",
  primary:      "#C1440E",   // terra
  primaryLight: "#E8A838",   // saffron
  primaryDark:  "#8B2500",   // terra dark
  text:         "#1E1208",
  surface:      "#FFFAF5",
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

export default function WarmSpiceTheme({
  restaurantName, tableLabel, categories, currentCategory,
  selectedCategory, onCategorySelect, cartItemCount, cartTotal,
  currency, onItemClick, onQuickAdd, onCartOpen, isLoadingMenu, themeColors,
  restaurantAddress, restaurantCity, restaurantPhone, restaurantDescription, openingHours,
}: QrThemeProps) {

  const c: Required<ThemeColors> = {
    bg:           themeColors?.bg           ?? DEFAULTS.bg,
    primary:      themeColors?.primary      ?? DEFAULTS.primary,
    primaryLight: themeColors?.primaryLight ?? DEFAULTS.primaryLight,
    primaryDark:  themeColors?.primaryDark  ?? DEFAULTS.primaryDark,
    text:         themeColors?.text         ?? DEFAULTS.text,
    surface:      themeColors?.surface      ?? DEFAULTS.surface,
  };

  const terraPale  = `${c.primary}22`;
  const saffronPale = `${c.primaryLight}22`;
  const borderCol  = "#EDE0D4";
  const muted      = "#9B8A7A";

  const menuSectionRef = useRef<HTMLDivElement>(null);
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Nunito:wght@400;500;600;700;800&display=swap";
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

  const items = currentCategory?.items ?? [];
  const allPopular = categories.flatMap((ct) => ct.items).filter((i) => i.isPopular).slice(0, 3);

  return (
    <div style={{ background: c.bg, color: c.text, fontFamily: "'Nunito', sans-serif", minHeight: "100vh" }}>

      {/* ── NAVBAR ── */}
      <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{ background: navScrolled ? `${c.primaryDark}f7` : "transparent", backdropFilter: navScrolled ? "blur(16px)" : "none", padding: "0 20px" }}>
        {navScrolled && (
          <div className="h-1" style={{ background: `repeating-linear-gradient(90deg,${c.primaryLight} 0,${c.primaryLight} 10px,${c.primary} 10px,${c.primary} 20px,${c.primaryDark} 20px,${c.primaryDark} 30px)` }} />
        )}
        <div className="flex items-center justify-between h-16 max-w-2xl mx-auto">
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, color: c.primaryLight, letterSpacing: 1 }}>{restaurantName}</div>
          <div className="flex items-center gap-3">
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setMenuDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold border transition-all"
                style={{ borderColor: navScrolled ? `${c.primaryLight}66` : "rgba(255,255,255,0.3)", color: navScrolled ? c.primaryLight : "#ffffff", background: navScrolled ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.2)" }}>
                <Menu className="h-3.5 w-3.5" />Menu
                <ChevronDown className="h-3 w-3 transition-transform" style={{ transform: menuDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
              </button>
              {menuDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl overflow-hidden z-50 shadow-2xl"
                  style={{ background: c.surface, border: `1px solid ${borderCol}` }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: borderCol, background: c.primaryDark }}>
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: c.primaryLight }}>Our Menu</span>
                    <button onClick={() => setMenuDropdownOpen(false)}><X className="h-4 w-4 text-white/60" /></button>
                  </div>
                  <div className="py-2 max-h-56 overflow-y-auto">
                    {categories.map((cat) => (
                      <button key={cat.id} onClick={() => scrollToCategory(cat.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left transition-all"
                        style={{ borderBottom: `1px solid ${borderCol}` }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = terraPale)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <span className="text-sm font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif", color: c.text, fontSize: 15 }}>{cat.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: terraPale, color: c.primary }}>{cat.items.length}</span>
                      </button>
                    ))}
                  </div>
                  {allPopular.length > 0 && (
                    <div className="border-t px-4 py-3" style={{ borderColor: borderCol }}>
                      <p className="text-xs uppercase tracking-wider mb-2" style={{ color: muted }}>Chef's Picks</p>
                      <div className="space-y-2">
                        {allPopular.map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                              : <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-sm" style={{ background: terraPale }}>🍽️</div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate" style={{ color: c.text }}>{item.name}</p>
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
              style={{ background: c.primaryLight, color: c.primaryDark }}>Order Now</button>
            {tableLabel && <div className="hidden sm:block text-xs font-extrabold" style={{ color: c.primaryLight }}>{tableLabel}</div>}
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative flex flex-col items-center justify-center text-center" style={{ height: "100vh", minHeight: 600 }}>
        <img src="https://images.unsplash.com/photo-1544025162-d76694265947?w=1200&q=80" alt="Food"
          className="absolute inset-0 w-full h-full object-cover" style={{ filter: "brightness(0.35)" }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${c.primaryDark}73 0%, ${c.text}a6 60%, ${c.bg} 100%)` }} />
        <div className="relative z-10 px-6 max-w-sm mx-auto">
          <div className="text-3xl mb-4 opacity-90">✦</div>
          <p className="text-xs font-bold tracking-[4px] uppercase mb-4" style={{ color: c.primaryLight }}>Authentic Flavours</p>
          <h1 className="mb-3 text-white" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(40px,11vw,62px)", fontWeight: 700, lineHeight: 1.1 }}>{restaurantName}</h1>
          <div className="flex items-center justify-center gap-4 mb-5">
            <div className="h-px w-14" style={{ background: "rgba(255,255,255,0.25)" }} />
            <span style={{ color: c.primaryLight, fontSize: 14 }}>✦</span>
            <div className="h-px w-14" style={{ background: "rgba(255,255,255,0.25)" }} />
          </div>
          {tableLabel && <p className="text-sm font-bold mb-2" style={{ color: c.primaryLight }}>{tableLabel}</p>}
          <p className="text-sm mb-8 text-white/70 tracking-wide leading-relaxed">Crafted with love, spice & tradition since 1998. Recipes passed down through generations.</p>
          <div className="flex flex-col gap-3">
            <button onClick={scrollToMenu} className="w-full px-8 py-4 rounded-full text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-0.5"
              style={{ background: c.primary, color: "#ffffff" }}>Explore The Menu</button>
            <button onClick={scrollToMenu} className="w-full px-8 py-4 rounded-full text-sm font-bold transition-all"
              style={{ background: c.primaryLight, color: c.primaryDark }}>Today's Chef Specials ✦</button>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
          <span className="text-xs tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.5)" }}>Scroll</span>
          <ChevronDown className="h-4 w-4 text-white/50" />
        </div>
      </section>

      {/* ── MENU SECTION ── */}
      <section ref={menuSectionRef} className="pb-10" style={{ background: c.bg }}>
        <div className="px-5 pt-12 pb-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="h-px w-8" style={{ background: c.primary }} />
            <span style={{ color: c.primary, fontSize: 14 }}>✦</span>
            <div className="h-px w-8" style={{ background: c.primary }} />
          </div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 700, color: c.text }}>Our Menu</h2>
          <p className="text-xs mt-1 tracking-wider" style={{ color: muted }}>Crafted with heritage spices & fresh ingredients</p>
        </div>
        {/* Category grid */}
        <div className="px-4 mb-5">
          <div className="grid grid-cols-2 gap-2.5">
            {categories.slice(0, 4).map((cat) => {
              const thumb = cat.items[0]?.imageUrl;
              const isSelected = selectedCategory === cat.id;
              return (
                <div key={cat.id} onClick={() => onCategorySelect(cat.id)}
                  className="relative h-24 rounded-2xl overflow-hidden cursor-pointer transition-all"
                  style={{ border: `2px solid ${isSelected ? c.primaryLight : "transparent"}` }}>
                  {thumb ? <img src={thumb} alt={cat.name} className="w-full h-full object-cover" style={{ filter: "brightness(0.5)" }} />
                    : <div className="w-full h-full" style={{ background: c.primaryDark }} />}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white font-bold text-sm tracking-wide">
                    <span className="text-xl mb-1">🍽️</span>{cat.name}
                  </div>
                </div>
              );
            })}
          </div>
          {categories.length > 4 && (
            <div className="flex flex-wrap gap-2 mt-2.5">
              {categories.slice(4).map((cat) => (
                <button key={cat.id} onClick={() => onCategorySelect(cat.id)}
                  className="px-4 py-2 rounded-full text-xs font-bold border transition-all"
                  style={selectedCategory === cat.id
                    ? { background: c.primary, color: "#ffffff", borderColor: c.primary }
                    : { background: "#ffffff", color: muted, borderColor: borderCol }}>
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Items */}
        <div className="px-4">
          <div className="flex items-center justify-between mb-3.5">
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: c.text }}>{currentCategory?.name || "Menu"}</h3>
          </div>
          <div className="flex flex-col gap-3.5">
            {isLoadingMenu ? [1,2,3].map((i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)
              : items.length === 0 ? <p className="text-center py-12" style={{ color: muted }}>No items in this category</p>
              : items.map((item) => {
                  const available = item.isAvailable !== false;
                  return (
                    <div key={item.id} onClick={() => available && onItemClick(item)}
                      className="rounded-2xl overflow-hidden border transition-all"
                      style={{ background: c.surface, borderColor: borderCol, boxShadow: "0 2px 12px rgba(193,68,14,0.06)", opacity: available ? 1 : 0.55, cursor: available ? "pointer" : "default" }}>
                      <div className="relative h-40">
                        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-4xl" style={{ background: terraPale }}>🍽️</div>}
                        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(30,18,8,0.5) 0%, transparent 50%)" }} />
                        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                          {item.isPopular && <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: c.primaryLight, color: c.primaryDark }}>⭐ Popular</span>}
                          {item.isNew && <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ background: "rgba(27,107,117,0.85)" }}>New</span>}
                        </div>
                      </div>
                      <div className="p-3.5">
                        <div className="flex items-start justify-between mb-1.5">
                          <p className="text-lg flex-1 mr-2.5" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, color: c.text, lineHeight: 1.2 }}>{item.name}</p>
                          <div className="px-3 py-1 rounded-full text-sm font-extrabold flex-shrink-0" style={{ background: terraPale, color: c.primary }}>
                            {currency}{parseFloat(item.price).toFixed(2)}
                          </div>
                        </div>
                        {item.description && <p className="text-xs mb-3 line-clamp-2" style={{ color: muted, lineHeight: 1.5 }}>{item.description}</p>}
                        <div className="flex items-center justify-between">
                          <div className="flex gap-1.5 flex-wrap">
                            {item.tags?.slice(0, 2).map((tag) => (
                              <span key={tag} className="text-xs px-2 py-0.5 rounded-lg font-semibold" style={{ background: saffronPale, color: "#9A6800" }}>{tag}</span>
                            ))}
                          </div>
                          {available && (
                            <button onClick={(e) => { e.stopPropagation(); item.modifierGroups?.length ? onItemClick(item) : onQuickAdd(item); }}
                              className="flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-bold text-white transition-all hover:opacity-90 flex-shrink-0"
                              style={{ background: c.primary }}>+ Add</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </section>

      {/* ── OUR CRAFT ── */}
      <section className="py-16 px-6 text-center" style={{ background: c.primaryDark }}>
        <div className="text-2xl mb-4">✦</div>
        <h2 className="mb-4" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, color: "#ffffff" }}>Our Craft</h2>
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="h-px w-10" style={{ background: `${c.primaryLight}66` }} />
          <span style={{ color: c.primaryLight }}>✦</span>
          <div className="h-px w-10" style={{ background: `${c.primaryLight}66` }} />
        </div>
        <p className="text-sm leading-relaxed max-w-sm mx-auto mb-10" style={{ color: "rgba(255,255,255,0.65)" }}>
          Every recipe at {restaurantName} is a love letter to authentic cuisine. We slow-cook, hand-grind spices, and honour time-tested methods passed through generations.
        </p>
        <div className="grid grid-cols-3 gap-4">
          {[{ icon: "🌶️", label: "Hand-ground Spices" }, { icon: "🔥", label: "Charcoal Grill" }, { icon: "🌿", label: "Daily Fresh Herbs" }].map((p) => (
            <div key={p.label} className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                style={{ background: `${c.primaryLight}1a`, border: `1px solid ${c.primaryLight}40` }}>{p.icon}</div>
              <p className="text-xs text-center font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.75)" }}>{p.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── ABOUT ── */}
      {restaurantDescription && (
        <section className="py-14 px-8 text-center" style={{ background: c.bg }}>
          <span style={{ color: c.primaryLight, fontSize: 32, fontFamily: "'Cormorant Garamond', serif" }}>"</span>
          <p className="text-lg italic leading-relaxed my-2" style={{ fontFamily: "'Cormorant Garamond', serif", color: c.text, lineHeight: 1.7 }}>
            {restaurantDescription}
          </p>
          <span style={{ color: c.primaryLight, fontSize: 32, fontFamily: "'Cormorant Garamond', serif" }}>"</span>
        </section>
      )}

      {/* ── OPENING HOURS ── */}
      {((openingHours && openingHours.length > 0) || restaurantAddress || restaurantCity || restaurantPhone) && (
        <section className="px-6 py-14" style={{ background: "#ffffff" }}>
          {openingHours && openingHours.length > 0 && (
            <>
              <div className="text-center mb-8">
                <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: c.text }}>Opening Hours</h2>
                <div className="flex items-center justify-center gap-3 mt-2">
                  <div className="h-px w-8" style={{ background: borderCol }} />
                  <span style={{ color: c.primary, fontSize: 10 }}>✦</span>
                  <div className="h-px w-8" style={{ background: borderCol }} />
                </div>
              </div>
              <div className="max-w-xs mx-auto rounded-2xl overflow-hidden border" style={{ borderColor: borderCol }}>
                {openingHours.map((row, i, arr) => (
                  <div key={row.day} className="flex justify-between items-center px-5 py-4"
                    style={{ borderBottom: i < arr.length - 1 ? `1px solid ${borderCol}` : "none", background: i % 2 === 0 ? "#ffffff" : c.bg }}>
                    <span className="text-sm" style={{ color: muted }}>{row.day}</span>
                    <span className="text-sm font-bold" style={{ color: c.primary }}>{row.hours}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {(restaurantAddress || restaurantCity || restaurantPhone) && (
            <div className="max-w-xs mx-auto mt-8 text-center space-y-2">
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

      {/* ── FOOTER ── */}
      <footer className="px-6 pt-10 pb-16" style={{ background: c.primaryDark, borderTop: `4px solid ${c.primary}` }}>
        <div className="h-1 mb-8" style={{ background: `repeating-linear-gradient(90deg,${c.primaryLight} 0,${c.primaryLight} 10px,${c.primary} 10px,${c.primary} 20px,${c.primaryDark} 20px,${c.primaryDark} 30px)` }} />
        <div className="text-center">
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, color: c.primaryLight, marginBottom: 8 }}>{restaurantName}</div>
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="h-px w-8" style={{ background: `${c.primaryLight}4d` }} />
            <span style={{ color: c.primaryLight, fontSize: 10 }}>✦</span>
            <div className="h-px w-8" style={{ background: `${c.primaryLight}4d` }} />
          </div>
          <p className="text-xs mb-6" style={{ color: "rgba(255,255,255,0.4)", letterSpacing: 2 }}>SCAN · ORDER · ENJOY</p>
          <div className="flex justify-center gap-6 mb-6">
            {["Instagram", "Facebook", "TripAdvisor"].map((s) => (
              <span key={s} className="text-xs cursor-pointer hover:opacity-70 transition-opacity" style={{ color: "rgba(255,255,255,0.45)" }}>{s}</span>
            ))}
          </div>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>© {new Date().getFullYear()} {restaurantName}. All rights reserved.</p>
        </div>
      </footer>

      {/* ── CART BAR ── */}
      {cartItemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-5 pt-3"
          style={{ background: `linear-gradient(to top, ${c.bg} 70%, transparent)` }}>
          <div onClick={onCartOpen}
            className="flex overflow-hidden rounded-2xl cursor-pointer transition-transform hover:-translate-y-0.5"
            style={{ background: c.primary, boxShadow: `0 8px 28px ${c.primary}66` }}>
            <div className="flex items-center justify-center px-5 text-lg font-extrabold"
              style={{ background: c.primaryDark, color: c.primaryLight, minWidth: 60, paddingTop: 16, paddingBottom: 16 }}>{cartItemCount}</div>
            <div className="flex-1 flex items-center px-4"><span className="text-white text-sm font-bold">View Your Order</span></div>
            <div className="flex items-center px-5 font-extrabold text-sm"
              style={{ background: c.primaryLight, color: c.primaryDark }}>{currency}{cartTotal.toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
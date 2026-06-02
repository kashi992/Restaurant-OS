import { useState } from "react";
import { Check, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────
export type QrTemplate = "luxe-dark" | "fresh-minimal" | "warm-spice";

export interface ThemeColors {
  bg?: string;
  primary?: string;
  primaryLight?: string;
  primaryDark?: string;
  text?: string;
  surface?: string;
}

// ── Default colors per theme ──────────────────────────────────────────────────
export const THEME_DEFAULTS: Record<QrTemplate, Required<ThemeColors>> = {
  "luxe-dark": {
    bg:           "#0D0D0D",
    primary:      "#C9A84C",
    primaryLight: "#E2C97E",
    primaryDark:  "#0D0D0D",
    text:         "#F5F0E8",
    surface:      "#1A1A1A",
  },
  "fresh-minimal": {
    bg:           "#F7F5F0",
    primary:      "#2D6A4F",
    primaryLight: "#52B788",
    primaryDark:  "#1B4332",
    text:         "#1C1C1C",
    surface:      "#FFFFFF",
  },
  "warm-spice": {
    bg:           "#FDF6EE",
    primary:      "#C1440E",
    primaryLight: "#E8A838",
    primaryDark:  "#8B2500",
    text:         "#1E1208",
    surface:      "#FFFAF5",
  },
};

// ── Color field labels per theme ──────────────────────────────────────────────
const COLOR_FIELDS: { key: keyof ThemeColors; labels: Record<QrTemplate, string> }[] = [
  { key: "bg",           labels: { "luxe-dark": "Background",         "fresh-minimal": "Background",     "warm-spice": "Background"    } },
  { key: "surface",      labels: { "luxe-dark": "Card Surface",       "fresh-minimal": "Card / White",   "warm-spice": "Card Surface"  } },
  { key: "primary",      labels: { "luxe-dark": "Gold (Primary)",     "fresh-minimal": "Green (Primary)","warm-spice": "Terra (Primary)"} },
  { key: "primaryLight", labels: { "luxe-dark": "Gold Light",         "fresh-minimal": "Green Light",    "warm-spice": "Saffron"       } },
  { key: "primaryDark",  labels: { "luxe-dark": "Dark Background",    "fresh-minimal": "Dark Green",     "warm-spice": "Terra Dark"    } },
  { key: "text",         labels: { "luxe-dark": "Text",               "fresh-minimal": "Text",           "warm-spice": "Text"          } },
];

// ── Theme meta ────────────────────────────────────────────────────────────────
const THEMES: { id: QrTemplate; label: string; description: string; preview: React.ReactNode }[] = [
  {
    id: "luxe-dark",
    label: "Luxe Dark",
    description: "Dark ambiance with gold accents — perfect for fine dining.",
    preview: (
      <div className="rounded-lg overflow-hidden" style={{ background: "#0D0D0D", padding: 8 }}>
        <div className="flex items-center justify-between mb-2">
          <div className="h-2 w-14 rounded" style={{ background: "#C9A84C" }} />
          <div className="h-2 w-10 rounded border" style={{ background: "#222", borderColor: "#C9A84C" }} />
        </div>
        <div className="grid grid-cols-2 gap-1">
          {[1,2,3,4].map((i) => (
            <div key={i} className="rounded overflow-hidden" style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}>
              <div className="h-6 w-full" style={{ background: "#2A2A2A" }} />
              <div className="p-1 space-y-0.5">
                <div className="h-1 rounded w-3/4" style={{ background: "#444" }} />
                <div className="h-1 rounded w-1/2" style={{ background: "#C9A84C" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "fresh-minimal",
    label: "Fresh & Minimal",
    description: "Clean white with green tones — ideal for cafés & health food.",
    preview: (
      <div className="rounded-lg overflow-hidden" style={{ background: "#F7F5F0", padding: 8 }}>
        <div className="flex items-center justify-between mb-2">
          <div className="h-2 w-12 rounded" style={{ background: "#2D6A4F" }} />
          <div className="h-2 w-10 rounded-full" style={{ background: "#D8F3DC" }} />
        </div>
        <div className="rounded-lg p-1.5 mb-1.5" style={{ background: "linear-gradient(135deg,#2D6A4F,#52B788)" }}>
          <div className="h-1.5 w-2/3 rounded bg-white/60 mb-1" />
          <div className="h-1 w-1/2 rounded bg-white/40" />
        </div>
        {[1,2].map((i) => (
          <div key={i} className="flex gap-1.5 items-center p-1.5 rounded-lg mb-1 bg-white border border-gray-100">
            <div className="w-7 h-7 rounded-lg shrink-0" style={{ background: "#D8F3DC" }} />
            <div className="flex-1 space-y-0.5">
              <div className="h-1.5 bg-gray-300 rounded w-3/4" />
              <div className="h-1 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "warm-spice",
    label: "Warm Spice",
    description: "Rich terracotta tones — Asian & Middle Eastern cuisine.",
    preview: (
      <div className="rounded-lg overflow-hidden" style={{ background: "#FDF6EE", padding: 0 }}>
        <div className="flex items-center justify-between px-2 py-1.5" style={{ background: "#8B2500" }}>
          <div className="h-2 w-10 rounded" style={{ background: "#E8A838" }} />
          <div className="h-1.5 w-8 rounded" style={{ background: "rgba(255,255,255,0.3)" }} />
        </div>
        <div className="h-1" style={{ background: "repeating-linear-gradient(90deg,#E8A838 0,#E8A838 4px,#C1440E 4px,#C1440E 8px)" }} />
        <div className="h-6 w-full" style={{ background: "linear-gradient(to bottom,#6B2000,#1E1208)" }} />
        <div className="px-1.5 pt-1.5 space-y-1">
          {[1,2].map((i) => (
            <div key={i} className="rounded-xl overflow-hidden border" style={{ background: "#FFFAF5", borderColor: "#EDE0D4" }}>
              <div className="h-5 w-full" style={{ background: "#FBE9DF" }} />
              <div className="flex items-center justify-between px-1.5 py-1">
                <div className="h-1.5 bg-gray-300 rounded w-2/3" />
                <div className="h-1.5 w-6 rounded-full" style={{ background: "#C1440E" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface QrThemePickerProps {
  currentTheme: QrTemplate;
  currentColors?: ThemeColors | null;
  onSelectTheme: (theme: QrTemplate) => void;
  onSaveColors: (theme: QrTemplate, colors: ThemeColors) => void;
  isSavingTheme?: boolean;
  isSavingColors?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function QrThemePicker({
  currentTheme,
  currentColors,
  onSelectTheme,
  onSaveColors,
  isSavingTheme = false,
  isSavingColors = false,
}: QrThemePickerProps) {
  // Which theme's color panel is open
  const [expandedTheme, setExpandedTheme] = useState<QrTemplate | null>(null);

  // Local color state per expanded theme — starts from saved or defaults
  const [localColors, setLocalColors] = useState<ThemeColors>({});

  const handleThemeClick = (themeId: QrTemplate) => {
    if (expandedTheme === themeId) {
      // Collapse if already open
      setExpandedTheme(null);
      return;
    }
    // Select the theme AND open color panel
    onSelectTheme(themeId);
    setExpandedTheme(themeId);
    // Seed local colors: use saved colors (if this is the active theme) or defaults
    const seed = themeId === currentTheme && currentColors
      ? { ...THEME_DEFAULTS[themeId], ...currentColors }
      : { ...THEME_DEFAULTS[themeId] };
    setLocalColors(seed);
  };

  const handleColorChange = (key: keyof ThemeColors, value: string) => {
    setLocalColors((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = (themeId: QrTemplate) => {
    setLocalColors({ ...THEME_DEFAULTS[themeId] });
  };

  const handleSave = (themeId: QrTemplate) => {
    onSaveColors(themeId, localColors);
  };

  return (
    <div className="space-y-4">
      {THEMES.map((theme) => {
        const isActive   = currentTheme === theme.id;
        const isExpanded = expandedTheme === theme.id;
        const defaults   = THEME_DEFAULTS[theme.id];

        return (
          <div
            key={theme.id}
            className={`rounded-2xl border-2 overflow-hidden transition-all ${
              isActive ? "border-primary" : "border-border"
            }`}
          >
            {/* ── Theme Card Row ── */}
            <button
              type="button"
              onClick={() => handleThemeClick(theme.id)}
              disabled={isSavingTheme}
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
            >
              {/* Mini preview */}
              <div className="w-28 flex-shrink-0 rounded-xl overflow-hidden border border-muted pointer-events-none">
                {theme.preview}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-sm">{theme.label}</p>
                  {isActive && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{theme.description}</p>
                {/* Color swatches preview */}
                <div className="flex gap-1.5 mt-2">
                  {Object.values(
                    isActive && currentColors
                      ? { ...defaults, ...currentColors }
                      : defaults
                  ).map((color, i) => (
                    <div key={i} className="w-4 h-4 rounded-full border border-muted flex-shrink-0"
                      style={{ background: color as string }} />
                  ))}
                </div>
              </div>

              {/* Right indicator */}
              <div className="flex-shrink-0 flex flex-col items-center gap-1">
                {isActive && <Check className="h-4 w-4 text-primary" />}
                <span className="text-xs text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
              </div>
            </button>

            {/* ── Expanded Color Panel ── */}
            {isExpanded && (
              <div className="border-t bg-muted/20 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">🎨 Customize Colors</p>
                  <p className="text-xs text-muted-foreground">Changes only apply to this theme</p>
                </div>

                {/* Color pickers grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {COLOR_FIELDS.map((field) => {
                    const label      = field.labels[theme.id];
                    const currentVal = (localColors[field.key] ?? defaults[field.key]) as string;
                    const isChanged  = currentVal !== defaults[field.key];
                    return (
                      <div key={field.key}
                        className={`flex items-center gap-3 p-3 rounded-xl border bg-background transition-all ${isChanged ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                        {/* Native color input */}
                        <label className="relative flex-shrink-0 cursor-pointer group">
                          <div className="w-10 h-10 rounded-xl border-2 border-muted overflow-hidden shadow-sm group-hover:border-primary transition-colors"
                            style={{ background: currentVal }}>
                            <input
                              type="color"
                              value={currentVal}
                              onChange={(e) => handleColorChange(field.key, e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                          </div>
                          {/* Pencil icon on hover */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs">✏️</span>
                          </div>
                        </label>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold">{label}</p>
                            {isChanged && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Modified</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{currentVal}</p>
                        </div>
                        {/* Reset this field */}
                        {isChanged && (
                          <button type="button"
                            onClick={() => handleColorChange(field.key, defaults[field.key])}
                            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                            title="Reset to default">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleReset(theme.id)}
                    className="flex items-center gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset All to Default
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSave(theme.id)}
                    disabled={isSavingColors}
                    className="flex items-center gap-1.5 ml-auto"
                  >
                    {isSavingColors ? (
                      <div className="h-3.5 w-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save Colors
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
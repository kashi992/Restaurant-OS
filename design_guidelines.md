# Design Guidelines: Restaurant POS + QR Ordering SaaS

## Design Approach
**Selected System:** Material Design 3 with modern dashboard conventions
**Rationale:** Information-dense business application requiring efficient data entry, real-time updates, and responsive customer-facing interfaces. Material provides robust patterns for both operational dashboards and consumer ordering experiences.

**Key References:** Toast POS (operational efficiency), Square Dashboard (clean data visualization), DoorDash consumer app (ordering flow)

---

## Typography System

**Font Stack:**
- Primary: Inter (via Google Fonts CDN) - UI, dashboard, data
- Secondary: DM Sans - Headers, branding elements

**Hierarchy:**
- Display (Hero/Marketing): text-4xl to text-6xl, font-bold
- H1 (Page Titles): text-3xl, font-semibold
- H2 (Section Headers): text-2xl, font-semibold  
- H3 (Card Titles): text-xl, font-medium
- Body: text-base, font-normal
- Small/Meta: text-sm, font-normal
- Micro (labels): text-xs, font-medium, uppercase tracking-wide

---

## Layout System

**Spacing Scale:** Tailwind units of **2, 4, 6, 8, 12, 16, 20**
- Tight spacing: p-2, gap-2 (dense tables, compact lists)
- Standard: p-4, gap-4 (cards, form fields)
- Comfortable: p-6, gap-6 (sections, containers)
- Generous: p-8 to p-20 (page padding, major sections)

**Grid System:**
- Dashboard: 12-column grid with sidebar (16rem fixed or 20rem)
- Customer QR App: Single column mobile-first, max-w-2xl centered
- Cards/Components: grid-cols-1 md:grid-cols-2 lg:grid-cols-3

---

## Core Components

### Navigation
**Dashboard Sidebar:**
- Fixed left sidebar (w-64), full height
- Logo area at top (h-16)
- Navigation items with icons (Heroicons) + labels
- Active state with subtle indicator (border-l-4)
- Collapsible on mobile (hamburger menu)

**Top Bar:**
- Fixed header (h-16)
- Breadcrumb navigation, search, notifications, user menu
- Right-aligned utility items

**QR App Navigation:**
- Minimal top bar with restaurant branding
- Bottom sheet or slide-out cart (fixed bottom)
- Category pills (horizontal scroll on mobile)

### Data Display
**Tables (POS Dashboard):**
- Striped rows for readability
- Sticky header row
- Row actions (icons only, right-aligned)
- Hover state for row selection
- Responsive: stack to cards on mobile

**Cards:**
- Rounded corners (rounded-lg)
- Elevation via shadow-md
- Padding p-6
- Header with title + action button/icon
- Consistent internal spacing (space-y-4)

**Menu Items (QR Ordering):**
- Card-based layout with images (aspect-square or aspect-video)
- Image + title + description + price layout
- "Add to Cart" button prominent and accessible
- Quantity selectors as steppers (-, number, +)

### Forms
**Input Fields:**
- Floating labels or top-aligned labels (label mb-2)
- Input height h-12, padding px-4
- Focus ring (ring-2 on focus)
- Helper text (text-sm below input)
- Error states with icon + message

**Buttons:**
- Heights: h-10 (default), h-12 (large), h-8 (small)
- Padding: px-6 (default), px-8 (large)
- Rounded: rounded-md
- Font: font-medium text-sm
- Primary: Solid fill
- Secondary: Outline style (border-2)
- Icon buttons: Square (w-10 h-10), centered icon

**Blurred Buttons on Images:**
- When buttons overlay hero/images: backdrop-blur-md with semi-transparent background
- No hover/active color changes (Button component handles states)

### Order Management
**Order Cards:**
- Status indicator (top border or badge)
- Order number prominent (text-lg font-bold)
- Items list (compact, scrollable if needed)
- Timestamp + customer info
- Action buttons (Accept/Prepare/Complete)

**Live Order Board:**
- Kanban-style columns (Pending/Preparing/Ready)
- Drag-and-drop enabled
- Real-time updates via Socket.IO visual feedback
- Order age indicator (color shift or timer display)

### Modals & Overlays
**Modal Structure:**
- Centered overlay with backdrop (backdrop-blur-sm)
- Max width constrained (max-w-md to max-w-2xl)
- Header with title + close button (top-right X)
- Body with scrollable content
- Footer with action buttons (right-aligned)

**Drawers (Mobile):**
- Slide from bottom for cart/filters
- Handle indicator at top
- Scrollable content area
- Fixed action buttons at bottom

---

## Animations
**Minimal Motion:**
- Page transitions: none (instant navigation)
- Micro-interactions only: button press (scale-95), checkbox check, toggle switch
- Live updates: Subtle pulse or fade-in for new orders
- Loading states: Simple spinner, no elaborate skeletons

---

## Accessibility
- All interactive elements: min height 44px (h-11 or larger)
- Form inputs: Consistent focus indicators across all input types
- Icon buttons: aria-label required
- Tables: Proper thead/tbody structure
- Sufficient contrast ratios (verified during color selection phase)

---

## Images

**Dashboard:**
- No hero images required
- Product/menu item thumbnails (96x96 to 256x256)
- Restaurant logo placement in sidebar and header

**QR Ordering App:**
- **Large Hero Image:** Yes - Restaurant ambiance or signature dish
  - Full-width banner (h-64 to h-96)
  - Overlay with restaurant name + tagline
  - CTA buttons with blurred backgrounds positioned on image
- Menu item images: Required for all products (aspect-square, rounded-lg)
- Category headers: Optional lifestyle images

**Image Strategy:**
- Use placeholder services (Unsplash API) for demo
- Describe: "Restaurant interior with warm lighting" / "Close-up of signature burger" / "Fresh ingredients preparation"
- Real implementation: Multi-tenant file upload system

---

## Distinct Interface Patterns

**POS Dashboard:**
- Information density prioritized
- Quick-scan tables and lists
- Keyboard shortcuts enabled
- Multi-panel layouts (order list + details)

**Customer QR App:**
- Generous whitespace and imagery
- Scroll-driven browsing (infinite scroll or pagination)
- Large touch targets (min 44px)
- Visual menu emphasis over data tables

---

This design system balances operational efficiency for restaurant staff with an inviting, modern experience for diners, maintaining consistency through shared typography, spacing, and component patterns while adapting density and visual hierarchy to each user's needs.
# Color Theme Management Guide

This guide shows you where to change colors throughout the SAM3 Annotation Platform for easy theme customization.

## 🎨 Color Palette

### Primary Colors
- **Emerald Green** `#10b981` - Main brand color (buttons, links, accents)
- **Chartreuse** `#9ABA12` - Secondary/accent color
- **Forest Green** `#37520B` - Dark accent/hints

### Usage Examples
```tsx
// Use emerald for primary actions
bg-emerald-600 hover:bg-emerald-700

// Use chartreuse for secondary highlights
bg-chartreuse-500 text-white

// Use forest for dark accents
text-forest-800 border-forest-600
```

## 📍 Where to Change Colors

### 1. **Tailwind Configuration** (Main Color Definitions)
**File:** `frontend/tailwind.config.js`

This is the **SINGLE SOURCE OF TRUTH** for all color values. Change colors here to update them throughout the entire app.

```javascript
colors: {
  // Primary brand color - Emerald Green
  emerald: {
    DEFAULT: '#10b981',  // ← Change this to update primary color
    50: '#ecfdf5',       // Lightest shade
    100: '#d1fae5',
    // ... through to 900 (darkest)
  },

  // Secondary/Accent color - Chartreuse
  chartreuse: {
    DEFAULT: '#9ABA12',  // ← Change this to update secondary color
    50: '#f7fce7',
    // ... full color scale
  },

  // Hint/Dark accent - Forest Green
  forest: {
    DEFAULT: '#37520B',  // ← Change this to update dark accent
    50: '#f4f7ed',
    // ... full color scale
  },
}
```

**After changing colors in Tailwind config:**
- The dev server will auto-reload
- All components using `bg-emerald-600`, `text-chartreuse-500`, etc. will update automatically
- No need to change individual component files

### 2. **HTML Meta Theme Color** (Browser Chrome Color)
**File:** `frontend/index.html`
**Line:** 29

```html
<meta name="theme-color" content="#10b981" />
```

Change `#10b981` to match your primary brand color. This affects:
- Mobile browser address bar color (Android)
- Safari theme color (iOS)

### 3. **CSS Global Styles** (Glass Effects & Backgrounds)
**File:** `frontend/src/index.css`

Look for these sections:
- `.glass` - Glass morphism effect for navigation
- `.glass-strong` - Stronger glass effect for sidebars
- Background gradients (e.g., `from-emerald-50`)

Example changes:
```css
/* Change gradient backgrounds */
.bg-gradient-to-br {
  background: linear-gradient(to bottom right,
    var(--emerald-50), /* ← Update color variable */
    white,
    var(--emerald-50)
  );
}
```

## 🔧 Common Color Update Scenarios

### Scenario 1: Change Primary Brand Color (Emerald → Blue)

1. **Update Tailwind config** (`tailwind.config.js`):
```javascript
emerald: {
  DEFAULT: '#3b82f6',  // Blue-500
  50: '#eff6ff',
  100: '#dbeafe',
  // ... use Tailwind's blue color scale
}
```

2. **Update meta theme color** (`index.html`):
```html
<meta name="theme-color" content="#3b82f6" />
```

3. **Done!** All `bg-emerald-*`, `text-emerald-*`, etc. classes now use blue.

### Scenario 2: Add a New Accent Color

1. **Add to Tailwind config**:
```javascript
colors: {
  emerald: { /* existing */ },
  chartreuse: { /* existing */ },
  forest: { /* existing */ },

  // New custom color
  coral: {
    DEFAULT: '#FF6B6B',
    50: '#fff5f5',
    // ... generate full scale using https://uicolors.app
  }
}
```

2. **Use in components**:
```tsx
<button className="bg-coral-500 hover:bg-coral-600">
  Custom Coral Button
</button>
```

### Scenario 3: Update Specific Component Colors

Most components use Tailwind utility classes. Search for these patterns:

**Primary actions (buttons, links):**
- `bg-emerald-600` → Change to `bg-chartreuse-600`
- `hover:bg-emerald-700` → Change to `hover:bg-chartreuse-700`
- `text-emerald-600` → Change to `text-chartreuse-600`

**Secondary elements:**
- `border-emerald-600` → Change to `border-forest-600`
- `ring-emerald-500` → Change to `ring-forest-500`

## 📂 Key Files with Color Usage

### Landing Page
- `frontend/src/components/landing/Navigation.tsx` - Logo text, hover effects
- `frontend/src/components/landing/Hero.tsx` - Headlines, badges
- `frontend/src/components/landing/Footer.tsx` - Logo, headings

### Annotation App
- `frontend/src/pages/AnnotationApp.tsx` - Header logo, buttons
- `frontend/src/components/Sidebar.tsx` - Filter buttons, badges, icons
- `frontend/src/components/LeftSidebar.tsx` - Tool selection buttons

### Common Patterns to Search For
```bash
# Find all emerald color uses
grep -r "emerald-" frontend/src/

# Find all chartreuse uses
grep -r "chartreuse-" frontend/src/

# Find all forest uses
grep -r "forest-" frontend/src/
```

## 🎯 Quick Reference: Color Class Patterns

| Element Type | Active/Selected State | Inactive/Default State |
|--------------|----------------------|------------------------|
| **Primary Button** | `bg-emerald-600 hover:bg-emerald-700 text-white` | - |
| **Secondary Button** | `bg-white text-emerald-600 border-emerald-600` | `bg-white text-gray-600 border-gray-200` |
| **Link/Text** | `text-emerald-600 hover:text-emerald-700` | `text-gray-600 hover:text-gray-900` |
| **Icon Badge** | `bg-emerald-500 text-white` | `bg-gray-300 text-gray-600` |
| **Border Accent** | `border-emerald-600` | `border-gray-200` |

## 🧪 Testing Color Changes

After updating colors:

1. **Check Landing Page** (http://localhost:5174/)
   - Logo text color
   - Navigation hover effects
   - CTA buttons
   - Footer branding

2. **Check Annotation App** (/app)
   - Header logo text
   - Export/Reset buttons
   - Sidebar filter buttons
   - AI-generated annotation badges

3. **Test Responsive**
   - Mobile view (< 640px)
   - Tablet view (640px - 1024px)
   - Desktop view (> 1024px)

4. **Check Accessibility**
   - Ensure color contrast meets WCAG AA standards (4.5:1 for text)
   - Test with color blindness simulators
   - Verify all interactive elements remain visible

## 🛠 Color Generation Tools

- **Tailwind Color Generator:** https://uicolors.app/create
- **Contrast Checker:** https://webaim.org/resources/contrastchecker/
- **Palette Generator:** https://coolors.co/

## 💡 Pro Tips

1. **Stick to Tailwind Shades:** Use the 50-900 scale for consistency
   - `50-100`: Very light backgrounds
   - `200-300`: Light accents, borders
   - `400-500`: Default colors
   - `600-700`: Primary buttons, strong accents
   - `800-900`: Dark text, deep backgrounds

2. **Maintain Contrast:** Always ensure sufficient contrast between text and backgrounds

3. **Use CSS Variables:** For dynamic theming, consider moving to CSS variables:
```css
:root {
  --color-primary: #10b981;
  --color-secondary: #9ABA12;
}
```

4. **Dark Mode Ready:** The Tailwind config already has `darkMode: ["class"]` enabled for future dark mode support

## 📝 Summary

**To change the entire color scheme:**
1. Update `tailwind.config.js` color definitions
2. Update `<meta name="theme-color">` in `index.html`
3. Optionally update any custom CSS in `index.css`
4. Test all pages and components

That's it! The component files use Tailwind classes, so they'll automatically pick up the new colors from the config.

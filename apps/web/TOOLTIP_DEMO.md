# 🎨 Interactive Frosted Glass Tooltip - Visual Guide

## Overview
The enhanced frosted glass tooltip provides an elegant, modern information display with three distinct sections and interactive features:

1. **Main Content** - Clear explanation of the field
2. **Example Section** - Code-formatted real-world example (optional)
3. **Note Section** - Additional helpful tips with 💡 emoji (optional)

## ✨ New Interactive Features

### 🖱️ Hover & Click Behavior
- **Hover**: Tooltip appears after 200ms delay
- **Click**: Pins the tooltip open (stays visible)
- **Click Outside**: Closes pinned tooltip
- **Pin Indicator**: Small pulsing emerald dot when pinned

### 📍 Smart Positioning
- **Auto-detect**: Checks available space on right side
- **Right Position**: Default - tooltip appears to the right
- **Left Position**: Automatically switches when too close to right edge
- **Arrow Adjustment**: Arrow direction changes based on position

---

## Visual Design Features

### 🪟 Enhanced Frosted Glass Effect
```css
backdrop-blur-xl          /* Strong blur for glass effect */
bg-white/70              /* 70% white opacity (more transparent!) */
bg-gray-900/70           /* 70% gray opacity (dark mode) */
border-gray-200/40       /* Subtle border with 40% opacity */
shadow-2xl               /* Deep shadow for depth */
rounded-xl               /* Smooth rounded corners */
```

**Transparency Update**: Changed from `/95` to `/70` for a more pronounced frosted glass appearance

### 🎯 Key Visual Elements

**Tooltip Container:**
- Width: `320px` (w-80) - Perfect for desktop readability
- Padding: `16px horizontal, 12px vertical`
- Z-index: `100` - Always on top
- Arrow: Centered triangle pointing to the info icon

**Color Scheme:**
- Main text: `text-gray-700` (dark gray, easy to read)
- Example header: `text-emerald-600` (brand color)
- Code background: `bg-gray-100/80` (subtle, translucent)
- Note text: `text-gray-600 italic` (lighter, styled)

### ✨ Animations
```css
animate-in fade-in slide-in-from-bottom-2 duration-200
```
- Smooth fade-in effect
- Slides up from bottom (2 units)
- 200ms duration for snappy response

---

## Usage Examples

### 1. Simple Tooltip (Content Only)
```tsx
<InfoTooltip content="Unique display name for the model (max 100 characters)" />
```

**Result:**
```
┌─────────────────────────────────────┐
│ Unique display name for the model  │
│ (max 100 characters)                │
└─────────────────────────────────────┘
```

### 2. With Example
```tsx
<InfoTooltip
  content="Base URL of the external model API. The inference path will be appended to this URL."
  example="https://api.example.com"
/>
```

**Result:**
```
┌─────────────────────────────────────┐
│ Base URL of the external model API.│
│ The inference path will be appended │
│ to this URL.                        │
├─────────────────────────────────────┤
│ Example:                            │
│ ┌─────────────────────────────────┐ │
│ │ https://api.example.com         │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 3. Full Tooltip (Content + Example + Note)
```tsx
<InfoTooltip
  content="JSON path to bounding boxes in your API response. Use dot notation for nested fields."
  example='predictions.boxes → {predictions: {boxes: [[x1,y1,x2,y2], ...]}}'
  note="Expected format: array of [x1, y1, x2, y2] coordinates in pixels"
/>
```

**Result:**
```
┌─────────────────────────────────────────────────┐
│ JSON path to bounding boxes in your API        │
│ response. Use dot notation for nested fields.  │
├─────────────────────────────────────────────────┤
│ Example:                                        │
│ ┌─────────────────────────────────────────────┐ │
│ │ predictions.boxes →                         │ │
│ │ {predictions: {boxes: [[x1,y1,x2,y2], ...]}}│ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ 💡 Expected format: array of [x1, y1, x2, y2]  │
│    coordinates in pixels                        │
└─────────────────────────────────────────────────┘
```

---

## Component Props

```typescript
interface InfoTooltipProps {
  content: string      // Main explanation (required)
  example?: string     // Code example (optional)
  note?: string        // Additional tip (optional)
  className?: string   // Custom styles (optional)
}
```

---

## Implementation in Form

### Basic Information Section
- ✅ Model Name - Simple content
- ✅ Endpoint URL - Content + Example + Note
- ✅ Bearer Token - Content + Example + Note
- ✅ Description - Simple content

### Model Capabilities Section
- ✅ Section header tooltip - Overview explanation
- ✅ Text Prompt Support - Content + Example + Note
- ✅ BBox Prompt Support - Content only (simpler capability)
- ✅ Auto Detection - Content + Example + Note
- ✅ Class Filtering - Content only
- ✅ Output Types - Content only
- ✅ Detectable Classes - Content + Note

### Endpoint Configuration Section
- ✅ Section header tooltip - Overview
- ✅ Inference Path - Content + Example + Note

### Response Mapping Section
- ✅ Section header tooltip - JSON path explanation
- ✅ Bounding Boxes Field - Content + Example + Note
- ✅ Confidence Scores Field - Content + Example + Note
- ✅ Masks Field - Content + Note
- ✅ Labels Field - Content + Example + Note
- ✅ Object Count Field - Content + Note

---

## Testing Checklist

### Visual Tests
- [ ] Hover over info icon turns it emerald color
- [ ] Tooltip appears centered above the icon
- [ ] Frosted glass effect is visible (blur + transparency)
- [ ] Arrow points correctly to the icon
- [ ] Fade-in animation plays smoothly
- [ ] Example section has distinct styling with green "Example:" label
- [ ] Code blocks have monospace font and subtle background
- [ ] Note section has lightbulb emoji and italic text
- [ ] Border separators between sections are subtle

### Interaction Tests
- [ ] Tooltip shows on mouse hover (200ms delay)
- [ ] Tooltip shows on keyboard focus (Tab key)
- [ ] Tooltip hides on mouse leave
- [ ] Tooltip hides on blur
- [ ] Click on info icon pins tooltip open
- [ ] Pinned tooltip shows pulsing emerald indicator
- [ ] Pinned tooltip doesn't hide on hover out
- [ ] Clicking outside closes pinned tooltip
- [ ] Clicking info icon again unpins tooltip
- [ ] Multiple tooltips don't interfere with each other
- [ ] Tooltip doesn't obstruct form fields
- [ ] Z-index prevents tooltip from appearing behind other elements

### Positioning Tests
- [ ] Tooltip appears on right side by default
- [ ] Tooltip appears on left side when near right edge
- [ ] Arrow points to info icon from correct direction
- [ ] Position check happens on hover and click
- [ ] Tooltip doesn't overflow viewport horizontally

### Responsiveness Tests
- [ ] Tooltip width (320px) fits desktop screens
- [ ] Text doesn't overflow or wrap awkwardly
- [ ] Long examples scroll or wrap appropriately
- [ ] Arrow remains centered

### Dark Mode Tests (Future)
- [ ] Dark mode colors apply correctly
- [ ] Text remains readable on dark background
- [ ] Border opacity adjusts for dark mode
- [ ] Arrow color matches dark mode background

---

## Browser Compatibility

**Tested Features:**
- `backdrop-blur-xl` - Modern browsers (Chrome 76+, Safari 9+, Firefox 103+)
- Tailwind opacity modifiers (`/90`, `/20`) - All modern browsers
- CSS animations - All modern browsers
- Pseudo-elements (arrow) - All browsers

**Fallback:**
If `backdrop-blur` is not supported, the tooltip will still work with solid background.

---

## Performance Notes

- **Lightweight**: No additional libraries required
- **Fast**: Simple hover state with CSS transitions
- **Efficient**: Only active tooltips are rendered
- **Memory**: Negligible impact (just state for visibility)

---

## Future Enhancements

Potential improvements for later:
1. Auto-positioning (flip above/below based on viewport)
2. Touch device support (tap to show/hide)
3. Keyboard shortcut hints (show on focus)
4. Rich content support (bullet points, links)
5. Theme customization (colors, sizes)
6. Delay before showing (prevent accidental triggers)
7. Max-width responsive breakpoints

---

## Code Location

**Files Modified:**
- `apps/web/src/components/ui/InfoTooltip.tsx` - Component implementation
- `apps/web/src/pages/ModelConfigPage.tsx` - Form integration

**Related Components:**
- Uses `lucide-react` for Info icon
- Styled with Tailwind CSS utility classes
- React hooks for state management

---

## Visual Preview ASCII Art

```
     ┌──────────────────────────────────────┐
     │  📝 Main Content                     │ ← Clear, readable text
     │  Explains what the field does       │
     ├──────────────────────────────────────┤
     │  Example:                            │ ← Green label
     │  ┌────────────────────────────────┐  │
     │  │ code example here              │  │ ← Monospace, gray bg
     │  └────────────────────────────────┘  │
     ├──────────────────────────────────────┤
     │  💡 Additional helpful tip           │ ← Italic, lighter color
     └──────────────────────────────────────┘
                     ▼ ← Arrow pointing to icon
                    ( i ) ← Info icon (hover me!)
```

---

**End of Documentation** ✨

To see it in action, run:
```bash
cd apps/web
npm run dev
```
Then navigate to the Model Configuration page and hover over any (i) icon!

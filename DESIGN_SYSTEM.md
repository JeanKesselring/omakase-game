# Omakase — Web Game Design System

A design system for the **Omakase** web game: a sushi card game played in the browser. This document is the source of truth for visual language, components, and interaction patterns. Paste into Claude Code as project rules.

The aesthetic is **paper-and-ink Japanese restaurant menu meets calm modern card game**. Generous whitespace, heavy type, hand-felt color, no plastic gradients, no glassmorphism, no neon. Every surface should feel like it could be printed on rice paper.

---

## 1. Brand Voice

- **Tone:** warm, confident, slightly playful, never childish. The game is for adults and families both.
- **Copy rules:**
  - Sentences are short. Think menu, not novel.
  - No exclamation marks except in tutorial wins.
  - Numbers are tabular (`font-variant-numeric: tabular-nums`).
  - Use Japanese terms (omakase, nigiri, maki, oshibori) sparingly and always lowercased in body copy. Capitalize only when used as a proper noun (card names).
- **Don'ts:** no emoji in chrome, no "🍣" decorations, no faux-Japanese display fonts (Wonton, Chop Suey, etc.).

---

## 2. Color Tokens

Pulled directly from the physical product. Use CSS custom properties; do not inline hex.

```css
:root {
  /* Periwinkle — primary brand surface, the box & card backs */
  --peri:        #8A9AD0;
  --peri-deep:   #6374B5;   /* primary action, links */
  --peri-soft:   #C4CEE8;
  --peri-wash:   #E5EAF5;   /* page backgrounds, calm zones */

  /* Warm neutrals — paper, rice */
  --cream:       #F5E9C9;   /* "rice" — card faces, light surfaces on dark */
  --cream-soft:  #FAF3DF;
  --paper:       #FBF7EC;   /* default page bg */

  /* Accent — fatty tuna red, the heartbeat */
  --salmon:      #E4525A;   /* primary accent, danger, eyebrows */
  --salmon-ink:  #C63B44;   /* pressed / hover-down */

  /* Secondary accents */
  --nori:        #4A7A4E;   /* success, "fresh" */
  --nori-deep:   #2F5A35;
  --mustard:     #E8A936;   /* warning, fatty tuna highlight */

  /* Ink */
  --ink:         #1B1E2E;   /* deep navy-black, body text on light */
  --body:        #2E3244;
  --muted:       #6B7088;
  --rule:        #D5D0BC;   /* hairline rules, dividers */
}
```

### Usage rules

| Role | Token | Notes |
|---|---|---|
| Page background | `--paper` | Default. `--peri-wash` for calm/menu screens. |
| Body text | `--body` | Never pure black. |
| Headings | `--ink` | |
| Primary action | `--peri-deep` bg, `--cream` text | Buttons, primary links. |
| Destructive / "play card" emphasis | `--salmon` | Use sparingly — it's the loudest color. |
| Success / valid move | `--nori` | |
| Warning / scoring highlight | `--mustard` | |
| Rules / dividers | `--rule` | 0.5pt or 1px hairlines only. |

### Forbidden

- No CSS gradients on backgrounds. (One exception: subtle radial vignettes on hero modals, ≤8% opacity.)
- No saturated colors above the 5 listed. Don't invent a sixth accent.
- No pure `#000` or `#fff` text — always use the tokens.

---

## 3. Typography

Three families, each with one job. Loaded from Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..800;1,9..144,500..600&family=Inter+Tight:wght@400;500;600;700&family=Shippori+Mincho:wght@400;500;600;700&display=swap" rel="stylesheet">
```

| Family | Role | When |
|---|---|---|
| **Fraunces** (variable, opsz 144) | Display | Game title, card names, big numbers, scores. Use weights 500–600 with `font-variation-settings: "opsz" 144`. Italic = emphasis. |
| **Inter Tight** | UI / body | All buttons, labels, body copy, tooltips, menus. Weights 400/500/600/700. |
| **Shippori Mincho** | Japanese marginalia only | Card kanji tabs, decorative furigana. Never for body. |

### Type scale

```css
--t-display-xl: clamp(40pt, 6vw, 64pt);   /* hero title only */
--t-display-l:  32pt;                      /* card name */
--t-display-m:  22pt;                      /* modal title */
--t-display-s:  16pt;                      /* section heading */
--t-body-l:     11pt;                      /* primary reading */
--t-body:       9.5pt;                     /* default UI */
--t-body-s:     8.5pt;                     /* secondary */
--t-eyebrow:    7pt;                       /* uppercase tracked label */
--t-mono:       9pt;                       /* tabular numbers */
```

### Reusable text classes

```css
.eyebrow {
  font-family: 'Inter Tight', sans-serif;
  font-size: 7pt; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--salmon);
}

.display {
  font-family: 'Fraunces', serif;
  font-weight: 600;
  letter-spacing: -0.028em;
  font-variation-settings: "opsz" 144;
  color: var(--ink);
}
.display em   { font-style: italic; font-weight: 500; color: var(--salmon); }
.display .peri{ color: var(--peri-deep); font-style: normal; }
.display .nori{ color: var(--nori-deep); font-style: italic; }
```

**Letter-spacing rule:** display type gets negative tracking (`-0.02em` to `-0.035em`). UI eyebrows get heavy positive tracking (`0.18em` to `0.24em`). Body is default.

---

## 4. Spacing & Layout

Use a **4pt base grid**. All paddings, gaps, margins are multiples of 4.

```css
--s-1: 4px;   --s-2: 8px;   --s-3: 12px;
--s-4: 16px;  --s-5: 24px;  --s-6: 32px;
--s-7: 48px;  --s-8: 64px;  --s-9: 96px;
```

- **Page max-width:** 1280px for game tables, 720px for dialogs/menus.
- **Gutters:** 24px mobile, 32px tablet, 48px desktop.
- **Card hand spacing:** 12px gap baseline, cards may overlap by up to 40% on hover-spread.

### Radii

```css
--r-card:   6px;   /* playing cards — slight, like a real card */
--r-button: 4px;
--r-pill:   999px;
--r-modal:  2px;   /* documents feel, not app feel */
```

### Shadows

Restrained. No glows.

```css
--shadow-card:  0 1px 2px rgba(27,30,46,0.08), 0 4px 16px rgba(27,30,46,0.10);
--shadow-card-lift: 0 4px 8px rgba(27,30,46,0.12), 0 16px 40px rgba(27,30,46,0.18);
--shadow-modal: 0 24px 80px rgba(27,30,46,0.28);
```

---

## 5. Components

### 5.1 Playing card

The hero element. Every card has the same anatomy.

```
┌──────────────┐
│ [jp-tab]     │  ← top-left: kanji tab in mustard/nori/salmon/peri
│              │
│   ILLUSTRA   │  ← centered illustration (or placeholder)
│   -TION      │
│              │
│ Card Name    │  ← Fraunces 14pt, ink
│ description  │  ← Inter Tight 8pt, body
│              │
│        [pts] │  ← bottom-right: point value, Fraunces 18pt salmon
└──────────────┘
```

- **Aspect:** 5:7 (poker proportion). Fixed at 200×280 desktop, 140×196 mobile.
- **Face:** `--cream` background, `--rule` 0.5pt border.
- **Back:** `--peri` background with a centered logo mark, no text.
- **States:**
  - default — `--shadow-card`
  - hover — translateY(-4px), `--shadow-card-lift`, 120ms ease-out
  - selected — `--peri-deep` 2px outline, offset 2px
  - disabled — opacity 0.5, no hover
  - playing — flip animation 400ms cubic-bezier(.7,0,.3,1)

### 5.2 Buttons

Two variants only.

```css
.btn {
  font-family: 'Inter Tight', sans-serif;
  font-weight: 600;
  font-size: 10pt;
  letter-spacing: 0.04em;
  padding: 12px 24px;
  border-radius: var(--r-button);
  border: none;
  cursor: pointer;
  transition: transform 80ms ease, background 120ms ease;
}
.btn:active { transform: translateY(1px); }

.btn-primary {
  background: var(--peri-deep);
  color: var(--cream);
}
.btn-primary:hover { background: #50609F; }

.btn-ghost {
  background: transparent;
  color: var(--ink);
  border: 0.5pt solid var(--rule);
}
.btn-ghost:hover { background: var(--peri-wash); }
```

Destructive actions reuse `.btn-primary` with `background: var(--salmon)`. No third color variant.

### 5.3 JP tab (decorative)

Small colored chip used on cards and as section markers. Always Shippori Mincho.

```css
.jp-tab {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 18px; padding: 0 6px;
  font-family: 'Shippori Mincho', serif;
  font-size: 9pt; font-weight: 500;
  background: var(--mustard); color: var(--ink);
}
.jp-tab.nori   { background: var(--nori);      color: var(--cream); }
.jp-tab.salmon { background: var(--salmon);    color: var(--cream); }
.jp-tab.peri   { background: var(--peri-soft); color: var(--peri-deep); }
```

### 5.4 Section heading (".h-section")

Uppercase tracked label with a colored dot. Used to delineate panels.

```css
.h-section {
  font-family: 'Inter Tight', sans-serif;
  font-weight: 600; font-size: 7.4pt;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--salmon);
  display: flex; align-items: center; gap: 8px;
}
.h-section::before {
  content: ""; width: 6px; height: 6px;
  background: var(--salmon); border-radius: 50%;
}
```

### 5.5 Score / number readout

Big numbers always Fraunces, salmon by default, with a small italic muted unit.

```css
.stat .num {
  font-family: 'Fraunces', serif;
  font-weight: 500;
  font-size: 30pt;
  color: var(--salmon);
  letter-spacing: -0.035em;
  font-variation-settings: "opsz" 144;
  font-variant-numeric: tabular-nums;
}
.stat .num .unit {
  font-size: 13pt; color: var(--muted);
  margin-left: 2px; font-style: italic; font-weight: 400;
}
```

### 5.6 Pull quote / callout

Used for tutorials, win states, and rule callouts.

```css
.pullquote {
  font-family: 'Fraunces', serif;
  font-style: italic; font-weight: 500;
  font-size: 14pt; line-height: 1.3;
  color: var(--ink);
  padding: 4px 0 4px 14px;
  border-left: 3px solid var(--salmon);
  letter-spacing: -0.01em;
}
```

### 5.7 Modals / dialogs

- Backdrop: `rgba(27,30,46,0.55)` over the play surface.
- Surface: `--paper`, radius `--r-modal`, `--shadow-modal`, max 560px wide.
- Top-bar accent: 3px stripe in `--salmon` running full width above the title.
- Close: ghost button, top-right, "×" character only.

### 5.8 Toasts

- Bottom-center, slide up 240ms.
- Surface: `--ink` bg, `--cream` text, no icon, eyebrow caps optional.
- Auto-dismiss 4s; stack max 3, oldest fades first.

---

## 6. Interaction & Motion

- **Default easing:** `cubic-bezier(.4, 0, .2, 1)` (Material standard) for UI; `cubic-bezier(.7, 0, .3, 1)` for card flips & deals.
- **Default duration:** 120ms for hover, 240ms for state, 400ms for card motion, 600ms for round transitions. Never longer than 600ms.
- **Card deal:** stagger 60ms per card from deck origin to hand position.
- **Card flip:** 3D rotateY, perspective 1200px, mid-flip swap face/back at 50%.
- **Hover lift:** translateY(-4px) only; never scale (cards have fixed dimensions for spatial reasoning).
- **Reduced motion:** `@media (prefers-reduced-motion)` collapses all transforms to opacity fades.

---

## 7. Iconography

- Use **Lucide** (`lucide-react` or static SVG) at stroke-width 1.5. No other icon set.
- Icon color inherits `currentColor`. Default 16px, 20px in buttons.
- No emoji in product UI. Emoji are allowed only in user-generated content (chat, custom decks).
- Forbidden: filled icons, duotone, brand glyphs of food (no SVG sushi — use real photos or the printed card art).

---

## 8. Imagery & Illustration

- **Card art:** photographed or illustrated in-house, on a `--cream` plate background. Never AI-generated stock.
- **Placeholders:** subtle 4° diagonal stripes in `--peri-wash` over `--peri-soft` with monospace caption ("PRODUCT SHOT — 5:7"). Never use Unsplash filler.
- **Photography:** flat overhead, soft daylight, real grain. No synthetic depth-of-field.

---

## 9. Accessibility

- Minimum body contrast: WCAG AA (4.5:1). All token pairs above pass; verify when adding new combos.
- Focus ring: 2px `--peri-deep` outline, 2px offset, never removed.
- Touch targets: 44px minimum.
- All interactive cards must be reachable via keyboard (Tab to hand, ←/→ between cards, Enter to play).
- Color is never the only signal — pair with text, position, or icon.

---

## 10. Dos and Don'ts

✅ **Do**
- Treat the screen like a tabletop. Heavy negative space, things sit *on* the surface.
- Use one strong accent (salmon) sparingly — it should always mean "look here now."
- Animate cards like real paper: a little weight, a little settle.
- Honor the 4pt grid in every spacing decision.

❌ **Don't**
- Don't add a sixth color. The palette is closed.
- Don't use Fraunces below 14pt. It collapses.
- Don't use drop shadows for hierarchy — use space, weight, and rule lines.
- Don't ship without `font-variant-numeric: tabular-nums` on any number that updates live.
- Don't recreate competitor card-game UIs. This system is its own thing.

---

## 11. File Structure (suggested)

```
src/
  styles/
    tokens.css        # all CSS custom properties
    base.css          # resets, body, type classes
    components.css    # .card, .btn, .jp-tab, .h-section, .pullquote
  components/
    Card.tsx
    Hand.tsx
    Button.tsx
    Modal.tsx
    Toast.tsx
    Scoreboard.tsx
  fonts/              # self-hosted woff2 if not using Google Fonts
```

Always import `tokens.css` first. Components consume tokens; never hardcode hex.

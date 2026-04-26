# Design System Master File

> **LOGIC:** When building a specific page, check `design-system/ip-creator-agent/pages/[page-name].md` first.  
> If that file exists, its rules override this Master file. Otherwise, follow the rules below.

---

**Project:** IP Creator Agent  
**Updated:** 2026-04-23  
**Positioning:** AI Agent workspace for knowledge-first KOCs on Xiaohongshu, focused on creator positioning, content generation, performance diagnosis, and comment operations.

---

## Design Intent

IP Creator Agent is not a playful creator app or a cold enterprise console.
It should feel like a **premium AI growth cockpit**:

- Light-mode first, because judges need to scan information quickly.
- Futuristic, but readable in Chinese.
- Product-like on first impression, competition-ready on deeper scroll.
- Confident and data-driven, while still creator-friendly.

Core emotional targets:

- **Trust:** "This feels reliable enough to guide my content decisions."
- **Momentum:** "I can move from idea to action quickly."
- **Intelligence:** "This is more than a template generator. It thinks with me."

---

## Visual Direction

### Primary Style

- **Style base:** Clean AI SaaS + dashboard-grade product UI
- **Accent layer:** Light glass / aurora glow used sparingly
- **Layout personality:** Bento grid, control-center panels, layered cards, readable data surfaces
- **Avoid:** App-store download page visuals, candy colors, heavy social-app vibes, dark cyberpunk overload

### Visual Keywords

- AI cockpit
- creator operating system
- light futuristic
- signal flow
- premium productivity
- intelligent guidance

### Motion Principles

- Use motion to signal system intelligence, not decoration.
- Animate only 1-2 focal elements per view.
- Prefer fade, rise, shimmer, and panel reveal over bounce or aggressive scaling.
- Respect `prefers-reduced-motion`.

---

## Color System

### Core Palette

| Role | Hex | Usage |
|------|-----|-------|
| Primary | `#2563EB` | Brand actions, selected states, key charts |
| Secondary | `#14B8A6` | AI signal, analysis highlights, positive system feedback |
| Accent / CTA | `#F97316` | Primary CTA, urgent guidance, conversion moments |
| Background | `#F8FAFC` | App shell and page background |
| Surface | `#FFFFFF` | Cards, panels, inputs |
| Surface Soft | `#EFF6FF` | Hero glow areas, subtle feature panels |
| Text Strong | `#0F172A` | Headings, critical metrics |
| Text Body | `#334155` | Paragraphs, labels |
| Text Muted | `#64748B` | Secondary descriptions |
| Border | `#E2E8F0` | Card borders, dividers |
| Success | `#10B981` | Positive feedback |
| Warning | `#F59E0B` | Attention states |
| Danger | `#EF4444` | Risk and negative signals |

### Gradient Guidance

Use gradients as atmosphere, not as the main UI fill.

- **Hero glow:** `linear-gradient(135deg, rgba(37,99,235,0.16), rgba(20,184,166,0.12) 55%, rgba(249,115,22,0.10))`
- **Agent halo:** radial blue/teal glow behind hero mockups or active modules
- **Data emphasis:** thin gradient strokes, not full saturated blocks

### Color Rules

- Primary actions use blue first, orange only for "start now" or high-intent CTA.
- Teal is reserved for "AI analysis", "detected insight", and "system intelligence".
- Do not use pink as a main brand color.
- Keep panels mostly white or near-white for judge readability.

---

## Typography

### Font Strategy

The interface is mixed Chinese and English. Use a dual-font system:

- **Display / English / Numerics:** `Space Grotesk`
- **Chinese UI / Body:** `Noto Sans SC`

This gives us a futuristic product feel without damaging Chinese readability.

### Usage Rules

- English module names such as `Profile Agent`, `Director Agent`, `Doctor Agent`, `Assistant Agent` should use the display font when practical.
- Chinese body copy, labels, helper text, and form questions should use the Chinese sans font.
- Numeric metrics, retention percentages, timing markers, and scores should prefer the display font.

### Suggested Import

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Space+Grotesk:wght@400;500;700&display=swap');
```

### Type Scale

| Token | Size | Usage |
|-------|------|-------|
| Display XL | `64px` | Hero statement on desktop |
| Display L | `48px` | Page titles |
| Heading 1 | `36px` | Section titles |
| Heading 2 | `28px` | Module headers |
| Heading 3 | `22px` | Card titles |
| Body L | `18px` | Lead text |
| Body M | `16px` | Default body |
| Body S | `14px` | Support copy |
| Caption | `12px` | Metadata |

### Tone Rules

- Chinese phrasing should sound like a smart creative coach, not a robotic admin system.
- Module labels can use `中文 + English` pairing, for example:
  `创作者画像 Profile`
  `脚本导演 Director`
  `复盘医生 Doctor`
  `评论助理 Assistant`

---

## Layout Principles

### General Layout

- Desktop-first composition.
- Use a centered content shell with `max-width: 1280px` or `1440px` depending on page density.
- The page should feel like a command center, not a blog.
- Prefer asymmetrical but balanced layouts: one dominant panel, supported by 2-4 satellite cards.

### Spacing Tokens

| Token | Value |
|-------|-------|
| `--space-2xs` | `4px` |
| `--space-xs` | `8px` |
| `--space-sm` | `12px` |
| `--space-md` | `16px` |
| `--space-lg` | `24px` |
| `--space-xl` | `32px` |
| `--space-2xl` | `48px` |
| `--space-3xl` | `64px` |
| `--space-4xl` | `96px` |

### Radius & Depth

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `12px` | Inputs, pills |
| `--radius-md` | `18px` | Standard cards |
| `--radius-lg` | `24px` | Hero panels |
| `--shadow-soft` | `0 10px 30px rgba(15,23,42,0.06)` | Default surface |
| `--shadow-panel` | `0 20px 60px rgba(15,23,42,0.08)` | Elevated hero panels |
| `--shadow-glow` | `0 0 0 1px rgba(255,255,255,0.8), 0 24px 60px rgba(37,99,235,0.12)` | Active AI surfaces |

---

## Component Rules

### Navigation

- Floating top navigation with space from viewport edges.
- Do not pin the navbar flush to the top.
- Use subtle blur and a thin border for the nav shell.

### Buttons

- Primary button: blue-to-teal energy, strong contrast, rounded but not pill-shaped.
- Secondary button: white surface with blue border or light tinted fill.
- Hover should not shift layout.
- All interactive cards and buttons must use `cursor-pointer`.

### Cards & Panels

- Cards should feel like system surfaces, not social content blocks.
- Use thin borders, soft shadows, and occasional top-edge gradient highlights.
- Important result panels can use light glass treatment, but keep text contrast strong.

### Inputs

- Inputs should look like "ask the agent" controls, not plain admin forms.
- Use strong focus rings in blue or teal.
- Multi-step forms should reveal one question cluster at a time.

### Data Visualization

- Use clean line charts, radar charts, segmented bars, and timeline markers.
- Avoid overly playful charts or rainbow palettes.
- Retention curves should use strong blue lines with orange markers for drop-off points.

---

## Product Surface Rules

### Landing Page

- Feels like a real AI product homepage first.
- Shows the four-agent system clearly.
- Includes a primary CTA for real use and a secondary CTA for demo mode.
- Must visually connect "creator growth" with "AI operating system".

### Onboarding

- Feels like a guided creator interview, not a survey.
- One focused prompt per step or step cluster.
- Use progress indicators and preview of emerging profile traits.

### Director

- Must feel generative and directive.
- Input area should resemble a strategic prompt studio.
- Output area should feel like multiple script paths generated by an expert system.

### Doctor

- Must feel analytical and evidence-based.
- Timeline alignment is the hero interaction for video diagnosis.
- Separate `图文 Graphic Post` and `视频 Video` modes clearly before upload.

### Assistant

- Must feel like a comment operations console.
- Outputs should include emotion reading, priority comments, and reply strategy.

---

## Recommended Page Pattern

For the homepage:

1. Hero with AI workspace preview
2. Pain point and competition framing
3. Four-agent grid
4. Product workflow / closed loop
5. Demo preview panels
6. Why it matters for ordinary KOCs
7. Final CTA

For app pages:

1. Page header with bilingual title
2. Input workspace
3. Live or staged system output
4. Summary insights sidebar
5. Next action links across agents

---

## Anti-Patterns

- Do not use pink as the dominant visual language.
- Do not make the site look like a mobile app download landing page.
- Do not overuse dark backgrounds just to signal "AI".
- Do not use sci-fi fonts for long Chinese paragraphs.
- Do not fill every card with gradients.
- Do not animate every block.
- Do not use emoji as icons.
- Do not hide key information in tabs if the judge needs to scan it quickly.

---

## Accessibility & Delivery Checklist

- [ ] Light mode contrast meets at least 4.5:1 for body text
- [ ] Focus states are visible on all interactive elements
- [ ] `prefers-reduced-motion` is respected
- [ ] Hover states do not cause layout shift
- [ ] All clickable cards use `cursor-pointer`
- [ ] Icons come from one consistent set
- [ ] Desktop looks strong at `1280px+`
- [ ] Mobile remains usable without horizontal scrolling
- [ ] Chinese text remains highly readable
- [ ] English display font is used sparingly for emphasis, not everywhere

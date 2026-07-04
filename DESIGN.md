# KoboLink Theme Reference from tryheckle.xyz

Source inspected: https://tryheckle.xyz/
Inspection date: 2026-07-01
Purpose: adapt the observed Heckle visual language to KoboLink without cloning copy or product identity.

## Visual Theme & Atmosphere

Heckle is a stark paper-and-ink marketing interface. It feels like an on-chain product wrapped in a printed match-day zine: white paper background, black typographic weight, 1px black rules, square boxes, serif display headlines, and monospaced uppercase controls. The design avoids gradients, rounded SaaS cards, glass effects, and colorful accent systems. Its personality comes from hard contrast, editorial whitespace, and mechanical rule lines rather than decoration.

Observed facts: body background is #ffffff, text is #000000, primary rule color is #000000, major cards have 0px radius, most dividers are 1px solid black, and shadows are almost absent except a tiny 0 1px 0 rgba(0,0,0,0.063) card edge.

## Color Palette & Roles

### Primary

- Paper: #ffffff. Used for the page background, normal cards, inputs, and secondary buttons.
- Ink: #000000. Used for text, rules, primary buttons, inverted CTA panels, card headers, and gutters between grid cells.
- Whisper: #f5f5f5. Used only as a soft off-white utility, not as a visible brand accent.
- Rule: #000000. Used as the structural color for borders, dividers, grid gaps, and focus borders.
- Shadow: #00000010. Used sparingly as a tiny edge, never as a floating glass shadow.

### Application to KoboLink

KoboLink should show Naira, Arc, x402, and agent data through the same black-and-white proof language: white paper screens, black rails, square receipt boxes, and uppercase monospaced labels. Reserve full black panels for decisive states such as active CTA, settled proof, auth gates, and final submission panels.

## Typography Rules

| Role | Observed treatment | KoboLink adaptation |
| --- | --- | --- |
| Display headlines | Custom display family, Georgia fallback, 900 weight, tight tracking around -0.02em | Use Georgia or Times New Roman fallback, 900 weight, black text |
| H1 desktop | 72px, 72px line-height, 900 weight | clamp from 48px to 72px, line-height 1 |
| H1 mobile | 48px, 48px line-height | clamp around 42px to 54px |
| H2 | 36px, 40px line-height, 900 weight | 32px to 44px depending section density |
| H3/card titles | 20px to 24px, 900 weight | compact serif titles inside data boxes |
| Body | Custom body family, system fallback, 16px/24px | system sans for paragraphs and labels |
| Controls | Custom mono, ui-monospace fallback, uppercase, 12px or 16px | all buttons, badges, receipts, and nav links use uppercase mono |

Principle: display type carries drama; mono type carries proof and action. Do not use rounded friendly SaaS typography for the core actions.

## Component Stylings

### Navigation

Sticky top header, white background, 1px black bottom border, no blur, no shadow. Brand uses black serif display weight. Desktop nav uses small uppercase monospaced links with 24px gaps. Mobile collapses to a bordered MENU button.

### Buttons

Buttons are square 1px rule boxes. Primary action is black fill with white uppercase monospaced text. Secondary action is white fill, black text, black border. Padding observed on main buttons is 12px 24px. Hover is a quick translateY(-1px) with a 150ms cubic-bezier(.4,0,.2,1) transition. Disabled state uses opacity around 0.4.

### Cards & Containers

Default cards are white with 1px black borders, 0px radius, and no soft elevation. Repeated grids use a black parent background with 1px gaps, making each white cell look separated by black rule gutters. Important inverted sections use black background, white text, and white secondary buttons.

### Badges and Receipts

Badges are inline-flex, border 1px solid black, uppercase mono, 12px text, 4px 8px padding, white background. Receipt metadata is small mono text with 0.6 to 0.8 opacity. Transaction hashes should wrap and remain readable in square proof cards.

### Forms

Inputs should be white, black text, 1px black border, square corners, 44px minimum height. Focus should be visible with a 2px black outline or a thicker border. Placeholder text should be mid gray, not pale green or blue.

### 3D Map

The map should feel like a monochrome printed object, not neon. Use white and light gray surfaces, black outlines, black fly lines, square readout labels, and subtle gray extrusion. Keep interaction, hover lift, and live city pulses, but remove colored glow language.

## Layout Principles

- Main content max-width observed around 1080px with 16px side padding.
- Desktop hero is wide, left-aligned, and not carded.
- Section spacing is generous, with major vertical gaps around 96px.
- Grids collapse cleanly from 3 columns to 1 column on mobile.
- Gutters can be black 1px separators instead of separate card margins.
- Avoid nested cards. Use sections, rule grids, and receipt panels.

## Depth & Elevation

Depth is almost flat. The signature depth pattern is shadow-as-edge: 0 1px 0 rgba(0,0,0,0.063). Avoid large blurred shadows, glass blur, glow, neumorphism, and tinted halos. If a surface must stand out, invert it to black instead of floating it.

## Interaction Patterns

- Hover on nav links and buttons: translate up by 1px.
- Transition speed: 150ms with cubic-bezier(.4,0,.2,1).
- Sticky header remains white and bordered on scroll.
- Mobile nav hides desktop links and exposes a bordered menu button.
- Motion should be crisp and mechanical, not bouncy or cinematic.

## Content & Messaging Patterns

The copy is direct, short, and proof-oriented. Headlines are declarative fragments. Supporting copy explains ownership, permanence, and settlement without long product education. CTAs are imperative and uppercase. KoboLink should mirror that confidence: LIST A CREATOR POST, AUTHORIZE BUDGET, RUN AGENT, VIEW ARC PROOF.

## Responsive Behavior

At mobile width, the nav becomes brand plus MENU, H1 drops to 48px, main padding stays 16px, and multi-column grids become single-column stacks. Buttons retain their square 12px 24px construction but can stretch when necessary. Data cards should never overflow horizontally; hashes wrap.

## Do and Do Not

Do use stark black and white. Do use serif display headlines. Do use uppercase monospaced controls. Do use 1px black rules and square corners. Do invert key proof or CTA panels to black.

Do not use neon accents, gradients, glass blur, rounded SaaS cards, pastel surfaces, dark slate backgrounds, colored payment badges, or decorative blobs. Do not soften proof boxes with large shadows. Do not bury proof labels in low-contrast gray.

## Agent Prompt Guide

Hero prompt: Build a white paper hero for KoboLink with a black serif 900-weight headline, a small uppercase mono proof badge, square black and white CTAs, and an unframed monochrome 3D Nigeria payment map.

Card grid prompt: Create a three-column rule grid where the parent is black and each cell is white, square, and separated by 1px gutters. Use mono numbers, serif card titles, and compact body copy.

Proof receipt prompt: Design a square receipt panel with a black header strip, white body, uppercase mono metadata, wrapping transaction hash, and a final black settled badge.

Dashboard prompt: Style the creator and fan dashboard as a proof ledger: white background, black rule borders, monospaced labels, serif headings, square inputs, black primary action buttons, and no color except black, white, and gray.

## Evidence Notes

Observed live evidence refreshed: 2026-07-01 using agent-browser DOM, CSS variable, computed-style, desktop, mobile, and local-app verification passes.


Observed viewport samples: desktop 1262x568 and mobile 390x844. Observed root tokens include paper #fff, ink #000, rule #000, whisper #f5f5f5, font-display with Georgia fallback, font-body with system fallback, and font-mono with ui-monospace fallback. The optional mobile menu expanded state was not captured because the local sandbox blocked the click command, but the closed mobile state and desktop navigation were inspected directly.

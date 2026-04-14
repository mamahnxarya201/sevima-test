---
globs:
ApplyIntelligently: false
---

# Design System Document: The Focused Editorial

## 1. Overview & Creative North Star
### The Creative North Star: "The Tactile Studio"
Most corporate automation tools feel like rigid spreadsheets—cold, linear, and cognitively taxing. This design system rejects the "mechanical" aesthetic in favor of **The Tactile Studio**. Our goal is to create a digital environment that mimics a high-end, physical workspace: warm paper stock, soft ambient lighting, and layered glass.

By utilizing intentional asymmetry and tonal depth rather than traditional grid lines, we move away from a "software" feel toward a "workspace" experience. We prioritize **calm productivity** by reducing visual noise, ensuring that the interface feels "comfy" yet authoritative. It is professional, not through stiffness, but through precision and restraint.

---

## 2. Colors & Surface Architecture
Our palette is rooted in "Warm Whites" and "Soft Blues," designed to reduce eye strain during long periods of focused work.

### The "No-Line" Rule
**Traditional 1px borders are strictly prohibited for sectioning.** To separate content, we rely on background color shifts.
- A card should not have an outline; it should be a `surface-container-low` object sitting on a `surface` background.
- If visual separation is needed, use a change in tonal value (e.g., `surface-container` to `surface-container-high`).

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the following hierarchy to define importance:
- **Base Layer:** `surface` (#fafaf5) – The "desk" upon which everything sits.
- **Sectioning:** `surface-container-low` (#f3f4ee) – Defines broad functional areas.
- **Primary Content Containers:** `surface-container` (#edefe8) – The standard container for data and modules.
- **Prominent Interaction Points:** `surface-container-highest` (#e0e4dc) – For active states or high-priority sidebars.

### The "Glass & Gradient" Rule
To inject "soul" into the corporate environment:
- **Glassmorphism:** For floating menus or navigation bars, use `surface` at 80% opacity with a `backdrop-blur` of 20px. This makes the UI feel integrated and airy.
- **Signature Gradients:** For primary CTAs and hero headers, use a subtle linear gradient from `primary` (#3a6095) to `primary_container` (#9ec2fe) at a 135-degree angle. This prevents the "flat" look of generic SaaS tools.

---

## 3. Typography
We use a dual-font strategy to balance editorial sophistication with functional clarity.

- **Display & Headlines:** **Manrope.** Its geometric yet soft curves provide a professional, modern "voice." Use `display-lg` through `headline-sm` for page titles and section headers to establish a clear, authoritative hierarchy.
- **Body & Interface:** **Inter.** Chosen for its exceptional legibility in data-dense automation workflows. 
    - Use `body-md` (0.875rem) as the standard for all functional text.
    - Use `label-sm` (0.6875rem) in all-caps with +5% letter spacing for metadata to provide an "architectural" feel.

The contrast between the expressive Manrope and the utilitarian Inter creates a "High-End Editorial" vibe that feels curated rather than templated.

---

## 4. Elevation & Depth
In this system, depth is a functional tool, not a decoration.

- **The Layering Principle:** Achieve lift by stacking. Place a `surface_container_lowest` (#ffffff) card on top of a `surface_container` (#edefe8) background. The 2-step jump in lightness creates a natural, "soft" lift.
- **Ambient Shadows:** When an element must float (e.g., a Modal or Popover), use an extra-diffused shadow: `box-shadow: 0 12px 40px rgba(47, 52, 46, 0.06);`. Notice the shadow color uses a low-opacity version of `on_surface` (#2f342e) rather than pure black, ensuring the shadow feels like a natural light casting.
- **The "Ghost Border":** If a border is required for accessibility (e.g., in high-contrast modes), use the `outline_variant` (#afb3ac) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
- **Primary:** Gradient from `primary` to `primary_dim`. Roundedness: `md` (0.75rem). Use `on_primary` for text.
- **Secondary:** `secondary_container` background with `on_secondary_container` text. No border.
- **Tertiary:** No background. Use `primary` text. On hover, apply a `surface_container_high` ghost background.

### Input Fields
- **Default State:** `surface_container_lowest` background. Roundedness: `sm` (0.25rem). 
- **Focus State:** 2px solid `primary`. No "glow" effect—just a clean, sharp color shift.
- **Error State:** Use `error` (#a83836) for text and `error_container` (#fa746f) at 20% opacity for the field background.

### Cards & Lists
- **The Divider Ban:** Never use horizontal lines to separate list items. Use 16px or 24px of vertical whitespace. If density is required, use alternating "zebra" stripes with `surface_container_low`.
- **Nesting:** Place `secondary_container` chips inside `surface_container` cards to create a "nested jewel" effect.

### Automation Flow Nodes (Specific Component)
For workflow nodes, use `xl` rounded corners (1.5rem). Use a `surface_container_highest` header area and a `surface_container_lowest` body area to differentiate the "Trigger" from the "Action" without using lines.

---

## 6. Do's and Don'ts

### Do
- **Do** use asymmetrical layouts. For example, a wide left column for content and a slim, floating right column for actions.
- **Do** lean into whitespace. "Focused productivity" comes from the breath between elements.
- **Do** use `primary_fixed_dim` for subtle accent backgrounds in empty states.

### Don't
- **Don't** use 100% black (#000000). Use `on_surface` (#2f342e) for all text to maintain the "comfy" vibe.
- **Don't** use sharp corners. Every element should have at least the `sm` (0.25rem) radius to remain approachable.
- **Don't** use standard "drop shadows." If a component doesn't look right without a heavy shadow, reconsider its background color contrast instead.
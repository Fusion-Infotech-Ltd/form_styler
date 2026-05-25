# Form Styler — Frappe App

A Frappe app that lets System Managers define custom widths, heights, colors,
and hover effects for fields, columns, and sections on any Frappe/ERPNext form —
without touching a single template or writing custom CSS manually.

---

## Features

| Capability | Details |
|---|---|
| **Field sizing** | Width & height per field, by field type, or for all fields in a DocType |
| **Column sizing** | Override column width and minimum height |
| **Section sizing** | Override section width and minimum height |
| **Label color** | Per-rule label text color |
| **Field text color** | Input text color |
| **Field background** | Input background color |
| **Hover effects** | Highlight / Lift / Glow (with preview in UI) |
| **Scope options** | By field type · Specific field · Multiple fields · All fields in a DocType |
| **Live CSS preview** | See generated CSS before saving |
| **Priority ordering** | Lower priority number = applied first (lower in cascade) |

---

## Installation

```bash
# 1. Get the app
cd /path/to/frappe-bench
bench get-app /path/to/form_styler
# or from git:
# bench get-app form_styler https://github.com/your-org/form_styler

# 2. Install on your site
bench --site your-site.localhost install-app form_styler

# 3. Migrate to create the DocType
bench --site your-site.localhost migrate

# 4. Build assets
bench build --app form_styler

# 5. Restart
bench restart
```

---

## Usage

### Via the Form Styler Page (recommended)

1. Go to **Desk → Form Styler** (search in the navbar or open `your-site/form-styler`)
2. Click **＋ New Rule**
3. Fill in the rule:
   - **Rule Name** — a human-readable label
   - **Apply To** — choose the scope
   - **Target Element** — Field, Column, or Section
   - Set dimensions, colors, hover effect as needed
4. Click **Save Rule**
5. The CSS is injected live — reload any form to see the effect

### Via the DocType list

Go to **Desk → Form Styler → Field Style Rule** and create/edit rules there.
Use the **Preview CSS** button in the form toolbar to see what CSS will be generated.

---

## How It Works

```
Boot session
  └─ utils.add_style_rules_to_boot()
       └─ frappe.boot.form_style_rules = [all active rules]

Page load (every desk page)
  └─ form_styler_runtime.js
       ├─ Reads frappe.boot.form_style_rules
       ├─ Generates CSS via buildRuleCSS()
       └─ Injects <style id="form-styler-global-css"> into <head>

On form refresh (frappe.ui.form.on('*', { refresh }))
  └─ Tags the form's layout element with .fs-doctype-{slug}
       so doctype-scoped CSS selectors match correctly

After saving a rule (Page UI)
  └─ FormStyler.reloadAndInject()
       └─ Fetches fresh rules via API and re-injects CSS live
```

### CSS Selectors Generated

| Scope | Selector example |
|---|---|
| By field type | `.frappe-control[data-fieldtype="Data"]` |
| Specific field | `.fs-doctype-sales-order .frappe-control[data-fieldname="customer"]` |
| Multiple fields | `.fs-doctype-sales-order .frappe-control[data-fieldname="territory"]` (one per field) |
| All fields in DocType | `.fs-doctype-sales-order .frappe-control` |
| Column | `.fs-doctype-sales-order .form-column` |
| Section | `.fs-doctype-sales-order .form-section` |

---

## Hover Effects

| Effect | What it does |
|---|---|
| **Highlight** | Applies a soft background color wash on hover (customizable color) |
| **Lift** | Adds a drop-shadow and micro-elevation transform on hover |
| **Glow** | Highlights the border with the primary color and a soft ring glow |

---

## Permissions

Only users with the **System Manager** role can create, edit, or delete rules.
The generated CSS is injected for **all logged-in users** (rules apply globally).

---

## File Structure

```
form_styler/
├── setup.py
├── requirements.txt
└── form_styler/
    ├── hooks.py                          # App config, boot_session, doc_events
    ├── modules.txt
    ├── utils.py                          # API endpoints, boot helper, cache
    ├── form_styler/
    │   ├── doctype/
    │   │   └── field_style_rule/
    │   │       ├── field_style_rule.json  # DocType schema
    │   │       ├── field_style_rule.py    # Validation controller
    │   │       └── field_style_rule.js    # Form script + Preview CSS button
    │   └── page/
    │       └── form_styler/
    │           ├── form_styler.json       # Page registration
    │           ├── form_styler.py         # Page permission check
    │           ├── form_styler.html       # Minimal HTML wrapper
    │           └── form_styler.js         # Full SPA UI (rule list + editor)
    └── public/
        ├── js/
        │   └── form_styler_runtime.js    # CSS generator + injector (runs on all pages)
        └── css/
            └── form_styler_ui.css        # Page UI styles + hover previews
```

app_name = "form_styler"
app_title = "Form Styler"
app_publisher = "Frappe Field Styler"
app_description = "Customize field, column, and section sizes, colors, and hover effects in Frappe forms"
app_icon = "octicon octicon-paintbrush"
app_color = "#6c7ef4"
app_email = "support@example.com"
app_license = "MIT"
app_version = "0.0.1"

# ─────────────────────────────────────────────
# Include JS/CSS in ALL Frappe desk pages
# ─────────────────────────────────────────────
app_include_js = ["/assets/form_styler/js/form_styler_runtime.js"]
app_include_css = ["/assets/form_styler/css/form_styler_ui.css"]

# ─────────────────────────────────────────────
# Boot session – passes style rules to client
# ─────────────────────────────────────────────
boot_session = "form_styler.utils.add_style_rules_to_boot"

# ─────────────────────────────────────────────
# DocType events – regenerate CSS cache on save
# ─────────────────────────────────────────────
doc_events = {
    "Field Style Rule": {
        "after_insert": "form_styler.utils.clear_style_cache",
        "on_update":    "form_styler.utils.clear_style_cache",
        "on_trash":     "form_styler.utils.clear_style_cache",
    }
}

# ─────────────────────────────────────────────
# Fixtures – export rule DocType with the app
# ─────────────────────────────────────────────
fixtures = ["Field Style Rule"]

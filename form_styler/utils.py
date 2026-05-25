import frappe
import json


def add_style_rules_to_boot(bootinfo):
    """
    Called during boot_session. Injects all active Field Style Rules
    into bootinfo so the client JS can generate and inject CSS
    without an extra API call.
    """
    try:
        cache_key = "form_styler_rules_cache"
        cached = frappe.cache().get_value(cache_key)

        if cached:
            rules = json.loads(cached)
        else:
            rules = _fetch_rules()
            frappe.cache().set_value(cache_key, json.dumps(rules), expires_in_sec=3600)

        bootinfo.form_style_rules = rules
    except Exception:
        bootinfo.form_style_rules = []


def _fetch_rules():
    """Fetch all active Field Style Rules from DB."""
    if not frappe.db.table_exists("tabField Style Rule"):
        return []

    rules = frappe.get_all(
        "Field Style Rule",
        filters={"is_active": 1},
        fields=[
            "name",
            "rule_name",
            "apply_to",
            "doctype_name",
            "fieldname",
            "field_type",
            "target_element",
            # dimensions
            "field_width",
            "field_height",
            "column_width",
            "column_height",
            "section_width",
            "section_height",
            # colors
            "label_color",
            "field_text_color",
            "field_bg_color",
            # hover
            "hover_effect",
            "hover_bg_color",
            # priority
            "priority",
        ],
        order_by="priority asc, creation asc",
    )
    return [r for r in rules]


def clear_style_cache(doc, method=None):
    """Clears cached style rules so next boot picks up fresh data."""
    frappe.cache().delete_value("form_styler_rules_cache")


@frappe.whitelist()
def get_style_rules():
    """API endpoint: returns all active rules as JSON (used by Page UI)."""
    rules = _fetch_rules()
    return rules


@frappe.whitelist()
def get_doctype_fields(doctype_name):
    """Returns field list for a given DocType (used in Page UI field selector)."""
    if not doctype_name:
        return []
    try:
        meta = frappe.get_meta(doctype_name)
        fields = []
        for f in meta.fields:
            if f.fieldtype not in ("Section Break", "Column Break", "Tab Break", "HTML"):
                fields.append({
                    "fieldname": f.fieldname,
                    "label": f.label or f.fieldname,
                    "fieldtype": f.fieldtype,
                })
        return fields
    except Exception:
        return []


@frappe.whitelist()
def save_style_rule(rule_data):
    """Upsert a Field Style Rule from the Page UI."""
    if isinstance(rule_data, str):
        rule_data = json.loads(rule_data)

    name = rule_data.get("name")
    if name and frappe.db.exists("Field Style Rule", name):
        doc = frappe.get_doc("Field Style Rule", name)
        doc.update(rule_data)
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.new_doc("Field Style Rule")
        doc.update(rule_data)
        doc.insert(ignore_permissions=True)

    frappe.db.commit()
    clear_style_cache(doc)
    return doc.name


@frappe.whitelist()
def delete_style_rule(name):
    """Delete a Field Style Rule."""
    frappe.delete_doc("Field Style Rule", name, ignore_permissions=True)
    frappe.db.commit()
    frappe.cache().delete_value("form_styler_rules_cache")
    return {"status": "ok"}


@frappe.whitelist()
def toggle_rule(name, is_active):
    """Toggle active state of a rule."""
    frappe.db.set_value("Field Style Rule", name, "is_active", int(is_active))
    frappe.db.commit()
    frappe.cache().delete_value("form_styler_rules_cache")
    return {"status": "ok"}

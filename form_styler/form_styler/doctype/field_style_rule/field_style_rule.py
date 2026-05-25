import frappe
from frappe.model.document import Document


class FieldStyleRule(Document):

    def validate(self):
        self._validate_criteria()
        self._validate_dimensions()

    def _validate_criteria(self):
        """Ensure required fields are set based on apply_to."""
        if self.apply_to == "By Field Type" and not self.field_type:
            frappe.throw("Please select a Field Type when 'Apply To' is 'By Field Type'.")

        if self.apply_to in ("Specific Field", "Multiple Fields in DocType", "All Fields in DocType"):
            if not self.doctype_name:
                frappe.throw("Please select a DocType.")

        if self.apply_to == "Specific Field" and not self.fieldname:
            frappe.throw("Please enter a Field Name for 'Specific Field'.")

        if self.apply_to == "Multiple Fields in DocType" and not self.fieldname:
            frappe.throw("Please enter comma-separated Field Names.")

    def _validate_dimensions(self):
        """Basic CSS value validation."""
        css_fields = [
            "field_width", "field_height",
            "column_width", "column_height",
            "section_width", "section_height",
        ]
        allowed_units = ("px", "rem", "em", "%", "vw", "vh", "auto", "inherit", "unset")
        for f in css_fields:
            val = self.get(f)
            if val:
                val = val.strip()
                if not any(val.endswith(u) for u in allowed_units) and val not in ("auto", "inherit", "unset"):
                    # Try to parse as number (treat as px)
                    try:
                        float(val)
                        self.set(f, val + "px")
                    except ValueError:
                        frappe.throw(
                            f"Invalid CSS value for {f}: '{val}'. "
                            f"Use values like 200px, 50%, 2rem, auto."
                        )

    def after_insert(self):
        self._clear_cache()

    def on_update(self):
        self._clear_cache()

    def on_trash(self):
        self._clear_cache()

    def _clear_cache(self):
        frappe.cache().delete_value("form_styler_rules_cache")


def get_permission_query_conditions(user):
    """Only System Managers can see all rules."""
    if "System Manager" in frappe.get_roles(user):
        return ""
    return "1=0"

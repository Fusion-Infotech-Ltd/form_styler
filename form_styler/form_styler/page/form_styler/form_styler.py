import frappe


def get_context(context):
    context.no_cache = 1
    if "System Manager" not in frappe.get_roles():
        frappe.throw("Not permitted", frappe.PermissionError)

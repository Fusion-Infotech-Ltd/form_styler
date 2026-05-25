// ── Field Style Rule Form Script ──────────────────────────────────────────────
frappe.ui.form.on("Field Style Rule", {

    refresh(frm) {
        frm.add_custom_button(__("Preview CSS"), () => {
            const css = window.FormStyler && window.FormStyler.buildRuleCSS(frm.doc);
            if (!css || !css.trim()) {
                frappe.msgprint(__("No CSS generated. Fill in at least one style property."));
                return;
            }
            frappe.msgprint({
                title: __("Generated CSS Preview"),
                message: `<pre style="font-size:12px;white-space:pre-wrap;word-break:break-all;">${frappe.utils.escape_html(css)}</pre>`,
                wide: true,
            });
        });

        frm.add_custom_button(__("Open Form Styler Page"), () => {
            frappe.set_route("form-styler");
        }, __("Go To"));
    },

    apply_to(frm) {
        // Clear irrelevant fields when scope changes
        const scope = frm.doc.apply_to;
        if (scope === "By Field Type") {
            frm.set_value("doctype_name", "");
            frm.set_value("fieldname", "");
        } else if (scope === "All Fields in DocType") {
            frm.set_value("field_type", "");
            frm.set_value("fieldname", "");
        }
    },

    doctype_name(frm) {
        // When doctype changes, reset fieldname
        frm.set_value("fieldname", "");
        if (frm.doc.doctype_name && frm.doc.apply_to === "Specific Field") {
            _load_fieldname_options(frm);
        }
    },
});

async function _load_fieldname_options(frm) {
    const res = await frappe.call({
        method: "form_styler.utils.get_doctype_fields",
        args: { doctype_name: frm.doc.doctype_name },
    });
    if (!res || !res.message) return;
    const fields = res.message;
    const opts = fields.map(f => `${f.fieldname} (${f.fieldtype})`).join("\n");
    // Just show a helper dialog to pick
    if (fields.length) {
        const d = new frappe.ui.Dialog({
            title: `Fields in ${frm.doc.doctype_name}`,
            fields: [{
                fieldname: "chosen_field",
                fieldtype: "Select",
                label: "Select Field",
                options: fields.map(f => f.fieldname).join("\n"),
            }],
            primary_action_label: "Use This Field",
            primary_action(vals) {
                frm.set_value("fieldname", vals.chosen_field);
                d.hide();
            },
        });
        d.show();
    }
}

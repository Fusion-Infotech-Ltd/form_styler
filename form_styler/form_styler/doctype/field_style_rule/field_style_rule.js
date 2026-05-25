// Field Style Rule — form script
frappe.ui.form.on("Field Style Rule", {
	refresh(frm) {
		frm.add_custom_button(__("Preview CSS"), () => {
			const preview = window.FormStyler && FormStyler.buildRuleCSS(frm.doc);
			frappe.msgprint({
				title: __("Style preview (applied directly to fields)"),
				message: `<pre style="font-size:12px;white-space:pre-wrap;">${frappe.utils.escape_html(
					preview || ""
				)}</pre>`,
				wide: true,
			});
		});

		frm.add_custom_button(__("Open Form Styler Page"), () => {
			frappe.set_route("form-styler");
		}, __("Go To"));

		if (window.FormStyler) {
			FormStyler.reloadAndInject();
		}
	},

	after_save(frm) {
		if (!window.FormStyler) return;
		setTimeout(function () {
			FormStyler.applyToForm(frm);
			FormStyler.reloadAndInject().then(({ styled, rules }) => {
				const msg =
					styled > 0
						? __("Styled {0} field(s) on this form", [styled])
						: rules && rules.length
							? __("Rule saved but 0 fields matched — set Field Width/Height and check Apply To")
							: __("Rule saved but not active or not returned from server");
				frappe.show_alert({ message: msg, indicator: styled ? "green" : "orange" });
			});
		}, 400);
	},

	apply_to(frm) {
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
	if (!fields.length) return;

	const d = new frappe.ui.Dialog({
		title: `Fields in ${frm.doc.doctype_name}`,
		fields: [
			{
				fieldname: "chosen_field",
				fieldtype: "Select",
				label: "Select Field",
				options: fields.map((f) => f.fieldname).join("\n"),
			},
		],
		primary_action_label: "Use This Field",
		primary_action(vals) {
			frm.set_value("fieldname", vals.chosen_field);
			d.hide();
		},
	});
	d.show();
}

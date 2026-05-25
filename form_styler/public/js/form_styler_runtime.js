// Form Styler Runtime
// Dataflow: DB rules → API → match each frm field → inline styles on controls
// (CSS injection kept only for column/section + hover)

(function () {
	"use strict";

	const SKIP_FIELDTYPES = new Set([
		"Section Break",
		"Column Break",
		"Tab Break",
		"HTML",
	]);

	let cachedRules = [];

	// ── Rule helpers ─────────────────────────────────────────────────────────

	function normalizeRule(rule) {
		if (!rule) return null;
		const r = Object.assign({}, rule);
		["apply_to", "field_type", "target_element", "fieldname", "doctype_name"].forEach(
			(k) => {
				if (r[k] && typeof r[k] === "string") r[k] = r[k].trim();
			}
		);
		return r;
	}

	function isRuleActive(rule) {
		if (!rule) return false;
		// API already filters is_active=1; older responses omitted the column.
		if (rule.is_active === undefined || rule.is_active === null) return true;
		return (
			rule.is_active === 1 ||
			rule.is_active === true ||
			rule.is_active === "1"
		);
	}

	function hasFieldWrapper(field) {
		if (!field) return false;
		if (field.$wrapper && field.$wrapper.length) return true;
		if (field.wrapper) return true;
		return false;
	}

	function iterFormFields(frm) {
		const seen = new Set();
		const list = [];

		function add(field) {
			if (!field || !field.df || !field.df.fieldname) return;
			if (seen.has(field.df.fieldname)) return;
			seen.add(field.df.fieldname);
			list.push(field);
		}

		if (frm.fields && frm.fields.length) {
			frm.fields.forEach(add);
		}
		if (frm.fields_dict) {
			Object.keys(frm.fields_dict).forEach((k) => add(frm.fields_dict[k]));
		}
		return list;
	}

	function ruleMatchesField(rule, frm, field) {
		rule = normalizeRule(rule);
		if (!rule || !isRuleActive(rule) || !field || !field.df) return false;
		if ((rule.target_element || "Field") !== "Field") return false;

		const df = field.df;
		const applyTo = rule.apply_to;

		if (applyTo === "By Field Type" && rule.field_type) {
			return df.fieldtype === rule.field_type;
		}
		if (applyTo === "Specific Field" && rule.fieldname) {
			if (rule.doctype_name && frm.doctype !== rule.doctype_name) return false;
			return df.fieldname === rule.fieldname;
		}
		if (applyTo === "Multiple Fields in DocType" && rule.fieldname) {
			if (rule.doctype_name && frm.doctype !== rule.doctype_name) return false;
			const names = rule.fieldname.split(",").map((s) => s.trim());
			return names.includes(df.fieldname);
		}
		if (applyTo === "All Fields in DocType" && rule.doctype_name) {
			return frm.doctype === rule.doctype_name;
		}
		return false;
	}

	function sortedRules(rules) {
		return (rules || [])
			.filter(isRuleActive)
			.map(normalizeRule)
			.sort((a, b) => (a.priority || 10) - (b.priority || 10));
	}

	function mergeFieldStyles(rules, frm, field) {
		const out = {};
		for (const rule of sortedRules(rules)) {
			if (!ruleMatchesField(rule, frm, field)) continue;
			if (rule.field_width) out.width = rule.field_width;
			if (rule.field_height) out.height = rule.field_height;
			if (rule.label_color) out.labelColor = rule.label_color;
			if (rule.field_text_color) out.textColor = rule.field_text_color;
			if (rule.field_bg_color) out.bgColor = rule.field_bg_color;
			if (rule.hover_effect) {
				out.hoverEffect = rule.hover_effect;
				out.hoverBgColor = rule.hover_bg_color;
			}
		}
		return out;
	}

	// ── Direct DOM styling (primary path) ────────────────────────────────────

	function applyStylesToFieldControl(field, styles) {
		const $w = field.$wrapper;
		if (!$w || !$w.length) return;

		$w.addClass("fs-styled");

		if (styles.width) {
			const w = styles.width;
			$w.css({ maxWidth: w });
			const $inputWrap = field.$input_wrapper || $w.find(".control-input-wrapper").first();
			if ($inputWrap.length) {
				$inputWrap.css({
					width: w,
					maxWidth: w,
					minWidth: w,
					flex: "0 0 " + w,
					boxSizing: "border-box",
				});
			}
			$w.find(".form-control, .like-disabled-input, .control-value").css({
				width: "100%",
				maxWidth: "100%",
				boxSizing: "border-box",
			});
		}

		if (styles.height) {
			const h = styles.height;
			$w.find(".form-control, .like-disabled-input").css({
				height: h,
				minHeight: h,
			});
		}

		if (styles.labelColor) {
			$w.find(".control-label").css("color", styles.labelColor);
		}
		if (styles.textColor) {
			$w.find(".form-control, .like-disabled-input, .control-value").css(
				"color",
				styles.textColor
			);
		}
		if (styles.bgColor) {
			$w.find(".form-control, .like-disabled-input").css(
				"background-color",
				styles.bgColor
			);
		}

		if (styles.hoverEffect) {
			$w.attr("data-fs-hover", styles.hoverEffect);
			if (styles.hoverBgColor) {
				$w.attr("data-fs-hover-bg", styles.hoverBgColor);
			}
		}
	}

	function clearFieldStyles(field) {
		const $w = field.$wrapper;
		if (!$w || !$w.length) return;
		$w.removeClass("fs-styled").removeAttr("data-fs-hover data-fs-hover-bg");
		$w.css({ maxWidth: "" });
		const $inputWrap = field.$input_wrapper || $w.find(".control-input-wrapper").first();
		$inputWrap.css({ width: "", maxWidth: "", minWidth: "", flex: "" });
		$w.find(".form-control, .like-disabled-input, .control-value, .control-label").attr(
			"style",
			""
		);
	}

	function applyDirectFieldStyles(frm, rules) {
		if (!frm) return 0;

		const fields = iterFormFields(frm);
		let styled = 0;

		for (const field of fields) {
			if (SKIP_FIELDTYPES.has(field.df.fieldtype)) continue;
			if (field.df.fieldname.startsWith("__")) continue;
			if (!hasFieldWrapper(field)) continue;

			clearFieldStyles(field);
			const styles = mergeFieldStyles(rules, frm, field);
			if (!Object.keys(styles).length) continue;

			applyStylesToFieldControl(field, styles);
			styled++;
		}
		return styled;
	}

	function debugNoMatches(frm, rules) {
		const fields = iterFormFields(frm);
		console.warn("FormStyler: rules loaded but no fields styled", {
			rules: rules,
			form: frm.doctype,
			fieldCount: fields.length,
			sample: fields.slice(0, 12).map((f) => ({
				fieldname: f.df.fieldname,
				fieldtype: f.df.fieldtype,
				hasWrapper: hasFieldWrapper(f),
			})),
		});
	}

	// ── CSS for column/section + hover (secondary) ─────────────────────────────

	function escapeCSSAttr(str) {
		return (str || "").replace(/["\\]/g, "\\$&");
	}

	function slugify(str) {
		return (str || "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	}

	function buildLayoutCSS(rules) {
		let css = "";
		for (const rule of sortedRules(rules)) {
			const target = rule.target_element || "Field";
			if (target === "Column" && (rule.column_width || rule.column_height)) {
				const scope = rule.doctype_name
					? `.fs-doctype-${slugify(rule.doctype_name)} `
					: "";
				css += `${scope}.form-column {`;
				if (rule.column_width) {
					css += `width:${rule.column_width}!important;flex:0 0 ${rule.column_width}!important;`;
				}
				if (rule.column_height) {
					css += `min-height:${rule.column_height}!important;`;
				}
				css += "}\n";
			}
			if (target === "Section" && (rule.section_width || rule.section_height)) {
				const scope = rule.doctype_name
					? `.fs-doctype-${slugify(rule.doctype_name)} `
					: "";
				css += `${scope}.form-section {`;
				if (rule.section_width) css += `width:${rule.section_width}!important;`;
				if (rule.section_height) css += `min-height:${rule.section_height}!important;`;
				css += "}\n";
			}
		}
		// Hover on directly styled fields
		css += `
.fs-styled[data-fs-hover="Highlight"] .form-control:hover,
.fs-styled[data-fs-hover="Highlight"] .like-disabled-input:hover {
  transition: background 0.2s ease;
}
.fs-styled[data-fs-hover="Highlight"] .form-control:hover,
.fs-styled[data-fs-hover="Highlight"] .like-disabled-input:hover {
  background-color: #e8f4ff !important;
}
.fs-styled[data-fs-hover="Lift"] .form-control:hover,
.fs-styled[data-fs-hover="Lift"] .like-disabled-input:hover {
  box-shadow: 0 4px 14px rgba(0,0,0,0.13) !important;
  transform: translateY(-1px);
}
.fs-styled[data-fs-hover="Glow"] .form-control:hover,
.fs-styled[data-fs-hover="Glow"] .like-disabled-input:hover {
  border-color: var(--primary) !important;
  box-shadow: 0 0 0 3px rgba(100,130,255,0.22) !important;
}
`;
		return css;
	}

	function injectLayoutCSS(rules) {
		const css = "/* Form Styler layout/hover */\n" + buildLayoutCSS(rules);
		let tag = document.getElementById("form-styler-global-css");
		if (!tag) {
			tag = document.createElement("style");
			tag.id = "form-styler-global-css";
			document.head.appendChild(tag);
		}
		tag.textContent = css;
	}

	function tagCurrentForm(frm) {
		if (!frm || !frm.doctype) return;
		const slug = slugify(frm.doctype);
		document.body.setAttribute("data-fs-doctype", slug);

		const layout = frm.layout && frm.layout.wrapper;
		const el = layout && (layout.jquery ? layout[0] : layout);
		if (el && el.classList) {
			el.className = el.className.replace(/\bfs-doctype-[\w-]+\b/g, "").trim();
			el.classList.add("fs-doctype-" + slug);
		}
	}

	// ── Main apply pipeline ────────────────────────────────────────────────────

	function fetchRules(callback) {
		frappe.call({
			method: "form_styler.utils.get_style_rules",
			callback: function (res) {
				const rules = ((res && res.message) || []).filter(isRuleActive);
				cachedRules = rules;
				if (frappe.boot) frappe.boot.form_style_rules = rules;
				callback(rules);
			},
			error: function (err) {
				console.warn("FormStyler: get_style_rules failed", err);
				callback(cachedRules || []);
			},
		});
	}

	function applyToForm(frm, attempt) {
		if (!frm) return;

		fetchRules(function (rules) {
			tagCurrentForm(frm);
			const styled = applyDirectFieldStyles(frm, rules);
			injectLayoutCSS(rules);

			console.info(
				"FormStyler [" + (attempt || 1) + "]:",
				rules.length,
				"rule(s),",
				styled,
				"field(s) styled on",
				frm.doctype
			);

			if (styled === 0 && rules.length > 0 && (attempt || 1) >= 3) {
				debugNoMatches(frm, rules);
			}

			if (styled === 0 && rules.length > 0 && (attempt || 1) < 4) {
				setTimeout(function () {
					applyToForm(frm, (attempt || 1) + 1);
				}, 250 * (attempt || 1));
			}
		});
	}

	function scheduleApply(frm) {
		if (!frm) return;
		applyToForm(frm, 1);
	}

	// ── Hooks ──────────────────────────────────────────────────────────────────

	function init() {
		frappe.ui.form.on("*", {
			refresh: function (frm) {
				scheduleApply(frm);
			},
		});

		$(document).on("page-change", function () {
			setTimeout(function () {
				if (cur_frm) scheduleApply(cur_frm);
			}, 100);
		});

		$(document).on("refresh-fields", function () {
			if (cur_frm) {
				setTimeout(function () {
					applyDirectFieldStyles(cur_frm, cachedRules);
				}, 50);
			}
		});
	}

	function countMatchingFields(frm, rules) {
		if (!frm) return 0;
		let n = 0;
		for (const field of iterFormFields(frm)) {
			if (SKIP_FIELDTYPES.has(field.df.fieldtype)) continue;
			if (!hasFieldWrapper(field)) continue;
			if (Object.keys(mergeFieldStyles(rules, frm, field)).length) n++;
		}
		return n;
	}

	// Preview merged styles for current rule (Form Styler / Field Style Rule UI)
	function buildRuleCSS(rule) {
		rule = normalizeRule(rule);
		if (!rule || !isRuleActive(rule)) return "/* Rule is inactive or empty */";

		const frm = cur_frm || { doctype: rule.doctype_name || "" };
		const sample = {
			df: {
				fieldtype: rule.field_type || "Data",
				fieldname: (rule.fieldname || "field_width").split(",")[0].trim(),
			},
		};
		if (!ruleMatchesField(rule, frm, sample)) {
			return (
				"/* This rule does not match the sample field on the open form.\n" +
				"   Check Apply To, DocType, Field Type, and Field Name. */"
			);
		}
		return (
			"/* Applied directly on each matching control (inline styles) */\n" +
			JSON.stringify(mergeFieldStyles([rule], frm, sample), null, 2)
		);
	}

	async function reloadAndInject() {
		return new Promise(function (resolve) {
			fetchRules(function (rules) {
				if (cur_frm) {
					tagCurrentForm(cur_frm);
					const styled = applyDirectFieldStyles(cur_frm, rules);
					injectLayoutCSS(rules);
					resolve({ rules: rules, styled: styled });
				} else {
					injectLayoutCSS(rules);
					resolve({ rules: rules, styled: 0 });
				}
			});
		});
	}

	async function diagnose() {
		const status = await frappe.call({
			method: "form_styler.utils.get_style_rules_status",
		});
		return new Promise(function (resolve) {
			fetchRules(function (rules) {
				const frm = cur_frm;
				const info = {
					server: (status && status.message) || null,
					rulesLoaded: rules.length,
					rules: rules,
					openForm: frm ? frm.doctype : null,
					fieldsInForm: frm ? iterFormFields(frm).length : 0,
					matchingFields: frm ? countMatchingFields(frm, rules) : 0,
				};
				console.table(
					rules.map((r) => ({
						name: r.rule_name,
						apply_to: r.apply_to,
						doctype: r.doctype_name,
						field_type: r.field_type,
						field: r.fieldname,
						width: r.field_width,
						height: r.field_height,
						is_active: r.is_active,
					}))
				);
				console.info("FormStyler diagnose:", info);
				resolve(info);
			});
		});
	}

	window.FormStyler = {
		applyToForm: scheduleApply,
		reloadAndInject: reloadAndInject,
		diagnose: diagnose,
		buildRuleCSS: buildRuleCSS,
		// legacy alias
		injectGlobalCSS: injectLayoutCSS,
	};

	if (typeof frappe !== "undefined" && frappe.ready) {
		frappe.ready(init);
	} else {
		init();
	}
})();

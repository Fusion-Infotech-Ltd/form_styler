// Authors: Raisul Islam
// Date: May 2026
// Description: Client-side runtime for Form Styler app. Applies style rules to ERPNext forms based on user-defined criteria, using direct DOM manipulation and dynamic CSS injection.
// License: MIT

// Form Styler Runtime


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

	function parseSelectedNames(rule) {
		const raw = (rule.fieldname || "").trim();
		if (raw === "__all__" || raw === "*") {
			return { all: true, names: [] };
		}
		return {
			all: false,
			names: raw
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean),
		};
	}

	function ruleMatchesSelected(rule, frm, elementFieldname) {
		rule = normalizeRule(rule);
		if (!rule || !isRuleActive(rule) || !elementFieldname) return false;
		if (rule.doctype_name && frm.doctype !== rule.doctype_name) return false;
		const sel = parseSelectedNames(rule);
		if (sel.all) return true;
		if (!sel.names.length) return false;
		return sel.names.includes(elementFieldname);
	}

	function ruleMatchesField(rule, frm, field) {
		if (!field || !field.df) return false;
		if ((rule.target_element || "Field") !== "Field") return false;
		// Legacy: By Field Type (global, no doctype list)
		if (rule.apply_to === "By Field Type" && rule.field_type) {
			return field.df.fieldtype === rule.field_type;
		}
		return ruleMatchesSelected(rule, frm, field.df.fieldname);
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

	function getFormRoot(frm) {
		if (frm.$wrapper && frm.$wrapper.length) return frm.$wrapper;
		if (frm.wrapper) return $(frm.wrapper);
		return null;
	}

	function ruleMatchesLayout(rule, frm, layoutType, breakFieldname) {
		if (!breakFieldname) return false;
		const target = rule.target_element || "Field";
		if (layoutType === "section" && target !== "Section") return false;
		if (layoutType === "column" && target !== "Column") return false;
		return ruleMatchesSelected(rule, frm, breakFieldname);
	}

	function mergeLayoutStyles(rules, frm, layoutType, breakFieldname) {
		const out = {};
		for (const rule of sortedRules(rules)) {
			if (!ruleMatchesLayout(rule, frm, layoutType, breakFieldname)) continue;
			if (layoutType === "section") {
				if (rule.section_width) out.width = rule.section_width;
				if (rule.section_height) out.height = rule.section_height;
			} else {
				if (rule.column_width) out.width = rule.column_width;
				if (rule.column_height) out.height = rule.column_height;
			}
			if (rule.label_color) out.labelColor = rule.label_color;
			if (rule.field_bg_color) out.bgColor = rule.field_bg_color;
			if (rule.hover_effect) {
				out.hoverEffect = rule.hover_effect;
				out.hoverBgColor = rule.hover_bg_color;
			}
		}
		return out;
	}

	function clearLayoutStyles($el) {
		$el.removeClass("fs-styled-layout")
			.removeAttr("data-fs-hover data-fs-hover-bg")
			.css({
				width: "",
				maxWidth: "",
				minWidth: "",
				minHeight: "",
				flex: "",
				backgroundColor: "",
			});
	}

	function applyStylesToLayoutElement($el, styles) {
		$el.addClass("fs-styled-layout");
		if (styles.width) {
			$el.css({
				width: styles.width,
				maxWidth: styles.width,
				minWidth: styles.width,
				flex: "0 0 " + styles.width,
				boxSizing: "border-box",
			});
		}
		if (styles.height) {
			$el.css({ minHeight: styles.height });
		}
		if (styles.bgColor) {
			$el.css("background-color", styles.bgColor);
		}
		if (styles.hoverEffect) {
			$el.attr("data-fs-hover", styles.hoverEffect);
			if (styles.hoverBgColor) {
				$el.attr("data-fs-hover-bg", styles.hoverBgColor);
			}
		}
	}

	function applyDirectLayoutStyles(frm, rules) {
		const $root = getFormRoot(frm);
		if (!$root || !$root.length) return 0;

		let styled = 0;
		$root.find(".form-section[data-fieldname]").each(function () {
			const $el = $(this);
			const fn = $el.attr("data-fieldname");
			clearLayoutStyles($el);
			const styles = mergeLayoutStyles(rules, frm, "section", fn);
			if (!Object.keys(styles).length) return;
			applyStylesToLayoutElement($el, styles);
			styled++;
		});

		$root.find(".form-column[data-fieldname]").each(function () {
			const $el = $(this);
			const fn = $el.attr("data-fieldname");
			clearLayoutStyles($el);
			const styles = mergeLayoutStyles(rules, frm, "column", fn);
			if (!Object.keys(styles).length) return;
			applyStylesToLayoutElement($el, styles);
			styled++;
		});

		return styled;
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
		// Per-element sizing is inline only — no global .form-section / .form-column rules.
		let css = `
.fs-styled[data-fs-hover="Highlight"] .form-control:hover,
.fs-styled[data-fs-hover="Highlight"] .like-disabled-input:hover {
  transition: background 0.2s ease;
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
.fs-styled-layout[data-fs-hover="Highlight"]:hover {
  transition: background 0.2s ease;
  background-color: #e8f4ff !important;
}
.fs-styled-layout[data-fs-hover="Lift"]:hover {
  box-shadow: 0 4px 14px rgba(0,0,0,0.13) !important;
  transform: translateY(-1px);
}
.fs-styled-layout[data-fs-hover="Glow"]:hover {
  outline: 2px solid var(--primary);
  box-shadow: 0 0 0 4px rgba(100,130,255,0.2) !important;
}
`;
		// Custom highlight bg per rule via inline on element — optional attribute
		for (const rule of sortedRules(rules)) {
			if (rule.hover_effect !== "Highlight" || !rule.hover_bg_color) continue;
			const sel = parseSelectedNames(rule);
			const names = sel.all ? [] : sel.names;
			names.forEach(function (fn) {
				const esc = escapeCSSAttr(fn);
				css += `.fs-styled[data-fieldname="${esc}"][data-fs-hover="Highlight"] .form-control:hover,`;
				css += `.fs-styled-layout[data-fieldname="${esc}"][data-fs-hover="Highlight"]:hover {`;
				css += `background-color:${rule.hover_bg_color}!important;}\n`;
			});
		}
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
			// 1. Read instantly from the browser's memory (Zero latency)
			// Note: Ensure the variable name exactly matches what you set in python (form_styler_rules)
			let rawRules = frappe.boot.form_style_rules || [];
			
			// 2. Filter active rules
			const rules = rawRules.filter(isRuleActive);
			
			// 3. Cache and return
			cachedRules = rules;
			callback(rules);
	}

	function applyToForm(frm, attempt) {
		if (!frm) return;

		fetchRules(function (rules) {
			tagCurrentForm(frm);
			const fieldStyled = applyDirectFieldStyles(frm, rules);
			const layoutStyled = applyDirectLayoutStyles(frm, rules);
			const styled = fieldStyled + layoutStyled;
			injectLayoutCSS(rules);

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
					applyDirectLayoutStyles(cur_frm, cachedRules);
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
					const fieldStyled = applyDirectFieldStyles(cur_frm, rules);
					const layoutStyled = applyDirectLayoutStyles(cur_frm, rules);
					injectLayoutCSS(rules);
					resolve({
						rules: rules,
						styled: fieldStyled + layoutStyled,
						fieldStyled: fieldStyled,
						layoutStyled: layoutStyled,
					});
				} else {
					injectLayoutCSS(rules);
					resolve({ rules: rules, styled: 0 });
				}
			});
		});
	}

	function diagnose() {
        // Read directly from the new bootinfo we set up
        const rules = frappe.boot.form_styler_rules || [];
        const frm = window.cur_frm; // Get the currently open ERPNext form

        const info = {
            rulesLoaded: rules.length,
            rules: rules,
            openForm: frm ? frm.doctype : null,
            // Assuming you have these helper functions defined elsewhere in your file
            fieldsInForm: frm && typeof iterFormFields === "function" ? iterFormFields(frm).length : 0,
            matchingFields: frm && typeof countMatchingFields === "function" ? countMatchingFields(frm, rules) : 0,
        };

        // Print a nice table to the browser console
        console.table(
            rules.map((r) => ({
                name: r.name, 
                target: r.target_element,
                doctype: r.doctype_name,
                fields: r.fields,
                active: r.active !== undefined ? r.active : 1
            }))
        );
        
        console.info("FormStyler diagnose:", info);
        return info;
    }

    // Expose APIs for your builder UI to interact with
    window.FormStyler = {
        applyToForm: scheduleApply,
        reloadAndInject: reloadAndInject,
        diagnose: diagnose,
        buildRuleCSS: buildRuleCSS,
        injectGlobalCSS: injectLayoutCSS,
    };

    // The Ignition Switch: Wait for Frappe to load, then initialize
    if (typeof frappe !== "undefined" && frappe.ready) {
        frappe.ready(init);
    } else {
        init();
    }
})();

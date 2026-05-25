// ── Form Styler Runtime ───────────────────────────────────────────────────────
// Loaded on every Frappe desk page via app_include_js.
// Reads boot.form_style_rules and injects generated CSS into <head>.
// Also re-injects on form navigation so doctype-specific rules apply correctly.

(function () {
    "use strict";

    // ── CSS Builder ───────────────────────────────────────────────────────────

    /**
     * Build CSS for a single rule object.
     * Supports:
     *   - Field width/height
     *   - Column width/height
     *   - Section width/height
     *   - Label color, field text color, field bg color
     *   - Hover effects: Highlight, Lift, Glow
     */
    function buildRuleCSS(rule) {
        if (!rule) return "";

        const selectors = buildSelectors(rule);
        if (!selectors.length) return "";

        let css = "";

        selectors.forEach(function (sel) {
            const target = rule.target_element || "Field";
            let block = "";

            // ── Dimensions ──────────────────────────────────────────────────
            if (target === "Field") {
                if (rule.field_width) {
                    block += `\n  width: ${rule.field_width} !important;`;
                    block += `\n  max-width: ${rule.field_width} !important;`;
                    block += `\n  min-width: ${rule.field_width} !important;`;
                    block += `\n  flex: 0 0 ${rule.field_width} !important;`;
                }
                if (rule.field_height) {
                    block += `\n  --fs-field-height: ${rule.field_height};`;
                }
                if (block) css += `${sel} {${block}\n}\n`;

                // Height on actual inputs
                if (rule.field_height) {
                    css += `${sel} .form-control,\n`;
                    css += `${sel} .like-disabled-input,\n`;
                    css += `${sel} .frappe-control > div:first-child {`;
                    css += `\n  height: ${rule.field_height} !important;`;
                    css += `\n  min-height: ${rule.field_height} !important;`;
                    css += `\n}\n`;
                }
            } else if (target === "Column") {
                if (rule.column_width || rule.column_height) {
                    block += rule.column_width ? `\n  width: ${rule.column_width} !important;\n  flex: 0 0 ${rule.column_width} !important;` : "";
                    block += rule.column_height ? `\n  min-height: ${rule.column_height} !important;` : "";
                    // Column selector override
                    css += `${sel} {${block}\n}\n`;
                }
            } else if (target === "Section") {
                if (rule.section_width || rule.section_height) {
                    block += rule.section_width ? `\n  width: ${rule.section_width} !important;` : "";
                    block += rule.section_height ? `\n  min-height: ${rule.section_height} !important;` : "";
                    css += `${sel} {${block}\n}\n`;
                }
            }

            // ── Label color ─────────────────────────────────────────────────
            if (rule.label_color) {
                css += `${sel} label.control-label,\n`;
                css += `${sel} .control-label {\n`;
                css += `  color: ${rule.label_color} !important;\n}\n`;
            }

            // ── Field text color ────────────────────────────────────────────
            if (rule.field_text_color) {
                css += `${sel} .form-control,\n`;
                css += `${sel} .like-disabled-input {\n`;
                css += `  color: ${rule.field_text_color} !important;\n}\n`;
            }

            // ── Field background ────────────────────────────────────────────
            if (rule.field_bg_color) {
                css += `${sel} .form-control,\n`;
                css += `${sel} .like-disabled-input {\n`;
                css += `  background-color: ${rule.field_bg_color} !important;\n}\n`;
            }

            // ── Hover effects ───────────────────────────────────────────────
            if (rule.hover_effect) {
                css += buildHoverCSS(sel, rule);
            }
        });

        return css;
    }

    /**
     * Build hover CSS for a given selector and rule.
     */
    function buildHoverCSS(sel, rule) {
        const effect = rule.hover_effect;
        const transBase = "transition: all 0.22s ease;";
        let css = "";

        // Base transition so it's always smooth
        css += `${sel} .form-control,\n`;
        css += `${sel} .like-disabled-input {\n  ${transBase}\n}\n`;

        if (effect === "Highlight") {
            const bg = rule.hover_bg_color || "#e8f4ff";
            css += `${sel}:hover .form-control,\n`;
            css += `${sel}:hover .like-disabled-input {\n`;
            css += `  background-color: ${bg} !important;\n}\n`;

        } else if (effect === "Lift") {
            css += `${sel}:hover .form-control,\n`;
            css += `${sel}:hover .like-disabled-input {\n`;
            css += `  box-shadow: 0 4px 14px rgba(0,0,0,0.13) !important;\n`;
            css += `  transform: translateY(-1px);\n}\n`;

        } else if (effect === "Glow") {
            css += `${sel}:hover .form-control,\n`;
            css += `${sel}:hover .like-disabled-input {\n`;
            css += `  border-color: var(--primary) !important;\n`;
            css += `  box-shadow: 0 0 0 3px rgba(100,130,255,0.22) !important;\n}\n`;
        }

        return css;
    }

    /**
     * Build an array of CSS selectors from a rule.
     * Handles all apply_to modes and target elements.
     */
    function buildSelectors(rule) {
        const applyTo = rule.apply_to;
        const target = rule.target_element || "Field";
        const selectors = [];

        if (target === "Column") {
            // Column selectors are positional; we scope by doctype if given
            if (rule.doctype_name) {
                selectors.push(`[data-page-route*="${escapeCSSAttr(rule.doctype_name)}"] .form-column`);
            } else {
                selectors.push(".form-column");
            }
            return selectors;
        }

        if (target === "Section") {
            if (rule.doctype_name) {
                selectors.push(`[data-page-route*="${escapeCSSAttr(rule.doctype_name)}"] .form-section`);
            } else {
                selectors.push(".form-section");
            }
            return selectors;
        }

        // target === "Field" (default)
        if (applyTo === "By Field Type" && rule.field_type) {
            selectors.push(`.frappe-control[data-fieldtype="${escapeCSSAttr(rule.field_type)}"]`);

        } else if (applyTo === "Specific Field" && rule.fieldname) {
            const fn = rule.fieldname.trim();
            if (rule.doctype_name) {
                selectors.push(
                    `.layout-main-section[data-route*="${escapeCSSAttr(rule.doctype_name)}"] ` +
                    `.frappe-control[data-fieldname="${escapeCSSAttr(fn)}"]`
                );
                // Fallback without doctype scoping (relies on JS injection instead)
                selectors.push(`.fs-doctype-${slugify(rule.doctype_name)} .frappe-control[data-fieldname="${escapeCSSAttr(fn)}"]`);
            } else {
                selectors.push(`.frappe-control[data-fieldname="${escapeCSSAttr(fn)}"]`);
            }

        } else if (applyTo === "Multiple Fields in DocType" && rule.fieldname) {
            const names = rule.fieldname.split(",").map(s => s.trim()).filter(Boolean);
            names.forEach(function (fn) {
                if (rule.doctype_name) {
                    selectors.push(`.fs-doctype-${slugify(rule.doctype_name)} .frappe-control[data-fieldname="${escapeCSSAttr(fn)}"]`);
                } else {
                    selectors.push(`.frappe-control[data-fieldname="${escapeCSSAttr(fn)}"]`);
                }
            });

        } else if (applyTo === "All Fields in DocType" && rule.doctype_name) {
            selectors.push(`.fs-doctype-${slugify(rule.doctype_name)} .frappe-control`);
        }

        return selectors;
    }

    function escapeCSSAttr(str) {
        return (str || "").replace(/["\\]/g, "\\$&");
    }

    function slugify(str) {
        return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }

    // ── CSS Injection ─────────────────────────────────────────────────────────

    function injectGlobalCSS(rules) {
        let css = "/* Form Styler — Generated CSS */\n";
        (rules || []).forEach(function (rule) {
            css += buildRuleCSS(rule) + "\n";
        });

        let tag = document.getElementById("form-styler-global-css");
        if (!tag) {
            tag = document.createElement("style");
            tag.id = "form-styler-global-css";
            document.head.appendChild(tag);
        }
        tag.textContent = css;
    }

    /**
     * Adds a .fs-doctype-{slug} class to the current form's layout
     * so doctype-specific CSS selectors work reliably.
     * Called on every form refresh.
     */
    function tagCurrentForm(frm) {
        if (!frm || !frm.doctype) return;
        const slug = slugify(frm.doctype);
        const layout = frm.layout && frm.layout.wrapper && frm.layout.wrapper[0];
        if (layout) {
            // Remove old tags
            layout.className = layout.className.replace(/\bfs-doctype-[\w-]+\b/g, "").trim();
            layout.classList.add("fs-doctype-" + slug);
        }
    }

    // ── Entry Point ───────────────────────────────────────────────────────────

    function init() {
        // Inject CSS from boot data immediately
        const rules = (frappe.boot && frappe.boot.form_style_rules) || [];
        injectGlobalCSS(rules);

        // Re-tag forms on every refresh so doctype-scoped CSS applies
        frappe.ui.form.on("*", {
            refresh: function (frm) {
                tagCurrentForm(frm);
            },
        });

        // Also handle page changes for good measure
        $(document).on("page-change", function () {
            // Small delay to let form DOM render
            setTimeout(function () {
                const frm = cur_frm;
                if (frm) tagCurrentForm(frm);
            }, 50);
        });
    }

    // ── Reload helper (called by Page UI after save) ──────────────────────────
    async function reloadAndInject() {
        try {
            const res = await frappe.call({ method: "form_styler.utils.get_style_rules" });
            injectGlobalCSS(res.message || []);
            // Update boot for consistency
            if (frappe.boot) frappe.boot.form_style_rules = res.message || [];
        } catch (e) {
            console.warn("FormStyler: could not reload rules", e);
        }
    }

    // ── Expose public API ─────────────────────────────────────────────────────
    window.FormStyler = {
        buildRuleCSS: buildRuleCSS,
        injectGlobalCSS: injectGlobalCSS,
        reloadAndInject: reloadAndInject,
    };

    // Run on DOMContentLoaded or immediately if already ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

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
     *
     * In Frappe v16, field wrappers carry the class `form-group` (not the
     * legacy `frappe-control`). To support both v15 and v16 — and avoid
     * matching unrelated `.form-group` elements outside forms — we emit
     * BOTH selectors for every field-level rule.
     */
    function fieldWrapperSelectors(attr) {
        // attr = e.g. `[data-fieldname="customer"]`
        return [
            `.frappe-control${attr}`,   // legacy
            `.form-group${attr}`,        // Frappe v16
        ];
    }

    function buildSelectors(rule) {
        const applyTo = rule.apply_to;
        const target = rule.target_element || "Field";
        const selectors = [];

        if (target === "Column") {
            if (rule.doctype_name) {
                selectors.push(`.fs-doctype-${slugify(rule.doctype_name)} .form-column`);
            } else {
                selectors.push(".form-column");
            }
            return selectors;
        }

        if (target === "Section") {
            if (rule.doctype_name) {
                selectors.push(`.fs-doctype-${slugify(rule.doctype_name)} .form-section`);
            } else {
                selectors.push(".form-section");
            }
            return selectors;
        }

        // target === "Field" (default)
        const push = (attr, scope) => {
            fieldWrapperSelectors(attr).forEach(sel => {
                selectors.push(scope ? `${scope} ${sel}` : sel);
            });
        };

        if (applyTo === "By Field Type" && rule.field_type) {
            const attr = `[data-fieldtype="${escapeCSSAttr(rule.field_type)}"]`;
            if (rule.doctype_name) {
                push(attr, `.fs-doctype-${slugify(rule.doctype_name)}`);
            } else {
                push(attr);
            }

        } else if (applyTo === "Specific Field" && rule.fieldname) {
            const fn = rule.fieldname.trim();
            const attr = `[data-fieldname="${escapeCSSAttr(fn)}"]`;
            if (rule.doctype_name) {
                push(attr, `.fs-doctype-${slugify(rule.doctype_name)}`);
            } else {
                push(attr);
            }

        } else if (applyTo === "Multiple Fields in DocType" && rule.fieldname) {
            const names = rule.fieldname.split(",").map(s => s.trim()).filter(Boolean);
            names.forEach(function (fn) {
                const attr = `[data-fieldname="${escapeCSSAttr(fn)}"]`;
                if (rule.doctype_name) {
                    push(attr, `.fs-doctype-${slugify(rule.doctype_name)}`);
                } else {
                    push(attr);
                }
            });

        } else if (applyTo === "All Fields in DocType" && rule.doctype_name) {
            const scope = `.fs-doctype-${slugify(rule.doctype_name)}`;
            selectors.push(`${scope} .frappe-control`);
            selectors.push(`${scope} .form-group[data-fieldname]`);
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

    function hookFormRefresh() {
        // frappe.ui.form.on("*", ...) is NOT supported by Frappe — there is
        // no wildcard doctype binding. Instead, patch Form.prototype.refresh
        // so every form refresh re-tags its wrapper with .fs-doctype-{slug}.
        try {
            if (
                window.frappe &&
                frappe.ui &&
                frappe.ui.form &&
                frappe.ui.form.Form &&
                frappe.ui.form.Form.prototype &&
                !frappe.ui.form.Form.prototype.__fs_patched
            ) {
                const proto = frappe.ui.form.Form.prototype;
                const orig = proto.refresh;
                proto.refresh = function () {
                    const ret = orig.apply(this, arguments);
                    try { tagCurrentForm(this); } catch (e) { /* no-op */ }
                    return ret;
                };
                proto.__fs_patched = true;
            }
        } catch (e) {
            console.warn("FormStyler: could not patch Form.refresh", e);
        }
    }

    function init() {
        // Inject CSS from boot data immediately
        const rules = (frappe.boot && frappe.boot.form_style_rules) || [];
        injectGlobalCSS(rules);

        // If boot was empty (e.g. boot_session failed), fetch via API.
        if (!rules.length) {
            reloadAndInject();
        }

        // Re-tag forms on every refresh so doctype-scoped CSS applies
        hookFormRefresh();

        // Router-change fallback: covers initial navigation into a form
        // before the prototype patch has been applied.
        if (frappe.router && typeof frappe.router.on === "function") {
            frappe.router.on("change", function () {
                setTimeout(function () {
                    if (window.cur_frm) tagCurrentForm(window.cur_frm);
                }, 100);
            });
        }

        // Also handle legacy page-change event
        $(document).on("page-change", function () {
            setTimeout(function () {
                if (window.cur_frm) tagCurrentForm(window.cur_frm);
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

    // Wait until both DOM and the `frappe` global are ready before init.
    function whenReady() {
        if (typeof window.frappe === "undefined" || !frappe.boot) {
            return setTimeout(whenReady, 50);
        }
        init();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", whenReady);
    } else {
        whenReady();
    }
})();

// ── Form Styler Page ──────────────────────────────────────────────────────────
// Full SPA-style UI built with vanilla JS inside Frappe's Page framework.

frappe.pages["form-styler"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "Form Styler",
        single_column: true,
    });

    page.set_indicator("Beta", "orange");

    // Toolbar buttons
    page.add_menu_item("New Rule", () => FormStylerApp.openEditor(null));
    page.add_menu_item("Reload Rules", () => FormStylerApp.loadRules());

    // Mount app
    FormStylerApp.init(wrapper, page);
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const FIELD_TYPES = [
    "Attach", "Attach Image", "Barcode", "Check", "Code", "Color",
    "Currency", "Data", "Date", "Datetime", "Dynamic Link", "Email",
    "Float", "Geolocation", "Image", "Int", "JSON", "Link", "Long Text",
    "Markdown Editor", "Password", "Percent", "Phone", "Rating",
    "Read Only", "Select", "Signature", "Small Text", "Table",
    "Table MultiSelect", "Text", "Text Editor", "Time",
];

const HOVER_EFFECTS = {
    Highlight: {
        icon: "🌈",
        desc: "Soft background wash on hover",
        css: (bg) => `
  transition: background 0.25s ease;
  &:hover .form-control, &:hover .like-disabled-input {
    background: ${bg || "#e8f4ff"} !important;
    transition: background 0.25s ease;
  }`,
    },
    Lift: {
        icon: "⬆️",
        desc: "Subtle elevation shadow on hover",
        css: () => `
  &:hover .form-control, &:hover .like-disabled-input {
    box-shadow: 0 4px 12px rgba(0,0,0,0.12) !important;
    transform: translateY(-1px);
    transition: all 0.2s ease;
  }`,
    },
    Glow: {
        icon: "✨",
        desc: "Glowing border on hover",
        css: () => `
  &:hover .form-control, &:hover .like-disabled-input {
    border-color: var(--primary) !important;
    box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.2) !important;
    transition: all 0.2s ease;
  }`,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP OBJECT
// ─────────────────────────────────────────────────────────────────────────────
const FormStylerApp = {
    rules: [],
    currentRule: null,
    doctypeFields: {},

    // ── Init ──────────────────────────────────────────────────────────────────
    async init(wrapper, page) {
        this.wrapper = wrapper;
        this.page = page;
        this._buildLayout();
        await this.loadRules();
    },

    _buildLayout() {
        // In Frappe v16 the page .html template is not always auto-injected
        // into the wrapper, so we resolve a mount point and ensure the
        // #fs-app-root container exists before writing to it.
        let root = this.wrapper.querySelector("#fs-app-root");
        if (!root) {
            const mount =
                (this.page && (this.page.body || this.page.main)) ||
                this.wrapper.querySelector(".layout-main-section") ||
                this.wrapper.querySelector(".page-body") ||
                this.wrapper;
            root = document.createElement("div");
            root.id = "fs-app-root";
            // The .fs-page-wrapper class is used by some host CSS rules.
            const pageWrap = document.createElement("div");
            pageWrap.className = "fs-page-wrapper";
            pageWrap.appendChild(root);
            // mount may be a jQuery object from Frappe — normalize to DOM.
            const mountEl = mount && mount.jquery ? mount[0] : mount;
            mountEl.appendChild(pageWrap);
        }
        root.innerHTML = `
<div class="fs-layout">
  <!-- LEFT: Rule List -->
  <div class="fs-sidebar">
    <div class="fs-sidebar-header">
      <span class="fs-sidebar-title">Style Rules</span>
      <button class="btn btn-primary btn-xs fs-new-btn">＋ New Rule</button>
    </div>
    <div class="fs-search-wrap">
      <input class="fs-search form-control form-control-sm" placeholder="Search rules…" />
    </div>
    <div id="fs-rule-list" class="fs-rule-list">
      <div class="fs-empty-state">No rules yet. Create one →</div>
    </div>
  </div>

  <!-- RIGHT: Editor -->
  <div class="fs-editor" id="fs-editor">
    <div class="fs-editor-placeholder">
      <div class="fs-placeholder-icon">🎨</div>
      <div class="fs-placeholder-title">Form Styler</div>
      <div class="fs-placeholder-sub">Select a rule to edit or create a new one</div>
      <button class="btn btn-primary fs-new-btn-center">＋ Create First Rule</button>
    </div>
  </div>
</div>`;

        // Event: new rule buttons
        root.querySelectorAll(".fs-new-btn, .fs-new-btn-center").forEach(btn =>
            btn.addEventListener("click", () => this.openEditor(null))
        );

        // Event: search
        root.querySelector(".fs-search").addEventListener("input", (e) => {
            this._filterRules(e.target.value);
        });
    },

    // ── Load Rules ────────────────────────────────────────────────────────────
    async loadRules() {
        const res = await frappe.call({ method: "form_styler.utils.get_style_rules" });
        this.rules = res.message || [];
        this._renderRuleList(this.rules);
    },

    _renderRuleList(rules) {
        const list = document.getElementById("fs-rule-list");
        if (!rules.length) {
            list.innerHTML = `<div class="fs-empty-state">No rules yet. Create one →</div>`;
            return;
        }
        list.innerHTML = rules.map(r => `
<div class="fs-rule-item ${this.currentRule?.name === r.name ? "active" : ""}"
     data-name="${r.name}">
  <div class="fs-rule-item-left">
    <span class="fs-rule-dot ${r.is_active ? "active" : "inactive"}"></span>
    <div>
      <div class="fs-rule-name">${r.rule_name}</div>
      <div class="fs-rule-meta">${r.apply_to} ${r.doctype_name ? "· " + r.doctype_name : ""} ${r.field_type ? "· " + r.field_type : ""}</div>
    </div>
  </div>
  <div class="fs-rule-badges">
    ${r.hover_effect ? `<span class="fs-badge hover">${r.hover_effect}</span>` : ""}
    ${r.field_width || r.field_height ? `<span class="fs-badge dim">⇔</span>` : ""}
    ${r.label_color || r.field_bg_color ? `<span class="fs-badge color">🎨</span>` : ""}
  </div>
</div>`).join("");

        list.querySelectorAll(".fs-rule-item").forEach(item => {
            item.addEventListener("click", () => {
                const rule = this.rules.find(r => r.name === item.dataset.name);
                if (rule) this.openEditor(rule);
            });
        });
    },

    _filterRules(query) {
        const q = query.toLowerCase();
        const filtered = this.rules.filter(r =>
            r.rule_name.toLowerCase().includes(q) ||
            (r.doctype_name || "").toLowerCase().includes(q) ||
            (r.field_type || "").toLowerCase().includes(q)
        );
        this._renderRuleList(filtered);
    },

    // ── Editor ────────────────────────────────────────────────────────────────
    openEditor(rule) {
        this.currentRule = rule ? { ...rule } : this._blankRule();
        this._renderEditor();
        this._renderRuleList(this.rules); // refresh active state
    },

    _blankRule() {
        return {
            name: null,
            rule_name: "",
            is_active: 1,
            priority: 10,
            apply_to: "By Field Type",
            target_element: "Field",
            doctype_name: "",
            fieldname: "",
            field_type: "Data",
            field_width: "",
            field_height: "",
            column_width: "",
            column_height: "",
            section_width: "",
            section_height: "",
            label_color: "",
            field_text_color: "",
            field_bg_color: "",
            hover_effect: "",
            hover_bg_color: "",
        };
    },

    _renderEditor() {
        const r = this.currentRule;
        const editor = document.getElementById("fs-editor");

        editor.innerHTML = `
<div class="fs-editor-inner">
  <!-- Header -->
  <div class="fs-editor-header">
    <div class="fs-editor-title">
      <input class="fs-rule-name-input" data-field="rule_name"
             placeholder="Rule name…" value="${r.rule_name || ""}" />
    </div>
    <div class="fs-editor-header-actions">
      <label class="fs-toggle-label">
        <input type="checkbox" class="fs-toggle" data-field="is_active" ${r.is_active ? "checked" : ""} />
        Active
      </label>
      <button class="btn btn-primary btn-sm fs-save-btn">Save Rule</button>
      ${r.name ? `<button class="btn btn-danger btn-sm fs-delete-btn">Delete</button>` : ""}
    </div>
  </div>

  <div class="fs-editor-body">

    <!-- SECTION: Scope -->
    <div class="fs-section">
      <div class="fs-section-title">1 · Scope</div>
      <div class="fs-grid-2">
        <div class="fs-field-group">
          <label>Apply To</label>
          <select class="form-control form-control-sm" data-field="apply_to">
            ${["By Field Type","Specific Field","Multiple Fields in DocType","All Fields in DocType"]
              .map(o => `<option ${r.apply_to===o?"selected":""}>${o}</option>`).join("")}
          </select>
        </div>
        <div class="fs-field-group">
          <label>Target Element</label>
          <select class="form-control form-control-sm" data-field="target_element">
            ${["Field","Column","Section"]
              .map(o => `<option ${r.target_element===o?"selected":""}>${o}</option>`).join("")}
          </select>
        </div>
      </div>

      <!-- Conditional criteria rows -->
      <div id="fs-criteria-area"></div>
    </div>

    <!-- SECTION: Dimensions -->
    <div class="fs-section" id="fs-dim-section">
      <div class="fs-section-title">2 · Dimensions</div>
      <div class="fs-grid-2" id="fs-dim-grid"></div>
    </div>

    <!-- SECTION: Colors -->
    <div class="fs-section">
      <div class="fs-section-title">3 · Colors</div>
      <div class="fs-grid-3">
        <div class="fs-field-group">
          <label>Label Color</label>
          <div class="fs-color-wrap">
            <input type="color" class="fs-color-picker" data-field="label_color"
                   value="${r.label_color || "#333333"}" />
            <input type="text" class="form-control form-control-sm fs-color-text"
                   data-field="label_color" value="${r.label_color || ""}" placeholder="#hex or empty" />
            <button class="fs-clear-color" data-field="label_color" title="Clear">✕</button>
          </div>
        </div>
        <div class="fs-field-group">
          <label>Field Text Color</label>
          <div class="fs-color-wrap">
            <input type="color" class="fs-color-picker" data-field="field_text_color"
                   value="${r.field_text_color || "#333333"}" />
            <input type="text" class="form-control form-control-sm fs-color-text"
                   data-field="field_text_color" value="${r.field_text_color || ""}" placeholder="#hex or empty" />
            <button class="fs-clear-color" data-field="field_text_color" title="Clear">✕</button>
          </div>
        </div>
        <div class="fs-field-group">
          <label>Field Background</label>
          <div class="fs-color-wrap">
            <input type="color" class="fs-color-picker" data-field="field_bg_color"
                   value="${r.field_bg_color || "#ffffff"}" />
            <input type="text" class="form-control form-control-sm fs-color-text"
                   data-field="field_bg_color" value="${r.field_bg_color || ""}" placeholder="#hex or empty" />
            <button class="fs-clear-color" data-field="field_bg_color" title="Clear">✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION: Hover Effect -->
    <div class="fs-section">
      <div class="fs-section-title">4 · Hover Effect</div>
      <div class="fs-hover-grid">
        ${["", "Highlight", "Lift", "Glow"].map(eff => {
            const info = HOVER_EFFECTS[eff];
            if (!eff) return `
<div class="fs-hover-card ${!r.hover_effect ? "selected" : ""}" data-effect="">
  <div class="fs-hover-icon">🚫</div>
  <div class="fs-hover-name">None</div>
  <div class="fs-hover-desc">No hover effect</div>
</div>`;
            return `
<div class="fs-hover-card ${r.hover_effect===eff ? "selected" : ""}" data-effect="${eff}">
  <div class="fs-hover-icon">${info.icon}</div>
  <div class="fs-hover-name">${eff}</div>
  <div class="fs-hover-desc">${info.desc}</div>
  <div class="fs-hover-preview fs-hover-preview-${eff.toLowerCase()}">
    <div class="fs-mock-input">Sample Field</div>
  </div>
</div>`;
        }).join("")}
      </div>
      <!-- Highlight custom color -->
      <div id="fs-hover-color-row" style="${r.hover_effect==="Highlight"?"":"display:none"}">
        <div class="fs-field-group" style="max-width:260px;margin-top:12px">
          <label>Hover Background Color (optional)</label>
          <div class="fs-color-wrap">
            <input type="color" class="fs-color-picker" data-field="hover_bg_color"
                   value="${r.hover_bg_color || "#e8f4ff"}" />
            <input type="text" class="form-control form-control-sm fs-color-text"
                   data-field="hover_bg_color" value="${r.hover_bg_color || ""}" placeholder="#e8f4ff" />
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION: CSS Preview -->
    <div class="fs-section">
      <div class="fs-section-title">5 · Generated CSS Preview</div>
      <pre id="fs-css-preview" class="fs-css-preview">— fill in fields above to see CSS —</pre>
    </div>

  </div>
</div>`;

        this._bindEditorEvents(editor);
        this._updateCriteria();
        this._updateDimensions();
        this._updateCSSPreview();
    },

    _bindEditorEvents(editor) {
        const self = this;
        const r = this.currentRule;

        // Generic field binding
        editor.querySelectorAll("[data-field]").forEach(el => {
            const field = el.dataset.field;
            const evt = el.type === "checkbox" ? "change" : "input";
            el.addEventListener(evt, (e) => {
                if (el.type === "checkbox") {
                    r[field] = e.target.checked ? 1 : 0;
                } else {
                    r[field] = e.target.value;
                }
                // Sync color pickers ↔ text inputs
                if (el.classList.contains("fs-color-picker")) {
                    const text = editor.querySelector(`.fs-color-text[data-field="${field}"]`);
                    if (text) text.value = e.target.value;
                } else if (el.classList.contains("fs-color-text")) {
                    const picker = editor.querySelector(`.fs-color-picker[data-field="${field}"]`);
                    if (picker && /^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                        picker.value = e.target.value;
                    }
                }
                // Cascade updates
                if (field === "apply_to") self._updateCriteria();
                if (field === "target_element") self._updateDimensions();
                self._updateCSSPreview();
            });
        });

        // Clear color buttons
        editor.querySelectorAll(".fs-clear-color").forEach(btn => {
            btn.addEventListener("click", () => {
                const field = btn.dataset.field;
                r[field] = "";
                const text = editor.querySelector(`.fs-color-text[data-field="${field}"]`);
                if (text) text.value = "";
                self._updateCSSPreview();
            });
        });

        // Hover effect cards
        editor.querySelectorAll(".fs-hover-card").forEach(card => {
            card.addEventListener("click", () => {
                editor.querySelectorAll(".fs-hover-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                r.hover_effect = card.dataset.effect;
                const colorRow = document.getElementById("fs-hover-color-row");
                if (colorRow) colorRow.style.display = r.hover_effect === "Highlight" ? "" : "none";
                self._updateCSSPreview();
            });
        });

        // Save
        editor.querySelector(".fs-save-btn").addEventListener("click", () => self._saveRule());

        // Delete
        const deleteBtn = editor.querySelector(".fs-delete-btn");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", () => self._deleteRule());
        }
    },

    _updateCriteria() {
        const r = this.currentRule;
        const area = document.getElementById("fs-criteria-area");
        if (!area) return;

        if (r.apply_to === "By Field Type") {
            area.innerHTML = `
<div class="fs-grid-2" style="margin-top:12px">
  <div class="fs-field-group">
    <label>Field Type</label>
    <select class="form-control form-control-sm" data-field="field_type">
      ${FIELD_TYPES.map(t => `<option ${r.field_type===t?"selected":""}>${t}</option>`).join("")}
    </select>
  </div>
</div>`;
        } else if (r.apply_to === "Specific Field") {
            area.innerHTML = `
<div class="fs-grid-2" style="margin-top:12px">
  <div class="fs-field-group">
    <label>DocType</label>
    <div class="fs-doctype-wrap">
      <input class="form-control form-control-sm fs-doctype-input" data-field="doctype_name"
             placeholder="e.g. Sales Order" value="${r.doctype_name || ""}" />
    </div>
  </div>
  <div class="fs-field-group">
    <label>Field Name</label>
    <div class="input-group">
      <input class="form-control form-control-sm" data-field="fieldname"
             placeholder="e.g. customer" value="${r.fieldname || ""}" />
      <button class="btn btn-default btn-sm fs-pick-field-btn" style="white-space:nowrap">Browse ▾</button>
    </div>
  </div>
</div>`;
            this._bindDoctypeInput(area);

        } else if (r.apply_to === "Multiple Fields in DocType") {
            area.innerHTML = `
<div class="fs-grid-2" style="margin-top:12px">
  <div class="fs-field-group">
    <label>DocType</label>
    <input class="form-control form-control-sm fs-doctype-input" data-field="doctype_name"
           placeholder="e.g. Sales Order" value="${r.doctype_name || ""}" />
  </div>
  <div class="fs-field-group">
    <label>Field Names <small>(comma-separated)</small></label>
    <div class="input-group">
      <input class="form-control form-control-sm" data-field="fieldname"
             placeholder="e.g. customer, territory, currency" value="${r.fieldname || ""}" />
      <button class="btn btn-default btn-sm fs-pick-field-btn" style="white-space:nowrap">Browse ▾</button>
    </div>
  </div>
</div>`;
            this._bindDoctypeInput(area);

        } else if (r.apply_to === "All Fields in DocType") {
            area.innerHTML = `
<div class="fs-grid-2" style="margin-top:12px">
  <div class="fs-field-group">
    <label>DocType</label>
    <input class="form-control form-control-sm fs-doctype-input" data-field="doctype_name"
           placeholder="e.g. Sales Order" value="${r.doctype_name || ""}" />
  </div>
</div>`;
            this._bindDoctypeInput(area);
        }

        // Re-bind generic field events on new elements
        const self = this;
        area.querySelectorAll("[data-field]").forEach(el => {
            const field = el.dataset.field;
            const evt = el.tagName === "SELECT" ? "change" : "input";
            el.addEventListener(evt, (e) => {
                self.currentRule[field] = e.target.value;
                self._updateCSSPreview();
            });
        });
    },

    _bindDoctypeInput(area) {
        const self = this;
        const doctypeInput = area.querySelector(".fs-doctype-input");
        if (doctypeInput) {
            // Autocomplete using frappe's built-in
            $(doctypeInput).autocomplete({
                source: function(req, resp) {
                    frappe.call({
                        method: "frappe.client.get_list",
                        args: { doctype: "DocType", filters: [["name", "like", `%${req.term}%`]], fields: ["name"], limit: 10 },
                    }).then(r => resp((r.message || []).map(d => d.name)));
                },
                select: function(event, ui) {
                    self.currentRule.doctype_name = ui.item.value;
                    self._updateCSSPreview();
                },
            });
        }

        const pickBtn = area.querySelector(".fs-pick-field-btn");
        if (pickBtn) {
            pickBtn.addEventListener("click", async () => {
                const dt = self.currentRule.doctype_name;
                if (!dt) { frappe.msgprint("Select a DocType first."); return; }
                const res = await frappe.call({ method: "form_styler.utils.get_doctype_fields", args: { doctype_name: dt } });
                const fields = res.message || [];
                if (!fields.length) { frappe.msgprint("No fields found."); return; }

                const isMulti = self.currentRule.apply_to === "Multiple Fields in DocType";
                const d = new frappe.ui.Dialog({
                    title: `Fields in ${dt}`,
                    fields: [{
                        fieldname: "chosen",
                        fieldtype: isMulti ? "MultiCheck" : "Select",
                        label: "Select Field(s)",
                        options: isMulti
                            ? fields.map(f => ({ label: `${f.label || f.fieldname} (${f.fieldtype})`, value: f.fieldname }))
                            : fields.map(f => f.fieldname).join("\n"),
                    }],
                    primary_action_label: "Apply",
                    primary_action(vals) {
                        const chosen = Array.isArray(vals.chosen) ? vals.chosen.join(", ") : vals.chosen;
                        self.currentRule.fieldname = chosen;
                        const inp = area.querySelector("[data-field='fieldname']");
                        if (inp) inp.value = chosen;
                        self._updateCSSPreview();
                        d.hide();
                    },
                });
                d.show();
            });
        }
    },

    _updateDimensions() {
        const r = this.currentRule;
        const grid = document.getElementById("fs-dim-grid");
        const section = document.getElementById("fs-dim-section");
        if (!grid || !section) return;

        const target = r.target_element || "Field";
        let fields = [];

        if (target === "Field") {
            fields = [
                { key: "field_width", label: "Width", ph: "200px / 50% / 20rem" },
                { key: "field_height", label: "Height", ph: "32px / 4rem" },
            ];
        } else if (target === "Column") {
            fields = [
                { key: "column_width", label: "Column Width", ph: "300px / 40%" },
                { key: "column_height", label: "Column Height", ph: "auto / 200px" },
            ];
        } else if (target === "Section") {
            fields = [
                { key: "section_width", label: "Section Width", ph: "100% / 800px" },
                { key: "section_height", label: "Section Height", ph: "auto / 400px" },
            ];
        }

        grid.innerHTML = fields.map(f => `
<div class="fs-field-group">
  <label>${f.label}</label>
  <div class="input-group">
    <input class="form-control form-control-sm" data-field="${f.key}"
           placeholder="${f.ph}" value="${r[f.key] || ""}" />
    <div class="input-group-append">
      <span class="input-group-text" style="font-size:11px;color:#888">CSS</span>
    </div>
  </div>
</div>`).join("");

        // Re-bind
        const self = this;
        grid.querySelectorAll("[data-field]").forEach(el => {
            el.addEventListener("input", (e) => {
                self.currentRule[el.dataset.field] = e.target.value;
                self._updateCSSPreview();
            });
        });
    },

    _updateCSSPreview() {
        const el = document.getElementById("fs-css-preview");
        if (!el) return;
        const css = window.FormStyler && window.FormStyler.buildRuleCSS(this.currentRule);
        el.textContent = css && css.trim() ? css : "— fill in fields above to see CSS —";
    },

    // ── Persistence ───────────────────────────────────────────────────────────
    async _saveRule() {
        const r = this.currentRule;
        if (!r.rule_name || !r.rule_name.trim()) {
            frappe.msgprint("Please enter a Rule Name."); return;
        }

        frappe.show_alert({ message: "Saving…", indicator: "blue" });
        try {
            const res = await frappe.call({
                method: "form_styler.utils.save_style_rule",
                args: { rule_data: r },
            });
            if (res.message) {
                r.name = res.message;
                frappe.show_alert({ message: "Rule saved!", indicator: "green" });
                await this.loadRules();
                this._renderRuleList(this.rules);
                // Trigger live CSS re-injection
                window.FormStyler && FormStyler.reloadAndInject();
            }
        } catch (e) {
            frappe.show_alert({ message: "Error saving rule.", indicator: "red" });
        }
    },

    async _deleteRule() {
        const name = this.currentRule.name;
        if (!name) return;
        const confirmed = await new Promise(res => {
            frappe.confirm("Delete this rule?", () => res(true), () => res(false));
        });
        if (!confirmed) return;
        await frappe.call({ method: "form_styler.utils.delete_style_rule", args: { name } });
        frappe.show_alert({ message: "Rule deleted.", indicator: "orange" });
        this.currentRule = null;
        document.getElementById("fs-editor").innerHTML = `
<div class="fs-editor-placeholder">
  <div class="fs-placeholder-icon">🎨</div>
  <div class="fs-placeholder-title">Form Styler</div>
  <div class="fs-placeholder-sub">Select a rule to edit or create a new one</div>
</div>`;
        await this.loadRules();
        window.FormStyler && FormStyler.reloadAndInject();
    },
};

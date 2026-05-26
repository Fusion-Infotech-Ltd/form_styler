// Author: Raisul Islam (raisul.aust1@gmail.com)	
// Date: 2026-05-26
// Version: 1.0.0
// Description: Form Styler is a Frappe app that allows you to customize the width, height, background color, hover effects, label color, and text color of fields, Section Breaks, and Column Breaks directly from the UI. It helps you design and personalize form layouts efficiently without writing custom code, giving you more flexibility beyond the default Frappe layout system.

// ── Form Styler Page ──────────────────────────────────────────────────────────
// Full SPA-style UI built with vanilla JS inside Frappe's Page framework.

frappe.pages["form-styler"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Form Styler",
		single_column: true,
	});

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
	"Attach",
	"Attach Image",
	"Barcode",
	"Check",
	"Code",
	"Color",
	"Currency",
	"Data",
	"Date",
	"Datetime",
	"Dynamic Link",
	"Email",
	"Float",
	"Geolocation",
	"Image",
	"Int",
	"JSON",
	"Link",
	"Long Text",
	"Markdown Editor",
	"Password",
	"Percent",
	"Phone",
	"Rating",
	"Read Only",
	"Select",
	"Signature",
	"Small Text",
	"Table",
	"Table MultiSelect",
	"Text",
	"Text Editor",
	"Time",
	"Section Break",
	"Column Break",
	"Tab Break",
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

const LAYOUT_FIELDTYPES = new Set(["Section Break", "Column Break", "Tab Break"]);

const DIM_KEYS = {
	Field: { w: "field_width", h: "field_height", label: "Field", wMax: 600, hMax: 200 },
	Column: { w: "column_width", h: "column_height", label: "Column", wMax: 900, hMax: 600 },
	Section: { w: "section_width", h: "section_height", label: "Section", wMax: 1200, hMax: 800 },
};

// MAIN APP OBJECT
const FormStylerApp = {
	rules: [],
	currentRule: null,
	doctypeFields: {},
	fieldsFetchPromises: {}, // Track ongoing fetches per cache key


	async init(wrapper, page) {
		this.wrapper = wrapper;
		this.page = page;
		this._scopeControls = { doctype: null, target: null };
		this.buildLayout();
		await this.loadRules();
	},

	buildLayout() {
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
		<button class="btn btn-primary fs-new-btn-center">
			Create First Rule
		</button>
    </div>
  </div>
</div>`;

		// Event: new rule buttons
		root.querySelectorAll(".fs-new-btn, .fs-new-btn-center").forEach((btn) =>
			btn.addEventListener("click", () => this.openEditor(null)),
		);

		// Event: search
		root.querySelector(".fs-search").addEventListener("input", (e) => {
			this.filterRules(e.target.value);
		});
	},

	async loadRules() {
		const res = await frappe.call({
			method: "form_styler.utils.get_style_rules",
		});

		this.rules = res.message || [];

		this.renderRuleList(this.rules);

		// Update placeholder button text dynamically
		const btn = document.querySelector(".fs-new-btn-center");

		if (btn) {
			btn.textContent =
				this.rules.length === 0
					? "Create First Rule"
					: "＋ Create Rule";
		}
	},

	renderRuleList(rules) {
		const list = document.getElementById("fs-rule-list");
		if (!rules.length) {
			list.innerHTML = `<div class="fs-empty-state">No rules yet. Create one →</div>`;
			return;
		}
		list.innerHTML = rules
			.map(
				(r) => `
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
</div>`,
			)
			.join("");

		list.querySelectorAll(".fs-rule-item").forEach((item) => {
			item.addEventListener("click", () => {
				const rule = this.rules.find((r) => r.name === item.dataset.name);
				if (rule) this.openEditor(rule);
			});
		});
	},

	filterRules(query) {
		const q = query.toLowerCase();
		const filtered = this.rules.filter(
			(r) =>
				r.rule_name.toLowerCase().includes(q) ||
				(r.doctype_name || "").toLowerCase().includes(q) ||
				(r.field_type || "").toLowerCase().includes(q),
		);
		this.renderRuleList(filtered);
	},

	// ── Editor ────────────────────────────────────────────────────────────────
	openEditor(rule) {
		this.currentRule = rule ? { ...rule } : this.blankRule();
		this.renderEditor();
		this.renderRuleList(this.rules); // refresh active state
	},

	blankRule() {
		return {
			name: null,
			rule_name: "",
			is_active: 1,
			priority: 10,
			apply_to: "Multiple Fields in DocType",
			target_element: "Field",
			doctype_name: "Employee",
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

	renderEditor() {
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
          <label>Target Element</label>
          <select class="form-control form-control-sm" data-field="target_element" style="max-width:300px !important; min-width:100px !important;">
            ${["Field", "Column", "Section"]
				.map((o) => `<option ${r.target_element === o ? "selected" : ""}>${o}</option>`)
				.join("")}
          </select>
        </div>
      </div>
      <div id="fs-criteria-area"></div>
    </div>

    <!-- SECTION: Dimensions -->
    <div class="fs-section" id="fs-dim-section">
      <div class="fs-section-title">2 · Dimensions <span style="font-weight:400;color:var(--text-muted)">— drag corner or use sliders</span></div>
      <div id="fs-resize-host"></div>
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
        ${["", "Highlight", "Lift", "Glow"]
			.map((eff) => {
				const info = HOVER_EFFECTS[eff];
				if (!eff)
					return `
<div class="fs-hover-card ${!r.hover_effect ? "selected" : ""}" data-effect="">
  <div class="fs-hover-icon">🚫</div>
  <div class="fs-hover-name">None</div>
  <div class="fs-hover-desc">No hover effect</div>
</div>`;
				return `
<div class="fs-hover-card ${r.hover_effect === eff ? "selected" : ""}" data-effect="${eff}">
  <div class="fs-hover-icon">${info.icon}</div>
  <div class="fs-hover-name">${eff}</div>
  <div class="fs-hover-desc">${info.desc}</div>
  <div class="fs-hover-preview fs-hover-preview-${eff.toLowerCase()}">
    <div class="fs-mock-input">Sample Field</div>
  </div>
</div>`;
			})
			.join("")}
      </div>
      <!-- Highlight custom color -->
      <div id="fs-hover-color-row" style="${r.hover_effect === "Highlight" ? "" : "display:none"}">
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

		this.bindEditorEvents(editor);
		// Async setup of criteria — waits for data to be pre-fetched
		this.updateCriteria()
			.then(() => {
				this.updateDimensions();
				this.updateCSSPreview();
			})
			.catch(err => {
				console.error("[renderEditor] Error updating criteria:", err);
				this.updateDimensions();
				this.updateCSSPreview();
			});
	},

	bindEditorEvents(editor) {
		const self = this;
		const r = this.currentRule;

		// Generic field binding
		editor.querySelectorAll("[data-field]").forEach((el) => {
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
				if (field === "target_element") {

					r.fieldname = "";
					r.apply_to = "Multiple Fields in DocType";
				
					Object.keys(self.doctypeFields).forEach((k) => delete self.doctypeFields[k]);
					Object.keys(self.fieldsFetchPromises).forEach((k) => delete self.fieldsFetchPromises[k]);
					self.updateCriteria();
					self.updateDimensions();
				}
				self.updateCSSPreview();
			});
		});

		// Clear color buttons
		editor.querySelectorAll(".fs-clear-color").forEach((btn) => {
			btn.addEventListener("click", () => {
				const field = btn.dataset.field;
				r[field] = "";
				const text = editor.querySelector(`.fs-color-text[data-field="${field}"]`);
				if (text) text.value = "";
				self.updateCSSPreview();
			});
		});

		// Hover effect cards
		editor.querySelectorAll(".fs-hover-card").forEach((card) => {
			card.addEventListener("click", () => {
				editor
					.querySelectorAll(".fs-hover-card")
					.forEach((c) => c.classList.remove("selected"));
				card.classList.add("selected");
				r.hover_effect = card.dataset.effect;
				const colorRow = document.getElementById("fs-hover-color-row");
				if (colorRow)
					colorRow.style.display = r.hover_effect === "Highlight" ? "" : "none";
				self.updateCSSPreview();
			});
		});

		// Save
		editor.querySelector(".fs-save-btn").addEventListener("click", () => self.saveRule());

		// Delete
		const deleteBtn = editor.querySelector(".fs-delete-btn");
		if (deleteBtn) {
			deleteBtn.addEventListener("click", () => self.deleteRule());
		}
	},

	parseCssPx(val, fallback) {
		if (!val) return fallback;
		const m = String(val).match(/^([\d.]+)\s*(px|%|rem|em)?$/);
		if (!m) return fallback;
		return { num: parseFloat(m[1]), unit: m[2] || "px" };
	},

	formatCssSize(num, unit) {
		if (unit === "%") return `${Math.round(num)}%`;
		return `${Math.round(num)}px`;
	},

	async loadDoctypeFields(doctype, target) {
		if (!doctype) return [];
		const cacheKey = `${doctype}::${target || "Field"}`;
		if (this.doctypeFields[cacheKey]) {
			console.log(`[Cache HIT] ${cacheKey}:`, this.doctypeFields[cacheKey].length, "fields");
			return this.doctypeFields[cacheKey];
		}
		try {
			console.log(`[Fetching] ${doctype} (target: ${target || "Field"})...`);
			const res = await frappe.call({
				method: "form_styler.utils.get_doctype_fields",
				args: { doctype_name: doctype, target_element: target || "Field" },
			});
			const fields = res.message || [];
			console.log(`[Fetched] ${cacheKey}: ${fields.length} fields`);
			if (fields.length === 0) {
				console.warn(`⚠ WARNING: Backend returned 0 fields for ${doctype}`);
			}
			this.doctypeFields[cacheKey] = fields;
			return fields;
		} catch (err) {
			console.error(`[ERROR] Failed to fetch fields for ${doctype}:`, err);
			this.doctypeFields[cacheKey] = [];
			return [];
		}
	},

	destroyScopeControls() {
		["doctype", "target"].forEach((key) => {
			const ctrl = this._scopeControls && this._scopeControls[key];
			if (ctrl && ctrl.$wrapper) {
				ctrl.$wrapper.remove();
			}
		});
		this._scopeControls = { doctype: null, target: null };
	},

	targetLabel() {
		const t = this.currentRule.target_element || "Field";
		if (t === "Section") return __("Section(s)");
		if (t === "Column") return __("Column(s)");
		return __("Field(s)");
	},

	syncSelectionFromTargetControl() {
		const r = this.currentRule;
		const ctrl = this._scopeControls && this._scopeControls.target;
		if (!ctrl) return;

		let vals = ctrl.get_value();
		if (typeof vals === "string") {
			vals = vals ? [vals] : [];
		}
		vals = vals || [];

		if (vals.includes("__all__")) {
			r.fieldname = "__all__";
			r.apply_to = "All Fields in DocType";
		} else if (vals.length === 1) {
			r.fieldname = vals[0];
			r.apply_to = "Specific Field";
		} else if (vals.length > 1) {
			r.fieldname = vals.join(", ");
			r.apply_to = "Multiple Fields in DocType";
		} else {
			r.fieldname = "";
			r.apply_to = "Multiple Fields in DocType";
		}
	},

	setTargetLoading(show) {
		const el = document.getElementById("fs-target-loading");
		if (el) el.classList.toggle("hide", !show);
	},

	async getTargetOptions(txt) {
		const r = this.currentRule;
		const dt = r.doctype_name;
		if (!dt) {
			console.log("[getTargetOptions] No doctype selected");
			return [];
		}

		const cacheKey = `${dt}::${r.target_element || "Field"}`;
		const self = this;
		
		// If not in cache, fetch it now
		if (!this.doctypeFields[cacheKey]) {
			console.log(`[getTargetOptions] Cache miss for ${cacheKey}, fetching...`);
			this.setTargetLoading(true);
			try {
				await this.loadDoctypeFields(dt, r.target_element || "Field");
				console.log(`[getTargetOptions] Fetch complete, cache now has data`);
				this.setTargetLoading(false);
			} catch (err) {
				console.error(`[getTargetOptions] Error fetching for ${cacheKey}:`, err);
				this.setTargetLoading(false);
			}
		} else {
			console.log(`[getTargetOptions] Using cache for ${cacheKey}`);
		}

		// Get cached data (now guaranteed to exist)
		const fields = this.doctypeFields[cacheKey] || [];
		console.log(`[getTargetOptions] Returning options: ${fields.length} total fields`);
		
		const term = (txt || "").toLowerCase();
		const filtered = fields.filter((f) => {
			if (!term) return true;
			return (
				f.fieldname.toLowerCase().includes(term) ||
				(f.label || "").toLowerCase().includes(term) ||
				f.fieldtype.toLowerCase().includes(term)
			);
		});

		let options = filtered.map((f) => ({
			value: f.fieldname,
			label: f.label || f.fieldname,
			description: f.fieldtype,
		}));

		options.unshift({
			value: "__all__",
			label: __("All in this DocType"),
			description: __("Style every matching element"),
		});

		console.log(`[getTargetOptions] After filter: ${options.length} options for term "${txt || ""}"`);
		return options;
	},

	async setupScopeControls(area) {
		const self = this;
		const r = this.currentRule;
		this.destroyScopeControls();
		this._scopeControls = { doctype: null, target: null };

		const dtMount = area.querySelector("#fs-doctype-mount");
		const tgtMount = area.querySelector("#fs-target-mount");
		if (!dtMount || !tgtMount) return;

		// ── Build controls ────────────────────────────────────────────────
		this._doctypeCtrl = frappe.ui.form.make_control({
			parent: dtMount,
			df: {
				label: __("DocType"),
				fieldtype: "Link",
				options: "DocType",
				fieldname: "doctype_name",
				reqd: 1,
				get_query: () => ({
					filters: { in_create: 0, istable: 0, issingle: 0, name: ["!=", "Access Log"] }
				})
			},
			render_input: true,
		});
		this._doctypeCtrl.$wrapper.css({
			maxWidth: "300px",
			minWidth: "100px"
		});
		this._scopeControls.doctype = this._doctypeCtrl;

		this._targetCtrl = frappe.ui.form.make_control({
			parent: tgtMount,
			df: {
				label: this.targetLabel(),
				fieldtype: "MultiSelectList",
				fieldname: "fieldname",
				reqd: 1,
				get_data(txt) { return self.getTargetOptions(txt); },
			},
			render_input: true,
		});
		this._targetCtrl.$wrapper.css({
			maxWidth: "300px",
			minWidth: "100px"
		});
		this._scopeControls.target = this._targetCtrl;

		// ── Pre-warm cache for already-known doctype (editing existing rule) ──
		if (r.doctype_name) {
			const cacheKey = `${r.doctype_name}::${r.target_element || "Field"}`;
			if (!this.doctypeFields[cacheKey]) {
				this.setTargetLoading(true);
				await this.loadDoctypeFields(r.doctype_name, r.target_element || "Field")
					.finally(() => this.setTargetLoading(false));
			}
		} 

		// ── Snapshot initial fieldname values ─────────────────────────────
		const initial =
			r.fieldname === "__all__" || r.apply_to === "All Fields in DocType"
				? ["__all__"]
				: (r.fieldname || "").split(",").map(s => s.trim()).filter(Boolean);

		// ── Guards ────────────────────────────────────────────────────────
		// `locked`  → guards TARGET handler during forceTargetValues init only.
		// `lastDt`  → guards DOCTYPE handler: programmatic set_value fires change
		//             with the SAME value (skipped); a real user pick has a
		//             DIFFERENT value (proceeds). No timing window at all.
		let locked = true;
		let lastDt = r.doctype_name || "";

		this._doctypeCtrl.$input.on("change", () => {
			const newDt = self._doctypeCtrl.get_value() || "";
			if (newDt === lastDt) return; // same value = validation echo, skip
			lastDt = newDt;
			r.doctype_name = newDt;
			console.log("[doctypeChange] Doctype changed to:", newDt);

			// Clear stale cache
			Object.keys(self.doctypeFields).forEach(k => delete self.doctypeFields[k]);
			Object.keys(self.fieldsFetchPromises).forEach(k => delete self.fieldsFetchPromises[k]);

			// Reset target selection
			if (self._targetCtrl) { self._targetCtrl.set_value([]); r.fieldname = ""; }

			// *** KEY FIX: eagerly pre-warm cache for the new doctype so the
			// Fields dropdown has data ready before the user opens it ***
			if (newDt) {
				self.setTargetLoading(true);
				self.loadDoctypeFields(newDt, r.target_element || "Field")
					.finally(() => self.setTargetLoading(false));
			}
			self.updateCSSPreview();
		});

		this._targetCtrl.$input.on("change", () => {
			if (locked) return; // prevents init-time forceTargetValues cascade
			self.syncSelectionFromTargetControl();
			self.updateCSSPreview();
		});

		// Trigger initial doctype value — fires validation → change → lastDt guard skips it ✓
		if (r.doctype_name) {
			this._doctypeCtrl.set_value(r.doctype_name);
		}

		// Release target lock after initial values are confirmed
		if (initial.length) {
			this.forceTargetValues(this._targetCtrl, initial, () => { locked = false; });
		} else {
			setTimeout(() => { locked = false; }, 5000);
		}
	},
	// Retries set_value until get_value() confirms the values are actually set.
	// Gives up after MAX attempts and releases the lock regardless.
	forceTargetValues(ctrl, values, onDone, attempt = 0) {
		const MAX = 15, INTERVAL = 200;

		try {
			// Stop if ctrl was removed from DOM (controls were rebuilt)
			if (!ctrl?.$wrapper || !document.contains(ctrl.$wrapper[0])) {
				onDone?.();
				return;
			}

			ctrl.set_value(values);

			setTimeout(() => {
				try {
					let got = ctrl.get_value() ?? null;
					got = Array.isArray(got)
						? got
						: got ? String(got).split(",").map(s => s.trim()) : [];

					const confirmed = values.every(v => got.includes(v));

					if (confirmed || attempt >= MAX) {
						onDone?.(); // ← lock released here, only after values visible
					} else {
						this.forceTargetValues(ctrl, values, onDone, attempt + 1);
					}
				} catch (_) { onDone?.(); }
			}, INTERVAL);

		} catch (_) { onDone?.(); }
	},

	async updateCriteria() {
		const r = this.currentRule;
		const area = document.getElementById("fs-criteria-area");
		if (!area) return;

		const target = r.target_element || "Field";
		const hint =
			target === "Section"
				? __("Pick section break name(s) from Customize Form")
				: target === "Column"
					? __("Pick column break name(s) from Customize Form")
					: __("Pick input field name(s)");

		area.innerHTML = `
	<div class="fs-scope-controls" style="margin-top:12px">
	<div id="fs-doctype-mount"></div>
	<div class="fs-field-group" style="margin-top:10px">
		<div id="fs-target-mount"></div>
		<div id="fs-target-loading" class="fs-target-loading hide">
		<span class="spinner-border spinner-border-sm" role="status"></span>
		${__("Loading fields…")}
		</div>
		<p class="text-muted small" style="margin:8px 0 0">${hint}</p>
	</div>
	</div>`;

		// AWAIT the setup to complete before returning — don't let dropdown be opened until data ready
		await this.setupScopeControls(area);
	},

	bindResizePanel(host) {
		const self = this;
		const r = this.currentRule;
		const target = r.target_element || "Field";
		const keys = DIM_KEYS[target] || DIM_KEYS.Field;

		const box = host.querySelector(".fs-resize-box");
		const handle = host.querySelector(".fs-resize-handle");
		const wRange = host.querySelector(".fs-resize-w");
		const hRange = host.querySelector(".fs-resize-h");
		const wVal = host.querySelector(".fs-resize-w-val");
		const hVal = host.querySelector(".fs-resize-h-val");
		const unitSel = host.querySelector(".fs-resize-unit-sel");
		const boxLabel = host.querySelector(".fs-resize-box-label");

		if (boxLabel) {
			boxLabel.textContent = `${keys.label} preview — drag corner`;
		}

		const wParsed = this.parseCssPx(r[keys.w], { num: 200, unit: "px" });
		const hParsed = this.parseCssPx(r[keys.h], { num: 40, unit: "px" });
		const unit = wParsed.unit === "%" ? "%" : "px";
		if (unitSel) unitSel.value = unit;

		const applySize = (wNum, hNum, unitType) => {
			const wCss = this.formatCssSize(wNum, unitType);
			const hCss = this.formatCssSize(hNum, unitType);
			r[keys.w] = wCss;
			r[keys.h] = hCss;
			if (unitType === "px") {
				box.style.width = wCss;
				box.style.maxWidth = wCss;
				box.style.height = hCss;
				box.style.minHeight = hCss;
			} else {
				box.style.width = wCss;
				box.style.height = hCss;
			}
			if (wRange) wRange.value = wNum;
			if (hRange) hRange.value = hNum;
			if (wVal) wVal.textContent = wCss;
			if (hVal) hVal.textContent = hCss;
			self.updateCSSPreview();
		};

		applySize(wParsed.num, hParsed.num, unit);

		if (wRange) {
			wRange.addEventListener("input", (e) => {
				applySize(Number(e.target.value), Number(hRange.value), unitSel.value);
			});
		}
		if (hRange) {
			hRange.addEventListener("input", (e) => {
				applySize(Number(wRange.value), Number(e.target.value), unitSel.value);
			});
		}
		if (unitSel) {
			unitSel.addEventListener("change", (e) => {
				applySize(Number(wRange.value), Number(hRange.value), e.target.value);
			});
		}

		if (handle) {
			let startX, startY, startW, startH;
			const onMove = (ev) => {
				const nw = Math.max(40, startW + (ev.clientX - startX));
				const nh = Math.max(24, startH + (ev.clientY - startY));
				applySize(nw, nh, "px");
				if (unitSel) unitSel.value = "px";
			};
			const onUp = () => {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};
			handle.addEventListener("mousedown", (e) => {
				e.preventDefault();
				startX = e.clientX;
				startY = e.clientY;
				startW = box.offsetWidth;
				startH = box.offsetHeight;
				document.addEventListener("mousemove", onMove);
				document.addEventListener("mouseup", onUp);
			});
		}
	},

	updateDimensions() {
		const r = this.currentRule;
		const host = document.getElementById("fs-resize-host");
		if (!host) return;

		const target = r.target_element || "Field";
		const keys = DIM_KEYS[target] || DIM_KEYS.Field;

		host.innerHTML = `
<div class="fs-resize-panel">
  <div class="fs-resize-stage">
    <div class="fs-resize-box">
      <span class="fs-resize-box-label"></span>
      <div class="fs-resize-handle" title="Drag to resize"></div>
    </div>
  </div>
  <div class="fs-resize-sliders">
    <label>Width</label>
    <input type="range" class="fs-resize-w" min="40" max="${keys.wMax}" value="200" />
    <div class="fs-resize-value fs-resize-w-val">200px</div>
    <label>Height</label>
    <input type="range" class="fs-resize-h" min="24" max="${keys.hMax}" value="40" />
    <div class="fs-resize-value fs-resize-h-val">40px</div>
    <label class="fs-resize-unit">Unit</label>
    <select class="form-control form-control-sm fs-resize-unit-sel">
      <option value="px">px</option>
      <option value="%">%</option>
    </select>
    <p class="text-muted small" style="margin-top:10px">Values save as CSS (e.g. 320px, 50%).</p>
  </div>
</div>`;

		this.bindResizePanel(host);
	},

	updateCSSPreview() {
		const el = document.getElementById("fs-css-preview");
		if (!el) return;
		const css = window.FormStyler && window.FormStyler.buildRuleCSS(this.currentRule);
		el.textContent = css && css.trim() ? css : "— fill in fields above to see CSS —";
	},

	// ── Persistence ───────────────────────────────────────────────────────────
	async saveRule() {
		const r = this.currentRule;
		if (!r.rule_name || !r.rule_name.trim()) {
			frappe.msgprint("Please enter a Rule Name.");
			return;
		}

		if (this._scopeControls?.doctype) {
			r.doctype_name = this._scopeControls.doctype.get_value() || "";
		}
		if (this._scopeControls?.target) {
			this.syncSelectionFromTargetControl();
		}
		if (!r.doctype_name) {
			frappe.msgprint(__("Please select a DocType."));
			return;
		}
		if (!r.fieldname) {
			frappe.msgprint(__("Please select at least one {0}", [this.targetLabel()]));
			return;
		}

		frappe.show_alert({ message: "Saving…", indicator: "blue" });
		try {
			const res = await frappe.call({
				method: "form_styler.utils.save_style_rule",
				args: { rule_data: r },
			});
			if (res.message) {
				const saved = typeof res.message === "object" ? res.message : { name: res.message };
				r.name = saved.name || res.message;
				await this.loadRules();

				// ✅ Re-open editor with fresh rule from server so MultiSelectList re-hydrates correctly
				const freshRule = this.rules.find((ru) => ru.name === r.name);
				if (freshRule) this.openEditor(freshRule);
				else this.renderRuleList(this.rules);

				if (window.FormStyler) {
					const result = await FormStyler.reloadAndInject();
					const styled = result && result.styled;
					const onForm = cur_frm ? cur_frm.doctype : null;
					if (cur_frm && styled > 0) {
						frappe.show_alert({
							message: __("Rule saved — styled {0} field(s) on {1}", [styled, onForm]),
							indicator: "green",
						});
					} else if (cur_frm) {
						frappe.show_alert({
							message: __(
								"Rule saved but 0 fields matched on {0}. Check Apply To / DocType / Field Type, then refresh the form.",
								[onForm]
							),
							indicator: "orange",
						});
					} else {
						frappe.show_alert({
							message: __(
								"Rule saved. Open a DocType form (e.g. Asset) to see styles."
							),
							indicator: "green",
						});
					}
				}
			}
		} catch (e) {
			frappe.show_alert({ message: "Error saving rule.", indicator: "red" });
		}
	},

	async deleteRule() {
		const name = this.currentRule.name;
		if (!name) return;
		const confirmed = await new Promise((res) => {
			frappe.confirm(
				"Delete this rule?",
				() => res(true),
				() => res(false),
			);
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
		if (window.FormStyler) {
			FormStyler.reloadAndInject();
			if (cur_frm) FormStyler.applyToForm(cur_frm);
		}
	},
};

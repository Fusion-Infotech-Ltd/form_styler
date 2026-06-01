# Form Styler

Frappe Version 16

This Frappe app allows you to customize the width, height, background color, hover effects, label color, and text color of fields and Column Breaks directly from the UI. It helps you design and personalize form layouts efficiently without writing custom code, giving you more flexibility beyond the default Frappe layout system. 

## One-time setup (required)

Run these on your bench **once**:

```bash
cd ~/frappe-bench
bench get-app https://github.com/raisulislam0/form_styler.git
bench --site YOUR_SITE install-app form_styler
bench --site YOUR_SITE migrate
bench --site YOUR_SITE clear-cache
```
Replace `YOUR_SITE` with your site name (e.g. `site1.local`).

Then in the browser: **hard refresh** the desk (`Ctrl+Shift+R`).

Confirm the app is loaded: open browser DevTools → Network → filter `form_styler_runtime.js` — it should load with status 200.

## Screenshots

<img width="1676" height="913" alt="image" src="https://github.com/user-attachments/assets/05c9394e-8f8d-4c1e-a270-65abf009a05b" />
<img width="1897" height="917" alt="image" src="https://github.com/user-attachments/assets/359272e8-95ac-4ebf-a746-56aa41007962" />
<img width="1897" height="910" alt="image" src="https://github.com/user-attachments/assets/0815ac72-2a73-48e9-aca1-87b4b940d24d" />


---
## Create a test rule (Asset form example)

1. Open **Form Styler** (search in Awesomebar).
2. Click **＋ New Rule**.
3. Fill in exactly:

| Field | Value |
|--------|--------|
| Rule Name | `Asset wide fields` |
| Active | ✓ checked |
| Apply To | **All Fields in DocType** |
| Target Element | `Field` · `Column` · `Section` — switch to resize column-break or section containers |
| DocType | `Asset` |
| Field Width | `400px` |

4. Click **Save Rule**.
5. Click **Reload Rules** (menu).
6. Open **Asset → New Asset** (or any existing Asset).
You should see inputs noticeably wider (~400px). Colors/hover on the same rule also prove CSS is working.

### Common mistake

If **Apply To** is left as **By Field Type**, the DocType field is **ignored**. The rule only targets field types (e.g. all `Data` fields **on every form**), not “all fields on Asset”.

For one DocType, always use:

- **All Fields in DocType** + DocType = `Asset`, or  
- **Specific Field** + DocType + fieldname (e.g. `item_code`), or  
- **Multiple Fields in DocType** + DocType + `item_code, location`

---
## After every rule change

1. **Save Rule** in Form Styler.
2. **Reload Rules** (or reopen the target form).
3. If still no change: `bench --site YOUR_SITE clear-cache` and hard refresh the browser.

---
## How it works (dataflow)

1. **Field Style Rule** records are stored in the database.
2. On every form **refresh**, the runtime calls `form_styler.utils.get_style_rules`.
3. For each field in `frm.fields_dict`, rules are matched in JavaScript (Apply To / DocType / field type).
4. Matching fields get **inline styles** on their Frappe control (`$wrapper`, `.control-input-wrapper`, inputs).
5. Column/section/hover use a small global CSS block.

---

## Other DocTypes

Same steps: set **Apply To** = **All Fields in DocType**, **DocType** = exact name (`Sales Invoice`, `Customer`, …), save, reload form.

No extra setup per DocType.






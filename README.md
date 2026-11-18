# ReconcileDesk

Compare orders and payments from two CSV exports. The browser flags exceptions and creates an Excel workbook with a summary, order details, and a payment audit.

## Try it

Click **Try sample data** on the app page, or select these files and click **Compare files**:

- [Orders sample](sample-orders.csv)
- [Payments sample](sample-payments.csv)

The sample includes split payments, unpaid and partially paid orders, and duplicate IDs. Its payment control difference is 0.00.

## File format

| File | Required headers |
| --- | --- |
| Orders | order_id, order_amount |
| Payments | payment_id, order_id, payment_amount |

Use UTF-8 CSV files up to 10 MB each, with nonnegative amounts in one currency. Matching uses exact order IDs after trimming whitespace. Files are processed in the browser.

## Run locally

Run python -m http.server 8000 from the repository root, then open http://localhost:8000.

## Commission audit

Open `commission-audit.html` and choose **Try sample data**, or select UTF-8 CSVs for a single period and currency.

| File | Required headers |
| --- | --- |
| Invoices | invoice_id, sales_rep, invoice_amount |
| Project costs | cost_id, invoice_id, cost_amount |
| Recorded commissions (optional) | invoice_id, recorded_commission |

Use one invoice row per invoice ID and a unique ID per cost row. Multiple cost rows per invoice are supported. Supply a zero-cost row where appropriate. Commission is positive gross profit times a flat rate, rounded to the nearest cent per invoice. Duplicate invoices, duplicate linked costs and missing costs are held for review. The optional third export enables per-invoice comparisons with recorded commission.

All inputs are processed in the browser. Download an Excel workbook with summary, invoice findings and input audit sheets. The invoice explainer uses the calculated results and CSV line references.

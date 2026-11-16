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

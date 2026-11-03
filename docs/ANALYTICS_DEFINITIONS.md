# Analytics & Financial Reporting Definitions — DIANO Backend

This document establishes the binding formulas, business rules, timezone conversions, and data contracts for all analytics and reporting services in the DIANO platform. All backend SQL queries, in-memory calculations, and export generators strictly follow these specifications.

---

## 1. Timezone & Business Day Boundaries

- **Standard Business Timezone:** `Asia/Dhaka` (UTC+6:00).
- **Storage:** All database timestamps (`placedAt`, `deliveredAt`, `completedAt`, `createdAt`, `date`) are stored in UTC (`TIMESTAMP WITH TIME ZONE` or UTC timestamp).
- **Query Range:** Every period is converted to an half-open UTC interval:
  $$\text{Interval} = [\text{startUtc}, \text{endUtc})$$
  Where `startUtc` is inclusive (Dhaka 00:00:00 converted to UTC) and `endUtc` is exclusive (Dhaka 24:00:00 / next day 00:00:00 converted to UTC).

### Standard Periods & Comparison Ranges
1. **`today`**: Current calendar day in Dhaka (00:00:00 to tomorrow 00:00:00 Dhaka). Comparison: `yesterday`.
2. **`yesterday`**: Preceding calendar day in Dhaka. Comparison: day before yesterday.
3. **`last_7_days`**: Past 7 complete days up to start of tomorrow Dhaka. Comparison: preceding 7-day window.
4. **`last_30_days`**: Past 30 complete days up to start of tomorrow Dhaka. Comparison: preceding 30-day window.
5. **`this_week`**: Begins Saturday 00:00:00 Dhaka (Bangladesh business week convention) up to start of tomorrow. Comparison: same number of elapsed days in preceding week.
6. **`last_week`**: Preceding week from Saturday 00:00:00 to Friday 23:59:59.999 Dhaka. Comparison: the week prior to that.
7. **`this_month`**: 1st day of current Dhaka month 00:00:00 to start of tomorrow. Comparison: same elapsed day count in preceding month.
8. **`last_month`**: 1st day of prior month 00:00:00 to 1st day of current month 00:00:00. Comparison: month before that.
9. **`this_year`**: January 1 00:00:00 Dhaka to start of tomorrow. Comparison: same elapsed period in preceding year (YoY).
10. **`last_year`**: January 1 to December 31 23:59:59.999 of preceding year. Comparison: two years ago.
11. **`custom`**: Explicit `from` and `to` ISO dates (inclusive Dhaka dates, max 366 days). Comparison: identical duration immediately preceding `from`.

---

## 2. Order Inclusion & Sales Classification

- **Order Timing:** An order is classified into a period based strictly on its `placedAt` timestamp.
- **Cancelled Orders:** Orders with `status = 'CANCELLED'` are **excluded from all sales and revenue metrics**, but are tracked in the order volume and `cancellationRate`.
- **Unconfirmed/Draft Online Orders:** Orders with `status = 'PENDING'` and `paymentStatus != 'PAID'` (e.g. pending SSLCOMMERZ checkout) are excluded from sales metrics until confirmed or paid.
- **Included Orders Definition:**
  $$\text{Included Orders} = \{ \text{order} \mid \text{status} \neq \text{'CANCELLED'} \land (\text{paymentStatus} = \text{'PAID'} \lor \text{status} \neq \text{'PENDING'}) \}$$

---

## 3. Financial Metrics & Formulas

All currency arithmetic is computed using arbitrary-precision Decimal math (`Decimal.js` or SQL `NUMERIC(12, 2)`). Zero floating-point rounding errors.

### 3.1 Gross Sales
Sum of pre-discount item totals across all included orders:
$$\text{grossSales} = \sum_{\text{included orders}} \sum_{\text{items}} (\text{unitPrice} \times \text{quantity})$$

### 3.2 Discounts
Total promotional reductions (coupons, item discounts, flash sales) across included orders:
$$\text{discounts} = \sum_{\text{included orders}} \text{discountTotal}$$

### 3.3 Refunds
Total completed cash/gateway refunds during the selected period based on the refund's `completedAt` (or `createdAt` if completedAt is null):
$$\text{refunds} = \sum_{\substack{\text{refund.status} = \text{'COMPLETED'} \\ \text{completedAt} \in [\text{start}, \text{end})}} \text{amount}$$
*Note: Refunds are accounted for on the date they are executed/completed, independent of when the original order was placed.*

### 3.4 Net Sales
$$\text{netSales} = \text{grossSales} - \text{discounts} - \text{refunds}$$

### 3.5 Ancillary Revenues (Reported Separately, Excluded from Net Sales)
- **Shipping Revenue:** $\sum \text{shippingTotal}$ across included orders.
- **Tax:** $\sum \text{taxTotal}$ across included orders.

### 3.6 Delivered Sales
Total revenue of orders physically delivered during the selected period:
$$\text{deliveredSales} = \sum_{\substack{\text{status} = \text{'DELIVERED'} \\ \text{deliveredAt} \in [\text{start}, \text{end})}} \text{grandTotal}$$

### 3.7 Undelivered Orders
Count of active orders awaiting delivery:
$$\text{undeliveredOrders} = \text{count}(\text{status} \in \{\text{'CONFIRMED'}, \text{'PROCESSING'}, \text{'PACKED'}, \text{'SHIPPED'}\})$$

---

## 4. Cost of Goods Sold (COGS) & Profitability Policy

**Strict Rule: Never Guess Profit.**

1. **COGS Calculation:**
   $$\text{COGS} = \sum_{\text{included orders}} \sum_{\text{items}} (\text{costPrice} \times \text{quantity})$$
2. **COGS Coverage:**
   $$\text{cogsCoverage} = \left( \frac{\sum_{\text{items with non-null, >0 costPrice}} 1}{\sum_{\text{all items}} 1} \right) \times 100\%$$
3. **Gross Profit:**
   $$\text{grossProfit} = \begin{cases} \text{netSales} - \text{COGS} & \text{if } \text{cogsCoverage} = 100\% \\ \text{null} & \text{if } \text{cogsCoverage} < 100\% \end{cases}$$
   When `grossProfit` is null, a descriptive reason is provided: `"Incomplete cost price data (coverage: X.X%)"`.
4. **Payment Fees:** Actual gateway fees charged by SSLCOMMERZ (only when recorded in `Payment.gatewayFee`, otherwise `null`).
5. **Operating Expenses:** Total sum of administrative and operating expenses recorded in the `Expense` table within the selected period:
   $$\text{expenses} = \sum_{\text{date} \in [\text{start}, \text{end})} \text{Expense.amount}$$
6. **Net Profit:**
   $$\text{netProfit} = \begin{cases} \text{grossProfit} - \text{paymentFees} - \text{expenses} & \text{if } \text{grossProfit} \neq \text{null} \land \text{expenses} \neq \text{null} \\ \text{null} & \text{otherwise} \end{cases}$$

---

## 5. Customer & Funnel Metrics

- **Average Order Value (AOV):**
  $$\text{AOV} = \frac{\text{netSales}}{\text{count(included orders)}} \quad (\text{null if count is 0})$$
- **New Customers:** Distinct customers whose first-ever order was placed in the selected range.
- **Returning Customers:** Distinct customers who placed an order in the range and had at least one order placed prior to the range.
- **Repeat Purchase Rate:**
  $$\text{repeatPurchaseRate} = \left( \frac{\text{customers with } \ge 2 \text{ orders in period}}{\text{total distinct ordering customers in period}} \right) \times 100\%$$
- **Customer Lifetime Value (Historical CLV):**
  $$\text{CLV} = \frac{\text{cumulative netSales across all time}}{\text{total unique customers all time}}$$
- **Customer Acquisition Cost (CAC):** `null` (marketing attribution ad spend integration pending).
- **Checkout Conversion Funnel:**
  Funnel steps:
  1. `checkout_started`
  2. `customer_info`
  3. `shipping_info`
  4. `payment_method`
  5. `order_placed`
  $$\text{conversionRate} = \left( \frac{\text{sessions reaching order\_placed}}{\text{sessions reaching checkout\_started}} \right) \times 100\%$$
  $$\text{abandonmentRate} = 100\% - \text{conversionRate}$$

---

## 6. Standard KPI Response Shape

Every KPI card returns comparative performance against the preceding window:
```json
{
  "current": "125000.00",
  "previous": "100000.00",
  "absoluteChange": "25000.00",
  "percentageChange": 25.0,
  "trend": "up"
}
```
- `percentageChange`: `((current - previous) / previous) * 100`. If `previous == 0`, `percentageChange` is `null`.
- `trend`: `'up'` when `current > previous`, `'down'` when `current < previous`, `'flat'` when `current == previous`.

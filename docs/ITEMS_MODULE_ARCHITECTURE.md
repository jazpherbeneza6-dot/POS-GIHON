# Items Module Architecture

## Overview

The **Items module** is where Items are created and managed, serving as the **primary reference** for all transactions in the system.

## Key Principles

### 1. Items Are Master Data, Not Transactions

Items themselves are **not transactions** and therefore:
- Do **NOT** directly affect inventory levels
- Do **NOT** directly affect accounting records
- Serve only as **reference data** for actual transactions

### 2. Transaction Impact

Any inventory or accounting impact occurs **only** when an Item is used within an actual transaction, such as:

| Transaction Type | Module | Impact |
|------------------|--------|--------|
| Sales Order | Sales | Reference only (no inventory/accounting impact until invoiced) |
| Invoice | Sales | Reduces inventory, creates accounting entries |
| Package | Sales | Groups items for shipment |
| Shipment | Sales | Tracks delivery of items |
| Purchase Order | Purchases | Reference only (no inventory/accounting impact until received) |
| Purchase Receive | Purchases | Increases inventory |
| Bill | Purchases | Creates accounting entries |
| Inventory Adjustment | Inventory | Directly adjusts inventory levels |

### 3. Item Visibility

- Items **exist only** within the Items module
- Items **appear in other modules** solely as:
  - Lookup data (for selection in transactions)
  - Reference data (displaying item details in transactions)
- An Item must **never** be:
  - Treated as a standalone transaction
  - Displayed as a transaction
  - Processed as a transaction

## Data Flow

```
┌─────────────────┐
│   ITEMS MODULE  │  ← Master Data (Create/Edit/Delete Items)
│  (Master Data)  │
└────────┬────────┘
         │
         │ Referenced by (Lookup/Selection)
         ▼
┌─────────────────────────────────────────────────────────┐
│                     TRANSACTIONS                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Sales Orders │  │   Invoices   │  │   Packages   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Shipments   │  │Purchase Ord. │  │Purchase Recv.│   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │    Bills     │  │ Inv. Adjust. │  │   Reports    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
         │
         │ Impacts (When Transaction is Processed)
         ▼
┌─────────────────────────────────────────────────────────┐
│                    BUSINESS IMPACT                       │
│  ┌──────────────────────┐  ┌──────────────────────┐     │
│  │   Inventory Levels   │  │  Accounting Records  │     │
│  └──────────────────────┘  └──────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## Implementation Guidelines

### When Creating/Editing Items
- Items should be saved to the Items table only
- No inventory or accounting entries should be created

### When Using Items in Transactions
- Fetch item data from Items table as reference
- Clone relevant item properties into the transaction line item
- Inventory/accounting entries are created based on transaction type, not item creation

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/items` | List all items (for lookup/selection) |
| `GET /api/items/:id` | Get single item details |
| `POST /api/items` | Create new item (master data only) |
| `PUT /api/items/:id` | Update item |
| `DELETE /api/items/:id` | Delete item (if not referenced) |

### Database Relationships

```sql
-- Items table (Master Data)
items (
  id, name, sku, description, unit, price, cost,
  brand, manufacturer, category, status, ...
)

-- Transaction tables reference items
sales_order_items (
  id, sales_order_id, item_id, quantity, price, ...
)

invoice_items (
  id, invoice_id, item_id, quantity, price, ...
)

purchase_order_items (
  id, purchase_order_id, item_id, quantity, cost, ...
)
-- etc.
```

## Summary

> **Remember**: Items are reference data. They define WHAT can be sold/purchased, but they don't represent actual sales or purchases. Only transactions create business impact.

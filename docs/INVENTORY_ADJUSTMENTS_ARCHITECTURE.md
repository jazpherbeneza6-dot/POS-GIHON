# Inventory Adjustments Module Architecture

## Overview

**Inventory Adjustments** are used to correct stock mismatches in the system. They provide a mechanism to align physical inventory counts with system records.

## Flow Diagram

```
┌─────────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│                     │      │                     │      │                     │
│    Inventory        │ ───► │   Updates Item      │ ───► │   Reflects in       │
│    Adjustment       │      │   Stock             │      │   Inventory Reports │
│                     │      │                     │      │                     │
└─────────────────────┘      └─────────────────────┘      └─────────────────────┘
```

## Key Principles

### 1. Immediate Stock Impact

Inventory Adjustments cause an **immediate** increase or decrease in item stock levels:

| Adjustment Type | Stock Impact |
|-----------------|--------------|
| Quantity Increase | ↑ Stock level increases immediately |
| Quantity Decrease | ↓ Stock level decreases immediately |

### 2. No Accounting Entries (By Default)

Inventory Adjustments do **NOT** create accounting entries within the system.

```
┌─────────────────────────────────────────────────────────┐
│                 INVENTORY ADJUSTMENT                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   ✅ Updates Stock Levels      (Immediate)              │
│   ❌ Creates Accounting Entries (Not in Inventory)      │
│                                                          │
│   Optional: Sync to Accounting System                    │
│   └── If enabled, accounting impact occurs there         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3. Visibility Rules

| Module | Visible? | Purpose |
|--------|----------|---------|
| Inventory Adjustments | ✅ Yes | Create and manage adjustments |
| Stock Reports | ✅ Yes | Track stock changes |
| Inventory Reports | ✅ Yes | View adjustment history |
| Sales Module | ❌ No | Not visible/selectable |
| Purchase Module | ❌ No | Not visible/selectable |
| Sales Transactions | ❌ No | Cannot be used as line items |
| Purchase Transactions | ❌ No | Cannot be used as line items |

## What Inventory Adjustments ARE

- ✅ Stock correction records
- ✅ Inventory reconciliation tools
- ✅ Physical count adjustments
- ✅ Shrinkage/damage tracking
- ✅ Opening stock entries

## What Inventory Adjustments ARE NOT

- ❌ Sales transactions
- ❌ Purchase transactions
- ❌ Accounting entries
- ❌ Sellable/purchasable entities
- ❌ Customer/vendor transactions

## Adjustment Types

### Quantity Adjustment

```
Purpose: Correct stock quantity
Example: Physical count shows 50, system shows 45
Action:  Increase stock by 5

┌────────────────────────────────────────┐
│ Adjustment Type: Quantity              │
│ Item: Product A                        │
│ Current Stock: 45                      │
│ Adjustment: +5                         │
│ New Stock: 50                          │
└────────────────────────────────────────┘
```

### Value Adjustment

```
Purpose: Correct stock value
Example: Adjust value due to price changes
Action:  Modify item value without changing quantity

┌────────────────────────────────────────┐
│ Adjustment Type: Value                 │
│ Item: Product A                        │
│ Current Value: $1,000                  │
│ Adjustment: +$100                      │
│ New Value: $1,100                      │
└────────────────────────────────────────┘
```

## Reasons for Adjustment

| Reason Code | Description |
|-------------|-------------|
| Damaged Goods | Items damaged and unusable |
| Stocktaking | Physical count differences |
| Stolen Goods | Items lost to theft |
| Expired Items | Items past expiration |
| Opening Stock | Initial inventory setup |
| Production | Items used in manufacturing |
| Write-off | Items removed from inventory |
| Other | Miscellaneous adjustments |

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  INVENTORY ADJUSTMENTS MODULE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. CREATE ADJUSTMENT                                          │
│   ┌─────────────────────────────────────────────────────┐       │
│   │ • Select Reason                                      │       │
│   │ • Choose Items                                       │       │
│   │ • Enter Quantities (increase/decrease)              │       │
│   │ • Add Description                                    │       │
│   └─────────────────────────────────────────────────────┘       │
│                           │                                      │
│                           ▼                                      │
│   2. STOCK UPDATED (IMMEDIATE)                                  │
│   ┌─────────────────────────────────────────────────────┐       │
│   │ • Item stock levels modified                         │       │
│   │ • Stock movement recorded                            │       │
│   │ • Timestamp recorded                                 │       │
│   └─────────────────────────────────────────────────────┘       │
│                           │                                      │
│                           ▼                                      │
│   3. REPORTS UPDATED                                            │
│   ┌─────────────────────────────────────────────────────┐       │
│   │ • Inventory valuation report                         │       │
│   │ • Stock summary report                               │       │
│   │ • Inventory aging report                             │       │
│   │ • FIFO cost lot tracking                            │       │
│   └─────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Command Flow

### Creating an Inventory Adjustment

```
1. Navigate to Inventory Adjustments
   └── Sidebar → Inventory → Inventory Adjustments
   └── URL: /inventory-adjustments.html

2. Click "+ New" button

3. Fill Adjustment Details:
   ├── Date (required)
   ├── Reason (required)
   │   ├── Damaged Goods
   │   ├── Stocktaking
   │   ├── Stolen Goods
   │   └── etc.
   ├── Reference # (optional)
   └── Description (optional)

4. Add Items:
   ├── Select Item
   ├── Enter Quantity Adjusted (+/-)
   └── Add more items as needed

5. Click "Save"
   └── Stock levels updated immediately
```

## API Reference

```
GET    /api/inventory-adjustments           → List all adjustments
GET    /api/inventory-adjustments/:id       → Get adjustment details
POST   /api/inventory-adjustments           → Create adjustment
PUT    /api/inventory-adjustments/:id       → Update adjustment
DELETE /api/inventory-adjustments/:id       → Delete adjustment
```

## Database Schema

```sql
-- Inventory Adjustments table
inventory_adjustments (
  id, date, reason, reference_number,
  description, status, created_at, updated_at
)

-- Adjustment Line Items
inventory_adjustment_items (
  id, adjustment_id, item_id,
  quantity_adjusted, unit_cost,
  created_at
)
```

## Summary

> **Remember**: Inventory Adjustments exist solely to correct stock levels. They are NOT sales, purchases, or accounting transactions. They update inventory immediately but do not create accounting entries unless synced to an external accounting system.

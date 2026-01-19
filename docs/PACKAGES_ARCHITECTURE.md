# Packages Module Architecture

## Overview

**Packages** are used for the purpose of **packing goods only** and do not represent dispatch or delivery. They serve as an intermediate step between sales order confirmation and shipment.

## Flow Diagram

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│   Sales Order   │ ───► │    Package      │ ───► │   Shipment      │
│                 │      │   (Packing)     │      │   (Optional)    │
│                 │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                        │                        │
        │                        │                        │
        ▼                        ▼                        ▼
   Order Placed           Goods Packed            Goods Dispatched
   (No Stock Impact)      (No Stock Impact)       (Stock Deducted)
```

## Key Principles

### 1. NO Inventory Impact

Creating a Package does **NOT** deduct item stock:

| Action | Stock Impact |
|--------|--------------|
| Create Sales Order | ❌ No stock change |
| Create Package | ❌ No stock change |
| Create Shipment | ✅ Stock deducted |

### 2. NO Accounting Impact

Packages have **NO** accounting impact:

```
┌─────────────────────────────────────────────────────────┐
│                      PACKAGES                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   ❌ Does NOT deduct stock                               │
│   ❌ Does NOT create accounting entries                  │
│   ❌ Does NOT generate invoices                          │
│                                                          │
│   ✅ Groups items for packing                            │
│   ✅ Prepares for shipment                               │
│   ✅ Links to Sales Order                                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3. Visibility Rules

| Module | Visible? | Purpose |
|--------|----------|---------|
| Packages Module | ✅ Yes | Create and manage packages |
| Sales Orders | ✅ Yes | View linked packages |
| Shipments | ✅ Yes | Create shipment from package |
| Invoices | ❌ No | Not visible/selectable |
| Accounting | ❌ No | No accounting impact |
| Purchase Module | ❌ No | Not related to purchases |
| Inventory Reports | ❌ No | No inventory impact |

## What Packages ARE

- ✅ Packing records for goods
- ✅ Grouping of items to be shipped
- ✅ Preparation step before shipment
- ✅ Reference linked to Sales Order
- ✅ Internal logistics tracking

## What Packages ARE NOT

- ❌ Inventory transactions
- ❌ Accounting transactions
- ❌ Financial documents
- ❌ Stock-affecting records
- ❌ Invoices or bills
- ❌ Dispatch confirmation

## Package Status Flow

```
┌────────────┐      ┌────────────┐      ┌────────────┐
│            │      │            │      │            │
│   Draft    │ ───► │   Packed   │ ───► │  Shipped   │
│            │      │            │      │            │
└────────────┘      └────────────┘      └────────────┘
                                              │
                                              ▼
                                    Linked to Shipment
                                    (Stock deducted via Shipment)
```

## Relationship to Other Modules

### Sales Order → Package → Shipment

```
SALES ORDER (SO-001)
├── Item A: 10 units
├── Item B: 5 units
└── Item C: 3 units
        │
        ▼ (Create Package)
PACKAGE (PKG-001)
├── Item A: 10 units  ← Packed
├── Item B: 5 units   ← Packed
└── Item C: 3 units   ← Packed
        │
        ▼ (Create Shipment - OPTIONAL)
SHIPMENT (SHP-001)
├── Package: PKG-001
├── Carrier: FedEx
├── Tracking: 123456789
└── Status: Shipped
        │
        ▼
STOCK DEDUCTED (Only here!)
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       PACKAGES MODULE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. PACKAGE CREATED FROM SALES ORDER                           │
│   ┌─────────────────────────────────────────────────────┐       │
│   │ • Linked to Sales Order                              │       │
│   │ • Items selected for packing                         │       │
│   │ • Quantities specified                               │       │
│   │ • Package date recorded                              │       │
│   └─────────────────────────────────────────────────────┘       │
│                           │                                      │
│                           ▼                                      │
│   2. NO IMMEDIATE IMPACT                                        │
│   ┌─────────────────────────────────────────────────────┐       │
│   │ • Stock levels UNCHANGED                             │       │
│   │ • No accounting entries created                      │       │
│   │ • Package status: Packed/Not Shipped                │       │
│   └─────────────────────────────────────────────────────┘       │
│                           │                                      │
│                           ▼                                      │
│   3. OPTIONAL: CREATE SHIPMENT                                  │
│   ┌─────────────────────────────────────────────────────┐       │
│   │ • Shipment created from package                      │       │
│   │ • Stock deducted (via Shipment, not Package)        │       │
│   │ • Delivery details recorded                          │       │
│   └─────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Command Flow

### Creating a Package

```
1. Navigate to Sales Order
   └── Open an existing Sales Order

2. Click "Create Package" or
   └── Navigate to Packages → + New

3. Select Sales Order (if creating from Packages module)

4. Fill Package Details:
   ├── Package Date
   ├── Items to Pack
   │   ├── Select items from Sales Order
   │   └── Enter quantities
   └── Notes (optional)

5. Click "Save"
   └── Package created (NO stock deduction)

6. Optional: Create Shipment from Package
   └── Click "Create Shipment" on Package
```

## API Reference

```
GET    /api/packages                    → List all packages
GET    /api/packages/:id                → Get package details
POST   /api/packages                    → Create package
PUT    /api/packages/:id                → Update package
DELETE /api/packages/:id                → Delete package
GET    /api/sales-orders/:id/packages   → Get packages for order
```

## Database Schema

```sql
-- Packages table
packages (
  id, package_number, sales_order_id,
  package_date, status, notes,
  created_at, updated_at
)

-- Package Line Items
package_items (
  id, package_id, item_id,
  quantity_packed,
  created_at
)
```

## Summary Table

| Aspect | Package | Shipment |
|--------|---------|----------|
| Purpose | Pack goods | Dispatch goods |
| Stock Impact | ❌ None | ✅ Deducts stock |
| Accounting | ❌ None | ❌ None |
| Required | Yes (if tracking packing) | Optional |
| Creates From | Sales Order | Package |

> **Remember**: Packages are for packing goods ONLY. They do not affect inventory or accounting. Stock is only deducted when a Shipment is created from the Package.
</Parameter>
<parameter name="Complexity">5

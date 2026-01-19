# Item Groups Module Architecture

## Overview

**Item Groups** are used for the logical grouping of Items to support **reporting** and **pricing analysis**. Each Item may belong to an Item Group; however, an Item Group itself is never sold, purchased, or stocked.

## Key Principles

### 1. Item Groups Are Organizational References

Item Groups have **NO direct impact** on:
- ❌ Inventory levels
- ❌ Accounting records
- ❌ Stock movements

They function **solely** as:
- ✅ Organizational references
- ✅ Reporting categories
- ✅ Pricing analysis groups

### 2. Item Groups Are NOT Transaction Entities

| What Item Groups ARE | What Item Groups ARE NOT |
|---------------------|-------------------------|
| Logical groupings | Sellable products |
| Reporting categories | Purchasable items |
| Organizational units | Stockable inventory |
| Pricing analysis groups | Transaction line items |

### 3. Visibility Rules

| Module | Item Groups Visible? | Purpose |
|--------|---------------------|---------|
| Items Module | ✅ Yes | Part of item setup (assign items to groups) |
| Item Groups Page | ✅ Yes | Manage groups and view grouped items |
| Sales Orders | ❌ No | Not selectable or processable |
| Invoices | ❌ No | Not selectable or processable |
| Purchase Orders | ❌ No | Not selectable or processable |
| Bills | ❌ No | Not selectable or processable |
| Any Transaction | ❌ No | Never appears as line item |

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    ITEM GROUPS MODULE                    │
│              (Organizational/Reporting Data)             │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ Electronics │  │  Furniture  │  │   Apparel   │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
│         │                │                │              │
│         ▼                ▼                ▼              │
│  ┌─────────────────────────────────────────────────┐    │
│  │              ITEMS (Grouped by Category)         │    │
│  │  Phone, Laptop, Chair, Desk, Shirt, Pants...    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                           │
                           │ Items can be used in transactions
                           │ (Item Groups CANNOT)
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      TRANSACTIONS                        │
│  (Only ITEMS appear here, never Item Groups)            │
│                                                          │
│  Sales Orders → Invoices → Packages → Shipments         │
│  Purchase Orders → Purchase Receives → Bills            │
└─────────────────────────────────────────────────────────┘
```

## Use Cases for Item Groups

### 1. Reporting
```
Sales Report by Item Group:
┌─────────────────┬──────────┬─────────┐
│ Item Group      │ Quantity │ Revenue │
├─────────────────┼──────────┼─────────┤
│ Electronics     │    150   │ $45,000 │
│ Furniture       │     75   │ $22,500 │
│ Apparel         │    200   │ $10,000 │
└─────────────────┴──────────┴─────────┘
```

### 2. Pricing Analysis
- Compare profit margins across groups
- Analyze pricing trends by category
- Identify best/worst performing categories

### 3. Inventory Organization
- Logical categorization of inventory
- Easier item management
- Structured item hierarchy

## Implementation Guidelines

### Creating Item Groups
- Groups are saved to the `item_groups` table only
- No inventory or accounting entries are created
- Groups contain metadata (name, description, attributes)

### Assigning Items to Groups
- Each item has an optional `group_id` foreign key
- An item can belong to only one group (or none)
- Removing a group does not delete its items

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/items/groups` | List all item groups |
| `GET /api/items/groups/:id` | Get single group with its items |
| `POST /api/items/groups` | Create new group |
| `PUT /api/items/groups/:id` | Update group |
| `DELETE /api/items/groups/:id` | Delete group (items remain) |

### Database Schema

```sql
-- Item Groups table (Organizational Data)
item_groups (
  id, name, description, manufacturer, brand,
  attributes, status, created_at, updated_at
)

-- Items reference groups
items (
  id, name, sku, ...,
  group_id REFERENCES item_groups(id),  -- Optional
  ...
)
```

## What NOT to Do

> ⚠️ **Never**:
> - Include Item Groups in transaction dropdowns
> - Allow Item Groups to be added to sales/purchase documents
> - Create inventory entries for Item Groups
> - Create accounting entries for Item Groups
> - Treat Item Groups as sellable/purchasable entities

## Summary

| Aspect | Items | Item Groups |
|--------|-------|-------------|
| Can be sold | ✅ Yes | ❌ No |
| Can be purchased | ✅ Yes | ❌ No |
| Affects inventory | When in transactions | ❌ Never |
| Affects accounting | When in transactions | ❌ Never |
| Appears in transactions | ✅ Yes | ❌ Never |
| Purpose | Products/Services | Organization/Reporting |

> **Remember**: Item Groups exist purely for organization and reporting. They help categorize Items but are never part of any business transaction.

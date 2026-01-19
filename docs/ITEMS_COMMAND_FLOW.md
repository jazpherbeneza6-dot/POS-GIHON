# Items & Item Groups - Command Flow Guide

## Quick Reference

| Action | Module | Route |
|--------|--------|-------|
| View All Items | Items | `/items.html` |
| Create New Item | Items | `/items.html` → + New |
| View Item Groups | Items | `/item-groups.html` |
| Create New Item Group | Items | `/new-item-group.html` |

---

## Item Groups Flow

### Creating an Item Group

```
1. Navigate to Item Groups
   └── Sidebar → Items → Item Groups
   └── URL: /item-groups.html

2. Click "+ New" button

3. Fill Group Details:
   ├── Group Name (required)
   ├── Manufacturer (optional)
   ├── Brand (optional)
   ├── Description (optional)
   └── Attributes (optional - Size, Color, etc.)

4. Add Items to Group (optional):
   ├── Enter item details in table
   └── Items will be created with group assignment

5. Click "Save"
   └── Group created with assigned items
```

### Managing Item Groups

```
View Groups:
├── All Item Groups     → Shows all groups
├── Active Item Groups  → Shows active only
└── Inactive Item Groups → Shows inactive only

Actions:
├── Click group → View details + items
├── Edit button → Modify group
├── Delete button → Remove group (items remain)
└── + Add Item → Add new item to group
```

---

## Items Flow

### Creating an Item

```
1. Navigate to Items
   └── Sidebar → Items → Items
   └── URL: /items.html

2. Click "+ New" button

3. Fill Item Details:
   ├── Basic Info
   │   ├── Name (required)
   │   ├── SKU
   │   └── Unit
   │
   ├── Pricing
   │   ├── Selling Price
   │   └── Purchase Cost
   │
   ├── Inventory
   │   ├── Opening Stock
   │   └── Reorder Point
   │
   ├── Classification
   │   ├── Item Group (optional)
   │   ├── Brand
   │   └── Manufacturer
   │
   └── Accounts
       ├── Sales Account
       ├── Purchase Account
       └── Inventory Account

4. Click "Save"
   └── Item created as master data
```

### Managing Items

```
View Options:
├── All Items     → Shows all items
├── Active Items  → Shows active only
└── Inactive Items → Shows inactive only

View Modes:
├── List View (☰) → Table format
└── Grid View (▦) → Card format

Actions:
├── Click item → View details panel
├── Checkbox → Select for bulk actions
├── Edit → Modify item
└── Delete → Remove item

Bulk Actions (when items selected):
├── Delete        → Remove selected items
├── Bulk Update   → Update field for all selected
├── New Transaction → Create transaction with items
├── Mark as Active/Inactive → Change status
├── Add to Group  → Assign to item group
└── Mark as Returnable → Set returnable flag
```

### Bulk Update Flow

```
1. Select items using checkboxes
2. Click "Bulk Update"
3. Choose field to update:
   ├── Brand
   ├── Manufacturer
   ├── Selling Price
   ├── Purchase Price
   ├── Unit
   ├── Tax
   ├── Returnable
   ├── Reorder Point
   ├── Purchase Account
   ├── Sales Account
   ├── Inventory Account
   ├── Valuation Method
   ├── Sales Description
   └── Purchase Description
4. Enter/Select new value
5. Click "Update"
```

### New Transaction Flow

```
1. Select items using checkboxes
2. Click "New Transaction ▼"
3. Choose transaction type:
   ├── Sales Order     → /new-sales-order.html
   ├── Invoice         → /new-invoice.html
   ├── Sales Receipt   → /new-sales-receipt.html
   ├── Purchase Order  → /new-purchase-order.html
   └── Bill            → /new-bill.html
4. Items pre-populated in transaction
```

---

## Filter & Sort Commands

### Items Page

```
Filter by Status:
└── Click "All Items ▼" dropdown
    ├── All Items
    ├── Active Items
    └── Inactive Items

Sort Options (⋯ → Sort by):
├── Name
├── SKU
├── Stock On Hand
├── Reorder Level
├── Purchase Rate
├── Rate
├── Created Time
└── Last Modified Time

Column Customization:
└── Click ☰ (filter icon in table header)
    ├── Customize Columns
    └── Clip Text
```

### Item Groups Page

```
Filter by Status:
└── Click "Active Item Groups ▲" dropdown
    ├── All Item Groups
    ├── Active Item Groups
    └── Inactive Item Groups
```

---

## Search Commands

### Items
```
Search by: Name or Description
Location: Search bar in header
Action: Type to filter instantly
```

### Item Groups
```
Search by: Group Name or Description
Location: Search input in panel header
Action: Type to filter list
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit form |
| `Escape` | Close modal/panel |
| `Tab` | Navigate fields |

---

## API Command Reference

### Items

```
GET    /api/items           → List all items
GET    /api/items/:id       → Get item details
POST   /api/items           → Create item
PUT    /api/items/:id       → Update item
DELETE /api/items/:id       → Delete item
PUT    /api/items/bulk      → Bulk update items
```

### Item Groups

```
GET    /api/items/groups           → List all groups
GET    /api/items/groups/:id       → Get group with items
POST   /api/items/groups           → Create group
PUT    /api/items/groups/:id       → Update group
DELETE /api/items/groups/:id       → Delete group
```

---

## State Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        ITEMS MODULE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐         ┌─────────────┐                       │
│   │ Item Groups │ ──────► │    Items    │                       │
│   │   (Setup)   │ groups  │  (Master)   │                       │
│   └─────────────┘         └──────┬──────┘                       │
│                                  │                               │
│                                  │ reference                     │
│                                  ▼                               │
│   ┌──────────────────────────────────────────────────────┐      │
│   │              TRANSACTION MODULES                      │      │
│   │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │      │
│   │  │ Sales  │ │Purchase│ │Invoices│ │ Bills  │  ...   │      │
│   │  │ Orders │ │ Orders │ │        │ │        │        │      │
│   │  └────────┘ └────────┘ └────────┘ └────────┘        │      │
│   └──────────────────────────────────────────────────────┘      │
│                                  │                               │
│                                  │ process                       │
│                                  ▼                               │
│   ┌──────────────────────────────────────────────────────┐      │
│   │              BUSINESS IMPACT                          │      │
│   │  ┌─────────────────┐    ┌─────────────────┐          │      │
│   │  │   Inventory     │    │   Accounting    │          │      │
│   │  └─────────────────┘    └─────────────────┘          │      │
│   └──────────────────────────────────────────────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Name required" | Missing item/group name | Enter a name |
| "SKU already exists" | Duplicate SKU | Use unique SKU |
| "Cannot delete" | Item in use | Remove from transactions first |
| "Group not found" | Invalid group ID | Refresh and try again |

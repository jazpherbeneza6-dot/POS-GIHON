// Layout Component Loader
// This script loads the sidebar and header components dynamically

(function () {
    // Load component HTML from file
    async function loadComponent(url, targetId) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load component: ${url}`);
            }
            const html = await response.text();
            const target = document.getElementById(targetId);
            if (target) {
                target.innerHTML = html;
            }
            return html;
        } catch (error) {
            console.error('Error loading component:', error);
            return null;
        }
    }

    // Set active navigation item based on current page
    function setActiveNavItem() {
        const currentPath = window.location.pathname;
        const pageName = currentPath.split('/').pop().replace('.html', '') || 'index';

        // Remove all active classes first with animation
        document.querySelectorAll('.nav-item.active').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelectorAll('.nav-submenu-item.active').forEach(item => {
            item.classList.remove('active');
        });

        // Small delay to see the transition
        setTimeout(() => {
            // Set active class on current page's nav item (only for main nav items, not submenu items)
            const navItems = document.querySelectorAll('.nav-item[data-page]');
            navItems.forEach(item => {
                const itemPage = item.getAttribute('data-page');
                if (itemPage === pageName || (pageName === '' && itemPage === 'index')) {
                    // Add animation class before adding active
                    item.classList.add('active');
                }
            });

            // For submenu items, expand the parent menu AND highlight the submenu item
            const submenuItems = document.querySelectorAll('.nav-submenu-item[data-page]');
            submenuItems.forEach(item => {
                const itemPage = item.getAttribute('data-page');
                if (itemPage === pageName || (pageName === '' && itemPage === 'index')) {
                    // Add active class to the submenu item
                    item.classList.add('active');

                    // Update localStorage to match the current page
                    localStorage.setItem('activeSubmenuItem', itemPage);

                    // Expand the parent submenu
                    const parentSubmenu = item.closest('.nav-submenu');
                    if (parentSubmenu) {
                        const parentButton = parentSubmenu.previousElementSibling;
                        if (parentButton && parentButton.classList.contains('nav-item')) {
                            parentButton.classList.add('expanded');
                            parentSubmenu.style.maxHeight = '500px';
                            parentSubmenu.style.opacity = '1';
                            // Update arrow
                            const arrow = parentButton.querySelector('.nav-item-arrow');
                            if (arrow) arrow.textContent = '⌄';
                        }
                    }
                }
            });

            // Special handling for items and item-groups pages
            if (pageName === 'items' || pageName === 'item-groups') {
                const itemsMenuToggle = document.getElementById('itemsMenuToggle');
                const itemsSubmenu = document.getElementById('itemsSubmenu');
                const itemsArrow = document.getElementById('itemsArrow');

                if (itemsMenuToggle && itemsSubmenu) {
                    itemsMenuToggle.classList.add('expanded');
                    itemsSubmenu.style.maxHeight = '500px';
                    itemsSubmenu.style.opacity = '1';
                    if (itemsArrow) itemsArrow.textContent = '⌄';
                }
            }

            // Special handling for inventory pages (adjustments, packages, shipments)
            if (pageName === 'inventory-adjustments' || pageName === 'packages' || pageName === 'shipments') {
                const inventoryMenuToggle = document.getElementById('inventoryMenuToggle');
                const inventorySubmenu = document.getElementById('inventorySubmenu');
                const inventoryArrow = document.getElementById('inventoryArrow');

                if (inventoryMenuToggle && inventorySubmenu) {
                    inventoryMenuToggle.classList.add('expanded');
                    inventorySubmenu.style.maxHeight = '500px';
                    inventorySubmenu.style.opacity = '1';
                    if (inventoryArrow) inventoryArrow.textContent = '⌄';
                }

                const subItem = document.querySelector(`.nav-submenu-item[data-page="${pageName}"]`);
                if (subItem) {
                    subItem.classList.add('active');
                    localStorage.setItem('activeSubmenuItem', pageName);
                }
            }

            // Special handling for sales page
            if (pageName === 'sales' || pageName === 'sales-orders' || pageName === 'new-sales-order' || pageName === 'invoices' || pageName === 'sales-receipts' || pageName === 'new-sales-receipt' || pageName === 'customers' || pageName === 'new-customer' || pageName === 'credit-notes' || pageName === 'new-credit-note' || pageName === 'sales-returns') {
                const salesMenuToggle = document.getElementById('salesMenuToggle');
                const salesSubmenu = document.getElementById('salesSubmenu');
                const salesArrow = document.getElementById('salesArrow');

                if (salesMenuToggle && salesSubmenu) {
                    salesMenuToggle.classList.add('expanded');
                    salesSubmenu.style.maxHeight = '500px';
                    salesSubmenu.style.opacity = '1';
                    if (salesArrow) salesArrow.textContent = '⌄';
                }

                // Highlight the correct submenu item
                const pageMap = { 'new-sales-order': 'sales-orders', 'new-customer': 'customers', 'new-sales-receipt': 'sales-receipts', 'new-credit-note': 'credit-notes' };
                const targetPage = pageMap[pageName] || pageName;
                const subItem = document.querySelector(`.nav-submenu-item[data-page="${targetPage}"]`);
                if (subItem) {
                    subItem.classList.add('active');
                    localStorage.setItem('activeSubmenuItem', targetPage);
                }
            }

            // Special handling for purchases page
            if (pageName === 'purchases') {
                const purchasesMenuToggle = document.getElementById('purchasesMenuToggle');
                const purchasesSubmenu = document.getElementById('purchasesSubmenu');
                const purchasesArrow = document.getElementById('purchasesArrow');

                if (purchasesMenuToggle && purchasesSubmenu) {
                    purchasesMenuToggle.classList.add('expanded');
                    purchasesSubmenu.style.maxHeight = '500px';
                    purchasesSubmenu.style.opacity = '1';
                    if (purchasesArrow) purchasesArrow.textContent = '⌄';
                }
            }

            // Special handling for bills-related pages
            if (pageName === 'bills' || pageName === 'new-bill' || pageName === 'import-bills' || pageName === 'unpaid-bills') {
                const purchasesMenuToggle = document.getElementById('purchasesMenuToggle');
                const purchasesSubmenu = document.getElementById('purchasesSubmenu');
                const purchasesArrow = document.getElementById('purchasesArrow');

                if (purchasesMenuToggle && purchasesSubmenu) {
                    purchasesMenuToggle.classList.add('expanded');
                    purchasesSubmenu.style.maxHeight = '500px';
                    purchasesSubmenu.style.opacity = '1';
                    if (purchasesArrow) purchasesArrow.textContent = '⌄';
                }

                // Highlight Bills submenu item
                const billsItem = document.querySelector('.nav-submenu-item[data-page="bills"]');
                if (billsItem) {
                    billsItem.classList.add('active');
                    localStorage.setItem('activeSubmenuItem', 'bills');
                }
            }

            // Special handling for payments-related pages
            if (pageName === 'payments-made' || pageName === 'record-payment' || pageName === 'import-payments') {
                const purchasesMenuToggle = document.getElementById('purchasesMenuToggle');
                const purchasesSubmenu = document.getElementById('purchasesSubmenu');
                const purchasesArrow = document.getElementById('purchasesArrow');

                if (purchasesMenuToggle && purchasesSubmenu) {
                    purchasesMenuToggle.classList.add('expanded');
                    purchasesSubmenu.style.maxHeight = '500px';
                    purchasesSubmenu.style.opacity = '1';
                    if (purchasesArrow) purchasesArrow.textContent = '⌄';
                }

                // Highlight Payments Made submenu item
                const paymentsItem = document.querySelector('.nav-submenu-item[data-page="payments-made"]');
                if (paymentsItem) {
                    paymentsItem.classList.add('active');
                    localStorage.setItem('activeSubmenuItem', 'payments-made');
                }
            }

            // Special handling for vendor-credits-related pages
            if (pageName === 'vendor-credits' || pageName === 'new-vendor-credit' || pageName === 'import-vendor-credits') {
                const purchasesMenuToggle = document.getElementById('purchasesMenuToggle');
                const purchasesSubmenu = document.getElementById('purchasesSubmenu');
                const purchasesArrow = document.getElementById('purchasesArrow');

                if (purchasesMenuToggle && purchasesSubmenu) {
                    purchasesMenuToggle.classList.add('expanded');
                    purchasesSubmenu.style.maxHeight = '500px';
                    purchasesSubmenu.style.opacity = '1';
                    if (purchasesArrow) purchasesArrow.textContent = '⌄';
                }

                // Highlight Vendor Credits submenu item
                const vendorCreditsItem = document.querySelector('.nav-submenu-item[data-page="vendor-credits"]');
                if (vendorCreditsItem) {
                    vendorCreditsItem.classList.add('active');
                    localStorage.setItem('activeSubmenuItem', 'vendor-credits');
                }
            }

            // Special handling for purchase-returns-related pages
            if (pageName === 'purchase-returns' || pageName === 'new-purchase-return') {
                const purchasesMenuToggle = document.getElementById('purchasesMenuToggle');
                const purchasesSubmenu = document.getElementById('purchasesSubmenu');
                const purchasesArrow = document.getElementById('purchasesArrow');

                if (purchasesMenuToggle && purchasesSubmenu) {
                    purchasesMenuToggle.classList.add('expanded');
                    purchasesSubmenu.style.maxHeight = '500px';
                    purchasesSubmenu.style.opacity = '1';
                    if (purchasesArrow) purchasesArrow.textContent = '⌄';
                }

                // Highlight Purchase Returns submenu item
                const purchaseReturnsItem = document.querySelector('.nav-submenu-item[data-page="purchase-returns"]');
                if (purchaseReturnsItem) {
                    purchaseReturnsItem.classList.add('active');
                    localStorage.setItem('activeSubmenuItem', 'purchase-returns');
                }
            }

            // Special handling for FIFO Report - show under Inventory > Inventory Adjustments
            if (pageName === 'fifo-report') {
                const inventoryMenuToggle = document.getElementById('inventoryMenuToggle');
                const inventorySubmenu = document.getElementById('inventorySubmenu');
                const inventoryArrow = document.getElementById('inventoryArrow');

                if (inventoryMenuToggle && inventorySubmenu) {
                    inventoryMenuToggle.classList.add('expanded');
                    inventorySubmenu.style.maxHeight = '500px';
                    inventorySubmenu.style.opacity = '1';
                    if (inventoryArrow) inventoryArrow.textContent = '⌄';
                }

                // Highlight Inventory Adjustments submenu item
                const invAdjItem = document.querySelector('.nav-submenu-item[data-page="inventory-adjustments"]');
                if (invAdjItem) {
                    invAdjItem.classList.add('active');
                    localStorage.setItem('activeSubmenuItem', 'inventory-adjustments');
                }
            }

            // Special handling for reports page - highlight Reports
            if (pageName === 'reports' || pageName === 'stock-summary' || pageName === 'inventory-valuation') {
                const reportsItem = document.querySelector('.nav-item[data-page="reports"]');
                if (reportsItem) {
                    reportsItem.classList.add('active');
                }
            }
        }, 50);
    }

    // Check if sidebar is in collapsed (burger) mode
    function isSidebarCollapsed() {
        const sidebar = document.getElementById('sidebar');
        return sidebar && sidebar.classList.contains('sidebar-collapsed');
    }

    // Helper function to close all submenus
    function closeAllSubmenus() {
        const submenus = [
            { toggle: 'itemsMenuToggle', submenu: 'itemsSubmenu', arrow: 'itemsArrow' },
            { toggle: 'inventoryMenuToggle', submenu: 'inventorySubmenu', arrow: 'inventoryArrow' },
            { toggle: 'salesMenuToggle', submenu: 'salesSubmenu', arrow: 'salesArrow' },
            { toggle: 'purchasesMenuToggle', submenu: 'purchasesSubmenu', arrow: 'purchasesArrow' }
        ];

        submenus.forEach(item => {
            const toggle = document.getElementById(item.toggle);
            const submenu = document.getElementById(item.submenu);
            const arrow = document.getElementById(item.arrow);

            if (toggle && submenu) {
                toggle.classList.remove('expanded');
                submenu.style.maxHeight = '0';
                submenu.style.opacity = '0';
                if (arrow) arrow.textContent = '›';
            }
        });
    }

    // Global function to toggle items submenu
    window.toggleItemsSubmenu = function () {
        if (isSidebarCollapsed()) return; // Let CSS hover handle it
        const itemsMenuToggle = document.getElementById('itemsMenuToggle');
        const itemsSubmenu = document.getElementById('itemsSubmenu');
        const itemsArrow = document.getElementById('itemsArrow');

        if (itemsMenuToggle && itemsSubmenu) {
            const isExpanded = itemsMenuToggle.classList.contains('expanded');

            // Close all submenus first
            closeAllSubmenus();

            if (!isExpanded) {
                // Only open if it wasn't already expanded
                itemsMenuToggle.classList.add('expanded');
                itemsSubmenu.style.maxHeight = '500px';
                itemsSubmenu.style.opacity = '1';
                if (itemsArrow) itemsArrow.textContent = '⌄';
            }
        }
    };

    // Global function to toggle inventory submenu
    window.toggleInventorySubmenu = function () {
        if (isSidebarCollapsed()) return; // Let CSS hover handle it
        const inventoryMenuToggle = document.getElementById('inventoryMenuToggle');
        const inventorySubmenu = document.getElementById('inventorySubmenu');
        const inventoryArrow = document.getElementById('inventoryArrow');

        if (inventoryMenuToggle && inventorySubmenu) {
            const isExpanded = inventoryMenuToggle.classList.contains('expanded');

            // Close all submenus first
            closeAllSubmenus();

            if (!isExpanded) {
                // Only open if it wasn't already expanded
                inventoryMenuToggle.classList.add('expanded');
                inventorySubmenu.style.maxHeight = '500px';
                inventorySubmenu.style.opacity = '1';
                if (inventoryArrow) inventoryArrow.textContent = '⌄';
            }
        }
    };

    // Global function to toggle sales submenu
    window.toggleSalesSubmenu = function () {
        if (isSidebarCollapsed()) return; // Let CSS hover handle it
        const salesMenuToggle = document.getElementById('salesMenuToggle');
        const salesSubmenu = document.getElementById('salesSubmenu');
        const salesArrow = document.getElementById('salesArrow');

        if (salesMenuToggle && salesSubmenu) {
            const isExpanded = salesMenuToggle.classList.contains('expanded');

            // Close all submenus first
            closeAllSubmenus();

            if (!isExpanded) {
                // Only open if it wasn't already expanded
                salesMenuToggle.classList.add('expanded');
                salesSubmenu.style.maxHeight = '500px';
                salesSubmenu.style.opacity = '1';
                if (salesArrow) salesArrow.textContent = '⌄';
            }
        }
    };

    // Global function to toggle purchases submenu
    window.togglePurchasesSubmenu = function () {
        if (isSidebarCollapsed()) return; // Let CSS hover handle it
        const purchasesMenuToggle = document.getElementById('purchasesMenuToggle');
        const purchasesSubmenu = document.getElementById('purchasesSubmenu');
        const purchasesArrow = document.getElementById('purchasesArrow');

        if (purchasesMenuToggle && purchasesSubmenu) {
            const isExpanded = purchasesMenuToggle.classList.contains('expanded');

            // Close all submenus first
            closeAllSubmenus();

            if (!isExpanded) {
                // Only open if it wasn't already expanded
                purchasesMenuToggle.classList.add('expanded');
                purchasesSubmenu.style.maxHeight = '500px';
                purchasesSubmenu.style.opacity = '1';
                if (purchasesArrow) purchasesArrow.textContent = '⌄';
            }
        }
    };

    // Add click handlers to submenu items for active highlighting
    function addSubmenuItemClickHandlers() {
        const submenuItems = document.querySelectorAll('.nav-submenu-item');

        // Restore active state from localStorage
        const activeSubmenuItem = localStorage.getItem('activeSubmenuItem');
        if (activeSubmenuItem) {
            const itemToActivate = document.querySelector(`.nav-submenu-item[data-page="${activeSubmenuItem}"]`);
            if (itemToActivate) {
                itemToActivate.classList.add('active');
            }
        }

        submenuItems.forEach(item => {
            item.addEventListener('click', function (e) {
                // Remove active class from all submenu items
                document.querySelectorAll('.nav-submenu-item.active').forEach(activeItem => {
                    activeItem.classList.remove('active');
                });

                // Add active class to the clicked item
                this.classList.add('active');

                // Save to localStorage for persistence across page navigation
                const dataPage = this.getAttribute('data-page');
                if (dataPage) {
                    localStorage.setItem('activeSubmenuItem', dataPage);
                }
            });
        });
    }

    // Configure header based on page-specific settings
    function configureHeader() {
        // Get page-specific configuration from data attribute or global variable
        const headerActionsContainer = document.getElementById('headerActions');
        const searchInput = document.getElementById('globalSearch');

        if (window.pageConfig) {
            // Set search placeholder
            if (window.pageConfig.searchPlaceholder && searchInput) {
                searchInput.placeholder = window.pageConfig.searchPlaceholder;
                searchInput.id = window.pageConfig.searchId || 'globalSearch';
            }

            // Add action buttons
            if (window.pageConfig.headerButtons && headerActionsContainer) {
                headerActionsContainer.innerHTML = window.pageConfig.headerButtons;
            }

            // Set up search handler
            if (window.pageConfig.onSearch && searchInput) {
                searchInput.addEventListener('keyup', window.pageConfig.onSearch);
            }
        }
    }



    // Initialize layout
    async function initLayout() {
        // Load sidebar
        await loadComponent('/components/sidebar.html', 'sidebarContainer');

        // Load header
        await loadComponent('/components/header.html', 'headerContainer');

        // Set active navigation
        setActiveNavItem();

        // Add submenu click handlers
        setTimeout(() => {
            addSubmenuItemClickHandlers();
        }, 100);

        // Configure header for current page
        configureHeader();

        // Reset page on load
        const content = document.querySelector('.content') || document.body;
        content.style.opacity = '1';

        // Dispatch event to notify that layout is ready
        document.dispatchEvent(new CustomEvent('layoutReady'));

        // Load toast script globally
        const toastScript = document.createElement('script');
        toastScript.src = '/js/toast.js';
        document.body.appendChild(toastScript);

        // Load notifications script dynamically
        const script = document.createElement('script');
        script.src = '/js/notifications.js';
        document.body.appendChild(script);
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLayout);
    } else {
        initLayout();
    }
})();

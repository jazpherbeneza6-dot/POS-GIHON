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
            item.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
            item.classList.remove('active');
        });
        document.querySelectorAll('.nav-submenu-item.active').forEach(item => {
            item.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
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
                    item.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                    item.classList.add('active');
                }
            });

            // For submenu items, just expand the parent menu but don't highlight the submenu item
            const submenuItems = document.querySelectorAll('.nav-submenu-item[data-page]');
            submenuItems.forEach(item => {
                const itemPage = item.getAttribute('data-page');
                if (itemPage === pageName || (pageName === '' && itemPage === 'index')) {
                    // Expand the parent submenu only
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

            // Special handling for sales page
            if (pageName === 'sales') {
                const salesMenuToggle = document.getElementById('salesMenuToggle');
                const salesSubmenu = document.getElementById('salesSubmenu');
                const salesArrow = document.getElementById('salesArrow');

                if (salesMenuToggle && salesSubmenu) {
                    salesMenuToggle.classList.add('expanded');
                    salesSubmenu.style.maxHeight = '500px';
                    salesSubmenu.style.opacity = '1';
                    if (salesArrow) salesArrow.textContent = '⌄';
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
        }, 50);
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

    // Add click animations to sidebar items
    function addSidebarClickAnimations() {
        const navItems = document.querySelectorAll('.nav-item, .nav-submenu-item');

        navItems.forEach(item => {
            item.addEventListener('click', function (e) {
                // Add click animation
                this.style.transform = 'translateX(2px) scale(0.98)';
                this.style.transition = 'transform 0.1s ease';

                setTimeout(() => {
                    this.style.transform = '';
                }, 100);

                // If it's a link, add fade transition for page change
                if (this.tagName === 'A' && this.href) {
                    // Add page fade out effect
                    const content = document.querySelector('.content') || document.body;
                    content.style.transition = 'opacity 0.3s ease';
                    content.style.opacity = '0.7';
                }
            });
        });
    }

    // Initialize layout
    async function initLayout() {
        // Load sidebar
        await loadComponent('/components/sidebar.html', 'sidebarContainer');

        // Load header
        await loadComponent('/components/header.html', 'headerContainer');

        // Set active navigation
        setActiveNavItem();

        // Add click animations
        setTimeout(() => {
            addSidebarClickAnimations();
            addSubmenuItemClickHandlers();
        }, 100);

        // Configure header for current page
        configureHeader();

        // Reset page fade on load
        const content = document.querySelector('.content') || document.body;
        content.style.opacity = '1';
        content.style.transition = 'opacity 0.4s ease';

        // Dispatch event to notify that layout is ready
        document.dispatchEvent(new CustomEvent('layoutReady'));

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

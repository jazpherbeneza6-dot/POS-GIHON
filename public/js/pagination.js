// ============================================
// GLOBAL PAGINATION UTILITY
// ============================================
// Usage:
//   const pager = Pagination.create({
//       data: allItems,           // full data array
//       perPage: 14,              // items per page (default 14)
//       containerId: 'paginationContainer',  // where to render controls
//       onPageChange: function(pageData, page, totalPages) {
//           // render pageData into your table
//       }
//   });
//
//   // To update data (e.g. after search/filter):
//   pager.updateData(newArray);
//
//   // To go to a specific page:
//   pager.goToPage(2);

(function () {
    'use strict';

    function PaginationInstance(config) {
        this.data = config.data || [];
        this.perPage = config.perPage || 14;
        this.containerId = config.containerId;
        this.onPageChange = config.onPageChange;
        this.currentPage = 1;
        this.totalPages = Math.max(1, Math.ceil(this.data.length / this.perPage));
    }

    PaginationInstance.prototype.getPageData = function () {
        var start = (this.currentPage - 1) * this.perPage;
        var end = start + this.perPage;
        return this.data.slice(start, end);
    };

    PaginationInstance.prototype.goToPage = function (page) {
        if (page < 1) page = 1;
        if (page > this.totalPages) page = this.totalPages;
        this.currentPage = page;
        this.render();
        if (this.onPageChange) {
            this.onPageChange(this.getPageData(), this.currentPage, this.totalPages);
        }
    };

    PaginationInstance.prototype.updateData = function (newData) {
        this.data = newData || [];
        this.totalPages = Math.max(1, Math.ceil(this.data.length / this.perPage));
        if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
        this.goToPage(this.currentPage);
    };

    PaginationInstance.prototype.render = function () {
        var container = document.getElementById(this.containerId);
        if (!container) return;

        var total = this.data.length;
        if (total === 0) {
            container.innerHTML = '';
            return;
        }

        var cid = this.containerId;

        var html = '<div class="pagination-wrapper">';
        html += '<div class="pagination-controls">';

        // Prev button
        html += '<button class="pagination-btn nav-btn" ' +
            (this.currentPage === 1 ? 'disabled' : '') +
            ' onclick="window.__paginations[\'' + cid + '\'].goToPage(' + (this.currentPage - 1) + ')">&#8249; Prev</button>';

        // Single current page number
        html += '<button class="pagination-btn active">' + this.currentPage + '</button>';

        // Next button
        html += '<button class="pagination-btn nav-btn" ' +
            (this.currentPage === this.totalPages ? 'disabled' : '') +
            ' onclick="window.__paginations[\'' + cid + '\'].goToPage(' + (this.currentPage + 1) + ')">Next &#8250;</button>';

        html += '</div></div>';
        container.innerHTML = html;
    };

    // Global registry for onclick handlers
    window.__paginations = window.__paginations || {};

    window.Pagination = {
        create: function (config) {
            var instance = new PaginationInstance(config);
            // Register globally so onclick can reference it
            window.__paginations[config.containerId] = instance;
            // Initial render
            instance.goToPage(1);
            return instance;
        }
    };
})();

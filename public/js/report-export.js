/**
 * Report Export Utility
 * Provides PDF, XLSX, XLS, CSV export and Print functionality for all report pages.
 * Auto-initializes on load. Include report-export.css for dropdown styling.
 */

(function () {
    'use strict';

    // Inject permanent print styles
    const printCSS = document.createElement('style');
    printCSS.textContent = `
        @media print {
            /* Hide everything except report content */
            .report-top-bar, .filter-bar, #sidebarContainer, .sidebar,
            .export-wrapper, .export-dropdown, .top-bar-actions,
            .options-bar, .amount-note, .filter-more, .sort-icon, .customize-count { display: none !important; }
            .content { margin-left: 0 !important; padding: 0 !important; }
            .main-layout { display: block !important; }
            body { background: #fff !important; margin: 0 !important; padding: 0 !important; font-size: 12px !important; }

            /* Report header */
            .report-body { padding: 40px 30px !important; }
            .report-header-section { text-align: center; margin-bottom: 30px !important; }
            .company-name { font-size: 18px !important; font-weight: 700 !important; color: #000 !important; margin-bottom: 8px !important; }
            .report-main-title { font-size: 16px !important; font-weight: 600 !important; color: #000 !important; }
            .report-date-range { font-size: 12px !important; color: #333 !important; margin-top: 4px !important; }
            .date-highlight { color: #333 !important; font-weight: 500 !important; }

            /* Table */
            .report-table { width: 100% !important; border-collapse: collapse !important; font-size: 11px !important; min-width: unset !important; }
            .report-table thead th {
                text-align: left !important; font-size: 10px !important; font-weight: 700 !important;
                color: #000 !important; padding: 8px 6px !important; border-bottom: 1.5px solid #999 !important;
                background: transparent !important; text-transform: capitalize !important; letter-spacing: 0 !important;
            }
            .report-table tbody td {
                padding: 7px 6px !important; border-bottom: 1px solid #ddd !important;
                color: #000 !important; font-size: 11px !important; white-space: normal !important;
            }
            .report-table tfoot td {
                padding: 8px 6px !important; font-weight: 700 !important;
                border-top: 1.5px solid #999 !important; background: transparent !important; color: #000 !important;
            }
            .report-table tbody tr:hover { background: transparent !important; }

            /* Fix overflow for wrapped tables */
            .report-table-wrapper { overflow: visible !important; }

            /* Remove link colors and status badge backgrounds */
            .vendor-link, .txn-link, .item-link, .link-cell, .amount-cell, .amount-negative, .value-blue { color: #000 !important; }
            .status-badge { background: transparent !important; color: #000 !important; padding: 0 !important; font-size: 11px !important; }
            a { color: #000 !important; text-decoration: none !important; }

            /* Page setup */
            @page { margin: 15mm; }
        }
    `;
    document.head.appendChild(printCSS);

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReportExport);
    } else {
        initReportExport();
    }

    function initReportExport() {
        // Find the Export button
        const exportBtn = document.querySelector('.btn-export');
        if (!exportBtn) return;

        // Remove standalone print button (the one with 🖨 next to Export)
        const topActions = exportBtn.closest('.top-bar-actions');
        if (topActions) {
            topActions.querySelectorAll('button').forEach(btn => {
                if (btn !== exportBtn && btn.textContent.includes('🖨')) {
                    btn.remove();
                }
            });
        }

        // Wrap the button in a container for dropdown positioning
        const wrapper = document.createElement('div');
        wrapper.className = 'export-wrapper';
        exportBtn.parentNode.insertBefore(wrapper, exportBtn);
        wrapper.appendChild(exportBtn);

        // Create dropdown menu
        const dropdown = document.createElement('div');
        dropdown.className = 'export-dropdown';
        dropdown.id = 'exportDropdown';
        dropdown.innerHTML = `
            <div class="export-dropdown-header">EXPORT AS</div>
            <button class="export-dropdown-item" data-export="pdf">PDF</button>
            <button class="export-dropdown-item" data-export="xlsx">XLSX (Microsoft Excel)</button>
            <button class="export-dropdown-item" data-export="xls">XLS (Microsoft Excel 1997-2004 Compatible)</button>
            <button class="export-dropdown-item" data-export="csv">CSV (Comma Separated Value)</button>
            <div class="export-dropdown-divider"></div>
            <div class="export-dropdown-header">PRINT</div>
            <button class="export-dropdown-item" data-export="print">Print</button>
        `;
        wrapper.appendChild(dropdown);

        // Toggle dropdown on click
        exportBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function () {
            dropdown.classList.remove('show');
        });

        // Handle export actions
        dropdown.addEventListener('click', function (e) {
            const item = e.target.closest('[data-export]');
            if (!item) return;
            e.stopPropagation();
            dropdown.classList.remove('show');

            const type = item.dataset.export;
            const table = document.querySelector('.report-table');
            const title = document.querySelector('.report-main-title');
            const reportTitle = title ? title.textContent.trim() : 'Report';

            switch (type) {
                case 'pdf':
                case 'print': window.print(); break;
                case 'xlsx': exportXLSX(table, reportTitle); break;
                case 'xls': exportXLS(table, reportTitle); break;
                case 'csv': exportCSV(table, reportTitle); break;
            }
        });
    }

    function getTableData(table) {
        const headers = [];
        const rows = [];

        const thElements = table.querySelectorAll('thead th');
        thElements.forEach(th => {
            headers.push(th.textContent.replace(/[↑↓]/g, '').trim());
        });

        const trElements = table.querySelectorAll('tbody tr');
        trElements.forEach(tr => {
            const row = [];
            tr.querySelectorAll('td').forEach(td => {
                row.push(td.textContent.trim());
            });
            if (row.length > 0 && row.some(c => c !== '')) {
                rows.push(row);
            }
        });

        const tfootTrs = table.querySelectorAll('tfoot tr');
        tfootTrs.forEach(tr => {
            if (tr.closest('tfoot').style.display === 'none') return;
            const row = [];
            tr.querySelectorAll('td').forEach(td => {
                row.push(td.textContent.trim());
            });
            if (row.length > 0) rows.push(row);
        });

        return { headers, rows };
    }

    function exportCSV(table, reportTitle) {
        const { headers, rows } = getTableData(table);
        let csv = headers.map(h => `"${h}"`).join(',') + '\n';
        rows.forEach(row => {
            csv += row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
        });
        downloadFile(csv, reportTitle + '.csv', 'text/csv;charset=utf-8;');
    }

    function exportXLSX(table, reportTitle) {
        const { headers, rows } = getTableData(table);
        const xmlContent = generateExcelXML(headers, rows, reportTitle);
        downloadFile(xmlContent, reportTitle + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    function exportXLS(table, reportTitle) {
        const { headers, rows } = getTableData(table);
        const xmlContent = generateExcelXML(headers, rows, reportTitle);
        downloadFile(xmlContent, reportTitle + '.xls', 'application/vnd.ms-excel');
    }

    function generateExcelXML(headers, rows, title) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<?mso-application progid="Excel.Sheet"?>\n';
        xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
        xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
        xml += '<Styles>\n';
        xml += '<Style ss:ID="header"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#F0F0F0" ss:Pattern="Solid"/></Style>\n';
        xml += '<Style ss:ID="default"><Font ss:Size="11"/></Style>\n';
        xml += '<Style ss:ID="total"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#FAFAFA" ss:Pattern="Solid"/></Style>\n';
        xml += '</Styles>\n';
        xml += `<Worksheet ss:Name="${title.substring(0, 31)}">\n<Table>\n`;

        xml += '<Row>\n';
        headers.forEach(h => {
            xml += `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXML(h)}</Data></Cell>\n`;
        });
        xml += '</Row>\n';

        rows.forEach((row, idx) => {
            const isLast = idx === rows.length - 1 && row[0] && row[0].toLowerCase().includes('total');
            const style = isLast ? 'total' : 'default';
            xml += '<Row>\n';
            row.forEach(cell => {
                const isNum = /^[\d,]+\.?\d*$/.test(cell.replace(/[PHP,]/g, ''));
                const numVal = cell.replace(/[PHP,\s]/g, '');
                if (isNum && !isNaN(parseFloat(numVal))) {
                    xml += `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${parseFloat(numVal)}</Data></Cell>\n`;
                } else {
                    xml += `<Cell ss:StyleID="${style}"><Data ss:Type="String">${escapeXML(cell)}</Data></Cell>\n`;
                }
            });
            xml += '</Row>\n';
        });

        xml += '</Table>\n</Worksheet>\n</Workbook>';
        return xml;
    }

    function escapeXML(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

})();

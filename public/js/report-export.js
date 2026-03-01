/**
 * Report Export Utility
 * Provides PDF, XLSX, XLS, CSV export and Print functionality for all report pages.
 * Auto-initializes on load. Include report-export.css for dropdown styling.
 */

(function () {
    'use strict';

    // Load html2pdf.js library from CDN for PDF export
    var html2pdfScript = document.createElement('script');
    html2pdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    document.head.appendChild(html2pdfScript);

    // Inject permanent print styles
    var printCSS = document.createElement('style');
    printCSS.textContent = '\
        @media print {\
            .report-top-bar, .filter-bar, #sidebarContainer, .sidebar,\
            .export-wrapper, .export-dropdown, .top-bar-actions,\
            .options-bar, .amount-note, .filter-more, .sort-icon, .customize-count { display: none !important; }\
            .content { margin-left: 0 !important; padding: 0 !important; }\
            .main-layout { display: block !important; }\
            body { background: #fff !important; margin: 0 !important; padding: 0 !important; font-size: 12px !important; }\
            .report-body { padding: 40px 30px !important; }\
            .report-header-section { text-align: center; margin-bottom: 30px !important; }\
            .company-name { font-size: 18px !important; font-weight: 700 !important; color: #000 !important; margin-bottom: 8px !important; }\
            .report-main-title { font-size: 16px !important; font-weight: 600 !important; color: #000 !important; }\
            .report-date-range { font-size: 12px !important; color: #333 !important; margin-top: 4px !important; }\
            .date-highlight { color: #333 !important; font-weight: 500 !important; }\
            .report-table { width: 100% !important; border-collapse: collapse !important; font-size: 11px !important; min-width: unset !important; }\
            .report-table thead th {\
                text-align: left !important; font-size: 10px !important; font-weight: 700 !important;\
                color: #000 !important; padding: 8px 6px !important; border-bottom: 1.5px solid #999 !important;\
                background: transparent !important; text-transform: capitalize !important; letter-spacing: 0 !important;\
            }\
            .report-table tbody td {\
                padding: 7px 6px !important; border-bottom: 1px solid #ddd !important;\
                color: #000 !important; font-size: 11px !important; white-space: normal !important;\
            }\
            .report-table tfoot td {\
                padding: 8px 6px !important; font-weight: 700 !important;\
                border-top: 1.5px solid #999 !important; background: transparent !important; color: #000 !important;\
            }\
            .report-table tbody tr:hover { background: transparent !important; }\
            .report-table-wrapper { overflow: visible !important; }\
            .vendor-link, .txn-link, .item-link, .link-cell, .amount-cell, .amount-negative, .value-blue { color: #000 !important; }\
            .status-badge { background: transparent !important; color: #000 !important; padding: 0 !important; font-size: 11px !important; }\
            a { color: #000 !important; text-decoration: none !important; }\
            @page { margin: 15mm; }\
        }\
    ';
    document.head.appendChild(printCSS);

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReportExport);
    } else {
        initReportExport();
    }

    function initReportExport() {
        var exportBtn = document.querySelector('.btn-export');
        if (!exportBtn) return;

        // Remove standalone print button
        var topActions = exportBtn.closest('.top-bar-actions');
        if (topActions) {
            topActions.querySelectorAll('button').forEach(function (btn) {
                if (btn !== exportBtn && btn.textContent.includes('\u{1F5A8}')) {
                    btn.remove();
                }
            });
        }

        // Wrap button for dropdown positioning
        var wrapper = document.createElement('div');
        wrapper.className = 'export-wrapper';
        exportBtn.parentNode.insertBefore(wrapper, exportBtn);
        wrapper.appendChild(exportBtn);

        // Create dropdown
        var dropdown = document.createElement('div');
        dropdown.className = 'export-dropdown';
        dropdown.id = 'exportDropdown';
        dropdown.innerHTML = '<div class="export-dropdown-header">EXPORT AS</div>'
            + '<button class="export-dropdown-item" data-export="pdf">PDF</button>'
            + '<button class="export-dropdown-item" data-export="xlsx">XLSX (Microsoft Excel)</button>'
            + '<button class="export-dropdown-item" data-export="xls">XLS (Microsoft Excel 1997-2004 Compatible)</button>'
            + '<button class="export-dropdown-item" data-export="csv">CSV (Comma Separated Value)</button>'
            + '<div class="export-dropdown-divider"></div>'
            + '<div class="export-dropdown-header">PRINT</div>'
            + '<button class="export-dropdown-item" data-export="print">Print</button>';
        wrapper.appendChild(dropdown);

        exportBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        document.addEventListener('click', function () {
            dropdown.classList.remove('show');
        });

        dropdown.addEventListener('click', function (e) {
            var item = e.target.closest('[data-export]');
            if (!item) return;
            e.stopPropagation();
            dropdown.classList.remove('show');

            var type = item.dataset.export;
            var table = document.querySelector('.report-table');
            var titleEl = document.querySelector('.report-main-title');
            var reportTitle = titleEl ? titleEl.textContent.trim() : 'Report';

            switch (type) {
                case 'pdf': exportPDF(reportTitle); break;
                case 'print': window.print(); break;
                case 'xlsx': exportXLSX(table, reportTitle); break;
                case 'xls': exportXLS(table, reportTitle); break;
                case 'csv': exportCSV(table, reportTitle); break;
            }
        });
    }

    function exportPDF(reportTitle) {
        if (typeof html2pdf === 'undefined') {
            alert('PDF library is still loading. Please try again in a moment.');
            return;
        }

        var reportBody = document.querySelector('.report-body');
        if (!reportBody) return;

        var clone = reportBody.cloneNode(true);
        clone.style.padding = '10px 20px';
        clone.style.background = '#fff';
        clone.style.fontFamily = 'Inter, Helvetica, Arial, sans-serif';

        // Remove UI-only elements
        clone.querySelectorAll('.options-bar, .amount-note, .sort-icon, .customize-count').forEach(function (el) { el.remove(); });

        // Make all colored text black
        clone.querySelectorAll('.vendor-link, .txn-link, .item-link, .link-cell, .amount-cell, .amount-negative, .value-blue, .date-highlight').forEach(function (el) {
            el.style.color = '#000';
        });

        // Remove status badge backgrounds
        clone.querySelectorAll('.status-badge').forEach(function (el) {
            el.style.background = 'transparent';
            el.style.color = '#000';
            el.style.padding = '0';
        });

        // Style company name
        var companyEl = clone.querySelector('.company-name');
        if (companyEl) { companyEl.style.color = '#000'; companyEl.style.fontSize = '18px'; companyEl.style.fontWeight = '700'; }

        // Style title and date
        var tEl = clone.querySelector('.report-main-title');
        if (tEl) { tEl.style.color = '#000'; }
        var dEl = clone.querySelector('.report-date-range');
        if (dEl) { dEl.style.color = '#333'; }
        clone.querySelectorAll('.date-highlight').forEach(function (el) { el.style.color = '#333'; });

        // Fix table for PDF
        var table = clone.querySelector('.report-table');
        if (table) {
            table.style.width = '100%';
            table.style.minWidth = 'unset';
            table.style.fontSize = '10px';
            table.querySelectorAll('th').forEach(function (th) {
                th.style.color = '#000'; th.style.background = 'transparent';
                th.style.fontSize = '9px'; th.style.padding = '6px 4px';
                th.style.borderBottom = '1.5px solid #999';
            });
            table.querySelectorAll('tbody td').forEach(function (td) {
                td.style.color = '#000'; td.style.padding = '5px 4px';
                td.style.borderBottom = '1px solid #ddd';
                td.style.fontSize = '10px'; td.style.whiteSpace = 'normal';
            });
            table.querySelectorAll('tfoot td').forEach(function (td) {
                td.style.color = '#000'; td.style.fontWeight = '700';
                td.style.borderTop = '1.5px solid #999'; td.style.background = 'transparent';
            });
        }

        var tableWrapper = clone.querySelector('.report-table-wrapper');
        if (tableWrapper) { tableWrapper.style.overflow = 'visible'; }

        // Generate PDF and download
        html2pdf().set({
            margin: [10, 10, 10, 10],
            filename: reportTitle + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        }).from(clone).save();
    }

    function getTableData(table) {
        var headers = [];
        var rows = [];

        table.querySelectorAll('thead th').forEach(function (th) {
            headers.push(th.textContent.replace(/[↑↓]/g, '').trim());
        });

        table.querySelectorAll('tbody tr').forEach(function (tr) {
            var row = [];
            tr.querySelectorAll('td').forEach(function (td) {
                row.push(td.textContent.trim());
            });
            if (row.length > 0 && row.some(function (c) { return c !== ''; })) {
                rows.push(row);
            }
        });

        table.querySelectorAll('tfoot tr').forEach(function (tr) {
            if (tr.closest('tfoot').style.display === 'none') return;
            var row = [];
            tr.querySelectorAll('td').forEach(function (td) {
                row.push(td.textContent.trim());
            });
            if (row.length > 0) rows.push(row);
        });

        return { headers: headers, rows: rows };
    }

    function exportCSV(table, reportTitle) {
        var data = getTableData(table);
        var csv = data.headers.map(function (h) { return '"' + h + '"'; }).join(',') + '\n';
        data.rows.forEach(function (row) {
            csv += row.map(function (cell) { return '"' + cell.replace(/"/g, '""') + '"'; }).join(',') + '\n';
        });
        downloadFile(csv, reportTitle + '.csv', 'text/csv;charset=utf-8;');
    }

    function exportXLSX(table, reportTitle) {
        var data = getTableData(table);
        var xml = generateExcelXML(data.headers, data.rows, reportTitle);
        downloadFile(xml, reportTitle + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    function exportXLS(table, reportTitle) {
        var data = getTableData(table);
        var xml = generateExcelXML(data.headers, data.rows, reportTitle);
        downloadFile(xml, reportTitle + '.xls', 'application/vnd.ms-excel');
    }

    function generateExcelXML(headers, rows, title) {
        var xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
            + '<?mso-application progid="Excel.Sheet"?>\n'
            + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n'
            + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
            + '<Styles>\n'
            + '<Style ss:ID="header"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#F0F0F0" ss:Pattern="Solid"/></Style>\n'
            + '<Style ss:ID="default"><Font ss:Size="11"/></Style>\n'
            + '<Style ss:ID="total"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#FAFAFA" ss:Pattern="Solid"/></Style>\n'
            + '</Styles>\n'
            + '<Worksheet ss:Name="' + title.substring(0, 31) + '">\n<Table>\n';

        xml += '<Row>\n';
        headers.forEach(function (h) {
            xml += '<Cell ss:StyleID="header"><Data ss:Type="String">' + escapeXML(h) + '</Data></Cell>\n';
        });
        xml += '</Row>\n';

        rows.forEach(function (row, idx) {
            var isLast = idx === rows.length - 1 && row[0] && row[0].toLowerCase().indexOf('total') >= 0;
            var style = isLast ? 'total' : 'default';
            xml += '<Row>\n';
            row.forEach(function (cell) {
                var cleanNum = cell.replace(/[PHP,\s]/g, '');
                var isNum = /^[\d,]+\.?\d*$/.test(cell.replace(/[PHP,]/g, ''));
                if (isNum && !isNaN(parseFloat(cleanNum))) {
                    xml += '<Cell ss:StyleID="' + style + '"><Data ss:Type="Number">' + parseFloat(cleanNum) + '</Data></Cell>\n';
                } else {
                    xml += '<Cell ss:StyleID="' + style + '"><Data ss:Type="String">' + escapeXML(cell) + '</Data></Cell>\n';
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
        var blob = new Blob([content], { type: mimeType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

})();

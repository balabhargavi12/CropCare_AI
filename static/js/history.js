// History page functionality
document.addEventListener('DOMContentLoaded', function() {
    console.log('History page loaded');
    
    // Initialize theme
    initializeTheme();
    
    // Setup download button
    const downloadBtn = document.getElementById('download-history');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadHistoryReport);
    }
    
    function downloadHistoryReport() {
        // Get table data
        const table = document.querySelector('.history-table table');
        if (!table) return;
        
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        const headerCells = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent);
        
        // Create CSV content
        let csvContent = headerCells.join(',') + '\n';
        
        rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td'));
            const rowData = cells.map(cell => {
                // Handle status cells specially
                if (cell.querySelector('.status')) {
                    return cell.querySelector('.status').textContent;
                }
                return '"' + cell.textContent.replace(/"/g, '""') + '"';
            });
            csvContent += rowData.join(',') + '\n';
        });
        
        // Create and download CSV file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const date = new Date().toISOString().slice(0, 10);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `crop-history-${date}.csv`;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
});
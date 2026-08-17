import * as XLSX from 'xlsx';

/**
 * Exporta un libro de Excel (WorkBook) como descarga de archivo .xlsx en el navegador web.
 * @param {XLSX.WorkBook} workbook
 * @param {string} defaultFileName
 * @returns {boolean}
 */
export const exportExcelFile = async (workbook, defaultFileName = 'export.xlsx') => {
    try {
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const uint8Array = new Uint8Array(wbout);
        const blob = new Blob([uint8Array], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = defaultFileName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 500);
        return true;
    } catch (err) {
        console.error("Error al exportar archivo Excel:", err);
        alert(`❌ Error al exportar archivo: ${err.message || err}`);
        return false;
    }
};

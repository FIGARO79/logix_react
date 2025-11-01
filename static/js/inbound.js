
document.addEventListener("DOMContentLoaded", () => {
    // --- Constants and Configuration ---
    const API_BASE_URL = "http://localhost:5000/api"; // para desarrollo local
    const dynamicUrls = {
        updateFiles: "/update",
        viewLogs: "/view_logs",
        viewReconciliation: "/reconciliation",
        stock: "/stock"
    };

    // --- DOM Elements ---
    const mainForm = document.getElementById("main-form");
    const packingListNumberInput = document.getElementById("packingListNumber");
    const waybillInput = document.getElementById("waybill");
    const itemCodeInput = document.getElementById("itemCode");
    const quantityInput = document.getElementById("quantity");
    const relocateBinInput = document.getElementById("relocateBin");
    const itemDescriptionDiv = document.getElementById("itemDescription");
    const binLocationDiv = document.getElementById("binLocation");
    const aditionalBinsDiv = document.getElementById("aditionalBins");
    const qtyReceivedDiv = document.getElementById("qtyReceived");
    const qtyGrnDiv = document.getElementById("qtyGrn");
    const differenceDiv = document.getElementById("difference");
    const labelItemCode = document.getElementById("labelItemCode");
    const labelItemDescription = document.getElementById("labelItemDescription");
    const labelQtyPackInput = document.getElementById("labelQtyPackInput");
    const labelQtyPackSpan = document.getElementById("labelQtyPackSpan");
    const labelWeight = document.getElementById("labelWeight");
    const labelReceptionDate = document.getElementById("labelReceptionDate");
    const labelBinLocation = document.getElementById("labelBinLocation");
    const qrCodeContainer = document.getElementById("qrCodeContainer");
    const logTable = document.getElementById("logTable");
    const logTableBody = document.getElementById("logTableBody");
    const findItemBtn = document.getElementById("findItemBtn");
    const printLabelBtn = document.getElementById("printLabelBtn");
    const addLogEntryBtn = document.getElementById("addLogEntryBtn");
    const exportLogBtn = document.getElementById("exportLogBtn");
    const emptyTableMessage = document.getElementById("emptyTableMessage");
    const toastContainer = document.getElementById("toast-container");
    const updateFilesBtn = document.getElementById("UpdateFilesBtn");
    const viewLogsLinkBtn = document.getElementById("viewLogsLinkBtn");
    const viewReconciliationBtn = document.getElementById("viewReconciliationBtn");
    // Scanner elements
    const scanItemCodeBtn = document.getElementById("scanItemCodeBtn");
    const scannerModal = document.getElementById('scanner-modal');
    const closeScannerBtn = document.getElementById('close-scanner-btn');

    // --- Global State Variables ---
    let currentItemData = null;
    let qrCodeInstance = null;
    let currentSortColumnIndex = 9;
    let currentSortDirection = "desc";
    let editingLogId = null;
    let html5QrCode = null;

    // --- SVG Icons ---
    const ICONS = {
        spinner: '<div class="spinner"></div>',
        search: '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" /></svg>',
        edit: '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>',
        delete: '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>',
        success: '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
        error: '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
        info: '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
    };

    // --- Functions ---

    function showToast(message, type = "info") {
        if (!toastContainer) return;
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        const icon = ICONS[type] || ICONS.info;
        toast.innerHTML = `<div class="toast-icon">${icon}</div><span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add("show"), 10);
        setTimeout(() => {
            toast.classList.remove("show");
            toast.addEventListener("transitionend", () => toast.remove());
        }, 5000);
    }

    function toggleButtonSpinner(button, isLoading, defaultContent) {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = ICONS.spinner;
        } else {
            button.disabled = false;
            button.innerHTML = defaultContent;
        }
    }

    async function findItemData(isEditing = false) {
        const code = itemCodeInput.value.trim().toUpperCase();
        const packingList = packingListNumberInput.value.trim().toUpperCase();

        if (!code) {
            if (!isEditing) {
                showToast("Por favor, ingrese un código de artículo.", "error");
            }
            return;
        }
        if (!packingList) {
            showToast("Por favor, ingrese el Packing List Number antes de buscar.", "error");
            return;
        }

        if (!isEditing) {
            showToast("Buscando artículo...", "info");
            currentItemData = null;
        }
        toggleButtonSpinner(findItemBtn, true, `<span>Buscar</span>${ICONS.search}`);
        try {
            const response = await fetch(`${API_BASE_URL}/find_item/${encodeURIComponent(code)}/${encodeURIComponent(packingList)}`);
            const data = await response.json();
            if (response.ok) {
                currentItemData = isEditing ? { ...currentItemData, ...data } : data;
                itemDescriptionDiv.textContent = currentItemData.description || "N/A";
                binLocationDiv.textContent = currentItemData.binLocation || "N/A";
                aditionalBinsDiv.textContent = currentItemData.aditionalBins || "N/A";
                if (!isEditing) qtyReceivedDiv.textContent = quantityInput.value || "0";
                qtyGrnDiv.textContent = currentItemData.defaultQtyGrn !== undefined ? currentItemData.defaultQtyGrn : "N/A";
                showToast(`Artículo "${currentItemData.description || code}" encontrado.`, "success");
                calculateDifference();
                updateLabel(currentItemData);
                if (!isEditing) {
                    quantityInput.focus();
                    quantityInput.select();
                }
            } else {
                showToast(data.error, "error");
                if (!isEditing) clearItemSpecificFields();
            }
        } catch (error) {
            showToast("Error de conexión al buscar.", "error");
            if (!isEditing) clearItemSpecificFields();
        } finally {
            toggleButtonSpinner(findItemBtn, false, `<span>Buscar</span>${ICONS.search}`);
            checkFormValidity();
        }
    }

    function clearItemSpecificFields() {
        try {
            if (itemCodeInput) itemCodeInput.value = "";
            if (quantityInput) quantityInput.value = "";
            if (relocateBinInput) relocateBinInput.value = "";
            if (itemDescriptionDiv) itemDescriptionDiv.textContent = "";
            if (binLocationDiv) binLocationDiv.textContent = "";
            if (aditionalBinsDiv) aditionalBinsDiv.textContent = "";
            if (qtyReceivedDiv) qtyReceivedDiv.textContent = "";
            if (qtyGrnDiv) qtyGrnDiv.textContent = "";
            if (differenceDiv) {
                differenceDiv.textContent = "";
                differenceDiv.classList.remove("text-red-600", "text-blue-600", "font-bold");
            }
            clearLabel();
            currentItemData = null;
            if (itemCodeInput && !editingLogId) itemCodeInput.focus();
            checkFormValidity();
        } catch (error) {
            console.error("Error crítico en clearItemSpecificFields:", error);
            // Opcional: mostrar un toast si esta función es crítica
            // showToast("Error al limpiar los campos del item.", "error");
        }
    }

    function clearLabel() {
        if (labelItemCode) labelItemCode.textContent = "ITEM CODE";
        if (labelItemDescription) labelItemDescription.textContent = "Item Description";
        if (labelQtyPackInput) labelQtyPackInput.value = "1";
        if (labelQtyPackSpan) labelQtyPackSpan.textContent = "1";
        if (labelWeight) labelWeight.textContent = "N/A";
        if (labelReceptionDate) labelReceptionDate.textContent = "DD/MM/YY";
        if (labelBinLocation) labelBinLocation.textContent = "BIN";
        if (qrCodeContainer) qrCodeContainer.innerHTML = '<div class="qr-placeholder">QR Code</div>';
        qrCodeInstance = null;
    }

    function calculateDifference() {
        const received = parseInt(quantityInput.value || "0", 10);
        const grn = parseInt(qtyGrnDiv.textContent || "0", 10);
        if (qtyReceivedDiv) qtyReceivedDiv.textContent = isNaN(received) ? "0" : received;
        if (isNaN(received) || isNaN(grn) || !differenceDiv) return;
        const diff = received - grn;
        differenceDiv.textContent = diff;
        differenceDiv.classList.remove("text-red-600", "text-blue-600", "font-bold");
        if (diff < 0) differenceDiv.classList.add("text-red-600", "font-bold");
        else if (diff > 0) differenceDiv.classList.add("text-blue-600", "font-bold");
    }

    function updateLabel(item) {
        const itemToDisplay = item || currentItemData || {};
        const currentQuantity = quantityInput.value || "1";
        if (labelItemCode) labelItemCode.textContent = itemToDisplay.itemCode || "ITEM CODE";
        if (labelItemDescription) labelItemDescription.textContent = itemToDisplay.description || "Item Description";
        if (labelQtyPackInput) labelQtyPackInput.value = currentQuantity;
        if (labelQtyPackSpan) labelQtyPackSpan.textContent = currentQuantity;
        if (labelWeight) labelWeight.textContent = !isNaN(parseFloat(itemToDisplay.weight)) ? parseFloat(itemToDisplay.weight).toFixed(2) : "N/A";
        if (labelReceptionDate) {
            const today = new Date();
            labelReceptionDate.textContent = today.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit" });
        }
        if (labelBinLocation) labelBinLocation.textContent = relocateBinInput.value.trim().toUpperCase() || itemToDisplay.binLocation || "BIN";
        generateQRCode(itemToDisplay.itemCode || "");
    }

    function generateQRCode(text) {
        if (!qrCodeContainer) return;
        qrCodeContainer.innerHTML = "";
        if (text) {
            try {
                qrCodeInstance = new QRCode(qrCodeContainer, { text, width: 96, height: 96, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
            } catch (e) { qrCodeContainer.innerHTML = '<div class="qr-placeholder">Error QR</div>'; }
        } else {
            qrCodeContainer.innerHTML = '<div class="qr-placeholder">QR Code</div>';
        }
    }

    async function addLogEntry() {
        if (!mainForm.checkValidity()) {
            showToast("Verifique todos los campos obligatorios antes de añadir.", "error");
            return;
        }
        const logData = {
            packingListNumber: packingListNumberInput.value.trim().toUpperCase(),
            waybill: waybillInput.value.trim().toUpperCase(),
            itemCode: currentItemData.itemCode,
            quantity: parseInt(quantityInput.value),
            relocateBin: relocateBinInput.value.trim().toUpperCase(),
            currentBinLocation: binLocationDiv.textContent.trim()
        };
        showToast("Añadiendo registro...", "info");
        toggleButtonSpinner(addLogEntryBtn, true, '<span>Añadir Registro</span>');
        try {
            const response = await fetch(`${API_BASE_URL}/add_log`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logData) });
            const result = await response.json();
            if (response.ok) {
                showToast(result.message || "Registro añadido.", "success");
                if (result.entry?.id !== undefined) {
                    addLogRowToTable(result.entry);
                    sortTableByColumn(currentSortColumnIndex, currentSortDirection, true);
                } else { await loadInitialLogs(); }
                clearItemSpecificFields();
                packingListNumberInput.focus();
            } else {
                showToast(result.error || `Error ${response.status}`, "error");
            }
        } catch (error) {
            showToast("Error de conexión al añadir.", "error");
        } finally {
            toggleButtonSpinner(addLogEntryBtn, false, '<span>Añadir Registro</span>');
        }
    }

    function addLogRowToTable(entry) {
        if (!logTableBody || entry?.id === undefined) return;
        const newRow = logTableBody.insertRow(0);
        newRow.setAttribute('data-log-id', entry.id);
        newRow.className = "hover:bg-gray-100 transition-colors duration-150";

        const createCell = (text) => {
            const cell = newRow.insertCell();
            cell.textContent = text || "-";
            cell.classList.add('whitespace-nowrap');
            return cell;
        };

        createCell(entry.packingListNumber);
        createCell(entry.waybill);
        createCell(entry.itemCode);
        const descCell = createCell(entry.itemDescription);
        descCell.classList.remove('whitespace-nowrap');
        descCell.classList.add('whitespace-normal');
        createCell(entry.binLocation);
        createCell(entry.relocatedBin);
        createCell(entry.qtyReceived);
        createCell(entry.qtyGrn);
        const diffCell = createCell(entry.difference);
        if (entry.difference < 0) diffCell.classList.add("text-red-600", "font-bold");
        else if (entry.difference > 0) diffCell.classList.add("text-blue-600", "font-bold");
        const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString("es-CO", { hour12: false }) : "-";
        createCell(timestamp);

        const actionsCell = newRow.insertCell();
        actionsCell.className = "text-center whitespace-nowrap";
        const editButton = document.createElement("button");
        editButton.className = "action-btn edit-btn";
        editButton.innerHTML = ICONS.edit;
        editButton.onclick = () => populateFormForEdit(entry);

        const deleteButton = document.createElement("button");
        deleteButton.className = "action-btn delete-btn ml-2";
        deleteButton.innerHTML = ICONS.delete;
        deleteButton.onclick = () => deleteLog(entry.id);

        actionsCell.appendChild(editButton);
        actionsCell.appendChild(deleteButton);

        checkTableEmpty();
    }

    async function deleteLog(logId) {
        if (!confirm(`¿Está seguro de que desea eliminar el registro ID: ${logId}?`)) return;

        showToast(`Eliminando registro ${logId}...`, "info");
        try {
            const response = await fetch(`${API_BASE_URL}/delete_log/${logId}`, { method: "DELETE" });
            const result = await response.json();
            if (response.ok) {
                showToast(result.message || "Registro eliminado.", "success");
                const row = logTableBody.querySelector(`tr[data-log-id='${logId}']`);
                if (row) row.remove();
                checkTableEmpty();
            } else {
                showToast(result.error || `Error ${response.status}`, "error");
            }
        } catch (error) {
            showToast("Error de conexión al eliminar.", "error");
        }
    }

    async function populateFormForEdit(logEntry) {
        editingLogId = logEntry.id;
        packingListNumberInput.readOnly = true;
        itemCodeInput.readOnly = true;
        packingListNumberInput.value = logEntry.packingListNumber;
        itemCodeInput.value = logEntry.itemCode;
        await findItemData(true);
        waybillInput.value = logEntry.waybill || "";
        quantityInput.value = logEntry.qtyReceived;
        relocateBinInput.value = logEntry.relocatedBin || "";
        qtyReceivedDiv.textContent = logEntry.qtyReceived;
        if (!qtyGrnDiv.textContent || qtyGrnDiv.textContent === "N/A") {
            qtyGrnDiv.textContent = logEntry.qtyGrn !== undefined ? logEntry.qtyGrn : "N/A";
        }
        calculateDifference();
        addLogEntryBtn.querySelector("span").textContent = "Guardar Cambios";
        let cancelBtn = document.getElementById("cancelEditBtn");
        if (!cancelBtn) {
            cancelBtn = document.createElement("button");
            cancelBtn.id = "cancelEditBtn";
            cancelBtn.textContent = "Cancelar Edición";
            cancelBtn.className = "btn-secondary w-60 h-10 ml-2";
            addLogEntryBtn.parentNode.insertBefore(cancelBtn, addLogEntryBtn.nextSibling);
            cancelBtn.onclick = () => cancelEditMode(false);
        }
        cancelBtn.style.display = "inline-flex";
        showToast(`Editando registro ID: ${editingLogId}`, "info");
        window.scrollTo(0, 0);
        checkFormValidity();
    }

    function cancelEditMode(isAfterUpdate = false) {
        try {
            editingLogId = null;
            if (addLogEntryBtn.querySelector("span")) {
                addLogEntryBtn.querySelector("span").textContent = "Añadir Registro";
            }
            packingListNumberInput.readOnly = false;
            itemCodeInput.readOnly = false;
            const cancelBtn = document.getElementById("cancelEditBtn");
            if (cancelBtn) cancelBtn.style.display = "none";
            
            clearItemSpecificFields(); // Llamamos a la función que también protegeremos
            
            if (!isAfterUpdate) showToast("Edición cancelada.", "info");
            packingListNumberInput.focus();
        } catch (error) {
            console.error("Error crítico en cancelEditMode:", error);
            showToast("Error al limpiar el formulario.", "error");
        }
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        if (editingLogId) await handleUpdateLogEntry();
        else await addLogEntry();
    }

    async function handleUpdateLogEntry() {
        if (!editingLogId) return;
        const quantityVal = parseInt(quantityInput.value);
        if (isNaN(quantityVal) || quantityVal < 0) {
            showToast("La cantidad debe ser un número válido.", "error"); return;
        }
        const logDataToUpdate = {
            waybill: waybillInput.value.trim().toUpperCase(),
            qtyReceived: quantityVal,
            relocateBin: relocateBinInput.value.trim().toUpperCase()
        };
        showToast(`Actualizando registro ID: ${editingLogId}...`, "info");
        toggleButtonSpinner(addLogEntryBtn, true, '<span>Guardar Cambios</span>');
        try {
            const response = await fetch(`${API_BASE_URL}/update_log/${editingLogId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logDataToUpdate) });
            const result = await response.json();
            if (response.ok) {
                showToast(result.message || "Registro actualizado.", "success");
                if (result.entry?.id !== undefined) updateTableRow(editingLogId, result.entry);
                else await loadInitialLogs();
                cancelEditMode(true);
            } else {
                showToast(result.error || `Error ${response.status}`, "error");
            }
        } catch (error) {
            showToast("Error de conexión al actualizar.", "error");
        } finally {
            toggleButtonSpinner(addLogEntryBtn, false, '<span>Añadir Registro</span>');
        }
    }

    function updateTableRow(logId, updatedEntry) {
        try {
            const row = logTableBody.querySelector(`tr[data-log-id='${logId}']`);
            if (row && row.cells.length >= 10) { // Añadimos una verificación de seguridad
                row.cells[1].textContent = updatedEntry.waybill || "-";
                row.cells[5].textContent = updatedEntry.relocatedBin || "-";
                row.cells[6].textContent = updatedEntry.qtyReceived;
                row.cells[7].textContent = updatedEntry.qtyGrn;
                const diffCell = row.cells[8];
                diffCell.textContent = updatedEntry.difference;
                diffCell.classList.remove("text-red-600", "text-blue-600", "font-bold");
                if (updatedEntry.difference < 0) diffCell.classList.add("text-red-600", "font-bold");
                else if (updatedEntry.difference > 0) diffCell.classList.add("text-blue-600", "font-bold");
                row.cells[9].textContent = new Date(updatedEntry.timestamp).toLocaleString("es-CO", { hour12: false });
            } else {
                console.error(`No se encontró la fila con ID ${logId} o su estructura es incorrecta. Recargando tabla.`);
                loadInitialLogs();
            }
        } catch (error) {
            console.error("Error al actualizar la fila en la tabla:", error);
            showToast(`Error al refrescar la fila ID ${logId}.`, "error");
            // Como alternativa, recargamos toda la tabla para asegurar consistencia
            loadInitialLogs();
        }
}

    async function loadInitialLogs() {
        showToast("Cargando registros...", "info");
        try {
            const response = await fetch(`${API_BASE_URL}/get_logs`);
            if (response.ok) {
                const logs = await response.json();
                logTableBody.innerHTML = "";
                logs.forEach(addLogRowToTable);
                updateSortIndicators(currentSortColumnIndex, currentSortDirection);
                sortTableByColumn(currentSortColumnIndex, currentSortDirection, true);
                showToast("Registros cargados.", "success");
            } else {
                const errorData = await response.json().catch(() => ({ error: `Error ${response.status}` }));
                showToast(errorData.error, "error");
            }
        } catch (error) {
            showToast("Error de conexión al cargar registros.", "error");
        } finally {
            checkTableEmpty();
        }
    }

    function checkTableEmpty() {
        if (emptyTableMessage) emptyTableMessage.classList.toggle("hidden", logTableBody.rows.length > 0);
    }

    function printLabel() {
        if (!currentItemData) { showToast("Busque un artículo para imprimir.", "error"); return; }
        if (labelQtyPackInput && labelQtyPackSpan) labelQtyPackSpan.textContent = labelQtyPackInput.value || "1";
        window.print();
        showToast("Diálogo de impresión abierto.", "info");
    }

    function getCellValue(cell, columnIndex) {
        const value = cell.textContent.trim();
        // Columns for Qty. Received, Qty. Expected, Difference
        if ([6, 7, 8].includes(columnIndex)) {
            return parseFloat(value) || -Infinity;
        }
        // Column for Timestamp
        if (columnIndex === 9) {
            try {
                // Format is "DD/MM/YYYY, HH:MM:SS"
                const [datePart] = value.split(',');
                const [day, month, year] = datePart.split('/');
                // new Date() expects MM/DD/YYYY, so we rearrange
                const isoDateString = `${month}/${day}/${year}`;
                return new Date(isoDateString).getTime() || 0;
            } catch (e) { 
                return 0; // Return a default value if parsing fails
            }
        }
        return value.toLowerCase();
    }

    function sortTableByColumn(columnIndex, initialDirection = "asc", forceDirection = false) {
        let direction = initialDirection;
        if (!forceDirection && columnIndex === currentSortColumnIndex) {
            direction = currentSortDirection === "asc" ? "desc" : "asc";
        }
        currentSortColumnIndex = columnIndex;
        currentSortDirection = direction;
        const rows = Array.from(logTableBody.rows);
        rows.sort((rowA, rowB) => {
            const valA = getCellValue(rowA.cells[columnIndex], columnIndex);
            const valB = getCellValue(rowB.cells[columnIndex], columnIndex);
            const comparison = valA > valB ? 1 : (valA < valB ? -1 : 0);
            return direction === "desc" ? comparison * -1 : comparison;
        });
        logTableBody.innerHTML = "";
        rows.forEach(row => logTableBody.appendChild(row));
        updateSortIndicators(columnIndex, direction);
    }

    function updateSortIndicators(activeIndex, direction) {
        logTable.querySelectorAll("thead th.sortable-header").forEach((header, index) => {
            header.classList.remove("sort-asc", "sort-desc");
            if (index === activeIndex) header.classList.add(direction === "asc" ? "sort-asc" : "sort-desc");
        });
    }

    async function exportLogToExcel() {
        if (logTableBody.rows.length === 0) { showToast("No hay datos para exportar.", "error"); return; }
        showToast("Generando Excel...", "info");
        try {
            const response = await fetch(`${API_BASE_URL}/export_log`);
            if (response.ok) {
                const blob = await response.blob();
                const disposition = response.headers.get("Content-Disposition");
                let filename = "inbound_log.xlsx";
                if (disposition) {
                    const match = disposition.match(new RegExp("filename[^;=\\n]*=((['\\\".*?\\2|[^;\\n]*))"));
                    if (match?.[1]) filename = match[1].replace(/['"]/g, "");
                }
                triggerDownload(blob, filename);
                showToast("Excel listo para descarga.", "success");
            } else {
                const errorData = await response.json().catch(() => ({ error: `Error ${response.status}` }));
                showToast(errorData.error, "error");
            }
        } catch (error) { showToast("Error de conexión al exportar.", "error"); }
    }

    function triggerDownload(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    }

    function checkFormValidity() {
        const isItemDataPresent = !!currentItemData;
        const isPackingList = !!packingListNumberInput.value.trim();
        const isWaybill = !!waybillInput.value.trim();
        const isQuantity = parseInt(quantityInput.value) > 0;

        addLogEntryBtn.disabled = !(isItemDataPresent && isPackingList && isWaybill && isQuantity);
        printLabelBtn.disabled = !isItemDataPresent;
    }

    // --- Barcode Scanner Logic ---
    function onScanSuccess(decodedText, decodedResult) {
        stopScanning();
        itemCodeInput.value = decodedText;
        findItemData();
    }

    function onScanFailure(error) {
        // Ignorar errores continuos del escáner
    }

    function stopScanning() {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(err => console.error("Fallo al detener el escáner.", err));
        }
        scannerModal.classList.add('hidden');
    }

    // --- Event Listeners Setup ---
    findItemBtn?.addEventListener("click", () => findItemData(false));
    itemCodeInput?.addEventListener("keypress", e => { if (e.key === 'Enter') { e.preventDefault(); findItemData(false); } });
    quantityInput?.addEventListener("input", () => {
        calculateDifference();
        if (labelQtyPackInput) labelQtyPackInput.value = quantityInput.value || "1";
        if (labelQtyPackSpan) labelQtyPackSpan.textContent = quantityInput.value || "1";
        checkFormValidity();
    });
    relocateBinInput?.addEventListener("input", () => {
        if (currentItemData && labelBinLocation) {
            labelBinLocation.textContent = relocateBinInput.value.trim().toUpperCase() || currentItemData.binLocation || "N/A";
        }
    });
    mainForm?.addEventListener("submit", handleFormSubmit);
    printLabelBtn?.addEventListener("click", printLabel);
    exportLogBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        exportLogToExcel();
    });
    viewReconciliationBtn?.addEventListener("click", e => { e.preventDefault(); window.location.href = dynamicUrls.viewReconciliation; });
    updateFilesBtn?.addEventListener("click", e => { e.preventDefault(); window.location.href = dynamicUrls.updateFiles; });
    viewLogsLinkBtn?.addEventListener("click", e => { e.preventDefault(); window.location.href = dynamicUrls.viewLogs; });
    labelQtyPackInput?.addEventListener("input", () => { if (labelQtyPackSpan) labelQtyPackSpan.textContent = labelQtyPackInput.value || "1"; });
    logTable?.querySelector("thead")?.addEventListener("click", e => {
        const header = e.target.closest("th.sortable-header");
        if (header) sortTableByColumn(parseInt(header.dataset.columnIndex));
    });

    scanItemCodeBtn?.addEventListener('click', () => {
        scannerModal.classList.remove('hidden');
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("reader");
        }
        html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 150 } },
            onScanSuccess,
            onScanFailure
        ).catch(err => {
            showToast("No se pudo iniciar la cámara. Asegúrate de dar los permisos necesarios.", "error");
            stopScanning();
        });
    });

    closeScannerBtn?.addEventListener('click', stopScanning);

    // Initial setup
    [packingListNumberInput, waybillInput, itemCodeInput, quantityInput].forEach(input => {
        input?.addEventListener('input', checkFormValidity);
    });
    clearLabel();
    itemCodeInput?.focus();
    loadInitialLogs();
    checkFormValidity();
});

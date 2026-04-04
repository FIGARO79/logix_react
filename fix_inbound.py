import re

with open('/home/fabio/logix_chile/frontend/src/pages/Inbound.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports and title
content = content.replace(
    "import { getDB } from '../utils/offlineDb';",
    "import { getDB, savePendingSync } from '../utils/offlineDb';"
)
content = content.replace(
    'useEffect(() => { setTitle("Inbound"); }, [setTitle]);',
    'useEffect(() => { setTitle("Recepción"); }, [setTitle]);\n\n    const sandvikLogoBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABJgAAADUCAYAAADQgZm0AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAK92lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDMgNzkuOTY5MGE4N2ZjLCAyMDI1LzAzLzA2LTIwOjUwOjE2ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtbG5zOnRpZmY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vdGlmZi8xLjAvIiB4bWxuczpleGlmPSJodHRwOi8vbnMuYWRvYmUuY29tL2V4aWYvMS4wLyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgV2ViICgyMDI1LjguMS4wIDMxNmYxNGNmYzhjKSAoR29vZ2xlIENocm9tZSkiIHhtcDpDcmVhdGVEYXRlPSIyMDI1LTA1LTAxVDIwOjQ5OjQ0LTA1OjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyNS0wNS0wMVQyMDo1MjowOS0wNTowMCIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyNS0wNS0wMVQyMDo1MjowOS0wNTowMCIgZGM6Zm9ybWF0PSJpbWFnZS9wbmciIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NzdhYjJmMjEtNWQ0Yi00Nzk0LWJkOWYtMzE3ZjY4ZWVkOTI3IiB4bXBNTTpEb2N1bWVudElEPSJhZG9iZTpkb2NpZDpwaG90b3Nob3A6ZDQ0OWIzM2ItNjM1Zi05OTRmLTg4YTAtYjIyYTgxZWViNWZhIiB4bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ9InhtcC5kaWQ6NzFiYjdjNmQtNzhmNy00ZmIxLWI3NzktOTdlYzUyMDRhNjUxIiB0aWZmOk9yaWVudGF0aW9uPSIxIiB0aWZmOlhSZXNvbHV0aW9uPSI5NjAwMDAvMTAwMDAiIHRpZmY6WVJlc29sdXRpb249Ijk2MDAwMC8xMDAwMCIgdGlmZjpSZXNvbHV0aW9uVW5pdD0iMiIgZXhpZjpDb2xvclNwYWNlPSI2NTUzNSIgZXhpZjpQaXhlbFhEaW1lbnNpb249IjExNzYiIGV4aWY6UGl4ZWxZRGltZW5zaW9uPSIyMTIiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjcxYmI3YzZkLTc4ZjctNGZiMS1iNzc5LTk3ZWM1MjA0YTY1MSIgc3RFdnQ6d2hlbj0iMjAyNS0wNS0wMVQyMDo0OTo0NC0wNTowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIFdlYiAoMjAyNS44LjEuMCAzMTZmMTRjZmM4YykgKEdvb2dsZSBDaHJvbWUpIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDo2NzczNjhjOC04N2VjLTQzYTYtOWRlMS00MDk3MzZiMjhmNzAiIHN0RXZ0OndoZW49IjIwMjUtMDUtMDFUMjA6NTE6MzYtMDU6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCBXZWIgKDIwMjUuOC4xLjAgMzE2ZjE0Y2ZjOGMpIChHb29nbGUgQ2hyb21lKSIgc3RFdnQ6Y2hhbmdlZD0iLyIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0ic2F2ZWQiIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6MzZiZjQxNWYtZjlkMi00MWI4LWE4OWMtZmEwMDIzMmQyOTM4IiBzdEV2dDp3aGVuPSIyMDI1LTA1LTAxVDIwOjUyOjA5LTA1OjAwIiBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgV2ViICgyMDI1LjguMS4wIDMxNmYxNGNmYzhjKSAoR29vZ2xlIENocm9tZSkiIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4gPHJkZjpsaSBzdEV2dDphY3Rpb249ImNvbnZlcnRlZCIgc3RFdnQ6cGFyYW1ldGVycz0iZnJvbSBkb2N1bWVudC92bmQuYWRvYmUuY3BzZCtkY3ggdG8gaW1hZ2UvcG5nIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJkZXJpdmVkIiBzdEV2dDpwYXJhbWV0ZXJzPSJjb252ZXJ0ZWQgZnJvbSBkb2N1bWVudC92bmQuYWRvYmUuY3BzZCtkY3ggdG8gaW1hZ2UvcG5nIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDo3N2FiMmYyMS01ZDRiLTQ3OTQtYmQ5Zi0zMTdmNjhlZWQ5MjciIHN0RXZ0OndoZW49IjIwMjUtMDUtMDFUMjA6NTI6MDktMDU6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCBXZWIgKDIwMjUuOC4xLjAgMzE2ZjE0Y2ZjOGMpIChHb29nbGUgQ2hyb21lKSIgc3RFdnQ6Y2hhbmdlZD0iLyIvPiA8L3JkZjpTZXE+IDwveG1wTU06SGlzdG9yeT4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6MzZiZjQxNWYtZjlkMi00MWI4LWE4OWMtZmEwMDIzMmQyOTM4IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOjcxYmI3YzZkLTc4ZjctNGZiMS1iNzc5LTk3ZWM1MjA0YTY1MSIgc3RSZWY6b3JpZ2luYWxEb2N1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";'
)

# 2. Remove hourglass emoji
content = content.replace(
    "{log.isPending && '⏳ '}{log.itemDescription}",
    "{log.itemDescription}"
)

# 3. Replace the handleSaveLog payload
old_payload = """        const payload = {
            importReference: importRef.trim().toUpperCase(),
            waybill: waybill.trim().toUpperCase(),
            itemCode: itemData.itemCode,
            itemDescription: itemData.description,
            quantity: parseInt(quantity),
            relocatedBin: relocatedBin.trim().toUpperCase(),
            client_id: targetClientId
        };"""

new_payload = """        const payload = {
            importReference: importRef.trim().toUpperCase(),
            waybill: waybill.trim().toUpperCase(),
            itemCode: itemData.itemCode,
            itemDescription: itemData.description,
            quantity: parseInt(quantity),
            qtyReceived: parseInt(quantity),
            relocatedBin: relocatedBin.trim().toUpperCase(),
            binLocation: itemData.binLocation,
            qtyGrn: itemData.defaultQtyGrn,
            client_id: targetClientId
        };"""
content = content.replace(old_payload, new_payload)

# 4. Replace db.put with savePendingSync in handleSaveLog
old_put_1 = "await db.put('pending_sync', { id: editId, payload, timestamp: new Date().toISOString() });"
new_put_1 = "await savePendingSync('inbound', payload, editId);"
content = content.replace(old_put_1, new_put_1)

old_put_2 = """            await db.put('pending_sync', {
                id: payload.client_id,
                payload,
                timestamp: new Date().toISOString(),
                editId: typeof editId === 'number' ? editId : null
            });"""
new_put_2 = "            await savePendingSync('inbound', payload, typeof editId === 'number' ? editId : null);"
content = content.replace(old_put_2, new_put_2)

# 5. Update image src in handlePrint
content = content.replace(
    '<img src="/static/images/logoytpe_sandvik.png" alt="Sandvik" class="label-logo" />',
    '<img src="${sandvikLogoBase64}" alt="Sandvik" class="label-logo" />'
)

with open('frontend/src/pages/Inbound.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Reparación quirúrgica completada.')

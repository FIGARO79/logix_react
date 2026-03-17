import os
import time
from playwright.sync_api import sync_playwright
from app.core.config import PO_EXTRACTOR_EXCEL_PATH

REPORT_URL = "https://sandvik-controltower.azurewebsites.net/Report/PurchaseOrderExtractor"

def run_po_robot(start_date: str, end_date: str):
    """
    Ejecuta el robot de Playwright con selectores robustos y fechas dinámicas.
    start_date, end_date deben venir en formato MM/DD/YYYY o DD/MM/YYYY según 
    requiera KendoUI (esperamos que la UI nos lo mande listo, por defecto DD/MM/YYYY o DD-MM-YYYY).
    """
    with sync_playwright() as p:
        print(f"🔧 Iniciando navegador Chromium para periodo {start_date} a {end_date}...", flush=True)
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        try:
            print(f"🚀 Accediendo a {REPORT_URL}...", flush=True)
            # Timeout extendido para carga inicial en Azure
            try:
                page.goto(REPORT_URL, wait_until="load", timeout=120000)
            except Exception as e:
                print(f"⚠️ Warning en goto: {e}. Intentando continuar...", flush=True)
            
            print("⏳ Esperando renderizado inicial (10s)...", flush=True)
            time.sleep(10)
            
            # Diagnóstico visual inicial
            page.screenshot(path="debug_initial.png")
            print("📸 Captura 'debug_initial.png' guardada.", flush=True)

            print("📝 Llenando formulario...", flush=True)

            # 1. Fechas ATD (usando los IDs exactos provistos)
            print(f"   Llenando 'Data Range ATD' ({start_date} - {end_date})...", flush=True)
            
            # KendoUI requiere simular escritura humana para registrar el cambio
            page.locator("#Form_StartDate").click()
            page.locator("#Form_StartDate").clear()
            page.keyboard.type(start_date, delay=50)
            page.keyboard.press("Enter")

            page.locator("#Form_EndDate").click()
            page.locator("#Form_EndDate").clear()
            page.keyboard.type(end_date, delay=50)
            page.keyboard.press("Enter")
            
            # 2. Selección de Chile (usando el ID exacto)
            print("🇨🇱 Seleccionando Chile...", flush=True)
            colombia_check = page.locator("#Form_SelectedCountries_2__IsSelected")
            colombia_check.scroll_into_view_if_needed()
            # El evento check es nativo de playwright para checkboxes
            colombia_check.check(force=True)

            # 3. Exportar (usando el input con name='Form.Export')
            print("💾 Buscando botón Export...", flush=True)
            btn = page.locator("input[name='Form.Export']")
            btn.scroll_into_view_if_needed()
            btn.wait_for(state="visible", timeout=10000)
            print("🚀 Iniciando descarga...", flush=True)

            try:
                # Vamos a capturar la pantalla justo al darle click para ver si hay un error de validación (e.g. fechas)
                with page.expect_download(timeout=180000) as download_info:
                    print("🚀 Dando click y esperando evento de descarga (3 mins max)...", flush=True)
                    # CRÍTICO: no_wait_after=True para evitar que Playwright haga timeout esperando respuesta del POST
                    btn.click(force=True, no_wait_after=True)
                    # NO usar wait_for_timeout ni screenshot aquí porque la página se queda bloqueada cargando el archivo!
                
                download = download_info.value
                download.save_as(PO_EXTRACTOR_EXCEL_PATH)
                print(f"✅ Descarga completada: {PO_EXTRACTOR_EXCEL_PATH}", flush=True)
                browser.close()
                return True, "Archivo actualizado correctamente."
            except Exception as download_err:
                print(f"⚠️ Error en descarga: {download_err}", flush=True)
                # Revisar si el archivo es reciente (modificado en los últimos 5 minutos)
                if os.path.exists(PO_EXTRACTOR_EXCEL_PATH) and (time.time() - os.path.getmtime(PO_EXTRACTOR_EXCEL_PATH) < 300):
                     print("📂 Archivo detectado manualmente como reciente.", flush=True)
                     browser.close()
                     return True, "Archivo actualizado (Detección manual)."
                
                # Tomar captura final para ver si hubo un mensaje de error
                page.screenshot(path="debug_error_final.png")
                print("📸 Captura 'debug_error_final.png' guardada.", flush=True)
                browser.close()
                raise download_err

        except Exception as e:
            error_path = "error_robot.png"
            page.screenshot(path=error_path)
            browser.close()
            print(f"❌ Error: {str(e)}", flush=True)
            return False, f"Error: {str(e)}"

if __name__ == "__main__":
    success, msg = run_po_robot()
    print(msg, flush=True)

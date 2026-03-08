import os
import time
from playwright.sync_api import sync_playwright
from app.core.config import PO_EXTRACTOR_EXCEL_PATH

REPORT_URL = "https://sandvik-controltower.azurewebsites.net/Report/PurchaseOrderExtractor"

def run_po_robot():
    """
    Ejecuta el robot de Playwright con selectores mejorados y manejo de errores.
    """
    with sync_playwright() as p:
        # Usamos un user_agent real para evitar bloqueos básicos
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        try:
            print(f"🚀 Accediendo a {REPORT_URL}...")
            page.goto(REPORT_URL, wait_until="networkidle", timeout=60000)
            
            # Esperar a que el cuerpo de la página esté listo
            page.wait_for_load_state("domcontentloaded")
            time.sleep(2) # Pausa breve para renderizado de JS

            print("📝 Llenando formulario...")

            # 1. Intentar llenar las fechas AAF (01-01-2026 a 31-12-2026)
            # Buscamos todos los inputs de fecha y tomamos el tercer bloque (según imagen)
            date_inputs = page.locator("input[placeholder*='date'], input[type='text']")
            count = date_inputs.count()
            print(f"   Inputs detectados: {count}")

            # Basado en la imagen, hay 6 inputs de fecha (3 pares). AAF es el último par.
            if count >= 6:
                date_inputs.nth(4).fill("01-01-2026") # AAF Start
                date_inputs.nth(5).fill("31-12-2026") # AAF End
            else:
                # Intento alternativo por posición si hay menos
                page.locator("input").nth(5).fill("01-01-2026")
                page.locator("input").nth(6).fill("31-12-2026")

            # 2. Seleccionar Colombia
            print("🇨🇴 Seleccionando Colombia...")
            # Buscamos el checkbox o el label que diga Colombia
            colombia_selector = "text='Colombia'"
            page.wait_for_selector(colombia_selector, timeout=10000)
            page.click(colombia_selector)

            # 3. Hacer clic en Export
            print("💾 Buscando botón Export...")
            # Intentar localizar el botón por ID común de ASP.NET o texto
            export_button = page.locator("button:has-text('Export'), input[type='submit'][value='Export'], #btnExport")
            
            # Asegurarnos de que el botón sea visible y estable
            export_button.first.wait_for(state="visible", timeout=30000)
            
            print("🖱️ Haciendo clic en Export (Esperando generación del archivo)...")
            
            # Aumentamos el timeout a 5 minutos (300,000 ms) porque los reportes de Sandvik pueden ser pesados
            try:
                with page.expect_download(timeout=300000) as download_info:
                    # Usamos click forzado para evitar problemas de capas invisibles
                    export_button.first.click(force=True)
                
                download = download_info.value
                download.save_as(PO_EXTRACTOR_EXCEL_PATH)
                print(f"✅ Descarga completada y guardada en: {PO_EXTRACTOR_EXCEL_PATH}")
                browser.close()
                return True, "Archivo actualizado correctamente."
            except Exception as download_err:
                print(f"⚠️ Error esperando descarga: {download_err}")
                # Si falló la detección pero crees que se descargó, verificamos si el archivo apareció
                time.sleep(10) # Esperar un poco más por si acaso
                if os.path.exists(PO_EXTRACTOR_EXCEL_PATH):
                     print("📂 El archivo apareció en la carpeta de destino a pesar del error de timeout.")
                     browser.close()
                     return True, "Archivo actualizado (Detección manual tras timeout)."
                raise download_err

        except Exception as e:
            # CAPTURA DE PANTALLA DE ERROR (Muy útil para diagnóstico)
            error_path = "error_robot.png"
            page.screenshot(path=error_path)
            browser.close()
            print(f"❌ Error: {str(e)}")
            print(f"📸 Captura de pantalla guardada en: {os.path.abspath(error_path)}")
            return False, f"Error: {str(e)}"

if __name__ == "__main__":
    success, msg = run_po_robot()
    print(msg)

import os
import asyncio
from playwright.async_api import async_playwright
from app.core.config import PO_EXTRACTOR_EXCEL_PATH, INSTANCE_FOLDER

REPORT_URL = "https://sandvik-controltower.azurewebsites.net/Report/PurchaseOrderExtractor"

async def run_po_robot(start_date: str, end_date: str):
    """
    Ejecuta el robot de Playwright de forma asíncrona con selectores robustos y fechas dinámicas.
    """
    # Asegurar que la carpeta de debug existe
    debug_dir = os.path.join(INSTANCE_FOLDER, 'debug_robot')
    os.makedirs(debug_dir, exist_ok=True)
    
    print(f"🤖 [ROBOT] Iniciando tarea para {start_date} - {end_date}...", flush=True)
    async with async_playwright() as p:
        print(f"🔧 [ROBOT] Navegador Chromium...", flush=True)
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        try:
            print(f"🚀 [ROBOT] Accediendo a {REPORT_URL}...", flush=True)
            try:
                await page.goto(REPORT_URL, wait_until="load", timeout=120000)
                print(f"📍 [ROBOT] URL actual: {page.url}", flush=True)
            except Exception as e:
                print(f"⚠️ [ROBOT] Warning en goto: {e}. Intentando continuar...", flush=True)
            
            print("⏳ [ROBOT] Esperando renderizado (10s)...", flush=True)
            await asyncio.sleep(10)
            
            initial_snap = os.path.join(debug_dir, "debug_initial.png")
            await page.screenshot(path=initial_snap)
            print(f"📸 [ROBOT] Captura '{initial_snap}' guardada.", flush=True)

            print("📝 [ROBOT] Llenando formulario...", flush=True)

            # 1. Fechas ATD
            print(f"   ➤ [ROBOT] Fecha Inicio: {start_date}", flush=True)
            await page.locator("#Form_StartDate").click()
            await page.locator("#Form_StartDate").clear()
            await page.keyboard.type(start_date, delay=50)
            await page.keyboard.press("Enter")

            print(f"   ➤ [ROBOT] Fecha Fin: {end_date}", flush=True)
            await page.locator("#Form_EndDate").click()
            await page.locator("#Form_EndDate").clear()
            await page.keyboard.type(end_date, delay=50)
            await page.keyboard.press("Enter")
            
            # 2. Selección de Chile
            print("🇨🇱 [ROBOT] Seleccionando Chile...", flush=True)
            chile_check = page.locator("#Form_SelectedCountries_2__IsSelected")
            await chile_check.scroll_into_view_if_needed()
            await chile_check.check(force=True)

            # 3. Exportar
            print("💾 [ROBOT] Buscando botón Export...", flush=True)
            btn = page.locator("input[name='Form.Export']")
            await btn.scroll_into_view_if_needed()
            await btn.wait_for(state="visible", timeout=10000)
            
            print("🚀 [ROBOT] Iniciando descarga...", flush=True)
            try:
                async with page.expect_download(timeout=180000) as download_info:
                    print("🚀 [ROBOT] Click en Export y esperando...", flush=True)
                    await btn.click(force=True, no_wait_after=True)
                
                download = await download_info.value
                await download.save_as(PO_EXTRACTOR_EXCEL_PATH)
                print(f"✅ [ROBOT] Descarga completada en {PO_EXTRACTOR_EXCEL_PATH}", flush=True)
                await browser.close()
                return True, "Archivo actualizado correctamente."
            except Exception as download_err:
                print(f"⚠️ [ROBOT] Error en descarga: {download_err}", flush=True)
                if os.path.exists(PO_EXTRACTOR_EXCEL_PATH) and (asyncio.get_event_loop().time() - os.path.getmtime(PO_EXTRACTOR_EXCEL_PATH) < 300):
                     print("📂 [ROBOT] Archivo reciente detectado.", flush=True)
                     await browser.close()
                     return True, "Archivo actualizado (Detección manual)."
                
                err_snap = os.path.join(debug_dir, "debug_error_final.png")
                await page.screenshot(path=err_snap)
                await browser.close()
                return False, f"Error en descarga: {str(download_err)}"

        except Exception as e:
            error_snap = os.path.join(debug_dir, "error_robot.png")
            await page.screenshot(path=error_snap)
            await browser.close()
            print(f"❌ [ROBOT] Error general: {str(e)}", flush=True)
            return False, f"Error: {str(e)}"

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Uso: python po_robot.py <start_date> <end_date>")
        sys.exit(1)
    
    async def main():
        success, msg = await run_po_robot(sys.argv[1], sys.argv[2])
        print(msg)
    
    asyncio.run(main())

import os
import asyncio
from datetime import datetime, timedelta
import polars as pl
from playwright.async_api import async_playwright
from app.core.config import PO_EXTRACTOR_EXCEL_PATH, INSTANCE_FOLDER

REPORT_URL = "https://sandvik-controltower.azurewebsites.net/Report/PurchaseOrderExtractor"

async def run_po_robot(start_date: str, end_date: str):
    """
    Ejecuta el robot de Playwright de forma asíncrona con selectores robustos y fechas dinámicas.
    Divide la consulta en bloques de hasta 30 días para evitar lentitudes y timeouts en Azure.
    """
    # Asegurar que la carpeta de debug existe
    debug_dir = os.path.join(INSTANCE_FOLDER, 'debug_robot')
    os.makedirs(debug_dir, exist_ok=True)
    
    print(f"🤖 [ROBOT] Iniciando tarea para {start_date} - {end_date}...", flush=True)
    
    # Parsear fechas y dividir en bloques de máximo 30 días
    try:
        start_dt = datetime.strptime(start_date, "%d/%m/%Y").date()
        end_dt = datetime.strptime(end_date, "%d/%m/%Y").date()
    except Exception as date_err:
        print(f"❌ [ROBOT] Error en formato de fechas: {date_err}", flush=True)
        return False, f"Formato de fecha inválido: {date_err}. Use DD/MM/YYYY."

    ranges = []
    current_start = start_dt
    max_days = 30
    while current_start <= end_dt:
        current_end = min(current_start + timedelta(days=max_days - 1), end_dt)
        ranges.append((current_start.strftime("%d/%m/%Y"), current_end.strftime("%d/%m/%Y")))
        current_start = current_end + timedelta(days=1)
        
    print(f"📅 [ROBOT] El periodo seleccionado se dividió en {len(ranges)} bloques de máximo {max_days} días.", flush=True)
    
    temp_files = []
    
    async with async_playwright() as p:
        print(f"🔧 [ROBOT] Navegador Chromium...", flush=True)
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--disable-setuid-sandbox",
                "--no-sandbox",
                "--no-zygote"
            ]
        )
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
            
            print("⏳ [ROBOT] Esperando renderizado del selector de países...", flush=True)
            try:
                await page.wait_for_selector("#Form_SelectedCountries_2__IsSelected", timeout=30000)
            except Exception as wait_err:
                print(f"⚠️ [ROBOT] Warning esperando selector: {wait_err}. Continuando...", flush=True)
            
            initial_snap = os.path.join(debug_dir, "debug_initial.png")
            await page.screenshot(path=initial_snap)
            print(f"📸 [ROBOT] Captura '{initial_snap}' guardada.", flush=True)

            # Selección de Chile (se realiza una vez y persiste en la página)
            print("[ROBOT] Seleccionando Chile...", flush=True)
            chile_check = page.locator("#Form_SelectedCountries_2__IsSelected")
            await chile_check.scroll_into_view_if_needed()
            await chile_check.check(force=True)

            # Iterar y descargar cada bloque
            for idx, (sub_start, sub_end) in enumerate(ranges):
                print(f"📝 [ROBOT] Procesando bloque {idx+1}/{len(ranges)}: {sub_start} a {sub_end}...", flush=True)
                
                # Rellenar Fecha Inicio (Teclado físico simulado rápido)
                print(f"   ➤ [ROBOT] Fecha Inicio: {sub_start}", flush=True)
                start_input = page.locator("#Form_StartDate")
                await start_input.click()
                await start_input.clear()
                await page.keyboard.type(sub_start, delay=15)
                await page.keyboard.press("Enter")
                
                # Rellenar Fecha Fin (Teclado físico simulado rápido)
                print(f"   ➤ [ROBOT] Fecha Fin: {sub_end}", flush=True)
                end_input = page.locator("#Form_EndDate")
                await end_input.click()
                await end_input.clear()
                await page.keyboard.type(sub_end, delay=15)
                await page.keyboard.press("Enter")
                
                # Esperar 0.5 segundos para estabilidad del DatePicker de Sandvik
                await asyncio.sleep(0.5)
                
                # Obtener el botón de exportación
                btn = page.locator("input[name='Form.Export']")
                await btn.scroll_into_view_if_needed()
                await btn.wait_for(state="visible", timeout=10000)
                
                # Captura de pantalla de debug del bloque
                block_snap = os.path.join(debug_dir, f"debug_block_{idx+1}.png")
                await page.screenshot(path=block_snap)
                print(f"📸 [ROBOT] Captura de bloque guardada: {block_snap}", flush=True)

                print(f"🚀 [ROBOT] Iniciando descarga del bloque {idx+1}...", flush=True)
                try:
                    async with page.expect_download(timeout=120000) as download_info:
                        await btn.click(force=True, no_wait_after=True)
                    
                    download = await download_info.value
                    temp_path = os.path.join(INSTANCE_FOLDER, f"temp_po_{idx}.xlsx")
                    await download.save_as(temp_path)
                    print(f"✅ [ROBOT] Bloque {idx+1} descargado correctamente en {temp_path}", flush=True)
                    temp_files.append(temp_path)
                except Exception as block_err:
                    print(f"⚠️ [ROBOT] Error al descargar bloque {idx+1}: {block_err}", flush=True)
                    # Tomar captura de error
                    err_snap = os.path.join(debug_dir, f"debug_error_block_{idx+1}.png")
                    await page.screenshot(path=err_snap)
                    # Propagar error para que no consolidemos datos incompletos
                    raise block_err
                
                # Esperar 0.5 segundos de cortesía entre consultas
                await asyncio.sleep(0.5)

            # Consolidar todos los excels usando Polars
            print("🔄 [ROBOT] Consolidando bloques Excel...", flush=True)
            dfs = []
            for temp_path in temp_files:
                try:
                    df = pl.read_excel(temp_path)
                    if len(df) > 0:
                        dfs.append(df)
                    # Eliminar archivo temporal una vez leído
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                except Exception as read_err:
                    print(f"⚠️ [ROBOT] Error al procesar archivo temporal {temp_path}: {read_err}", flush=True)
            
            if dfs:
                df_consolidated = pl.concat(dfs, how="vertical")
                # Eliminar duplicados si es necesario (generalmente los rangos no se solapan, pero por seguridad)
                df_consolidated = df_consolidated.unique()
                df_consolidated.write_excel(PO_EXTRACTOR_EXCEL_PATH)
                msg_success = f"Actualización completa. Consolidados {len(dfs)} bloques con un total de {len(df_consolidated)} registros."
                print(f"✅ [ROBOT] {msg_success}", flush=True)
                await browser.close()
                return True, msg_success
            else:
                print("⚠️ [ROBOT] No se extrajeron registros en ningún bloque del periodo.", flush=True)
                await browser.close()
                return False, "No se obtuvieron registros de PO en el periodo especificado."

        except Exception as e:
            error_snap = os.path.join(debug_dir, "error_robot.png")
            await page.screenshot(path=error_snap)
            await browser.close()
            print(f"❌ [ROBOT] Error general en el proceso: {str(e)}", flush=True)
            return False, f"Error: {str(e)}"
            
        finally:
            # Limpieza de cualquier archivo temporal que haya quedado por fallo
            for temp_path in temp_files:
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except:
                        pass

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Uso: python po_robot.py <start_date> <end_date>")
        sys.exit(1)
    
    async def main():
        success, msg = await run_po_robot(sys.argv[1], sys.argv[2])
        print(msg)
    
    asyncio.run(main())

import os
import asyncio
from datetime import datetime, timedelta
import polars as pl
from playwright.async_api import async_playwright
from app.core.config import PO_EXTRACTOR_EXCEL_PATH, INSTANCE_FOLDER

REPORT_URL = "https://sandvik-controltower.azurewebsites.net/Report/PurchaseOrderExtractor"

async def run_po_robot(start_date: str, end_date: str, status_cb=None):
    """
    Ejecuta el robot de Playwright de forma asíncrona con selectores robustos y fechas dinámicas.
    Divide la consulta en bloques de hasta 30 días para evitar lentitudes y timeouts en Azure.
    """
    def update_status(msg: str):
        print(f"🤖 [ROBOT] {msg}", flush=True)
        if status_cb:
            try:
                status_cb(msg)
            except Exception:
                pass

    # Asegurar que la carpeta de debug existe
    debug_dir = os.path.join(INSTANCE_FOLDER, 'debug_robot')
    os.makedirs(debug_dir, exist_ok=True)
    
    update_status(f"Iniciando tarea para {start_date} - {end_date}...")
    
    # Parsear fechas y dividir en bloques de máximo 30 días
    try:
        start_dt = datetime.strptime(start_date, "%d/%m/%Y").date()
        end_dt = datetime.strptime(end_date, "%d/%m/%Y").date()
    except Exception as date_err:
        err_msg = f"Formato de fecha inválido: {date_err}. Use DD/MM/YYYY."
        print(f"❌ [ROBOT] {err_msg}", flush=True)
        return False, err_msg

    ranges = []
    current_start = start_dt
    max_days = 30
    while current_start <= end_dt:
        current_end = min(current_start + timedelta(days=max_days - 1), end_dt)
        ranges.append((current_start.strftime("%d/%m/%Y"), current_end.strftime("%d/%m/%Y")))
        current_start = current_end + timedelta(days=1)
        
    update_status(f"Periodo dividido en {len(ranges)} bloque(s) de hasta {max_days} días.")
    
    temp_files = []
    
    async with async_playwright() as p:
        browser = None
        page = None
        try:
            update_status("Iniciando navegador Chromium...")
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

            update_status(f"Accediendo al portal Sandvik Control Tower...")
            try:
                await page.goto(REPORT_URL, wait_until="load", timeout=90000)
            except Exception as e:
                print(f"⚠️ [ROBOT] Warning en goto: {e}. Intentando continuar...", flush=True)
            
            update_status("Esperando formulario y opciones de país...")
            try:
                await page.wait_for_selector("#Form_SelectedCountries_2__IsSelected", timeout=30000)
            except Exception as wait_err:
                print(f"⚠️ [ROBOT] Warning esperando selector: {wait_err}. Continuando...", flush=True)
            
            initial_snap = os.path.join(debug_dir, "debug_initial.png")
            await page.screenshot(path=initial_snap)

            # Selección de Chile
            update_status("Seleccionando filtro de país: Chile...")
            chile_check = page.locator("#Form_SelectedCountries_2__IsSelected")
            await chile_check.scroll_into_view_if_needed()
            await chile_check.check(force=True)

            # Iterar y descargar cada bloque
            for idx, (sub_start, sub_end) in enumerate(ranges):
                update_status(f"Procesando bloque {idx+1}/{len(ranges)}: {sub_start} a {sub_end}...")
                
                val_start = sub_start.replace("/", "-")
                val_end = sub_end.replace("/", "-")

                # Asignación directa en DOM/jQuery para no romper el datepicker de Sandvik
                await page.evaluate("""({start, end}) => {
                    const s = document.querySelector("#Form_StartDate");
                    const e = document.querySelector("#Form_EndDate");
                    if (s) {
                        s.value = start;
                        s.dispatchEvent(new Event('input', { bubbles: true }));
                        s.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    if (e) {
                        e.value = end;
                        e.dispatchEvent(new Event('input', { bubbles: true }));
                        e.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    if (window.$) {
                        try { $('#Form_StartDate').val(start).trigger('change'); } catch(err) {}
                        try { $('#Form_EndDate').val(end).trigger('change'); } catch(err) {}
                        try { $('.datepicker').hide(); } catch(err) {}
                    }
                    document.querySelectorAll('.datepicker.dropdown-menu').forEach(el => el.style.display = 'none');
                }""", {"start": val_start, "end": val_end})

                # Rellenar también con Playwright para asegurar estado de form
                start_input = page.locator("#Form_StartDate")
                await start_input.fill(val_start)
                
                end_input = page.locator("#Form_EndDate")
                await end_input.fill(val_end)

                # Limpiar filtro de Orden de Compra individual si existiera
                try:
                    po_search = page.locator("#Form_PurchaseOrderSearch")
                    if await po_search.count() > 0:
                        await po_search.fill("")
                except Exception:
                    pass
                
                # Cerrar calendarios flotantes
                await page.keyboard.press("Escape")
                await asyncio.sleep(0.3)
                
                # Re-verificar que Chile continúe marcado
                if not await chile_check.is_checked():
                    await chile_check.check(force=True)

                # Obtener el botón de exportación
                btn = page.locator("input[name='Form.Export']")
                await btn.scroll_into_view_if_needed()
                await btn.wait_for(state="visible", timeout=10000)
                
                # Captura de pantalla de debug del bloque
                block_snap = os.path.join(debug_dir, f"debug_block_{idx+1}.png")
                await page.screenshot(path=block_snap)

                update_status(f"Descargando datos del bloque {idx+1}/{len(ranges)}...")
                try:
                    async with page.expect_download(timeout=60000) as download_info:
                        await btn.click(force=True, no_wait_after=True)
                        # Comprobar de inmediato si aparece alerta de validación
                        await asyncio.sleep(1.0)
                        alert_el = page.locator(".alert-danger, .validation-summary-errors")
                        if await alert_el.count() > 0 and await alert_el.is_visible():
                            err_text = await alert_el.inner_text()
                            if err_text.strip():
                                err_snap = os.path.join(debug_dir, f"debug_error_block_{idx+1}.png")
                                await page.screenshot(path=err_snap)
                                raise RuntimeError(f"Alerta del portal Sandvik: {err_text.strip()}")
                    
                    download = await download_info.value
                    temp_path = os.path.join(INSTANCE_FOLDER, f"temp_po_{idx}.xlsx")
                    await download.save_as(temp_path)
                    file_size_kb = os.path.getsize(temp_path) // 1024
                    update_status(f"Bloque {idx+1}/{len(ranges)} descargado ({file_size_kb} KB).")
                    temp_files.append(temp_path)
                except Exception as block_err:
                    print(f"⚠️ [ROBOT] Error al descargar bloque {idx+1}: {block_err}", flush=True)
                    err_snap = os.path.join(debug_dir, f"debug_error_block_{idx+1}.png")
                    try:
                        await page.screenshot(path=err_snap)
                    except Exception:
                        pass
                    raise block_err
                
                await asyncio.sleep(0.5)

            # Consolidar todos los excels usando Polars
            update_status(f"Consolidando {len(temp_files)} archivo(s) Excel descargados...")
            dfs = []
            for temp_path in temp_files:
                try:
                    df = pl.read_excel(temp_path)
                    if len(df) > 0:
                        dfs.append(df)
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                except Exception as read_err:
                    print(f"⚠️ [ROBOT] Error al procesar archivo temporal {temp_path}: {read_err}", flush=True)
            
            if dfs:
                df_consolidated = pl.concat(dfs, how="vertical").unique()
                df_consolidated.write_excel(PO_EXTRACTOR_EXCEL_PATH)
                msg_success = f"Descarga completa: consolidados {len(dfs)} bloques ({len(df_consolidated)} registros)."
                update_status(msg_success)
                if browser is not None:
                    await browser.close()
                return True, msg_success
            else:
                msg_empty = "No se extrajeron registros de PO en el periodo especificado."
                print(f"⚠️ [ROBOT] {msg_empty}", flush=True)
                if browser is not None:
                    await browser.close()
                return False, msg_empty

        except Exception as e:
            if page is not None:
                try:
                    error_snap = os.path.join(debug_dir, "error_robot.png")
                    await page.screenshot(path=error_snap)
                except Exception:
                    pass
            if browser is not None:
                try:
                    await browser.close()
                except Exception:
                    pass
            err_msg = f"Error en el robot: {str(e)}"
            print(f"❌ [ROBOT] {err_msg}", flush=True)
            return False, err_msg
            
        finally:
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

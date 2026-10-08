import os
import time
import asyncio
from typing import Optional, Callable, Awaitable, Any, Tuple
import orjson
from playwright.async_api import async_playwright
from app.core.config import PO_EXTRACTOR_EXCEL_PATH, INSTANCE_FOLDER

REPORT_URL = (
    "https://sandvik-controltower.azurewebsites.net/Report/PurchaseOrderExtractor"
)

ROBOT_STATUS_FILE = os.path.join(INSTANCE_FOLDER, "po_robot_status.json")


def get_persisted_robot_status() -> dict:
    """
    Lee el estado del robot compartido entre los diferentes workers de Granian.
    Si la tarea lleva más de 360 segundos en ejecución sin actualización, la marca como timeout.
    """
    if not os.path.exists(ROBOT_STATUS_FILE):
        return {"status": "idle", "message": "", "task_id": None, "updated_at": 0}
    try:
        with open(ROBOT_STATUS_FILE, "rb") as f:
            data = orjson.loads(f.read())
            if not isinstance(data, dict):
                return {"status": "idle", "message": "", "task_id": None, "updated_at": 0}

            # Liveness check: timeout de 360s si quedó colgado en running
            if data.get("status") == "running":
                updated_at = data.get("updated_at", 0)
                if time.time() - updated_at > 360:
                    data["status"] = "error"
                    data["message"] = "Tiempo límite excedido (Timeout del proceso en segundo plano)."
                    set_persisted_robot_status(
                        status="error",
                        message=data["message"],
                        task_id=data.get("task_id"),
                    )
            return data
    except Exception as e:
        print(f"[ROBOT STATUS READ ERROR] {e}", flush=True)
        return {"status": "idle", "message": "", "task_id": None, "updated_at": 0}


def set_persisted_robot_status(
    status: str,
    message: str,
    task_id: Optional[str] = None,
    **kwargs: Any,
) -> dict:
    """
    Escribe atómicamente el estado del robot en disco para garantizar
    visibilidad inmediata entre los workers de Granian sin condiciones de carrera.
    """
    os.makedirs(INSTANCE_FOLDER, exist_ok=True)
    payload = {
        "status": status,
        "message": message,
        "task_id": task_id,
        "updated_at": time.time(),
        **kwargs,
    }
    tmp_file = f"{ROBOT_STATUS_FILE}.tmp.{os.getpid()}"
    try:
        with open(tmp_file, "wb") as f:
            f.write(orjson.dumps(payload, option=orjson.OPT_INDENT_2))
        os.replace(tmp_file, ROBOT_STATUS_FILE)
    except Exception as e:
        print(f"[ROBOT STATUS WRITE ERROR] {e}", flush=True)
        if os.path.exists(tmp_file):
            try:
                os.remove(tmp_file)
            except Exception:
                pass
    return payload


async def run_po_robot(
    start_date: str,
    end_date: str,
    progress_callback: Optional[Callable[[str], Awaitable[None]]] = None,
) -> Tuple[bool, str]:
    """
    Ejecuta el robot de Playwright de forma asíncrona con selectores robustos y fechas dinámicas.
    Reporta progreso mediante progress_callback.
    """
    debug_dir = os.path.join(INSTANCE_FOLDER, "debug_robot")
    os.makedirs(debug_dir, exist_ok=True)

    async def report(step_text: str):
        print(f"[ROBOT] {step_text}", flush=True)
        if progress_callback:
            try:
                await progress_callback(step_text)
            except Exception as cb_err:
                print(f"[ROBOT CB ERR] {cb_err}", flush=True)

    await report(f"Iniciando tarea para {start_date} - {end_date}...")

    async with async_playwright() as p:
        await report("Iniciando navegador Chromium...")
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        try:
            await report("Accediendo al portal de Control Tower...")
            try:
                await page.goto(REPORT_URL, wait_until="load", timeout=120000)
                print(f"📍 [ROBOT] URL actual: {page.url}", flush=True)
            except Exception as e:
                print(f"[ROBOT] Warning en goto: {e}. Intentando continuar...", flush=True)

            await report("Esperando renderizado de la página...")
            await asyncio.sleep(10)

            initial_snap = os.path.join(debug_dir, "debug_initial.png")
            await page.screenshot(path=initial_snap)

            await report(f"Llenando formulario con fechas ({start_date} a {end_date})...")

            # 1. Fechas ATD
            await page.locator("#Form_StartDate").click()
            await page.locator("#Form_StartDate").clear()
            await page.keyboard.type(start_date, delay=50)
            await page.keyboard.press("Enter")

            await page.locator("#Form_EndDate").click()
            await page.locator("#Form_EndDate").clear()
            await page.keyboard.type(end_date, delay=50)
            await page.keyboard.press("Enter")

            # 2. Selección de Colombia
            await report("Seleccionando filtro de país (Colombia)...")
            colombia_check = page.locator("#Form_SelectedCountries_3__IsSelected")
            await colombia_check.scroll_into_view_if_needed()
            await colombia_check.check(force=True)

            # 3. Exportar
            await report("Localizando botón de exportación...")
            btn = page.locator("input[name='Form.Export']")
            await btn.scroll_into_view_if_needed()
            await btn.wait_for(state="visible", timeout=10000)

            await report("Solicitando reporte y esperando descarga...")
            try:
                async with page.expect_download(timeout=180000) as download_info:
                    print("[ROBOT] Click en Export y esperando archivo...", flush=True)
                    await btn.click(force=True, no_wait_after=True)

                download = await download_info.value
                await report("Descarga recibida. Guardando archivo en base de datos...")
                await download.save_as(PO_EXTRACTOR_EXCEL_PATH)

                # Forzar actualización de timestamp mtime al instante exacto
                try:
                    os.utime(PO_EXTRACTOR_EXCEL_PATH, None)
                except Exception:
                    pass

                print(f"[ROBOT] Descarga completada en {PO_EXTRACTOR_EXCEL_PATH}", flush=True)
                await browser.close()
                return True, "Archivo de compras descargado correctamente desde el portal."
            except Exception as download_err:
                print(f"[ROBOT] Error en descarga: {download_err}", flush=True)
                err_snap = os.path.join(debug_dir, "debug_error_final.png")
                try:
                    await page.screenshot(path=err_snap)
                except Exception:
                    pass
                await browser.close()
                return False, f"Error en descarga: {str(download_err)}"

        except Exception as e:
            error_snap = os.path.join(debug_dir, "error_robot.png")
            try:
                await page.screenshot(path=error_snap)
            except Exception:
                pass
            await browser.close()
            print(f"[ROBOT] Error general: {str(e)}", flush=True)
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


"""
Servicio para la lógica de conciliación de Inbound y snapshots optimizado con Polars.
Unifica la lógica de la vista web y la exportación de Excel, respetando las líneas individuales del Reporte 280.
"""

import datetime
import orjson
import os
import time
import polars as pl
from typing import List, Optional, Dict, Any
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import db_logs, csv_handler
from app.models.sql_models import (
    ReconciliationHistory,
    GRNMaster,
    SavedGRNReconciliation,
    SavedGRNReconciliationItem,
)
from app.core.config import PO_LOOKUP_JSON_PATH, GRN_JSON_DATA_PATH

# --- Caché en memoria para optimizar el polling de conciliación activa ---
_ACTIVE_RECONCILIATION_CACHE: Optional[List[Dict[str, Any]]] = None
_LAST_CACHE_TIME: float = 0.0
_CACHE_TTL: float = 30.0  # 30 segundos TTL de respaldo


def invalidate_reconciliation_cache():
    """Invalida la caché en memoria de la conciliación activa para forzar recálculo inmediato."""
    global _ACTIVE_RECONCILIATION_CACHE, _LAST_CACHE_TIME
    _ACTIVE_RECONCILIATION_CACHE = None
    _LAST_CACHE_TIME = 0.0


async def get_reconciliation_calculations(
    db: AsyncSession, archive_date: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Ejecuta los cálculos de conciliación cruzando el Reporte 280 con los Logs de Inbound.
    Valida la integridad usando la tríada: IR + Item + Order Number (Customer Ref).
    """
    global _ACTIVE_RECONCILIATION_CACHE, _LAST_CACHE_TIME

    # Si se consulta la conciliación activa y la caché está fresca, responder al instante (0 ms)
    if archive_date is None and _ACTIVE_RECONCILIATION_CACHE is not None:
        if (time.time() - _LAST_CACHE_TIME) < _CACHE_TTL:
            return _ACTIVE_RECONCILIATION_CACHE

    try:
        await csv_handler.reload_cache_if_needed()

        # 1. Obtener Logs (Lo recibido físicamente)
        logs_list = await (
            db_logs.load_archived_log_data_db_async(db, archive_date)
            if archive_date
            else db_logs.load_log_data_db_async(db)
        )
        if not logs_list:
            print("[RECONCILIATION] No hay registros de log para procesar.")
            if archive_date is None:
                _ACTIVE_RECONCILIATION_CACHE = []
                _LAST_CACHE_TIME = time.time()
            return []

        logs_pl = pl.from_dicts(logs_list)

        master_desc_map = csv_handler.master_desc_map or {}

        def resolve_item_description(item_code: Any, existing_desc: Any = None) -> str:
            code_clean = str(item_code or "").strip().upper()
            if existing_desc is not None:
                desc_str = str(existing_desc).strip()
                if (
                    desc_str
                    and desc_str.lower() not in ("none", "nan", "null", "")
                    and not desc_str.lower().startswith("no en")
                ):
                    return desc_str
            master_desc = master_desc_map.get(code_clean)
            if master_desc is not None:
                m_str = str(master_desc).strip()
                if (
                    m_str
                    and m_str.lower() not in ("none", "nan", "null", "")
                    and not m_str.lower().startswith("no en")
                ):
                    return m_str
            return code_clean

        # 2. Normalizar Logs
        log_cols = [
            pl.col("importReference")
            .cast(pl.Utf8)
            .str.strip_chars()
            .str.to_uppercase(),
            pl.col("itemCode").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("waybill").cast(pl.Utf8).fill_null(""),
            pl.col("qtyReceived")
            .cast(pl.Utf8)
            .str.replace_all(",", "")
            .cast(pl.Float64, strict=False)
            .fill_null(0.0),
        ]
        if "itemDescription" in logs_pl.columns:
            log_cols.append(pl.col("itemDescription").cast(pl.Utf8).fill_null(""))
        else:
            log_cols.append(pl.lit("").alias("itemDescription"))

        logs_pl = logs_pl.with_columns(log_cols)

        # Agrupar logs por IR + Item (Ancla física)
        logs_grouped = logs_pl.group_by(["importReference", "itemCode"]).agg(
            [
                pl.col("qtyReceived").sum().alias("qtyReceived"),
                pl.col("waybill").first().alias("Waybill_Log"),
                pl.col("itemDescription")
                .filter(
                    (pl.col("itemDescription") != "")
                    & (~pl.col("itemDescription").str.to_lowercase().str.contains("no en"))
                )
                .first()
                .fill_null("")
                .alias("itemDescription_Log"),
            ]
        )

        df_locations = logs_pl.group_by(["importReference", "itemCode"]).agg(
            [
                pl.col("binLocation").last().alias("binLocation"),
                pl.col("relocatedBin").last().alias("relocatedBin"),
            ]
        )

        # 3. Construir Mapa Maestro de GRN -> IR/Waybill
        db_grn_map = {}
        try:
            # Extraer DB GRNs primero (de GRNMaster y tablas de conciliaciones guardadas/históricas)
            db_grns = await db.execute(
                select(GRNMaster.import_reference, GRNMaster.grn_number, GRNMaster.waybill)
            )
            for row in db_grns.all():
                ir_val = str(row.import_reference or "").strip().upper()
                grn_val = str(row.grn_number or "").strip()
                wb_val = str(row.waybill or "").strip().upper()
                if ir_val and grn_val:
                    for g in grn_val.split(","):
                        g_clean = g.strip().upper()
                        if g_clean:
                            db_grn_map.setdefault(g_clean, set()).add((ir_val, wb_val))

            # Cargar GRNs históricas confirmadas/guardadas para NUNCA desasociarlas
            saved_headers = await db.execute(
                select(
                    SavedGRNReconciliation.import_reference,
                    SavedGRNReconciliation.grn_number,
                    SavedGRNReconciliation.waybill,
                ).where(
                    SavedGRNReconciliation.grn_number.is_not(None),
                    SavedGRNReconciliation.grn_number != "",
                )
            )
            for r in saved_headers.all():
                ir_val = str(r.import_reference or "").strip().upper()
                grn_val = str(r.grn_number or "").strip()
                wb_val = str(r.waybill or "").strip().upper()
                if ir_val and grn_val:
                    for g in grn_val.split(","):
                        g_clean = g.strip().upper()
                        if g_clean:
                            db_grn_map.setdefault(g_clean, set()).add((ir_val, wb_val))

            saved_items = await db.execute(
                select(
                    SavedGRNReconciliationItem.import_reference,
                    SavedGRNReconciliationItem.grn_number,
                    SavedGRNReconciliationItem.waybill,
                )
                .distinct()
                .where(
                    SavedGRNReconciliationItem.grn_number.is_not(None),
                    SavedGRNReconciliationItem.grn_number != "",
                )
            )
            for r in saved_items.all():
                ir_val = str(r.import_reference or "").strip().upper()
                grn_val = str(r.grn_number or "").strip()
                wb_val = str(r.waybill or "").strip().upper()
                if ir_val and grn_val:
                    for g in grn_val.split(","):
                        g_clean = g.strip().upper()
                        if g_clean:
                            db_grn_map.setdefault(g_clean, set()).add((ir_val, wb_val))
        except Exception as e:
            print(f"[RECONCILIATION] Error loading DB GRNs: {e}")

        # 4. Normalizar Reporte 280
        grn_pl = csv_handler.df_grn_cache
        if grn_pl is None or grn_pl.is_empty():
            df_280 = pl.DataFrame(
                schema={
                    "GRN_Number": pl.Utf8,
                    "Item_Code": pl.Utf8,
                    "Item_Description": pl.Utf8,
                    "Quantity": pl.Float64,
                    "Order_Number": pl.Utf8,
                    "Order_Line": pl.Utf8,
                }
            )
        else:
            if "Order_Number" not in grn_pl.columns:
                grn_pl = grn_pl.with_columns(pl.lit("").alias("Order_Number"))
            if "Order_Line" not in grn_pl.columns:
                grn_pl = grn_pl.with_columns(pl.lit("").alias("Order_Line"))
            if "Item_Description" not in grn_pl.columns:
                grn_pl = grn_pl.with_columns(pl.lit("").alias("Item_Description"))

            df_280 = grn_pl.select(
                [
                    pl.col("GRN_Number").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
                    pl.col("Item_Code").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
                    pl.col("Item_Description").cast(pl.Utf8).fill_null(""),
                    pl.col("Quantity")
                    .cast(pl.Utf8)
                    .map_elements(csv_handler.parse_quantity_smart, return_dtype=pl.Float64)
                    .fill_null(0.0),
                    pl.col("Order_Number")
                    .cast(pl.Utf8)
                    .str.strip_chars()
                    .str.to_uppercase()
                    .fill_null(""),
                    pl.col("Order_Line")
                    .cast(pl.Utf8)
                    .str.strip_chars()
                    .str.replace(r"^0+", "")
                    .fill_null(""),
                ]
            )
            if not df_280.is_empty():
                df_280 = df_280.with_columns(
                    pl.struct(["Item_Code", "Item_Description"])
                    .map_elements(
                        lambda s: resolve_item_description(s["Item_Code"], s.get("Item_Description")),
                        return_dtype=pl.Utf8,
                    )
                    .alias("Item_Description")
                )

        # 5. ASOCIACIÓN INTEGRAL MULTIDIMENSIONAL ESTRICTA:
        # Se asocian simultáneamente: (GRN_Number, Order_Number, Order_Line, Item_Code).
        # CERO asignaciones arbitrarias; si existen ambigüedades no unívocas, no se adivina.
        exact_grn_line_map = {}
        line_map = {}
        exact_grn_item_map = {}
        item_map = {}

        if os.path.exists(PO_LOOKUP_JSON_PATH):
            try:
                import orjson

                with open(PO_LOOKUP_JSON_PATH, "rb") as f_po:
                    po_data = orjson.loads(f_po.read())

                for ir_k, val in po_data.get("ir_to_data", {}).items():
                    ir_clean = str(ir_k).strip().upper()
                    wb_clean = str(val.get("waybill", "")).strip().upper()
                    for it in val.get("items", []):
                        c_ref = (str(it.get("customer_ref") or "").strip() or str(it.get("order_number") or "").strip()).upper()
                        it_c = str(it.get("item_code", "")).strip().upper()
                        o_ln = str(it.get("order_line", "")).strip().lstrip("0")
                        status_val = str(it.get("status", "")).strip().upper()
                        grn_val = str(it.get("grn", "")).replace("/", ",").strip().upper()
                        grns = [g.strip() for g in grn_val.split(",") if g.strip()]

                        if c_ref and it_c:
                            for g in grns:
                                exact_grn_item_map.setdefault((c_ref, it_c, g), set()).add((ir_clean, wb_clean))
                                if o_ln:
                                    exact_grn_line_map.setdefault((c_ref, it_c, o_ln, g), set()).add((ir_clean, wb_clean))
                            item_map.setdefault((c_ref, it_c), set()).add((ir_clean, wb_clean))
                            if o_ln:
                                line_map.setdefault((c_ref, it_c, o_ln), set()).add((ir_clean, wb_clean, status_val))
            except Exception as e_po_map:
                print(f"[RECONCILIATION] Error cargando po_lookup para cruce integral: {e_po_map}")

        resolved_irs = []
        resolved_wbs = []

        for r in df_280.iter_rows(named=True):
            g = str(r.get("GRN_Number") or "").strip().upper()
            o = str(r.get("Order_Number") or "").strip().upper()
            l = str(r.get("Order_Line") or "").strip().lstrip("0")
            i = str(r.get("Item_Code") or "").strip().upper()

            ir_match = None
            wb_match = None

            # Prioridad 1: Match Cuádruple Exacto (GRN + Orden + Línea + Ítem)
            if o and i and l and g:
                c1 = exact_grn_line_map.get((o, i, l, g))
                if c1 and len(c1) == 1:
                    ir_match, wb_match = next(iter(c1))

            # Prioridad 2: Match Compuesto Exacto de Línea (Orden + Línea + Ítem)
            if not ir_match and o and i and l:
                c2 = line_map.get((o, i, l))
                if c2:
                    unique_irs = {x[:2] for x in c2}
                    if len(unique_irs) == 1:
                        ir_match, wb_match = next(iter(unique_irs))
                    else:
                        # Si está en varias IRs por despacho dividido, desambiguar si solo una está COMPLETE/recibida
                        comp = {x[:2] for x in c2 if x[2] == "COMPLETE"}
                        if len(comp) == 1:
                            ir_match, wb_match = next(iter(comp))

            # Prioridad 3: Match Compuesto de Ítem y GRN (GRN + Orden + Ítem)
            if not ir_match and o and i and g:
                c3 = exact_grn_item_map.get((o, i, g))
                if c3 and len(c3) == 1:
                    ir_match, wb_match = next(iter(c3))

            # Prioridad 4: Match Compuesto Unívoco de Ítem (Orden + Ítem)
            # Solo si la combinación Orden + Ítem pertenece a una ÚNICA Import Reference
            if not ir_match and o and i:
                c4 = item_map.get((o, i))
                if c4 and len(c4) == 1:
                    ir_match, wb_match = next(iter(c4))

            # Prioridad 5: Mapeo explícito desde DB GRN Master si es unívoco
            if not ir_match and g:
                c5 = db_grn_map.get(g)
                if c5 and len(c5) == 1:
                    ir_match, wb_match = next(iter(c5))

            resolved_irs.append(ir_match or "SIN I.R. MAESTRA")
            resolved_wbs.append(wb_match or "SIN WAYBILL")

        df_expected_with_ir = df_280.with_columns(
            [
                pl.Series("ir_map", resolved_irs, dtype=pl.Utf8),
                pl.Series("wb_map", resolved_wbs, dtype=pl.Utf8),
            ]
        )

        # 5.1 PROPAGACIÓN ESTRICTA INTER-GRN (ÚNICA Y EXCLUSIVAMENTE SI ES UNÁNIME):
        # El GRN_Number agrupa físicamente la entrega en bodega.
        # Si todas las líneas resueltas del GRN apuntan a EXACTAMENTE UNA MISMA I.R. y Waybill,
        # cualquier línea huérfana de esa misma recepción física hereda dicha I.R.
        # Si el GRN contiene líneas de múltiples I.R. diferentes, NUNCA se propaga arbitrariamente.
        grn_unanimous = (
            df_expected_with_ir.filter(
                (pl.col("ir_map") != "SIN I.R. MAESTRA")
                & (pl.col("GRN_Number") != "")
            )
            .group_by("GRN_Number")
            .agg(
                [
                    pl.col("ir_map").n_unique().alias("_n_ir"),
                    pl.col("ir_map").first().alias("_grn_ir_prop"),
                    pl.col("wb_map").first().alias("_grn_wb_prop"),
                ]
            )
            .filter(pl.col("_n_ir") == 1)
        )
        if not grn_unanimous.is_empty():
            df_expected_with_ir = (
                df_expected_with_ir.join(grn_unanimous, on="GRN_Number", how="left")
                .with_columns(
                    [
                        pl.when(pl.col("ir_map") == "SIN I.R. MAESTRA")
                        .then(pl.col("_grn_ir_prop").fill_null("SIN I.R. MAESTRA"))
                        .otherwise(pl.col("ir_map"))
                        .alias("ir_map"),
                        pl.when(pl.col("wb_map") == "SIN WAYBILL")
                        .then(pl.col("_grn_wb_prop").fill_null("SIN WAYBILL"))
                        .otherwise(pl.col("wb_map"))
                        .alias("wb_map"),
                    ]
                )
                .drop(["_n_ir", "_grn_ir_prop", "_grn_wb_prop"])
            )

        # 5.2 PROTECCIÓN Y RECUPERACIÓN DE GRNs RECIBIDAS (SOLO SI ES UNÍVOCO):
        unmapped_grns = (
            df_expected_with_ir.filter(pl.col("ir_map") == "SIN I.R. MAESTRA")
            .get_column("GRN_Number")
            .unique()
            .to_list()
        )
        if unmapped_grns and not logs_pl.is_empty():
            recovered_mappings = []
            for u_grn in unmapped_grns:
                grn_item_codes = (
                    df_expected_with_ir.filter(pl.col("GRN_Number") == u_grn)
                    .get_column("Item_Code")
                    .unique()
                    .to_list()
                )
                if not grn_item_codes:
                    continue
                matched_logs = logs_pl.filter(
                    pl.col("itemCode").is_in(grn_item_codes)
                    & (pl.col("importReference") != "")
                    & (pl.col("importReference") != "SIN I.R. MAESTRA")
                )
                if not matched_logs.is_empty() and matched_logs.get_column("importReference").n_unique() == 1:
                    rec_ir = matched_logs.row(0, named=True)["importReference"]
                    rec_wb = matched_logs.row(0, named=True).get("waybill", "") or ""
                    recovered_mappings.append(
                        {"GRN_Number": u_grn, "_rec_ir": rec_ir, "_rec_wb": rec_wb}
                    )

            if recovered_mappings:
                df_rec = pl.DataFrame(recovered_mappings)
                df_expected_with_ir = (
                    df_expected_with_ir.join(df_rec, on="GRN_Number", how="left")
                    .with_columns(
                        [
                            pl.when(
                                (pl.col("ir_map") == "SIN I.R. MAESTRA")
                                & pl.col("_rec_ir").is_not_null()
                            )
                            .then(pl.col("_rec_ir"))
                            .otherwise(pl.col("ir_map"))
                            .alias("ir_map"),
                            pl.when(
                                (pl.col("wb_map") == "SIN WAYBILL")
                                & pl.col("_rec_wb").is_not_null()
                            )
                            .then(pl.col("_rec_wb"))
                            .otherwise(pl.col("wb_map"))
                            .alias("wb_map"),
                        ]
                    )
                    .drop(["_rec_ir", "_rec_wb"])
                )

        # 6. Cálculo de Totales Esperados por IR + Item
        total_exp_ir_item = df_expected_with_ir.group_by(["ir_map", "Item_Code"]).agg(
            pl.col("Quantity").sum().alias("Total_Esperado_IR")
        )

        # 7. Join Final con Logs (Físico vs Sistema)
        final = df_expected_with_ir.join(
            total_exp_ir_item, on=["ir_map", "Item_Code"], how="left"
        ).join(
            logs_grouped,
            left_on=["ir_map", "Item_Code"],
            right_on=["importReference", "itemCode"],
            how="left",
        )

        logs_sin_grn = logs_grouped.join(
            df_expected_with_ir.select(["ir_map", "Item_Code"]).unique(),
            left_on=["importReference", "itemCode"],
            right_on=["ir_map", "Item_Code"],
            how="anti",
        )
        if not logs_sin_grn.is_empty():
            logs_sin_grn = logs_sin_grn.with_columns(
                [
                    pl.col("importReference").alias("ir_map"),
                    pl.col("Waybill_Log").alias("wb_map"),
                    pl.lit("SIN GRN").alias("GRN_Number"),
                    pl.col("itemCode").alias("Item_Code"),
                    pl.struct(["itemCode", "itemDescription_Log"])
                    .map_elements(
                        lambda s: resolve_item_description(s["itemCode"], s.get("itemDescription_Log")),
                        return_dtype=pl.Utf8,
                    )
                    .alias("Item_Description"),
                    pl.lit(0.0).alias("Quantity"),
                    pl.lit(0.0).alias("Total_Esperado_IR"),
                    pl.lit("").alias("Order_Number"),
                    pl.lit("").alias("Order_Line"),
                ]
            )
        else:
            logs_sin_grn = pl.DataFrame(
                schema={
                    "ir_map": pl.Utf8,
                    "wb_map": pl.Utf8,
                    "GRN_Number": pl.Utf8,
                    "Item_Code": pl.Utf8,
                    "Item_Description": pl.Utf8,
                    "Quantity": pl.Float64,
                    "Order_Number": pl.Utf8,
                    "Order_Line": pl.Utf8,
                    "Total_Esperado_IR": pl.Float64,
                    "qtyReceived": pl.Float64,
                }
            )

        # Unificar
        common_cols = [
            "ir_map",
            "wb_map",
            "GRN_Number",
            "Item_Code",
            "Item_Description",
            "Quantity",
            "Order_Number",
            "Order_Line",
            "Total_Esperado_IR",
            "qtyReceived",
        ]
        final = pl.concat(
            [final.select(common_cols), logs_sin_grn.select(common_cols)],
            how="diagonal",
        )

        # Garantizar que ninguna fila en la conciliación conserve texto tipo "No en reporte 280" o "No en sistema 280"
        final = final.with_columns(
            pl.struct(["Item_Code", "Item_Description"])
            .map_elements(
                lambda s: resolve_item_description(s["Item_Code"], s.get("Item_Description")),
                return_dtype=pl.Utf8,
            )
            .alias("Item_Description")
        )

        # 9. Cálculos de Diferencia y Ubicaciones
        final = final.with_columns(
            [
                pl.col("qtyReceived").fill_null(0.0),
                (
                    pl.col("qtyReceived").fill_null(0.0) - pl.col("Total_Esperado_IR")
                ).alias("Diferencia"),
            ]
        ).with_columns(
            [
                pl.col("qtyReceived").cast(pl.Int64).alias("Cant_Recibida"),
                pl.col("Quantity").cast(pl.Int64).alias("Cant_Linea"),
                pl.col("Total_Esperado_IR").cast(pl.Int64).alias("Total_Esperado_IR"),
                pl.col("Diferencia").cast(pl.Int64).alias("Diferencia_Real_IR"),
            ]
        )

        final = final.join(
            df_locations,
            left_on=["ir_map", "Item_Code"],
            right_on=["importReference", "itemCode"],
            how="left",
        ).with_columns(
            [pl.col("binLocation").fill_null(""), pl.col("relocatedBin").fill_null("")]
        )

        # Extraer el timestamp de los logs (el más reciente para el grupo)
        df_timestamps = logs_pl.group_by(["importReference", "itemCode"]).agg(
            [pl.col("timestamp").last().alias("timestamp_log")]
        )
        final = final.join(
            df_timestamps,
            left_on=["ir_map", "Item_Code"],
            right_on=["importReference", "itemCode"],
            how="left",
        )

        # Distribuir Cant_Recibida en cascada línea por línea dentro de cada (ir_map, Item_Code)
        # respetando el orden de GRN y Order_Line para no duplicar cantidades recibidas ni diferencias
        final = final.with_columns(
            pl.col("Order_Line").cast(pl.Int64, strict=False).fill_null(0).alias("_order_line_num")
        ).sort(["ir_map", "Item_Code", "GRN_Number", "_order_line_num"])

        final = (
            final.with_columns(
                [
                    pl.col("GRN_Number")
                    .cum_count()
                    .over(["ir_map", "Item_Code"])
                    .alias("_row_num"),
                    pl.col("GRN_Number")
                    .count()
                    .over(["ir_map", "Item_Code"])
                    .alias("_group_size"),
                    (
                        pl.col("Cant_Linea")
                        .cum_sum()
                        .over(["ir_map", "Item_Code"])
                        - pl.col("Cant_Linea")
                    ).alias("_prev_cum_exp"),
                ]
            )
            .with_columns(
                _rem_rec=(pl.col("Cant_Recibida") - pl.col("_prev_cum_exp")).clip(lower_bound=0)
            )
            .with_columns(
                Cant_Recibida=pl.when(pl.col("_row_num") < pl.col("_group_size"))
                .then(pl.min_horizontal(pl.col("Cant_Linea"), pl.col("_rem_rec")).cast(pl.Int64))
                .otherwise(pl.col("_rem_rec").cast(pl.Int64))
            )
            .with_columns(
                Diferencia=(pl.col("Cant_Recibida") - pl.col("Cant_Linea")).cast(pl.Int64)
            )
            .drop(["_row_num", "_group_size", "_prev_cum_exp", "_rem_rec"])
        )

        # 10. Resultado Final
        result = (
            final.select(
                [
                    pl.col("ir_map").alias("Import_Reference"),
                    pl.col("wb_map").alias("Waybill"),
                    pl.col("GRN_Number").alias("GRN"),
                    pl.col("Order_Number").alias("Order_Number"),
                    pl.col("Order_Line").alias("Order_Line"),
                    pl.col("Item_Code").alias("Codigo_Item"),
                    pl.col("Item_Description").alias("Descripcion"),
                    pl.col("binLocation").alias("Ubicacion"),
                    pl.col("relocatedBin").alias("Reubicado"),
                    pl.col("Cant_Linea").alias("Cant_Esperada"),
                    pl.col("Total_Esperado_IR"),
                    pl.col("Cant_Recibida"),
                    pl.col("Diferencia"),
                    pl.col("Diferencia_Real_IR"),
                    pl.col("timestamp_log").alias("Timestamp"),
                    pl.col("_order_line_num"),
                ]
            )
            .sort(["Import_Reference", "GRN", "_order_line_num", "Codigo_Item"])
            .drop(["_order_line_num"])
            .to_dicts()
        )

        if archive_date is None:
            _ACTIVE_RECONCILIATION_CACHE = result
            _LAST_CACHE_TIME = time.time()

        return result

    except Exception as e:
        import traceback

        print(f"[RECONCILIATION ERROR]: {e}")
        print(traceback.format_exc())
        return []


async def create_snapshot(
    db: AsyncSession,
    data: List[dict],
    username: str,
    is_auto: bool = False,
    client_timestamp: Optional[str] = None,
):
    """Guarda un snapshot de conciliación en la DB."""
    prefix = "AUTO-" if is_auto else ""

    # Priorizar el timestamp del cliente si viene (ej: para respetar la hora de la bodega)
    base_time_str = (
        client_timestamp if client_timestamp else datetime.datetime.now().isoformat()
    )

    try:
        # Formatear el archive_date (ID del lote) para que sea legible
        dt_obj = datetime.datetime.fromisoformat(base_time_str.replace("Z", ""))
        archive_date = f"{prefix}{dt_obj.strftime('%Y-%m-%d %H:%M:%S')}"
    except:
        archive_date = f"{prefix}{base_time_str}"

    records = [
        ReconciliationHistory(
            archive_date=archive_date,
            import_reference=row.get("Import_Reference", ""),
            waybill=row.get("Waybill", ""),
            grn=row.get("GRN", ""),
            item_code=row.get("Codigo_Item", ""),
            description=row.get("Descripcion", ""),
            bin_location=row.get("Ubicacion", "") or "",
            relocated_bin=row.get("Reubicado", "") or "",
            qty_expected=int(row.get("Cant_Esperada", 0)),
            qty_received=int(row.get("Cant_Recibida", 0)),
            difference=int(row.get("Diferencia", 0)),
            username=username,
            timestamp=row.get("Timestamp") or base_time_str,
        )
        for row in data
    ]

    db.add_all(records)
    await db.commit()

    # Depuración automática preventiva: conservar únicamente el registro más reciente
    # para cada combinación de archive_date, import_reference, item_code y grn en el histórico.
    try:
        cleanup_query = text("""
            DELETE FROM reconciliation_history
            WHERE id NOT IN (
                SELECT max_id FROM (
                    SELECT MAX(id) as max_id
                    FROM reconciliation_history
                    GROUP BY archive_date, import_reference, item_code, grn
                ) as temp
            )
        """)
        await db.execute(cleanup_query)
        await db.commit()
    except Exception as cleanup_err:
        print(f"[RECONCILIATION CLEANUP ERROR]: {cleanup_err}")

    return archive_date


async def auto_snapshot_before_update(db: AsyncSession, username: str):
    """Realiza un snapshot automático si hay datos pendientes de conciliación."""
    try:
        current_data = await get_reconciliation_calculations(db)
        if current_data and len(current_data) > 0:
            user_str = (
                username
                if isinstance(username, str)
                else getattr(username, "username", str(username))
            )
            return await create_snapshot(
                db, current_data, f"AUTO({user_str})", is_auto=True
            )
        return None
    except Exception as e:
        print(f"Error en snapshot automático: {e}")
        return None

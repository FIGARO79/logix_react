"""Suite de pruebas para el núcleo nativo en Rust (logix_rust_core)."""

import json
import pytest
import logix_rust_core


# =====================================================================
# 1. CONTEOS CÍCLICOS (counts.rs)
# =====================================================================

def test_calculate_cycle_count_differences_rust():
    system_stock = [
        ("ITEM-A", "A-01-01", 10.0, 5.0),
        ("ITEM-B", "B-02-01", 20.0, 2.5),
        ("ITEM-C", "C-03-01", 15.0, 10.0),
    ]
    # Etapa más alta prevalece por (item, location)
    physical_counts = [
        ("item-a", "a-01-01", 10.0, 1),   # OK
        ("ITEM-B", "B-02-01", 15.0, 1),   # Etapa 1: 15
        ("ITEM-B", "B-02-01", 25.0, 2),   # Etapa 2: 25 (gana etapa 2 -> SOBRANTE +5)
        ("ITEM-D", "D-01-01", 4.0, 1),    # No en sistema -> SOBRANTE +4
    ]

    result = logix_rust_core.calculate_cycle_count_differences_rust(
        system_stock, physical_counts
    )
    by_key = {(r["item_code"], r["location"]): r for r in result}

    assert len(by_key) == 4

    assert by_key[("ITEM-A", "A-01-01")]["status"] == "OK"
    assert by_key[("ITEM-A", "A-01-01")]["diff_qty"] == pytest.approx(0.0)
    assert by_key[("ITEM-A", "A-01-01")]["stage_used"] == 1

    assert by_key[("ITEM-B", "B-02-01")]["status"] == "SOBRANTE"
    assert by_key[("ITEM-B", "B-02-01")]["counted_qty"] == pytest.approx(25.0)
    assert by_key[("ITEM-B", "B-02-01")]["diff_qty"] == pytest.approx(5.0)
    assert by_key[("ITEM-B", "B-02-01")]["diff_val"] == pytest.approx(12.5)
    assert by_key[("ITEM-B", "B-02-01")]["stage_used"] == 2

    assert by_key[("ITEM-C", "C-03-01")]["status"] == "FALTANTE"
    assert by_key[("ITEM-C", "C-03-01")]["counted_qty"] == pytest.approx(0.0)
    assert by_key[("ITEM-C", "C-03-01")]["diff_qty"] == pytest.approx(-15.0)

    assert by_key[("ITEM-D", "D-01-01")]["status"] == "SOBRANTE"
    assert by_key[("ITEM-D", "D-01-01")]["system_qty"] == pytest.approx(0.0)
    assert by_key[("ITEM-D", "D-01-01")]["counted_qty"] == pytest.approx(4.0)


def test_calculate_w2w_differences_alias():
    res = logix_rust_core.calculate_w2w_differences_rust(
        [("SKU1", "LOC1", 5.0, 1.0)],
        [("SKU1", "LOC1", 5.0, 1)],
    )
    assert len(res) == 1
    assert res[0]["status"] == "OK"


# =====================================================================
# 2. INVENTARIO GENERAL / W2W (general_inventory.rs)
# =====================================================================

def test_calculate_reconciliation_rust():
    master_items = [
        ("SKU-OK", "Desc OK", "BIN1", 100.0, 10.0),
        ("SKU-AUTO", "Desc Auto", "BIN2", 100.0, 10.0),
        ("SKU-PEND", "Desc Pend", "BIN3", 100.0, 50.0),
        ("SKU-MAN", "Desc Manual", "BIN4", 50.0, 20.0),
        ("SKU-UNCNT", "Desc Uncounted", "BIN5", 10.0, 5.0),
    ]
    count_records = [
        ("SKU-OK", 100.0, 1),
        ("SKU-AUTO", 99.0, 1),   # diff -1 (1% <= 5%, $10 <= $100) -> APPROVED_AUTO
        ("SKU-PEND", 80.0, 1),   # diff -20 (20% > 5%, $1000 > $100) -> PENDING
        ("SKU-MAN", 40.0, 1),    # en recount_statuses como manually_approved -> APPROVED_MANUAL
    ]
    recount_statuses = {"SKU-MAN": "manually_approved"}

    rows = logix_rust_core.calculate_reconciliation_rust(
        master_items,
        count_records,
        recount_statuses,
        1,     # current_stage
        0.05,  # qty_tolerance (5%)
        100.0, # val_tolerance ($100)
    )
    by_code = {r["item_code"]: r for r in rows}

    assert by_code["SKU-OK"]["status"] == "OK"
    assert by_code["SKU-AUTO"]["status"] == "APPROVED_AUTO"
    assert by_code["SKU-PEND"]["status"] == "PENDING"
    assert by_code["SKU-MAN"]["status"] == "APPROVED_MANUAL"
    assert by_code["SKU-UNCNT"]["status"] == "NOT_COUNTED"
    assert by_code["SKU-UNCNT"]["is_counted"] is False


def test_calculate_general_inventory_stats_rust():
    master_qty_cost = [
        ("SKU1", 10.0, 10.0),  # $100
        ("SKU2", 20.0, 5.0),   # $100
    ]
    count_records = [
        ("SKU1", 10.0, 1),     # $100 (diff 0)
        ("SKU2", 18.0, 1),     # $90  (diff -$10)
    ]
    stats = logix_rust_core.calculate_general_inventory_stats_rust(
        master_qty_cost, count_records
    )
    assert stats["total_items"] == 2
    assert stats["counted_items_count"] == 2
    assert stats["progress_percentage"] == pytest.approx(100.0)
    assert stats["total_system_value"] == pytest.approx(200.0)
    assert stats["total_counted_value"] == pytest.approx(190.0)
    assert stats["net_variance_value"] == pytest.approx(-10.0)
    assert stats["abs_variance_value"] == pytest.approx(10.0)
    assert stats["accuracy_percentage"] == pytest.approx(95.0)


def test_filter_recount_items_with_tolerances_rust():
    counted_counts = [
        ("SKU-SMALL", 100.0, 99.0, -1.0, 5.0),   # 1% y $5 -> dentro de tolerancia
        ("SKU-BIG", 100.0, 80.0, -20.0, 10.0),   # 20% y $200 -> excede tolerancia
    ]
    recounts = logix_rust_core.filter_recount_items_with_tolerances_rust(
        counted_counts, 0.05, 50.0, 2
    )
    assert len(recounts) == 1
    assert recounts[0]["item_code"] == "SKU-BIG"
    assert recounts[0]["stage_to_count"] == 2
    assert recounts[0]["status"] == "pending"


def test_calculate_recount_items_rust():
    counted_items = [("SKU1", 10.0), ("SKU2", 8.0)]
    system_map = {"SKU1": 10.0, "SKU2": 10.0}
    res = logix_rust_core.calculate_recount_items_rust(counted_items, system_map, 3)
    assert len(res) == 1
    assert res[0] == {"item_code": "SKU2", "stage_to_count": 3, "status": "pending"}


# =====================================================================
# 3. RESERVACIONES (reservations.rs)
# =====================================================================

def test_generate_reservation_cache_rust(tmp_path):
    csv_file = tmp_path / "reservations.csv"
    csv_file.write_text(
        "Item_Code,Customer_Code,Customer_Name,SO_Number,SO_Line_Number,PO_Number,Action_QTY\n"
        "item-100,C01,Acme Corp,SO1,1,PO-99,5\n"
        "ITEM-100,C01,Acme Corp,SO1,1,PO-99,8\n"  # Misma línea SO -> toma el mayor (8)
        "ITEM-100,C02,Beta Ltd,SO2,1,PO-100,4\n",
        encoding="utf-8",
    )

    cache = logix_rust_core.generate_reservation_cache_rust(str(csv_file))
    assert "ITEM-100" in cache
    entry = cache["ITEM-100"]
    assert entry["reserved_qty"] == pytest.approx(12.0)
    assert len(entry["customers"]) == 2


# =====================================================================
# 4. MAPAS MAESTROS GRN / IR / WAYBILL (master_maps.rs)
# =====================================================================

def test_build_master_maps_rust(tmp_path):
    grn_json = tmp_path / "grn_master_data.json"
    grn_json.write_text(
        json.dumps([
            {"Import_Reference": "ir-001", "GRN_Number": "grn-10", "Waybill": "WB-A"}
        ]),
        encoding="utf-8",
    )

    po_lookup = tmp_path / "po_lookup.json"
    po_lookup.write_text(
        json.dumps({
            "wb_to_data": {
                "wb-c": {
                    "import_ref": "ir-003",
                    "items": [{"grn": "grn-30, grn-31"}],
                }
            }
        }),
        encoding="utf-8",
    )

    db_grns = [("ir-002", "grn-20, grn-21", "WB-B")]
    maps = logix_rust_core.build_master_maps_rust(
        db_grns, str(grn_json), str(po_lookup)
    )

    expected = {
        ("GRN-10", "IR-001", "WB-A"),
        ("GRN-20", "IR-002", "WB-B"),
        ("GRN-21", "IR-002", "WB-B"),
        ("GRN-30", "IR-003", "WB-C"),
        ("GRN-31", "IR-003", "WB-C"),
    }
    assert set(maps) == expected


# =====================================================================
# 5. SLOTTING INDIVIDUAL Y BATCH (slotting.rs)
# =====================================================================

@pytest.fixture
def slotting_env():
    storage = {
        "RACK-HOT-9": {"zone": "Rack", "level": 1, "score": 9, "spot": "hot"},
        "RACK-HOT-5": {"zone": "Rack", "level": 1, "score": 5, "spot": "hot"},
        "RACK-WARM-5": {"zone": "Rack", "level": 2, "score": 5, "spot": "warm"},
        "RACK-COLD-2": {"zone": "Rack", "level": 2, "score": 2, "spot": "cold"},
        "MIN-01": {"zone": "Minuteria", "level": 1, "score": 8, "spot": "hot"},
        "CANT-01": {"zone": "Cantilever", "level": 1, "score": 5, "spot": "cold"},
    }
    turnover = {
        "W": {"spot": "hot"},
        "Y": {"spot": "warm"},
        "Z": {"spot": "cold"},
    }
    zone_rules = {
        "cantilever_keywords": "ROD, INTEGRAL STEEL",
        "minuteria_weight_max": "0.1",
        "heavy_weight_min": "10",
        "heavy_levels": "3, 4, 5",
        "high_rotation_levels": "0, 1",
        "high_rotation_min_score": "1",
        "high_rotation_max_score": "10",
        "medium_rotation_levels": "2",
        "medium_rotation_min_score": "4",
        "medium_rotation_max_score": "6",
        "default_levels": "2",
        "exile_rack_levels": "2",
        "exile_sic_codes": "0, Z, L",
        "minuteria_zone": "Minuteria",
        "exile_max_score": "3",
    }
    mix_limits = {
        "minuteria_max_skus": "3",
        "nivel2_max_skus": "6",
        "otros_niveles_max_skus": "4",
    }
    occupancy = {"RACK-HOT-9": 0, "RACK-WARM-5": 0, "RACK-COLD-2": 0}
    return storage, turnover, zone_rules, mix_limits, occupancy


def test_slotting_already_in_optimal_bin_returns_none(slotting_env):
    """Verifica la condición refactorizada para hot (score>=8), warm y cold (score<=exile_max)."""
    storage, turnover, zone_rules, mix_limits, occupancy = slotting_env

    # 1. Hot con score >= 8 -> None
    res_hot = logix_rust_core.get_suggested_bin_rust(
        storage, turnover, zone_rules, mix_limits,
        {"Bin_1": "RACK-HOT-9", "Item_Code": "I1", "Item_Description": "BOLT", "Weight_per_Unit": "1.5"},
        occupancy, "W"
    )
    assert res_hot is None

    # 2. Warm en spot warm -> None
    res_warm = logix_rust_core.get_suggested_bin_rust(
        storage, turnover, zone_rules, mix_limits,
        {"Bin_1": "RACK-WARM-5", "Item_Code": "I2", "Item_Description": "BOLT", "Weight_per_Unit": "1.5"},
        occupancy, "Y"
    )
    assert res_warm is None

    # 3. Cold con score <= 3 -> None
    res_cold = logix_rust_core.get_suggested_bin_rust(
        storage, turnover, zone_rules, mix_limits,
        {"Bin_1": "RACK-COLD-2", "Item_Code": "I3", "Item_Description": "BOLT", "Weight_per_Unit": "1.5"},
        occupancy, "Z"
    )
    assert res_cold is None


def test_slotting_suggests_better_bin_and_batch(slotting_env):
    storage, turnover, zone_rules, mix_limits, occupancy = slotting_env

    # Ítem W (hot) actualmente en ubicación con score 5 (<8) -> debe sugerir RACK-HOT-9
    suggested = logix_rust_core.get_suggested_bin_rust(
        storage, turnover, zone_rules, mix_limits,
        {"Bin_1": "RACK-HOT-5", "Item_Code": "I1", "Item_Description": "VALVE", "Weight_per_Unit": "2.0"},
        occupancy, "W"
    )
    assert suggested == "RACK-HOT-9"

    # Prueba en lote (batch): [óptimo -> None, reubicable -> RACK-HOT-9, minutería -> MIN-01]
    batch_items = [
        {"Bin_1": "RACK-HOT-9", "Item_Code": "I1", "Item_Description": "VALVE", "Weight_per_Unit": "2.0", "SIC_Code_stockroom": "W"},
        {"Bin_1": "RACK-HOT-5", "Item_Code": "I2", "Item_Description": "VALVE", "Weight_per_Unit": "2.0", "SIC_Code_stockroom": "W"},
        {"Bin_1": "", "Item_Code": "I3", "Item_Description": "WASHER", "Weight_per_Unit": "0.02", "SIC_Code_stockroom": "W"},
    ]
    batch_res = logix_rust_core.get_suggested_bins_batch_rust(
        storage, turnover, zone_rules, mix_limits, batch_items, occupancy
    )
    assert batch_res == [None, "RACK-HOT-9", "MIN-01"]


# =====================================================================
# 6. CACHÉ CSV Y JSON NATIVO EN MEMORIA (csv_cache.rs)
# =====================================================================

def test_parse_quantity_smart_and_column_rust():
    assert logix_rust_core.parse_quantity_smart_rust(None) == pytest.approx(0.0)
    assert logix_rust_core.parse_quantity_smart_rust("") == pytest.approx(0.0)
    assert logix_rust_core.parse_quantity_smart_rust("1.200,50") == pytest.approx(1200.50)
    assert logix_rust_core.parse_quantity_smart_rust("1,200.50") == pytest.approx(1200.50)
    assert logix_rust_core.parse_quantity_smart_rust("9,0") == pytest.approx(9.0)
    assert logix_rust_core.parse_quantity_smart_rust("1,200") == pytest.approx(1200.0)

    col = logix_rust_core.parse_quantity_column_rust(["1.200,50", "9,0", None, "nan", "25"])
    assert col == pytest.approx([1200.50, 9.0, 0.0, 0.0, 25.0])


def test_csv_cache_master_grn_and_po_lookup_rust(tmp_path):
    master_csv = tmp_path / "AURRSGLBD0250.csv"
    master_csv.write_text(
        "Item_Code,Item_Description,ABC_Code_stockroom,Physical_Qty,Frozen_Qty,"
        "Weight_per_Unit,Bin_1,Aditional_Bin_Location,SupersededBy,SIC_Code_stockroom,"
        "Date_Last_Received,Stockroom,Item_Type,Item_Class,Item_Group_Major,SIC_Code_Company,Cost_per_Unit\n"
        'sku-01,FILTER ELEMENT,A,"15,0",0,1.2,B-01-02,,,W,2026-10-01,MAIN,P,1,G1,W,"45,50"\n',
        encoding="utf-8",
    )

    grn_csv = tmp_path / "AURRSGLBD0280.csv"
    grn_csv.write_text(
        "GRN_Number,Item_Code,Quantity,Item_Description,Order_Number,Order_Line\n"
        'grn-100,sku-01,"12,0",FILTER ELEMENT,po-280,1\n'
        'grn-100,sku-01,"8,0",FILTER ELEMENT,po-280,2\n',
        encoding="utf-8",
    )

    po_lookup = tmp_path / "po_lookup.json"
    po_lookup.write_text(
        json.dumps({
            "ir_to_data": {
                "IR-500": {
                    "items": [
                        {
                            "item_code": "sku-01",
                            "qty": 20,
                            "customer_ref": "po-cust-1",
                            "grn": "grn-100",
                        }
                    ]
                }
            },
            "wb_to_data": {},
        }),
        encoding="utf-8",
    )

    grn_json = tmp_path / "grn_master_data.json"
    grn_json.write_text("[]", encoding="utf-8")

    qty_map, cost_map, desc_map, bin_map = logix_rust_core.load_master_csv_maps_rust(str(master_csv))
    assert qty_map["SKU-01"] == 15
    assert cost_map["SKU-01"] == pytest.approx(45.50)
    assert desc_map["SKU-01"] == "FILTER ELEMENT"
    assert bin_map["SKU-01"] == "B-01-02"

    item = logix_rust_core.get_master_item_rust("sku-01", str(master_csv))
    assert item is not None
    assert item["Item_Code"] == "SKU-01"
    assert item["Physical_Qty"] == pytest.approx(15.0)

    po_nums = set(
        logix_rust_core.get_po_numbers_for_import_ref_and_item_rust(
            "ir-500", "sku-01", str(po_lookup), str(grn_csv)
        )
    )
    assert po_nums == {"PO-CUST-1", "PO-280"}

    exp_po = logix_rust_core.get_expected_quantity_from_po_rust("ir-500", "sku-01", str(po_lookup))
    assert exp_po == 20

    breakdown = logix_rust_core.get_expected_breakdown_by_item_rust("sku-01", str(po_lookup))
    assert breakdown == [{"ir": "IR-500", "grn": "GRN-100", "qty": 20}]

    exp_grn = logix_rust_core.get_expected_grn_qty_rust(
        "ir-500", "sku-01", [], str(po_lookup), str(grn_json), str(grn_csv)
    )
    assert exp_grn == 20


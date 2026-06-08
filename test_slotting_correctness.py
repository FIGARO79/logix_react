import json
import time
import logix_rust_core

def get_suggested_bin_python(storage, turnover_map, zone_rules, mix_limits, item_details, occupancy, sic_code):
    current_bin = str(item_details.get('Bin_1', '')).strip().upper()
    item_code = str(item_details.get('Item_Code', '')).strip()

    # Determinar el spot ideal basado en el SIC Code
    ideal_spot = turnover_map.get(sic_code, {}).get('spot', 'cold').lower()
    if sic_code in ['W', 'X']: 
        ideal_spot = 'hot'
    elif sic_code in ['Y', 'K']:
        ideal_spot = 'warm'
    elif sic_code in ['L', 'Z', '0']:
        ideal_spot = 'cold'

    # Reubicación Proactiva: Si el ítem ya está en una ubicación válida en el maestro...
    if current_bin in storage:
        info = storage[current_bin]
        current_spot = str(info.get('spot', 'cold')).lower()
        current_score = info.get('score', 0)
        
        # Si el spot actual coincide con el ideal...
        if current_spot == ideal_spot:
            # Si es un ítem HOT y ya tiene un score excelente (>=8), se queda.
            if ideal_spot == 'hot' and current_score >= 8:
                return None
            # Si es un ítem COLD y ya está en una zona de exilio o baja prioridad (score <= exile_max_score), se queda.
            exile_max_score = int(zone_rules.get("exile_max_score", 3))
            if ideal_spot == 'cold' and current_score <= exile_max_score:
                return None
            # En otros casos (ej. ítem warm en score medio), se queda si no hay una mejor opción obvia.
            if ideal_spot == 'warm':
                return None

    target_zone = None
    target_levels = None
    forbidden_zones = []
    description = str(item_details.get('Item_Description', '')).upper()
    
    weight = 0.0
    try:
        weight_val = item_details.get('Weight_per_Unit', '0')
        weight = float(str(weight_val).replace(',', '')) if weight_val else 0.0
    except: pass

    # --- PARÁMETROS DINÁMICOS ---
    cantilever_kw = [k.strip().upper() for k in zone_rules.get("cantilever_keywords", "ROD, INTEGRAL STEEL").split(",") if k.strip()]
    minuteria_weight_max = float(zone_rules.get("minuteria_weight_max", 0.1))
    heavy_weight_min = float(zone_rules.get("heavy_weight_min", 10))
    heavy_levels = [int(lvl.strip()) for lvl in str(zone_rules.get("heavy_levels", "3, 4, 5")).split(",") if lvl.strip().isdigit()]
    high_rotation_levels = [int(lvl.strip()) for lvl in str(zone_rules.get("high_rotation_levels", "0, 1")).split(",") if lvl.strip().isdigit()]
    high_rotation_min_score = int(zone_rules.get("high_rotation_min_score", 1))
    high_rotation_max_score = int(zone_rules.get("high_rotation_max_score", 10))
    
    medium_rotation_levels = [int(lvl.strip()) for lvl in str(zone_rules.get("medium_rotation_levels", "1, 2")).split(",") if lvl.strip().isdigit()]
    medium_rotation_min_score = int(zone_rules.get("medium_rotation_min_score", 4))
    medium_rotation_max_score = int(zone_rules.get("medium_rotation_max_score", 6))
    
    default_levels = [int(lvl.strip()) for lvl in str(zone_rules.get("default_levels", "2")).split(",") if lvl.strip().isdigit()]
    exile_levels = [int(lvl.strip()) for lvl in str(zone_rules.get("exile_rack_levels", "2, 3")).split(",") if lvl.strip().isdigit()]
    exile_sics = [s.strip().upper() for s in str(zone_rules.get("exile_sic_codes", "0, Z, L")).split(",") if s.strip()]
    minuteria_zone = zone_rules.get("minuteria_zone", "Minuteria")

    limit_minuteria = int(mix_limits.get("minuteria_max_skus", 3))
    limit_n2 = int(mix_limits.get("nivel2_max_skus", 6))
    limit_others = int(mix_limits.get("otros_niveles_max_skus", 4))

    # --- REGLAS DE NEGOCIO POR ATRIBUTOS ---
    is_cantilever = any(kw in description for kw in cantilever_kw)
    
    target_score_min = None
    target_score_max = None

    if is_cantilever:
        target_zone = "Cantilever"
    elif 0 < weight < minuteria_weight_max:
        target_zone = minuteria_zone
    elif sic_code in exile_sics:
        target_zone = "Rack"
        if weight > heavy_weight_min:
            target_levels = [lvl for lvl in exile_levels if lvl >= 3]
            if not target_levels:
                target_levels = [3]
        else:
            target_levels = exile_levels
    elif weight > heavy_weight_min:
        target_zone = "Rack"
        target_levels = heavy_levels
    elif sic_code in ['W', 'X']:
        target_zone = "Rack"
        target_levels = high_rotation_levels
        target_score_min = high_rotation_min_score
        target_score_max = high_rotation_max_score
    elif sic_code in ['Y', 'K']:
        target_zone = "Rack"
        target_levels = medium_rotation_levels
        target_score_min = medium_rotation_min_score
        target_score_max = medium_rotation_max_score
    else:
        target_zone = "Rack"
        target_levels = default_levels
    
    if target_zone is None:
        forbidden_zones = ["Cantilever", "Minuteria"]
    else:
        forbidden_zones = []

    # --- BÚSQUEDA DE CANDIDATOS EN EL MAPA ---
    candidates = []
    for bin_code, info in storage.items():
        zone = info.get('zone')
        try:
            level = int(float(str(info.get('level', '0'))))
        except (ValueError, TypeError):
            level = 0
        score = info.get('score', 0)
        if zone in forbidden_zones: continue
        if target_zone and zone != target_zone: continue
        if target_levels and level not in target_levels: continue
        if target_score_min is not None and score < target_score_min: continue
        if target_score_max is not None and score > target_score_max: continue

        current_items = occupancy.get(bin_code.upper(), 0)
        
        if zone == "Minuteria" or zone == minuteria_zone:
            limit = limit_minuteria
        elif level == 2:
            limit = limit_n2
        else:
            limit = limit_others
        
        if current_items < limit:
            candidates.append({
                'bin': bin_code,
                'occupancy': current_items,
                'spot': str(info.get('spot', 'Cold')).lower(),
                'score': score
            })

    if not candidates:
        return None

    # --- ORDENAMIENTO ---
    if ideal_spot == 'hot':
        candidates.sort(key=lambda x: (x['spot'] != 'hot', -x['score'], x['occupancy'], x['bin']))
    elif ideal_spot == 'warm':
        candidates.sort(key=lambda x: (x['spot'] != 'warm', -x['score'], x['occupancy'], x['bin']))
    else:
        candidates.sort(key=lambda x: (x['spot'] != 'cold', x['score'], x['occupancy'], x['bin']))

    return candidates[0]['bin']


# 1. Cargar datos reales
with open('static/json/slotting_parameters.json', 'r') as f:
    config = json.load(f)

storage = config.get('storage', {})
turnover_map = config.get('turnover', {})
# Añadir datos ficticios para zone_rules y mix_limits si no existen
zone_rules = config.get('zone_rules', {
    "cantilever_keywords": "ROD, INTEGRAL STEEL",
    "minuteria_weight_max": "0.1",
    "heavy_weight_min": "10",
    "heavy_levels": "3, 4, 5",
    "high_rotation_levels": "0, 1",
    "high_rotation_min_score": "1",
    "high_rotation_max_score": "10",
    "medium_rotation_levels": "1, 2",
    "medium_rotation_min_score": "4",
    "medium_rotation_max_score": "6",
    "default_levels": "2",
    "exile_rack_levels": "2, 3",
    "exile_sic_codes": "0, Z, L",
    "minuteria_zone": "Minuteria",
    "exile_max_score": "3"
})
mix_limits = config.get('mix_limits', {
    "minuteria_max_skus": "3",
    "nivel2_max_skus": "6",
    "otros_niveles_max_skus": "4"
})

# Generar un estado de ocupación ficticio vacío, o aleatorio para simular ocupación
occupancy = {}
for i, bin_code in enumerate(storage.keys()):
    if i % 10 == 0:
        occupancy[bin_code.upper()] = 1
    elif i % 25 == 0:
        occupancy[bin_code.upper()] = 2

# Casos de prueba a evaluar
test_cases = [
    # 1. Cantilever
    {
        "name": "Cantilever Item",
        "item": {"Bin_1": "", "Item_Code": "C01", "Item_Description": "ROD STEEL 1/2 INCH", "Weight_per_Unit": "5.0"},
        "sic": "Y"
    },
    # 2. Minuteria
    {
        "name": "Minuteria Item (Lightweight)",
        "item": {"Bin_1": "", "Item_Code": "M01", "Item_Description": "SMALL WASHER", "Weight_per_Unit": "0.05"},
        "sic": "Z"
    },
    # 3. Peso Pesado
    {
        "name": "Heavy Weight Item",
        "item": {"Bin_1": "", "Item_Code": "H01", "Item_Description": "HEAVY MOTOR SHIELD", "Weight_per_Unit": "15.0"},
        "sic": "Y"
    },
    # 4. Alta rotación (Hot)
    {
        "name": "High Rotation Item (W)",
        "item": {"Bin_1": "", "Item_Code": "W01", "Item_Description": "FAST PICK SKU", "Weight_per_Unit": "2.0"},
        "sic": "W"
    },
    # 5. Baja rotación (Cold / Exilio)
    {
        "name": "Exile Item (Z)",
        "item": {"Bin_1": "", "Item_Code": "Z01", "Item_Description": "SLOW PICK SKU", "Weight_per_Unit": "1.0"},
        "sic": "Z"
    },
    # 6. Reubicación proactiva - Item HOT que ya está en ubicación ideal y con score >= 8
    {
        "name": "Proactive keep (Hot item in score >= 8)",
        # Busquemos un bin con spot=Hot, score=10 en storage para simularlo
        "item": {"Bin_1": "CA0100", "Item_Code": "W02", "Item_Description": "FAST PICK SKU", "Weight_per_Unit": "2.0"},
        "sic": "W"
    }
]

# Ajustar Bin_1 de prueba proactiva usando un bin real del layout que tenga score >= 8 y spot Hot si existe, o cambiarlo
for b_code, b_info in storage.items():
    if str(b_info.get('spot', '')).lower() == 'hot' and b_info.get('score', 0) >= 8:
        test_cases[5]["item"]["Bin_1"] = b_code
        break

print("=== INICIANDO COMPARACIÓN DE CORRECTITUD PYTHON VS RUST ===")
all_pass = True

# Serializar datos estáticos una sola vez para Rust
storage_json = json.dumps(storage)
turnover_json = json.dumps(turnover_map)
zone_rules_json = json.dumps(zone_rules)
mix_limits_json = json.dumps(mix_limits)
occupancy_json = json.dumps(occupancy)

for tc in test_cases:
    item = tc["item"]
    sic = tc["sic"]
    
    # Ejecutar en Python
    py_res = get_suggested_bin_python(storage, turnover_map, zone_rules, mix_limits, item, occupancy, sic)
    
    # Ejecutar en Rust
    item_json = json.dumps(item)
    rust_res = logix_rust_core.get_suggested_bin_rust(
        storage_json,
        turnover_json,
        zone_rules_json,
        mix_limits_json,
        item_json,
        occupancy_json,
        sic
    )
    
    match = (py_res == rust_res)
    if match:
        print(f"✅ [{tc['name']}] COINCIDE -> Python: {py_res} | Rust: {rust_res}")
    else:
        print(f"❌ [{tc['name']}] ¡DISCREPANCIA! -> Python: {py_res} | Rust: {rust_res}")
        all_pass = False

# Benchmark de rendimiento: 1000 iteraciones usando orjson (como en la app real)
import orjson
print("\n=== BENCHMARK: 1,000 ITERACIONES CON ORJSON ===")
tc_bench = test_cases[3] # High Rotation Item
item_bench = tc_bench["item"]
sic_bench = tc_bench["sic"]

# Pre-generar estructuras para Python
start_py = time.perf_counter()
for _ in range(1000):
    _ = get_suggested_bin_python(storage, turnover_map, zone_rules, mix_limits, item_bench, occupancy, sic_bench)
duration_py = time.perf_counter() - start_py

# 2. Rust con orjson overhead (simula get_suggested_bin completo de la app)
start_rust = time.perf_counter()
for _ in range(1000):
    _s_json = orjson.dumps(storage).decode('utf-8')
    _t_json = orjson.dumps(turnover_map).decode('utf-8')
    _z_json = orjson.dumps(zone_rules).decode('utf-8')
    _m_json = orjson.dumps(mix_limits).decode('utf-8')
    _i_json = orjson.dumps(item_bench).decode('utf-8')
    _o_json = orjson.dumps(occupancy).decode('utf-8')
    _ = logix_rust_core.get_suggested_bin_rust(
        _s_json, _t_json, _z_json, _m_json, _i_json, _o_json, sic_bench
    )
duration_rust = time.perf_counter() - start_rust

speedup = duration_py / duration_rust if duration_rust > 0 else float('inf')
print(f"Tiempo Total Python (1,000 llamadas): {duration_py:.4f}s")
print(f"Tiempo Total Rust (1,000 llamadas + JSON overhead completo): {duration_rust:.4f}s")
print(f"=> ¡Rust con serialización JSON en cada llamada es {speedup:.2f} veces más rápido!")

# 3. Rust con layout pre-serializado (procesamiento por lotes / caché)
print("\n=== BENCHMARK: 1,000 ITERACIONES CON LAYOUT PRE-SERIALIZADO ===")
_s_json = orjson.dumps(storage).decode('utf-8')
_t_json = orjson.dumps(turnover_map).decode('utf-8')
_z_json = orjson.dumps(zone_rules).decode('utf-8')
_m_json = orjson.dumps(mix_limits).decode('utf-8')
_o_json = orjson.dumps(occupancy).decode('utf-8')

start_rust_cached = time.perf_counter()
for _ in range(1000):
    _i_json = orjson.dumps(item_bench).decode('utf-8')
    _ = logix_rust_core.get_suggested_bin_rust(
        _s_json, _t_json, _z_json, _m_json, _i_json, _o_json, sic_bench
    )
duration_rust_cached = time.perf_counter() - start_rust_cached

speedup_cached = duration_py / duration_rust_cached if duration_rust_cached > 0 else float('inf')
print(f"Tiempo Total Rust (1,000 llamadas + layout pre-serializado): {duration_rust_cached:.4f}s")
print(f"=> ¡Rust con layout pre-serializado es {speedup_cached:.2f} veces más rápido!")

if all_pass:
    print("\n🎉 ¡TODAS LAS PRUEBAS DE CORRECTITUD PASARON CORRECTAMENTE!")
else:
    print("\n⚠️ ALGUNAS PRUEBAS FALLARON. POR FAVOR REVISA LAS DISCREPANCIAS.")

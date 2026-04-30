import orjson
import os

from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.sql_models import MasterItem, Log, BinLocation, SlottingRule
from app.core.config import SLOTTING_PARAMS_PATH

class SlottingService:
    def __init__(self):
        self.params_path = SLOTTING_PARAMS_PATH

    def get_sic_code_by_hits(self, hits: int) -> str:
        """Categoriza un ítem basándose en su frecuencia de movimiento (Hits)."""
        if hits > 30: return 'W'
        if hits >= 11: return 'X'
        if hits >= 7: return 'Y'
        if hits >= 5: return 'K'
        if hits >= 3: return 'L'
        if hits >= 1: return 'Z'
        return '0'

    async def _get_item_hits(self, db: AsyncSession, item_code: str, days: int = 90) -> int:
        """Obtiene el conteo de movimientos históricos para un ítem."""
        import datetime
        try:
            # Buscamos en logs de los últimos N días
            since_date = (datetime.datetime.now() - datetime.timedelta(days=days)).isoformat()
            stmt = select(func.count(Log.id)).where(and_(Log.itemCode == item_code, Log.timestamp >= since_date))
            res = await db.execute(stmt)
            return res.scalar() or 0
        except: return 0

    async def _get_layout_config(self, db: AsyncSession) -> Dict[str, Any]:
        """Obtiene la configuración del layout con prioridad en SQL y fallback en JSON."""
        # 1. Intentar obtener de SQL (Ubicaciones)
        res_bins = await db.execute(select(BinLocation))
        bins_sql = res_bins.scalars().all()
        
        storage = {}
        if bins_sql:
            storage = {b.bin_code: {"zone": b.zone, "aisle": b.aisle, "level": b.level, "spot": b.spot, "score": b.score} for b in bins_sql}
        
        # 2. Intentar obtener de SQL (Reglas de Rotación)
        res_rules = await db.execute(select(SlottingRule))
        rules_sql = res_rules.scalars().all()
        
        turnover = {}
        if rules_sql:
            turnover = {r.sic_code: {"range": r.description, "spot": r.ideal_spot} for r in rules_sql}

        # 3. Extraer reglas de negocio dinámicas siempre desde JSON
        zone_rules = {}
        mix_limits = {}
        if os.path.exists(self.params_path):
            try:
                with open(self.params_path, 'rb') as f:
                    config = orjson.loads(f.read())
                    zone_rules = config.get("zone_rules", {})
                    mix_limits = config.get("mix_limits", {})
                    
                    if not storage:
                        storage = config.get("storage", {})
                    if not turnover:
                        turnover = config.get("turnover", {})
            except: pass
            
        return {
            "storage": storage, 
            "turnover": turnover,
            "zone_rules": zone_rules,
            "mix_limits": mix_limits
        }

    async def get_suggested_bin(self, db: AsyncSession, item_details: Dict[str, Any]) -> Optional[str]:
        """Calcula la mejor ubicación disponible basada en el mapa de slotting, scores y reglas de negocio."""
        config = await self._get_layout_config(db)
        storage = config.get('storage', {})
        turnover_map = config.get('turnover', {})
        zone_rules = config.get('zone_rules', {})
        mix_limits = config.get('mix_limits', {})
        
        current_bin = str(item_details.get('Bin_1', '')).strip().upper()
        item_code = str(item_details.get('Item_Code', '')).strip()

        # Prioridad 1: Confiar en la clasificación oficial del Maestro (ERP)
        sic_code = str(item_details.get('SIC_Code_stockroom', '')).strip().upper()

        # Prioridad 2 (Fallback): Si el ERP no mandó SIC Code (vacío o '0'), intentar deducirlo por actividad local
        if not sic_code or sic_code == '0' or sic_code == 'N/A':
            hits = await self._get_item_hits(db, item_code)
            sic_code = self.get_sic_code_by_hits(hits)
            
        # Si aún así no hay nada, por defecto es '0' (Cold)
        if not sic_code:
            sic_code = '0'

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

        occupancy = await self._get_bins_occupancy(db)
        
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
        elif sic_code in exile_sics:
            target_zone = "Rack"
            target_levels = exile_levels
        else:
            # Todo lo demás
            target_zone = "Rack"
            target_levels = default_levels
        
        if target_zone is None:
            forbidden_zones = ["Cantilever", "Minuteria"]

        # --- BÚSQUEDA DE CANDIDATOS EN EL MAPA ---
        candidates = []
        for bin_code, info in storage.items():
            zone = info.get('zone')
            level = info.get('level')
            score = info.get('score', 0)
            if zone in forbidden_zones: continue
            if target_zone and zone != target_zone: continue
            if target_levels and level not in target_levels: continue
            if target_score_min is not None and score < target_score_min: continue
            if target_score_max is not None and score > target_score_max: continue

            current_items = occupancy.get(bin_code.upper(), 0)
            
            # Dinámica de límites configurables
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

        # --- ORDENAMIENTO POR SCORE Y ROTACIÓN ---
        # Prioridad: 
        # 1. Que coincida el SPOT (Hot/Cold)
        # 2. Si es HOT, mayor SCORE físico. Si es COLD, menor SCORE físico.
        # 3. Menor OCUPACIÓN.

        if ideal_spot == 'hot':
            candidates.sort(key=lambda x: (x['spot'] != 'hot', -x['score'], x['occupancy']))
        elif ideal_spot == 'warm':
            candidates.sort(key=lambda x: (x['spot'] != 'warm', -x['score'], x['occupancy']))
        else:
            candidates.sort(key=lambda x: (x['spot'] != 'cold', x['score'], x['occupancy']))

        return candidates[0]['bin']

    async def _get_bins_occupancy(self, db: AsyncSession) -> Dict[str, int]:
        """Calcula cuántos SKUs hay en cada bin (Cruza maestro + reubicaciones activas)."""
        occupancy = {}
        try:
            # 1. Master Items (Stock físico actual)
            master_stmt = select(MasterItem.bin_1, func.count(MasterItem.item_code)).where(MasterItem.physical_qty > 0).group_by(MasterItem.bin_1)
            master_res = await db.execute(master_stmt)
            for bin_code, count in master_res.all():
                if bin_code:
                    code = str(bin_code).strip().upper()
                    occupancy[code] = occupancy.get(code, 0) + count

            # 2. Logs Activos (Mercancía en camino a un bin)
            logs_stmt = select(Log.relocatedBin, func.count(func.distinct(Log.itemCode))).where(and_(Log.archived_at == None, Log.relocatedBin != '', Log.relocatedBin != None)).group_by(Log.relocatedBin)
            logs_res = await db.execute(logs_stmt)
            for bin_code, count in logs_res.all():
                if bin_code:
                    code = str(bin_code).strip().upper()
                    occupancy[code] = occupancy.get(code, 0) + count
        except Exception as e:
            print(f"Error calculando ocupación: {e}")
        return occupancy

    async def get_occupancy_report(self, db: AsyncSession) -> Dict[str, Any]:
        """Genera el reporte de métricas del mapa de slotting."""
        occupancy = await self._get_bins_occupancy(db)
        config = await self._get_layout_config(db)
        storage = config.get('storage', {})
        
        zones_by_items = {}
        aisles_by_items = {}
        total_items = 0
        
        report = {
            "summary": {
                "total_bins": len(storage), 
                "filled_bins": 0, 
                "available_bins": 0,
                "occupancy_pct": 0,
                "total_items": 0,
                "avg_items_per_bin": 0
            },
            "zones": {},
            "analytics": {
                "zones_by_items": {},
                "top_aisles": {}
            }
        }
        
        for bin_code, info in storage.items():
            zone = info.get('zone', 'Unknown')
            level = info.get('level', 0)
            aisle = info.get('aisle', 'N/A')
            
            if zone not in report["zones"]:
                report["zones"][zone] = {"total": 0, "occupied": 0, "levels": {}}
            
            if level not in report["zones"][zone]["levels"]:
                report["zones"][zone]["levels"][level] = {"total": 0, "occupied_skus": 0, "full_bins": 0}
            
            report["zones"][zone]["total"] += 1
            report["zones"][zone]["levels"][level]["total"] += 1
            
            current_skus = occupancy.get(bin_code.upper(), 0)
            limit = 3 if zone == "Minuteria" else 4
            
            if current_skus > 0:
                report["zones"][zone]["occupied"] += 1
                report["summary"]["filled_bins"] += 1
                report["zones"][zone]["levels"][level]["occupied_skus"] += current_skus
                total_items += current_skus
                
                zones_by_items[zone] = zones_by_items.get(zone, 0) + current_skus
                if aisle != 'N/A':
                    aisles_by_items[aisle] = aisles_by_items.get(aisle, 0) + current_skus

                if current_skus >= limit:
                    report["zones"][zone]["levels"][level]["full_bins"] += 1
            else:
                report["summary"]["available_bins"] += 1
        
        report["summary"]["total_items"] = total_items
        if report["summary"]["total_bins"] > 0:
            report["summary"]["occupancy_pct"] = round((report["summary"]["filled_bins"] / report["summary"]["total_bins"]) * 100, 1)
            report["summary"]["avg_items_per_bin"] = round(total_items / report["summary"]["filled_bins"], 1) if report["summary"]["filled_bins"] > 0 else 0

        report["analytics"]["zones_by_items"] = dict(sorted(zones_by_items.items(), key=lambda x: x[1], reverse=True)[:5])
        report["analytics"]["top_aisles"] = dict(sorted(aisles_by_items.items(), key=lambda x: x[1], reverse=True)[:5])
        report["analytics"]["bins_by_zone"] = {z: data["total"] for z, data in report["zones"].items()}
        report["analytics"]["bins_by_zone"] = dict(sorted(report["analytics"]["bins_by_zone"].items(), key=lambda x: x[1], reverse=True))
                
        return report

slotting_service = SlottingService()

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
            storage = {b.bin_code: {"zone": b.zone, "aisle": b.aisle, "level": b.level, "spot": b.spot} for b in bins_sql}
        
        # 2. Intentar obtener de SQL (Reglas de Rotación)
        res_rules = await db.execute(select(SlottingRule))
        rules_sql = res_rules.scalars().all()
        
        turnover = {}
        if rules_sql:
            turnover = {r.sic_code: {"range": r.description, "spot": r.ideal_spot} for r in rules_sql}

        # 3. Fallback al JSON si SQL está vacío (Migración inicial)
        if not storage and os.path.exists(self.params_path):
            try:
                with open(self.params_path, 'rb') as f:
                    config = orjson.loads(f.read())
                    storage = config.get("storage", {})
                    if not turnover:
                        turnover = config.get("turnover", {})
            except: pass
            
        return {"storage": storage, "turnover": turnover}

    async def get_suggested_bin(self, db: AsyncSession, item_details: Dict[str, Any]) -> Optional[str]:
        """Calcula la mejor ubicación disponible basada en el mapa de slotting y reglas de negocio."""
        config = await self._get_layout_config(db)
        storage = config.get('storage', {})
        turnover_map = config.get('turnover', {})
        
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
        if sic_code in ['W', 'X', 'Y']: 
            ideal_spot = 'hot'
        elif sic_code in ['K', 'L', 'Z', '0']:
            ideal_spot = 'cold'

        # Reubicación Proactiva: Si el ítem ya está en una ubicación válida en el maestro...
        if current_bin in storage:
            current_spot = str(storage[current_bin].get('spot', 'cold')).lower()
            # Si el spot actual coincide con el ideal, NO sugerimos nada nuevo (se queda ahí)
            if current_spot == ideal_spot:
                return None
            # Si NO coincide (ej. está en cold y ahora es hot), el algoritmo continuará y sugerirá un nuevo bin

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

        # --- REGLAS DE NEGOCIO POR ATRIBUTOS ---
        if "ROD" in description or "INTEGRAL STEEL" in description:
            target_zone = "Cantilever"
        elif 0 < weight < 0.1:
            target_zone = "Minuteria"
        elif weight > 10:
            target_levels = [3, 4, 5]
            target_zone = "Rack"
        elif 2 <= weight <= 10:
            target_levels = [2]
            target_zone = "Rack"
        elif 0.1 <= weight < 2:
            target_zone = "Rack"
            if sic_code in ['W', 'X']:
                target_levels = [1]
            elif sic_code in ['Y', 'K']:
                target_levels = [1, 2]
            else:
                target_levels = [3, 4, 5]
        
        if target_zone is None:
            forbidden_zones = ["Cantilever", "Minuteria"]

        # --- BÚSQUEDA DE CANDIDATOS EN EL MAPA ---
        candidates = []
        for bin_code, info in storage.items():
            zone = info.get('zone')
            level = info.get('level')
            if zone in forbidden_zones: continue
            if target_zone and zone != target_zone: continue
            if target_levels and level not in target_levels: continue

            current_items = occupancy.get(bin_code.upper(), 0)
            limit = 3 if zone == "Minuteria" else 4
            
            if current_items < limit:
                candidates.append({
                    'bin': bin_code,
                    'occupancy': current_items,
                    'spot': str(info.get('spot', 'Cold')).lower()
                })

        # --- FILTRADO POR ROTACIÓN (HOT/COLD) ---
        # Nueva organización: W, X, Y son HOT. K, L, Z, 0 son COLD.
        ideal_spot = turnover_map.get(sic_code, {}).get('spot', 'cold').lower()
        if sic_code in ['W', 'X', 'Y']: 
            ideal_spot = 'hot'
        elif sic_code in ['K', 'L', 'Z', '0']:
            ideal_spot = 'cold'

        # Filtrar candidatos que coincidan con el spot ideal
        matches = [c for c in candidates if c['spot'] == ideal_spot]
        if matches:
            candidates = matches

        # Ordenar por afinidad de spot y luego por menor ocupación
        candidates.sort(key=lambda x: (x['spot'] != ideal_spot, x['occupancy']))
        return candidates[0]['bin'] if candidates else None

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

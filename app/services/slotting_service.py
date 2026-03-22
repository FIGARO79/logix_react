import json
import os
import pandas as pd
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.sql_models import MasterItem, Log
from app.core.config import SLOTTING_PARAMS_PATH

class SlottingService:
    def __init__(self):
        self.params_path = SLOTTING_PARAMS_PATH
        self.params = self._load_params()

    def _load_params(self) -> Dict[str, Any]:
        try:
            if os.path.exists(self.params_path):
                with open(self.params_path, 'r') as f:
                    return json.load(f)
        except Exception as e:
            print(f"Error cargando slotting_parameters.json: {e}")
        return {"turnover": {}, "storage": {}}

    async def get_suggested_bin(self, db: AsyncSession, item_details: Dict[str, Any]) -> Optional[str]:
        # Recargar parámetros por si cambiaron en admin
        storage = self._load_params().get('storage', {})
        current_bin = str(item_details.get('Bin_1', '')).strip().upper()

        if current_bin in storage:
            return None

        occupancy = await self._get_bins_occupancy(db)
        
        target_zone = None
        target_levels = None
        forbidden_zones = []
        description = str(item_details.get('Item_Description', '')).upper()
        sic_code = str(item_details.get('SIC_Code_stockroom', '')).strip().upper()
        
        weight = 0.0
        try:
            weight_val = item_details.get('Weight_per_Unit', '0')
            weight = float(str(weight_val).replace(',', '')) if weight_val else 0.0
        except: pass

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
            else:
                target_levels = [1, 2]
        
        if target_zone is None:
            forbidden_zones = ["Cantilever", "Minuteria"]

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
                    'spot': info.get('spot', 'Cold').lower()
                })

        turnover_map = self._load_params().get('turnover', {})
        ideal_spot = turnover_map.get(sic_code, {}).get('spot', 'cold').lower()
        
        # Forzar 'hot' para W y Z si no está definido en el mapa de rotación
        if sic_code in ['W', 'Z']:
            ideal_spot = 'hot'

        if sic_code in ['Y', 'K', 'L', 'Z', '0', 'W']:
            exact_matches = [c for c in candidates if c['spot'] == ideal_spot]
            if exact_matches: candidates = exact_matches

        candidates.sort(key=lambda x: (x['spot'] != ideal_spot, x['occupancy']))
        return candidates[0]['bin'] if candidates else None

    async def _get_bins_occupancy(self, db: AsyncSession) -> Dict[str, int]:
        """Calcula cuántos SKUs hay en cada bin."""
        occupancy = {}
        try:
            # 1. Master Items
            master_stmt = select(MasterItem.bin_1, func.count(MasterItem.item_code)).where(MasterItem.physical_qty > 0).group_by(MasterItem.bin_1)
            master_res = await db.execute(master_stmt)
            for bin_code, count in master_res.all():
                if bin_code:
                    code = str(bin_code).strip().upper()
                    occupancy[code] = occupancy.get(code, 0) + count

            # 2. Logs Activos (Reubicaciones pendientes)
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
        """Genera un reporte detallado de ocupación por zona y nivel."""
        occupancy = await self._get_bins_occupancy(db)
        storage = self._load_params().get('storage', {})
        
        # Diccionarios para estadísticas avanzadas
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
            
            # Contar bin en zona y nivel
            report["zones"][zone]["total"] += 1
            report["zones"][zone]["levels"][level]["total"] += 1
            
            # Calcular ocupación real de este bin
            current_skus = occupancy.get(bin_code.upper(), 0)
            limit = 3 if zone == "Minuteria" else 4
            
            if current_skus > 0:
                report["zones"][zone]["occupied"] += 1
                report["summary"]["filled_bins"] += 1
                report["zones"][zone]["levels"][level]["occupied_skus"] += current_skus
                total_items += current_skus
                
                # Stats para analítica
                zones_by_items[zone] = zones_by_items.get(zone, 0) + current_skus
                if aisle != 'N/A':
                    aisles_by_items[aisle] = aisles_by_items.get(aisle, 0) + current_skus

                if current_skus >= limit:
                    report["zones"][zone]["levels"][level]["full_bins"] += 1
            else:
                report["summary"]["available_bins"] += 1
        
        # Cálculos finales de resumen
        report["summary"]["total_items"] = total_items
        if report["summary"]["total_bins"] > 0:
            report["summary"]["occupancy_pct"] = round((report["summary"]["filled_bins"] / report["summary"]["total_bins"]) * 100, 1)
            # Unificación: Promedio basado en bins en uso (densidad real)
            report["summary"]["avg_items_per_bin"] = round(total_items / report["summary"]["filled_bins"], 1) if report["summary"]["filled_bins"] > 0 else 0

        # Ordenar analítica
        report["analytics"]["zones_by_items"] = dict(sorted(zones_by_items.items(), key=lambda x: x[1], reverse=True)[:5])
        report["analytics"]["top_aisles"] = dict(sorted(aisles_by_items.items(), key=lambda x: x[1], reverse=True)[:5])
        
        # Agregar conteo de bins por zona (Layout Físico)
        report["analytics"]["bins_by_zone"] = {z: data["total"] for z, data in report["zones"].items()}
        report["analytics"]["bins_by_zone"] = dict(sorted(report["analytics"]["bins_by_zone"].items(), key=lambda x: x[1], reverse=True))
                
        return report

slotting_service = SlottingService()

import datetime
import os
import orjson
from typing import Dict, Any, Optional, List
from sqlalchemy import select, update, insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.sql_models import AIItemPattern, AICategoryPattern
from app.core.config import PROJECT_ROOT

class AISlottingService:
    def __init__(self):
        # Cache en memoria para predicciones instantáneas
        self._item_cache = {}
        self._category_cache = {}
        self._initialized = False

    async def _ensure_initialized(self, db: AsyncSession):
        """Carga los patrones de la DB a la memoria RAM al primer uso."""
        if self._initialized:
            return

        # 1. Intentar migrar desde JSON legacy si la DB está vacía
        await self._migrate_from_json_if_needed(db)

        # 2. Cargar patrones de ítems
        result_items = await db.execute(select(AIItemPattern))
        for p in result_items.scalars().all():
            if p.item_code not in self._item_cache:
                self._item_cache[p.item_code] = {}
            self._item_cache[p.item_code][p.bin_code] = p.frequency

        # 3. Cargar patrones de categorías
        result_cats = await db.execute(select(AICategoryPattern))
        for p in result_cats.scalars().all():
            if p.sic_code not in self._category_cache:
                self._category_cache[p.sic_code] = {}
            self._category_cache[p.sic_code][p.bin_code] = p.frequency

        self._initialized = True
        print(f"🧠 IA Slotting: Memoria cargada ({len(self._item_cache)} ítems, {len(self._category_cache)} categorías)")

    async def _migrate_from_json_if_needed(self, db: AsyncSession):
        """Migra la memoria de IA desde el archivo JSON legacy a la base de datos SQL."""
        # Verificar si ya hay datos
        res = await db.execute(select(AIItemPattern).limit(1))
        if res.scalar_one_or_none():
            return

        json_path = os.path.join(PROJECT_ROOT, "static", "json", "ai_slotting_memory.json")
        if not os.path.exists(json_path):
            return

        print("🚚 [IA] Migrando memoria JSON legacy a SQL...")
        try:
            with open(json_path, 'rb') as f:
                memory = orjson.loads(f.read())
            
            # Migrar ítems
            items = memory.get("items", {})
            for code, bins in items.items():
                for bin_code, freq in bins.items():
                    db.add(AIItemPattern(item_code=code.upper(), bin_code=bin_code.upper(), frequency=freq))
            
            # Migrar categorías
            cats = memory.get("categories", {})
            for sic, bins in cats.items():
                for bin_code, freq in bins.items():
                    db.add(AICategoryPattern(sic_code=sic.upper(), bin_code=bin_code.upper(), frequency=freq))
            
            await db.commit()
            print("✅ [IA] Migración completada con éxito.")
        except Exception as e:
            print(f"⚠️ [IA] Error en migración JSON -> SQL: {e}")
            await db.rollback()

    async def learn_from_decision(self, db: AsyncSession, item_code: str, final_bin: str, sic_code: str):
        """
        Registra una decisión de ubicación exitosa en la DB y actualiza el cache.
        Excluye ubicaciones virtuales como XDOCK para no contaminar la IA.
        """
        if not final_bin or not item_code:
            return

        final_bin = final_bin.strip().upper()
        
        # Filtro de seguridad: No aprender de bines virtuales
        if final_bin in ["XDOCK", "PUTAWAY", "STAGE", "TRANSITO"]:
            return

        await self._ensure_initialized(db)
        
        item_code = item_code.strip().upper()
        sic_code = sic_code.strip().upper() if sic_code else "N/A"
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # 1. Aprender por Item Específico (DB + Cache)
        if item_code not in self._item_cache:
            self._item_cache[item_code] = {}
        
        self._item_cache[item_code][final_bin] = self._item_cache[item_code].get(final_bin, 0) + 1
        
        stmt_item = select(AIItemPattern).where(AIItemPattern.item_code == item_code, AIItemPattern.bin_code == final_bin)
        res_item = await db.execute(stmt_item)
        existing_item = res_item.scalar_one_or_none()
        
        if existing_item:
            existing_item.frequency += 1
            existing_item.last_updated = now
        else:
            db.add(AIItemPattern(item_code=item_code, bin_code=final_bin, frequency=1, last_updated=now))

        # 2. Aprender por Categoría (DB + Cache)
        if sic_code not in self._category_cache:
            self._category_cache[sic_code] = {}
        
        self._category_cache[sic_code][final_bin] = self._category_cache[sic_code].get(final_bin, 0) + 1
        
        stmt_cat = select(AICategoryPattern).where(AICategoryPattern.sic_code == sic_code, AICategoryPattern.bin_code == final_bin)
        res_cat = await db.execute(stmt_cat)
        existing_cat = res_cat.scalar_one_or_none()
        
        if existing_cat:
            existing_cat.frequency += 1
            existing_cat.last_updated = now
        else:
            db.add(AICategoryPattern(sic_code=sic_code, bin_code=final_bin, frequency=1, last_updated=now))

        await db.commit()

    async def predict_best_bin(self, db: AsyncSession, item_code: str, sic_code: str, fallback_bin: Optional[str] = None) -> Optional[str]:
        """
        Predice la ubicación más probable basada en el cache de memoria (respaldado por DB).
        Filtra las predicciones por categoría asegurando que el spot (Hot/Cold) coincida.
        """
        await self._ensure_initialized(db)
        
        item_code = item_code.strip().upper()
        sic_code = sic_code.strip().upper() if sic_code else "N/A"

        # Prioridad 1: Item específico (Alta Confianza)
        if item_code in self._item_cache:
            bins = self._item_cache[item_code]
            best_bin = max(bins, key=bins.get)
            if bins[best_bin] >= 2:
                return best_bin

        # Prioridad 2: Categoría SIC (Media Confianza con Conciencia Espacial)
        if sic_code in self._category_cache:
            # Obtener configuración del almacén localmente para evitar importaciones circulares
            from app.services.slotting_service import slotting_service
            config = await slotting_service._get_layout_config(db)
            storage = config.get('storage', {})
            turnover_map = config.get('turnover', {})

            # Determinar el spot ideal de la categoría
            ideal_spot = turnover_map.get(sic_code, {}).get('spot', 'cold').lower()
            if sic_code in ['W', 'X', 'Y']: 
                ideal_spot = 'hot'
            elif sic_code in ['K', 'L', 'Z', '0']:
                ideal_spot = 'cold'

            # Filtrar ubicaciones aprendidas que tengan al menos 5 repeticiones
            valid_bins = {b: freq for b, freq in self._category_cache[sic_code].items() if freq >= 5}
            
            # Filtrar solo aquellas que coincidan con el spot ideal (Hot/Cold) del mapa
            spot_matched_bins = {}
            for b, freq in valid_bins.items():
                bin_spot = str(storage.get(b, {}).get('spot', 'cold')).lower()
                if bin_spot == ideal_spot:
                    spot_matched_bins[b] = freq

            if spot_matched_bins:
                # Retornar el bin más frecuente que cumple con la regla de optimización de espacio
                best_bin = max(spot_matched_bins, key=spot_matched_bins.get)
                return best_bin

        return fallback_bin

ai_slotting = AISlottingService()

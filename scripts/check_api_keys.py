import asyncio
import os
import sys

# Añadir el directorio raíz al path para poder importar app
sys.path.append('/home/debian/logix_granian')

from app.routers.picking import get_picking_order
from fastapi import Request

async def check_api():
    # Mocking despatch/order
    # Usaremos el mismo que vi en el head del CSV si es posible, o uno genérico
    # CSV: ...,0045040,02,6,... (Order, Despatch, Line)
    #      ...,0045038,01,47,...
    
    # Probaremos con 0045040 / 02
    try:
        response = await get_picking_order("0045040", "02")
        import json
        data = json.loads(response.body)
        if data:
            print("Keys in first item:", data[0].keys())
            print("Sample item:", data[0])
        else:
            print("No data found for 0045040 / 02")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_api())

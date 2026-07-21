import sys

def parse_quantity_smart(val) -> float:
    if val is None:
        return 0.0
    val_str = str(val).strip()
    if not val_str:
        return 0.0
    
    if "," in val_str and "." in val_str:
        last_comma = val_str.rfind(",")
        last_dot = val_str.rfind(".")
        if last_comma > last_dot:
            # Formato europeo: 1.200,50
            val_str = val_str.replace(".", "").replace(",", ".")
        else:
            # Formato US: 1,200.50
            val_str = val_str.replace(",", "")
    elif "," in val_str:
        parts = val_str.split(",")
        if len(parts[-1]) != 3:
            # Decimal con coma (ej. 9,0 o 12,50)
            val_str = val_str.replace(",", ".")
        else:
            # Separador de miles ambiguo, asume entero (ej. 1,200)
            val_str = val_str.replace(",", "")
            
    try:
        return float(val_str)
    except ValueError:
        return 0.0

test_cases = [
    "9.0",
    "9,0",
    "9,50",
    "1200",
    "1,200",
    "1.200",
    "1,200.50",
    "1.200,50",
    "12,0"
]

for t in test_cases:
    print(f"'{t}' -> {parse_quantity_smart(t)}")

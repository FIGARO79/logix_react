import sys
from app.services.csv_handler import parse_quantity_smart

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

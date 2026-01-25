# Mejora: Asignación de Artículos por Bulto en Picking

## Descripción
Esta mejora permite asignar artículos específicos a cada bulto durante el proceso de auditoría de picking, generando un packing list detallado que indica exactamente qué artículos van en cada bulto.

## Cambios Implementados

### 1. Base de Datos
- **Nueva tabla**: `picking_package_items`
  - Almacena la relación entre artículos y bultos
  - Campos: audit_id, package_number, item_code, description, qty_scan

### 2. Backend (Python/FastAPI)
- **Modelos actualizados**:
  - `PickingPackageItem` en `sql_models.py`
  - Schema `PickingAudit` actualizado para incluir `packages_assignment`
  
- **Endpoints nuevos/actualizados**:
  - `POST /api/save_picking_audit` - Ahora guarda la asignación de artículos a bultos
  - `GET /api/packing_list/{audit_id}` - Obtiene el packing list en formato JSON
  - `GET /packing_list_print/{audit_id}` - Página HTML para imprimir packing list

### 3. Frontend (HTML/JavaScript)
- **Modal de bultos mejorado** (`picking.html`):
  - Interfaz para asignar artículos a cada bulto
  - Selectores para agregar artículos
  - Botones para remover artículos
  - Visualización del contenido de cada bulto

- **Página de impresión** (`packing_list_print.html`):
  - Formato profesional para impresión
  - Un bulto por página
  - Información completa del pedido
  - Lista detallada de artículos por bulto

## Instrucciones de Uso

### Migración de Base de Datos

#### Opción 1: Para MySQL (Producción - PythonAnywhere)
Ejecutar en la consola MySQL de PythonAnywhere:
```sql
CREATE TABLE IF NOT EXISTS picking_package_items (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    audit_id INTEGER NOT NULL,
    package_number INTEGER NOT NULL,
    item_code VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    qty_scan INTEGER NOT NULL,
    FOREIGN KEY (audit_id) REFERENCES picking_audits(id)
);

CREATE INDEX idx_package_items_audit_id ON picking_package_items(audit_id);
```

O desde la consola bash de PythonAnywhere:
```bash
mysql -u whcol -h whcol.mysql.pythonanywhere-services.com -p whcol\$default << EOF
CREATE TABLE IF NOT EXISTS picking_package_items (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    audit_id INTEGER NOT NULL,
    package_number INTEGER NOT NULL,
    item_code VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    qty_scan INTEGER NOT NULL,
    FOREIGN KEY (audit_id) REFERENCES picking_audits(id)
);

CREATE INDEX idx_package_items_audit_id ON picking_package_items(audit_id);
EOF
```

#### Opción 2: Para SQLite (Desarrollo Local)
```bash
alembic upgrade head
```
O manualmente:
```sql
CREATE TABLE IF NOT EXISTS picking_package_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_id INTEGER NOT NULL,
    package_number INTEGER NOT NULL,
    item_code VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    qty_scan INTEGER NOT NULL,
    FOREIGN KEY (audit_id) REFERENCES picking_audits(id)
);
CREATE INDEX idx_package_items_audit_id ON picking_package_items(audit_id);
```

### Uso en la Aplicación

#### Durante la Auditoría de Picking:
1. Realizar el escaneo de artículos normalmente
2. Al finalizar, hacer clic en "Finalizar Auditoría"
3. En el modal de bultos:
   - Ingresar la cantidad total de bultos
   - Hacer clic en "Generar Bultos"
   - Asignar artículos a cada bulto usando los selectores
   - Los artículos se pueden agregar a múltiples bultos si es necesario
   - Remover artículos con el botón "✕"
4. Hacer clic en "Confirmar y Guardar"

#### Para Imprimir el Packing List:
1. Ir a "Auditoría de Picking" en el menú
2. Localizar la auditoría deseada
3. Hacer clic en el botón "🖨️" (Imprimir Packing List)
4. Se abrirá una nueva ventana con el packing list
5. Usar Ctrl+P o el botón "Imprimir" para imprimir

## Características del Packing List

- **Información del pedido**: Order Number, Despatch Number, Cliente, Fecha
- **Detalle por bulto**: Cada bulto se muestra en una página separada
- **Contenido específico**: Lista de artículos con código, descripción y cantidad
- **Formato profesional**: Diseño limpio y fácil de leer
- **Listo para imprimir**: Optimizado para impresión en papel

## Beneficios

✅ **Mayor precisión**: Saber exactamente qué va en cada bulto
✅ **Mejor organización**: Facilita el empaque y despacho
✅ **Trazabilidad**: Registro detallado de contenido por bulto
✅ **Verificación simplificada**: El receptor puede verificar bulto por bulto
✅ **Reducción de errores**: Menos confusión en el empaque

## Notas Técnicas

- La asignación de bultos es opcional - si no se asignan artículos, funcionará como antes
- Los artículos no asignados no aparecerán en el packing list
- Se puede asignar el mismo artículo a múltiples bultos si es necesario
- La información se guarda en la base de datos para consultas futuras

## Soporte

Para preguntas o problemas, revisar los logs de la aplicación o contactar al equipo de desarrollo.

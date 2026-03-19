# Estructura de la Base de Datos: logix_db (MariaDB)

Este documento describe las tablas, columnas y tipos de datos de la base de datos `logix_db`, según las definiciones en los modelos de la aplicación (`app/models/sql_models.py`).

---

## Tablas de Usuarios y Sesiones

### `users`
Tabla que almacena la información de los usuarios del sistema.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | Identificador único del usuario. |
| `username` | `String(100)` | Unique, Index | Nombre de usuario para iniciar sesión. |
| `password_hash` | `String(255)` | Not Null | Hash de la contraseña del usuario. |
| `is_approved` | `Integer` | Default: 0 | Estado de aprobación por administración (0/1). |
| `permissions` | `String(500)` | Default: "" | Permisos asignados al usuario (JSON o lista separada). |

### `password_reset_tokens`
Tokens para la recuperación de contraseñas.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID interno. |
| `user_id` | `Integer` | FK (users.id) | ID del usuario que solicitó el cambio. |
| `token` | `String(255)` | Unique, Index | Token único enviado por correo. |
| `expires_at` | `String(50)` | Not Null | Fecha de expiración (ISO format). |
| `used` | `Integer` | Default: 0 | Indica si el token ya fue utilizado. |
| `created_at` | `String(50)` | Not Null | Fecha de creación. |

---

## Tablas de Auditoría e Inventario

### `logs`
Tabla de logs generales para el seguimiento de recepción y reubicación (Legacy).

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID del log. |
| `timestamp` | `String(50)` | Not Null | Fecha y hora del evento. |
| `importReference` | `String(100)` | Default: '' | Referencia del lote importado. |
| `waybill` | `String(100)` | Nullable | Guía de transporte o Air Waybill. |
| `itemCode` | `String(100)` | Nullable | Código del artículo. |
| `itemDescription` | `String(255)` | Nullable | Descripción del artículo. |
| `binLocation` | `String(100)` | Nullable | Ubicación original (source). |
| `relocatedBin` | `String(100)` | Nullable | Nueva ubicación (destination). |
| `qtyReceived` | `Integer` | Nullable | Cantidad física recibida. |
| `qtyGrn` | `Integer` | Nullable | Cantidad registrada en GRN. |
| `difference` | `Integer` | Nullable | Diferencia entre recibido y GRN. |
| `archived_at` | `String(50)` | Nullable | Fecha en que el log fue archivado. |

### `stock_counts`
Registros individuales de conteo de stock.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID del conteo. |
| `session_id` | `Integer` | FK (count_sessions.id) | Sesión de inventario asociada. |
| `timestamp` | `String(50)` | Not Null | Fecha del conteo. |
| `item_code` | `String(100)` | Not Null | Código del producto contado. |
| `item_description`| `String(255)` | Nullable | Descripción del producto. |
| `counted_qty` | `Integer` | Not Null | Cantidad física contada. |
| `counted_location`| `String(100)` | Not Null | Ubicación donde se contó. |
| `bin_location_system`| `String(100)` | Nullable | Ubicación teórica en sistema. |
| `username` | `String(100)` | Nullable | Usuario que realizó el conteo. |

### `count_sessions`
Sesiones de inventario generales.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID de la sesión. |
| `user_username` | `String(100)` | Not Null | Usuario responsable. |
| `start_time` | `String(50)` | Not Null | Inicio de la sesión. |
| `end_time` | `String(50)` | Nullable | Fin de la sesión. |
| `status` | `String(50)` | Default: 'in_progress'| Estado (abierta/cerrada). |
| `inventory_stage` | `Integer` | Default: 1 | Etapa del inventario (1er conteo, 2do, etc.). |

### `session_locations`
Ubicaciones asignadas a una sesión de conteo.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID interno. |
| `session_id` | `Integer` | FK (sessions.id) | Sesión asociada. |
| `location_code` | `String(100)` | Index | Código de la ubicación física. |
| `status` | `String(50)` | Default: 'open' | Estado (open/closed). |
| `closed_at` | `String(50)` | Nullable | Fecha de cierre de la ubicación. |
| `count_stage` | `Integer` | Nullable | Etapa en la que fue cerrada. |

---

## Tablas de Auditoría de Picking y Despachos

### `picking_audits`
Tabla principal para la auditoría de pedidos.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID de la auditoría. |
| `order_number` | `String(100)` | Not Null | Número de orden/pedido. |
| `despatch_number` | `String(100)` | Not Null | Número de despacho. |
| `customer_name` | `String(255)` | Nullable | Nombre del cliente. |
| `customer_code` | `String(100)` | Nullable | Código del cliente. |
| `username` | `String(100)` | Not Null | Usuario que auditó. |
| `timestamp` | `String(50)` | Not Null | Fecha de la auditoría. |
| `status` | `String(50)` | Not Null | Resultado (Completo, Diferencia, etc.). |
| `packages` | `Integer` | Default: 0 | Cantidad de bultos/paquetes. |

### `picking_audit_items`
Líneas de auditoría por pedido.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID interno. |
| `audit_id` | `Integer` | FK (audits.id) | Cabecera de la auditoría. |
| `item_code` | `String(100)` | Not Null | Código de producto. |
| `description` | `String(255)` | Nullable | Descripción. |
| `order_line` | `String(50)` | Nullable | Número de línea en el pedido. |
| `qty_req` | `Integer` | Not Null | Cantidad requerida (sistema). |
| `qty_scan` | `Integer` | Not Null | Cantidad escaneada físicamente. |
| `difference` | `Integer` | Not Null | Diferencia detectada. |
| `edited` | `Integer` | Default: 0 | Indica si fue corregida manualmente. |

### `picking_package_items`
Contenido de cada paquete escaneado.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID interno. |
| `audit_id` | `Integer` | FK (audits.id) | Auditoría asociada. |
| `package_number` | `Integer` | Not Null | Número de bulto (Caja 1, 2, etc.). |
| `order_line` | `String(50)` | Nullable | Referencia de línea. |
| `item_code` | `String(100)` | Not Null | Código de producto. |
| `description` | `String(255)` | Nullable | Descripción. |
| `qty_scan` | `Integer` | Not Null | Cantidad dentro de la caja. |

---

## Tablas de Consolidación y Envíos (Shipments)

### `shipments`
Agrupación de múltiples auditorías para un solo envío.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID del envío. |
| `created_at` | `String(50)` | Not Null | Fecha de consolidación (ISO). |
| `username` | `String(100)` | Not Null | Usuario que consolidó. |
| `note` | `String(500)` | Nullable | Observaciones adicionales. |
| `carrier` | `String(255)` | Nullable | Empresa transportista. |
| `status` | `String(50)` | Default: 'active' | Estado (active/shipped). |

### `shipment_audits`
Tabla puente entre envíos y auditorías.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID interno. |
| `shipment_id` | `Integer` | FK (shipments.id) | ID del envío consolidado. |
| `audit_id` | `Integer` | FK (audits.id) | ID de la auditoría vinculada. |

---

## Tablas Maestras y de Ciclo

### `master_items`
Repositorio maestro de productos sincronizado.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `item_code` | `String(100)` | PK, Index | Código único del producto. |
| `description` | `String(255)` | Nullable | Descripción comercial. |
| `abc_code` | `String(10)` | Index | Categoría ABC de rotación. |
| `physical_qty` | `Integer` | Default: 0 | Cantidad actual (estimada/sinc). |
| `bin_1` | `String(100)` | Index | Ubicación primaria. |
| `additional_bin` | `String(100)` | Nullable | Ubicación secundaria. |
| `weight_per_unit` | `String(50)` | Nullable | Peso por unidad. |
| `item_type` | `String(50)` | Nullable | Tipo de ítem. |
| `item_class` | `String(50)` | Nullable | Clase de ítem. |
| `item_group_major`| `String(50)` | Nullable | Grupo mayor al que pertenece. |
| `stockroom` | `String(50)` | Nullable | Almacén asignado. |
| `cost_per_unit` | `Numeric(10, 2)` | Nullable | Costo unitario. |
| `updated_at` | `String(50)` | Nullable | Última sincronización. |

### `grn_master`
Control maestro de Goods Received Notes (Linhp).

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID interno. |
| `import_reference` | `String(255)` | Index | Identificador del archivo import. |
| `waybill` | `String(255)` | Index | Guía de transporte. |
| `grn_number` | `Text` | Nullable | Lista de GRNs generadas (puede ser texto largo). |
| `packs` | `Numeric(10, 2)` | Nullable | Cantidad de bultos declarados. |
| `aaf_date` | `String(50)` | Nullable | Fecha AAF. |
| `grn1_date` | `String(50)` | Nullable | Fecha generación GRN1. |
| `grn1_grn3` | `Numeric(10, 5)` | Nullable | Diferencia temporal de procesos. |
| `created_at` | `String(50)` | Default: ISO | Registro de creación en sistema. |

### `cycle_counts` / `cycle_count_recordings`
Tablas de seguimiento para conteos cíclicos programados.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID interno. |
| `planned_date` | `String(50)` | Not Null | Fecha planificada. |
| `executed_date` | `String(50)` | Not Null | Fecha de ejecución real. |
| `item_code` | `String(100)` | Index | Producto a contar. |
| `system_qty` | `Integer` | Default: 0 | Stock en sistema al momento. |
| `physical_qty` | `Integer` | Not Null | Stock físico contado. |
| `difference` | `Integer` | Default: 0 | Desvío detectado. |

---

## Tablas Misceláneas

### `app_state`
Configuraciones clave-valor persistentes.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `key` | `String(100)` | PK | Clave de configuración. |
| `value` | `String(255)` | Nullable | Valor configurado. |

### `recount_list`
Lista de ítems pendientes de reconteo por diferencias.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID interno. |
| `item_code` | `String(100)` | Not Null | Código de producto. |
| `stage_to_count` | `Integer` | Default: 1 | Etapa objetivo del reconteo. |
| `status` | `String(50)` | Default: 'pending'| Estado (pending/done). |

### `reconciliation_history`
Histórico detallado de conciliaciones ya procesadas y archivadas.

| Columna | Tipo de Dato | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `Integer` | PK, Autoinc | ID interno. |
| `archive_date` | `String(50)` | Index | ID del lote (timestamp ISO). |
| `item_code` | `String(100)` | Not Null | Código de producto. |
| `qty_expected` | `Integer` | Not Null | Cantidad esperada. |
| `qty_received` | `Integer` | Not Null | Cantidad final recibida. |
| `difference` | `Integer` | Not Null | Diferencia final. |
| `username` | `String(100)` | Not Null | Usuario que concilió. |

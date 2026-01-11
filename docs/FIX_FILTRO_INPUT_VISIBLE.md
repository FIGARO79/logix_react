# 🔧 FIX: Input box de filtro no se oculta en encabezado

## Problema
Al filtrar (usar el input box), el dropdown con el filtro se ocultaba detrás del encabezado de la tabla o se recortaba.

## Causa
1. **z-index bajo**: El dropdown tenía `z-index: 100`, pero el thead tenía `z-index: 10-11`
2. **overflow: hidden**: El table-container y el th tenían `overflow: hidden`, lo que recortaba el dropdown

## Soluciones Implementadas

### 1. Aumentar z-index del dropdown
```css
.filter-dropdown {
    z-index: 10000;  /* ANTES: 100 */
}
```

### 2. Cambiar overflow del table-container
```css
.table-container {
    overflow-x: auto;  /* ANTES: overflow-x: hidden */
}
```

### 3. Cambiar overflow del header de tabla
```css
.dataframe th {
    overflow: visible;  /* ANTES: overflow: hidden */
}
```

## Resultado
✅ El dropdown del filtro ahora aparece ENCIMA del encabezado  
✅ No se recorta ni se oculta  
✅ El filtro es completamente visible y funcional  

## Verificación
Para verificar que funciona:
1. Abre `/reconciliation`
2. Haz clic en cualquier icono de filtro
3. El dropdown debería aparecer completamente visible encima del encabezado
4. Escribe en el input para filtrar
5. El dropdown debería permanecer visible mientras filtras

## Archivo Modificado
- `templates/reconciliation.html` - 3 cambios de CSS

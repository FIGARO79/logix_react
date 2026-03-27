Especificación Técnica: Persistencia y Sincronización Offline para Logix1. IntroducciónEl objetivo es permitir que Logix capture datos sin conexión a internet, los almacene de forma segura en el dispositivo del usuario y los sincronice automáticamente con el backend (FastAPI) una vez que se restaure la conectividad.2. Arquitectura de ComponentesA. Identificadores Únicos (UUID)Para evitar colisiones de datos y conflictos en la base de datos centralizada, cada registro creado en el cliente debe tener un ID único universal.Implementación: Utilizar la librería uuid o la API nativa crypto.randomUUID().Razón: El servidor no puede asignar IDs secuenciales si el cliente está desconectado. El UUID permite que el registro tenga "identidad" desde su creación en el navegador.B. Almacenamiento Local (IndexedDB)IndexedDB es una base de datos NoSQL persistente dentro del navegador. A diferencia de LocalStorage, permite almacenar objetos complejos y grandes volúmenes de datos.Estructura sugerida: Una tabla (Object Store) llamada pending_sync con un índice en la fecha de creación.C. Service Worker & WorkboxEl Service Worker actúa como el "cerebro" que sobrevive a la pestaña del navegador.Workbox: Se recomienda usar la librería de Google para gestionar estrategias de caché y la cola de sincronización de fondo (Background Sync).3. Paso a Paso de la ImplementaciónPaso 1: Configuración de la Base de Datos LocalAl iniciar la aplicación, se debe inicializar IndexedDB. Se recomienda usar una librería como idb para simplificar las promesas.JavaScriptimport { openDB } from 'idb';

const dbPromise = openDB('LogixOfflineDB', 1, {
  upgrade(db) {
    db.createObjectStore('pending_sync', { keyPath: 'id' });
  },
});
Paso 2: Intercepción de GuardadoCuando el usuario intenta guardar un registro (ej. un formulario de Logix), la lógica debe ser:Generar un UUID.Verificar el estado de la red con navigator.onLine.Si hay red: Intentar envío normal a FastAPI. Si falla (error 500 o timeout), pasar al punto 4.Si NO hay red: Guardar el objeto en la tabla pending_sync de IndexedDB con un flag status: 'pending'.Paso 3: Registro del Service Worker con Background SyncEl Service Worker debe escuchar eventos de sincronización. Con Workbox, esto es casi automático:JavaScriptimport { BackgroundSyncPlugin } from 'workbox-background-sync';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

const syncPlugin = new BackgroundSyncPlugin('logix-sync-queue', {
  maxRetentionTime: 24 * 60 // Reintentar hasta por 24 horas
});

registerRoute(
  /\/api\/v1\/logix-data/, // Tu endpoint de FastAPI
  new NetworkOnly({
    plugins: [syncPlugin]
  }),
  'POST'
);
Paso 4: Sincronización al Reinicio (Recuperación)Si el equipo se apagó, al volver a abrir Logix, debemos forzar una revisión manual además del Service Worker:En el componente principal (ej. App.js), ejecutar una función de limpieza.Leer todos los registros en pending_sync.Intentar el envío de cada uno. Si el servidor responde con éxito (200 OK o 201 Created), eliminar el registro de IndexedDB.4. Manejo de Conflictos y ReintentosSituaciónEstrategia de SoluciónError de Servidor (500)El Service Worker aplicará un exponential backoff (reintentos cada vez más espaciados).Conflicto de DatosEl servidor (FastAPI) debe usar el updated_at para decidir si el dato del cliente es más nuevo que el del servidor.Cierre de NavegadorLos datos permanecen en IndexedDB. La Background Sync API despertará el proceso en cuanto haya red, incluso si la pestaña está cerrada.5. Recomendaciones de SeguridadValidación en Servidor: Aunque el cliente envíe los datos después de mucho tiempo, el backend debe validar que el UUID no exista ya y que los datos sean coherentes.Feedback al Usuario: Implementar un indicador visual (ej. una nube con una "x" o un check) para que el usuario sepa si tiene datos pendientes por subir.


Especificación Técnica: Lógica de Limpieza y Reconciliación (Logix)1. El Concepto de "Limpieza" (Cleanup)En una arquitectura offline-first, la "limpieza" no significa borrar datos al azar, sino vaciar la cola de pendientes de IndexedDB hacia el backend de FastAPI. Este proceso debe ejecutarse en dos momentos críticos:Al inicio de la aplicación: Para procesar datos que quedaron huérfanos tras un apagado del equipo.Al recuperar la conexión: Mediante el evento online del navegador.2. Flujo Lógico de Sincronización Post-ReinicioCuando el usuario enciende su equipo y abre la web de Logix, se dispara el siguiente flujo:A. Detección de PendientesLa aplicación consulta el Object Store pending_sync para ver si hay registros cuyo estado sea diferente a "completado".B. Procesamiento en Lote (Batching)En lugar de enviar 50 peticiones HTTP individuales (que podrían saturar el navegador), se agrupan los registros o se envían de forma secuencial controlada.C. Reconciliación (Manejo de Errores)Se clasifican las respuestas del servidor para decidir el destino del dato local.3. Implementación de la Función de Limpieza (JavaScript/React)Esta función debe residir en un nivel alto de tu aplicación (como un Proveedor de Contexto o el componente App.js).JavaScriptimport { openDB } from 'idb';

async function syncPendingData() {
  const db = await openDB('LogixOfflineDB', 1);
  const allPending = await db.getAll('pending_sync');

  if (allPending.length === 0) return;

  console.log(`Logix: Detectados ${allPending.length} registros pendientes.`);

  for (const record of allPending) {
    try {
      const response = await fetch('https://api.logix.com/v1/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record.data) // 'record' contiene el UUID y el payload
      });

      if (response.ok) {
        // ÉXITO: El servidor lo recibió, lo borramos de la base local
        await db.delete('pending_sync', record.id);
        console.log(`Registro ${record.id} sincronizado con éxito.`);
      } else if (response.status === 409) {
        // CONFLICTO: El dato ya existe en el servidor (duplicado)
        await db.delete('pending_sync', record.id); 
      }
      // Si es 500 u otro error, NO se borra para reintentar luego
    } catch (error) {
      console.error("Fallo de red persistente, se reintentará en la próxima sesión.");
      break; // Detener el bucle si no hay internet real
    }
  }
}
4. Estrategia de "Reintentos Automáticos"Para que el sistema sea autónomo, implementamos un escuchador de eventos global:Evento online:JavaScriptwindow.addEventListener('online', () => {
  console.log("Conexión restaurada. Iniciando limpieza...");
  syncPendingData();
});
Intervalo de Respaldo:Programar una revisión cada 5 o 10 minutos por si el Service Worker o el evento online fallan por alguna razón técnica del sistema operativo.5. Matriz de Decisiones en el Backend (FastAPI)Para que la lógica de limpieza sea segura, tu API en Python debe estar preparada para recibir datos "viejos":Código HTTPSignificado para Logix WebAcción en el Cliente201 CreatedRegistro nuevo guardado.Borrar de IndexedDB.200 OKEl registro ya existía y fue actualizado.Borrar de IndexedDB.409 ConflictEl UUID ya existe con una versión más reciente.Borrar de IndexedDB (el servidor manda).400 Bad RequestDatos corruptos o esquema inválido.Mover a una tabla de "Errores" para revisión manual.5xx / TimeoutProblema temporal del servidor.Mantener en IndexedDB para el próximo inicio.6. Consideración de UX (Interfaz de Usuario)Es vital informar al usuario sobre el estado de sus datos después de un reinicio:Badge de Sincronización: Un icono en la barra superior que muestre el número de registros en IndexedDB (ej. "Sincronizando 3 archivos...").Alerta de Éxito: Una notificación push o toast que diga: "Se han subido con éxito los datos registrados mientras estabas offline".
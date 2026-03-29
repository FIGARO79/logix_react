import React from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

function ReloadPrompt() {
  const {
    offlineReady,
    needUpdate,
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  }) || {}

  const [isOfflineReady, setIsOfflineReady] = offlineReady || [false, () => {}]
  const [isNeedUpdate, setIsNeedUpdate] = needUpdate || [false, () => {}]

  const close = () => {
    setIsOfflineReady(false)
    setIsNeedUpdate(false)
  }

  return (
    <div style={{
        position: 'fixed',
        right: '20px',
        bottom: '80px', // Por encima del SyncStatus
        zIndex: 10000,
    }}>
      {(isOfflineReady || isNeedUpdate) && (
        <div style={{
            padding: '12px 16px',
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minWidth: '200px'
        }}>
          <div style={{ fontSize: '0.9rem', color: '#333' }}>
            {isOfflineReady ? (
              <span>Aplicación lista para trabajar offline</span>
            ) : (
              <span>Nueva versión disponible. ¿Recargar para actualizar?</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            {isNeedUpdate && (
              <button 
                style={{
                    padding: '6px 12px',
                    backgroundColor: '#285f94',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                }}
                onClick={() => updateServiceWorker(true)}
              >
                Actualizar
              </button>
            )}
            <button 
                style={{
                    padding: '6px 12px',
                    backgroundColor: '#eee',
                    color: '#333',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                }}
                onClick={() => close()}
            >
                Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReloadPrompt

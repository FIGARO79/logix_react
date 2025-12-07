import React, { useState } from 'react';
import { useZxing } from 'react-zxing';
import axios from 'axios'; // Importar axios

export const ScannerPage = () => {
  const [scannedResult, setScannedResult] = useState('');
  const [quantity, setQuantity] = useState(1); // Estado para la cantidad

  const { ref } = useZxing({
    onDecodeResult(result) {
      setScannedResult(result.getText());
      if (navigator.vibrate) {
        navigator.vibrate(200);
      }
    },
  });

  // Función para enviar los datos al backend
  const handleSaveCount = async () => {
    if (!scannedResult) {
      alert('Primero escanee un código de producto.');
      return;
    }
    
    try {
      // Datos que enviaremos a la API. Ajusta user_id y task_id según tu lógica
      const countData = {
        item_code: scannedResult,
        location_name: 'A-01', // Esto debería ser dinámico más adelante
        counted_qty: quantity,
        user_id: 1, 
        task_id: 1,
      };

      // Hacemos la petición POST a nuestro backend
      const response = await axios.post('/api/counts/', countData);
      
      alert(response.data.message); // Muestra mensaje de éxito
      
      // Limpiar para el siguiente escaneo
      setScannedResult('');
      setQuantity(1);

    } catch (error) {
      console.error('Error al guardar el conteo:', error);
      alert('Hubo un error al guardar el conteo.');
    }
  };

  return (
    <div>
      <video ref={ref} style={{ width: '100%' }} />
      {scannedResult && (
        <div>
          <h3>Código: {scannedResult}</h3>
          <label>Cantidad:</label>
          <input 
            type="number" 
            value={quantity} 
            onChange={(e) => setQuantity(Number(e.target.value))}
            style={{ fontSize: '1.2rem', width: '100px' }}
          />
          <button onClick={handleSaveCount} style={{ marginLeft: '10px' }}>
            Guardar
          </button>
        </div>
      )}
    </div>
  );
};
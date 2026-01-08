/**
 * Módulo para impresión Bluetooth a impresoras Zebra ZT411
 * Usa Web Bluetooth API (solo Chrome Android)
 */

class ZebraPrinter {
    constructor() {
        this.device = null;
        this.characteristic = null;
        this.isConnected = false;

        // UUIDs de Zebra Link-OS
        this.SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
        this.WRITE_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';
    }

    /**
     * Verifica si el navegador soporta Web Bluetooth API
     */
    isBluetoothSupported() {
        if (!navigator.bluetooth) {
            console.warn('Web Bluetooth API no soportada en este navegador');
            return false;
        }
        return true;
    }

    /**
     * Conecta a la impresora Zebra vía Bluetooth
     */
    async connect() {
        if (!this.isBluetoothSupported()) {
            throw new Error('Tu navegador no soporta Bluetooth. Usa Chrome en Android.');
        }

        try {
            console.log('Solicitando dispositivo Bluetooth...');

            // Solicitar dispositivo Bluetooth
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'ZT411' },
                    { namePrefix: 'Zebra' }
                ],
                optionalServices: [this.SERVICE_UUID]
            });

            console.log('Dispositivo seleccionado:', this.device.name);

            // Conectar al servidor GATT
            console.log('Conectando al servidor GATT...');
            const server = await this.device.gatt.connect();

            // Obtener el servicio de Zebra
            console.log('Obteniendo servicio...');
            const service = await server.getPrimaryService(this.SERVICE_UUID);

            // Obtener la característica de escritura
            console.log('Obteniendo característica de escritura...');
            this.characteristic = await service.getCharacteristic(this.WRITE_CHARACTERISTIC_UUID);

            this.isConnected = true;
            console.log('Conectado exitosamente a', this.device.name);

            return {
                success: true,
                deviceName: this.device.name
            };

        } catch (error) {
            console.error('Error al conectar:', error);
            this.isConnected = false;

            // Mensajes de error más amigables
            if (error.name === 'NotFoundError') {
                throw new Error('No se encontró ninguna impresora Zebra. Verifica que esté encendida y en rango.');
            } else if (error.name === 'SecurityError') {
                throw new Error('Error de seguridad. Asegúrate de estar usando HTTPS.');
            } else if (error.message.includes('User cancelled')) {
                throw new Error('Selección de impresora cancelada.');
            } else {
                throw new Error('Error al conectar: ' + error.message);
            }
        }
    }

    /**
     * Envía comandos ZPL a la impresora
     */
    async print(zplCommand) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('No hay conexión con la impresora. Conecta primero.');
        }

        try {
            console.log('Enviando comando ZPL...');

            // Convertir el comando ZPL a bytes
            const encoder = new TextEncoder();
            const data = encoder.encode(zplCommand);

            // Enviar a la impresora
            await this.characteristic.writeValue(data);

            console.log('Comando enviado exitosamente');
            return { success: true };

        } catch (error) {
            console.error('Error al imprimir:', error);
            throw new Error('Error al enviar datos a la impresora: ' + error.message);
        }
    }

    /**
     * Desconecta de la impresora
     */
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
            this.isConnected = false;
            console.log('Desconectado de la impresora');
        }
    }

    /**
     * Genera comando ZPL para Packing List
     */
    generatePackingListZPL(auditData) {
        const {
            order_number,
            despatch_number,
            customer_name,
            items,
            packages,
            timestamp
        } = auditData;

        // Formatear fecha
        const date = timestamp ? new Date(timestamp).toLocaleDateString('es-ES') : new Date().toLocaleDateString('es-ES');

        // Construir lista de items (máximo 15 items para que quepan en la etiqueta)
        const itemLines = items.slice(0, 15).map((item, index) => {
            const yPos = 280 + (index * 35);
            const qty = item.qty_scan || item.qty_req || 0;
            const code = (item.code || item.item_code || '').substring(0, 20); // Limitar longitud
            return `^FO60,${yPos}^A0N,20,20^FD${code}^FS^FO400,${yPos}^A0N,20,20^FDQty: ${qty}^FS`;
        }).join('\n');

        // Comando ZPL completo
        const zpl = `
^XA
^CI28
^FO50,30^A0N,60,60^FDPacking List^FS
^FO50,100^GB700,3,3^FS

^FO60,120^A0N,30,30^FDOrder:^FS
^FO200,120^A0N,30,30^FD${order_number}/${despatch_number}^FS

^FO60,160^A0N,25,25^FDCustomer:^FS
^FO60,190^A0N,22,22^FD${customer_name.substring(0, 40)}^FS

^FO50,230^GB700,3,3^FS
^FO60,245^A0N,22,22^FDItems:^FS

${itemLines}

^FO50,820^GB700,3,3^FS
^FO60,840^A0N,25,25^FDPackages: ${packages || 0}^FS
^FO60,880^A0N,22,22^FDDate: ${date}^FS

^FO50,920^GB700,3,3^FS
^FO250,940^A0N,18,18^FDLogix System^FS

^XZ
`;

        return zpl;
    }

    /**
     * Imprime un Packing List completo (conecta, imprime y desconecta)
     */
    async printPackingList(auditData) {
        try {
            // Conectar
            const connection = await this.connect();
            console.log('Conectado a:', connection.deviceName);

            // Generar ZPL
            const zpl = this.generatePackingListZPL(auditData);
            console.log('ZPL generado:', zpl);

            // Imprimir
            await this.print(zpl);

            // Desconectar
            this.disconnect();

            return {
                success: true,
                message: 'Packing List impreso exitosamente'
            };

        } catch (error) {
            // Asegurar desconexión en caso de error
            this.disconnect();
            throw error;
        }
    }
}

// Exportar para uso global
window.ZebraPrinter = ZebraPrinter;

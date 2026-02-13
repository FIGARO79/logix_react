import React from 'react';
import { BarcodeScanner } from 'react-barcode-scanner';
import 'react-barcode-scanner/polyfill'; // Importar polyfill para soporte en todos los navegadores
import { toast } from 'react-toastify';

const ScannerModal = ({ onClose, onScan, title = "Apunta la cámara al código de barras" }) => {
    // Audio Beep Function
    const playBeep = () => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;

            const audioCtx = new AudioContext();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); // 800Hz beep
            oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);

            gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.15);
        } catch (error) {
            console.error("Error playing beep:", error);
        }
    };

    const handleDetected = (barcodes) => {
        if (barcodes && barcodes.length > 0) {
            const result = barcodes[0];
            const raw = result.rawValue || "";

            // Normalización: quitar caracteres no imprimibles, trim y mayúsculas
            const cleanCode = raw.replace(/[^\x20-\x7E]/g, '').trim().toUpperCase();

            if (cleanCode) {
                playBeep();
                onScan(cleanCode);
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-lg p-6 w-full max-w-lg relative shadow-2xl border-t-4 border-[#285f94]">
                <h3 className="text-center font-bold text-lg mb-4 text-gray-800 uppercase tracking-wide">{title}</h3>

                <div className="relative rounded-xl overflow-hidden mb-6 border-4 border-gray-100 bg-black aspect-square">
                    <BarcodeScanner
                        onCapture={handleDetected}
                        trackConstraints={{
                            facingMode: 'environment',
                            width: { min: 640, ideal: 1280 },
                            height: { min: 480, ideal: 720 }
                        }}
                        options={{
                            delay: 500,
                            formats: [
                                'code_128',
                                'code_39',
                                'ean_13',
                                'ean_8',
                                'qr_code',
                                'upc_a',
                                'upc_e',
                                'itf'
                            ]
                        }}
                        className="w-full h-full object-cover"
                    />

                    {/* Scanner Overlay UI */}
                    <div className="absolute inset-0 border-[40px] border-black/30 pointer-events-none">
                        <div className="w-full h-full border-2 border-dashed border-[#285f94]/50 rounded-lg relative">
                            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-[#285f94] shadow-[0_0_15px_rgba(40,95,148,0.8)] animate-pulse"></div>

                            {/* Corners */}
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#285f94]"></div>
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#285f94]"></div>
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#285f94]"></div>
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#285f94]"></div>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-all border border-gray-200"
                    >
                        CERRAR
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScannerModal;

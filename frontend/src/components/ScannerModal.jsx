import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';

const ScannerModal = ({ onClose, onScan, title = "Apunta la cámara al código de barras" }) => {
    const readerId = "global-reader";
    const scannerRef = useRef(null);
    const [torchOn, setTorchOn] = useState(false);

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

    useEffect(() => {
        // Dynamic import to avoid SSR issues or large bundle sizes until needed
        import('html5-qrcode').then(({ Html5Qrcode }) => {
            // Cleanup previous instances just in case
            if (scannerRef.current) {
                try { scannerRef.current.clear(); } catch (e) { }
            }

            const html5QrCode = new Html5Qrcode(readerId);
            scannerRef.current = html5QrCode;

            html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                async (decodedText) => {
                    // Success callback
                    const code = decodedText.toUpperCase();
                    playBeep(); // Feedback auditivo

                    // Stop scanner immediately
                    try {
                        await html5QrCode.stop();
                        html5QrCode.clear();
                    } catch (e) {
                        console.error("Error stopping scanner:", e);
                    }

                    scannerRef.current = null;
                    onScan(code);
                },
                (errorMessage) => {
                    // ignore parse errors
                }
            ).catch((err) => {
                console.error("Error starting scanner", err);
                toast.error("Error al iniciar cámara: " + err);
                onClose();
            });
        });

        return () => {
            if (scannerRef.current) {
                try {
                    scannerRef.current.stop().catch(() => { });
                    try { scannerRef.current.clear(); } catch (e) { }
                } catch (e) { }
            }
        };
    }, []);

    const toggleTorch = () => {
        if (scannerRef.current) {
            scannerRef.current.applyVideoConstraints({
                advanced: [{ torch: !torchOn }]
            })
                .then(() => setTorchOn(!torchOn))
                .catch(err => {
                    console.error(err);
                    toast.error("Flash no disponible");
                });
        }
    };

    const handleCancel = () => {
        if (scannerRef.current) {
            scannerRef.current.stop().then(() => {
                try { scannerRef.current.clear(); } catch (e) { }
                scannerRef.current = null;
                onClose();
            }).catch((err) => {
                onClose();
            });
        } else {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-lg relative">
                <h3 className="text-center font-bold text-lg mb-4 text-gray-800">{title}</h3>
                <div id={readerId} className="rounded-lg overflow-hidden mb-4 border-2 border-gray-100"></div>

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={toggleTorch}
                        className={`flex-1 h-12 flex items-center justify-center gap-2 rounded bg-[#34495e] hover:bg-[#2c3e50] text-white font-medium transition-colors ${torchOn ? 'ring-2 ring-yellow-400' : ''}`}
                        title={torchOn ? "Apagar Flash" : "Encender Flash"}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M2 6a6 6 0 1 1 10.174 4.31c-.203.196-.359.4-.453.619l-.762 1.769A.5.5 0 0 1 10.5 13a.5.5 0 0 1 0 1 .5.5 0 0 1 0 1l-.224.447a1 1 0 0 1-.894.553H6.618a1 1 0 0 1-.894-.553L5.5 15a.5.5 0 0 1 0-1 .5.5 0 0 1 0-1 .5.5 0 0 1-.46-.302l-.761-1.77a1.964 1.964 0 0 0-.453-.618A5.984 5.984 0 0 1 2 6zm6-5a5 5 0 0 0-3.479 8.592c.263.254.514.564.676.941L5.83 12h4.342l.632-1.467c.162-.377.413-.687.676-.941A5 5 0 0 0 8 1z" />
                        </svg>
                        Flash
                    </button>
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="flex-1 h-12 flex items-center justify-center bg-[#d32f2f] hover:bg-[#b71c1c] text-white font-medium rounded transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScannerModal;

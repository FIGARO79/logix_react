import React, { useEffect, useRef, useState } from 'react';
import { ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision';

const DimensionScanner = ({ onConfirm, onClose, packageNumber }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const detectorRef = useRef(null);
    const barcodeDetectorRef = useRef(null);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dimensions, setDimensions] = useState({ length: 0, width: 0, height: 0 });
    const [isCalibrated, setIsCalibrated] = useState(false);
    const [pxToCm, setPxToCm] = useState(0.15); // Ratio base inicial

    useEffect(() => {
        let stream = null;
        let animationFrameId = null;
        let isMounted = true;

        // Inicializar Detector de Códigos de Barras Nativo (Chrome)
        if ('BarcodeDetector' in window) {
            barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        }

        const init = async () => {
            try {
                // 1. Iniciar Cámara
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                // 2. Cargar IA Moderna
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );

                detectorRef.current = await ObjectDetector.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
                        delegate: "GPU"
                    },
                    scoreThreshold: 0.4,
                    runningMode: "VIDEO"
                });

                if (isMounted) {
                    setLoading(false);
                    renderLoop();
                }
            } catch (err) {
                console.error("Scanner Error:", err);
                if (isMounted) setError("Error al iniciar sensores 3D.");
            }
        };

        const renderLoop = async () => {
            if (!isMounted || !videoRef.current || !canvasRef.current) return;
            
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d', { alpha: false });

            if (video.readyState >= 2) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                // --- Lógica de Calibración QR ---
                if (barcodeDetectorRef.current && !isCalibrated) {
                    try {
                        const barcodes = await barcodeDetectorRef.current.detect(video);
                        if (barcodes.length > 0) {
                            const qr = barcodes[0].boundingBox;
                            // QR de 10cm: Ratio = 10 / pixeles
                            const newRatio = 10 / qr.width;
                            setPxToCm(newRatio);
                            setIsCalibrated(true);
                            
                            // Feedback Visual Verde para el QR
                            ctx.strokeStyle = '#22c55e';
                            ctx.lineWidth = 6;
                            ctx.strokeRect(qr.x, qr.y, qr.width, qr.height);
                        }
                    } catch (e) {}
                }

                // --- Lógica de Detección de Caja ---
                if (detectorRef.current) {
                    const result = detectorRef.current.detectForVideo(video, performance.now());
                    if (result.detections && result.detections.length > 0) {
                        const box = result.detections[0].boundingBox;
                        
                        // Dibujar Caja (Cian si está calibrado, Naranja si falta calibrar)
                        ctx.strokeStyle = isCalibrated ? '#00FFFF' : '#f97316';
                        ctx.lineWidth = 4;
                        ctx.strokeRect(box.originX, box.originY, box.width, box.height);

                        // Esquinas AR
                        const s = 30;
                        ctx.beginPath();
                        ctx.moveTo(box.originX, box.originY+s); ctx.lineTo(box.originX, box.originY); ctx.lineTo(box.originX+s, box.originY);
                        ctx.stroke();

                        // Medir usando el ratio (QR o Base)
                        setDimensions({
                            length: Math.round(box.width * pxToCm),
                            width: Math.round(box.height * pxToCm),
                            height: Math.round((box.width * 0.4) * pxToCm)
                        });
                    }
                }
            }
            animationFrameId = requestAnimationFrame(renderLoop);
        };

        init();

        return () => {
            isMounted = false;
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (stream) stream.getTracks().forEach(t => t.stop());
            if (detectorRef.current) detectorRef.current.close();
        };
    }, [isCalibrated, pxToCm]); // Re-renderizar ciclo si cambia la calibración

    return (
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col font-sans overflow-hidden">
            {/* Header con Estado de Calibración */}
            <div className="h-16 bg-slate-900 flex items-center justify-between px-4 border-b border-white/10">
                <div className="flex flex-col">
                    <span className="text-white font-bold text-sm tracking-tight flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isCalibrated ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-orange-500 animate-pulse'}`}></div>
                        ESCANER B{packageNumber}
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                        {isCalibrated ? 'SISTEMA CALIBRADO (PRECISIÓN ALTA)' : 'BUSCANDO QR DE 10CM PARA CALIBRAR...'}
                    </span>
                </div>
                <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-white bg-slate-800 rounded-full">✕</button>
            </div>

            {/* Viewport */}
            <div className="relative flex-grow bg-black flex items-center justify-center">
                <video ref={videoRef} playsInline muted style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0 }} />
                <canvas ref={canvasRef} width="1280" height="720" className="w-full h-full object-contain" />
                
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white">
                        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-[10px] font-bold tracking-widest uppercase">Iniciando IA...</p>
                    </div>
                )}
            </div>

            {/* Dashboard Medidas */}
            <div className="bg-slate-900 p-5 border-t border-white/10 shadow-2xl">
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-slate-800/80 p-3 rounded-xl text-center border border-white/5">
                        <span className="text-[8px] text-slate-500 block font-bold uppercase mb-1">Largo</span>
                        <span className={`text-2xl font-black ${isCalibrated ? 'text-white' : 'text-slate-500'}`}>{dimensions.length}<small className="text-[10px] ml-0.5 text-cyan-500">cm</small></span>
                    </div>
                    <div className="bg-slate-800/80 p-3 rounded-xl text-center border border-white/5">
                        <span className="text-[8px] text-slate-500 block font-bold uppercase mb-1">Ancho</span>
                        <span className={`text-2xl font-black ${isCalibrated ? 'text-white' : 'text-slate-500'}`}>{dimensions.width}<small className="text-[10px] ml-0.5 text-cyan-500">cm</small></span>
                    </div>
                    <div className="bg-slate-800/80 p-3 rounded-xl text-center border border-white/5">
                        <span className="text-[8px] text-slate-500 block font-bold uppercase mb-1">Alto</span>
                        <span className={`text-2xl font-black ${isCalibrated ? 'text-white' : 'text-slate-500'}`}>{dimensions.height}<small className="text-[10px] ml-0.5 text-cyan-500">cm</small></span>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-4 bg-slate-800 text-slate-400 font-bold rounded-2xl text-xs uppercase">Cerrar</button>
                    <button 
                        disabled={loading || dimensions.length === 0}
                        onClick={() => onConfirm(dimensions)}
                        className={`flex-[2] py-4 font-black rounded-2xl text-xs uppercase shadow-xl transition-all ${
                            isCalibrated 
                            ? 'bg-cyan-600 text-white shadow-cyan-900/40' 
                            : 'bg-orange-600/50 text-white/50 cursor-not-allowed'
                        }`}
                    >
                        {isCalibrated ? 'GUARDAR MEDIDAS' : 'ESPERANDO CALIBRACIÓN...'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DimensionScanner;

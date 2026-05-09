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
    const [instruction, setInstruction] = useState("BUSCANDO QR EN EL SUELO...");

    useEffect(() => {
        let stream = null;
        let animationFrameId = null;
        let isMounted = true;

        if ('BarcodeDetector' in window) {
            barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        }

        const init = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

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
                if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                }

                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                // --- DIBUJAR GUÍA DE ALINEACIÓN ---
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 2;
                ctx.setLineDash([10, 10]);
                ctx.strokeRect(centerX - 250, centerY - 150, 500, 350);
                ctx.setLineDash([]);

                // --- Lógica de Calibración QR ---
                let qrCorners = null;
                if (barcodeDetectorRef.current) {
                    try {
                        const barcodes = await barcodeDetectorRef.current.detect(video);
                        if (barcodes.length > 0) {
                            qrCorners = barcodes[0].cornerPoints;
                            setIsCalibrated(true);
                            setInstruction("QR DETECTADO. ALINEE LA CAJA.");
                            
                            ctx.strokeStyle = '#22c55e';
                            ctx.lineWidth = 4;
                            ctx.beginPath();
                            ctx.moveTo(qrCorners[0].x, qrCorners[0].y);
                            qrCorners.forEach(p => ctx.lineTo(p.x, p.y));
                            ctx.closePath();
                            ctx.stroke();
                        } else {
                            if (!isCalibrated) setInstruction("COLOQUE EL QR EN EL SUELO (CENTRO)");
                        }
                    } catch (e) {}
                }

                // --- Lógica de Detección de Caja ---
                if (detectorRef.current && isCalibrated && qrCorners) {
                    const result = detectorRef.current.detectForVideo(video, performance.now());
                    if (result.detections && result.detections.length > 0) {
                        const box = result.detections[0].boundingBox;
                        
                        // Los puntos de la base son los que tocan el suelo (Y + Height)
                        const boxCorners = [
                            {x: box.originX, y: box.originY + box.height},
                            {x: box.originX + box.width, y: box.originY + box.height},
                            {x: box.originX + box.width, y: box.originY},
                            {x: box.originX, y: box.originY}
                        ];

                        ctx.strokeStyle = '#00FFFF';
                        ctx.lineWidth = 3;
                        ctx.strokeRect(box.originX, box.originY, box.width, box.height);
                        
                        // Puntos de contacto visuales
                        ctx.fillStyle = '#00FFFF';
                        ctx.beginPath();
                        ctx.arc(box.originX, box.originY + box.height, 8, 0, Math.PI * 2);
                        ctx.arc(box.originX + box.width, box.originY + box.height, 8, 0, Math.PI * 2);
                        ctx.fill();

                        if (performance.now() % 30 < 1) {
                            fetch('/api/measure', {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                                },
                                body: JSON.stringify({
                                    qr_corners: qrCorners.map(p => [p.x, p.y]),
                                    box_corners: boxCorners.map(p => [p.x, p.y])
                                })
                            })
                            .then(res => res.json())
                            .then(data => {
                                if (data.length) {
                                    setDimensions(prev => ({
                                        ...prev,
                                        length: data.length,
                                        width: data.width,
                                        height: Math.round(data.length * 0.4)
                                    }));
                                    setInstruction("MEDIDA CAPTURADA. PULSE GUARDAR.");
                                }
                            });
                        }
                    } else {
                        setInstruction("BUSCANDO CAJA EN EL PLANO...");
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
    }, [isCalibrated]);

    return (
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col font-sans overflow-hidden">
            <div className="h-16 flex-shrink-0 bg-slate-900 flex items-center justify-between px-4 border-b border-white/10">
                <div className="flex flex-col">
                    <span className="text-white font-bold text-sm tracking-tight flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isCalibrated ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-orange-500 animate-pulse'}`}></div>
                        ESCANER B{packageNumber}
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                        {instruction}
                    </span>
                </div>
                <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-white bg-slate-800 rounded-full">✕</button>
            </div>

            <div className="relative flex-grow min-h-0 bg-black flex items-center justify-center overflow-hidden">
                <video ref={videoRef} playsInline muted style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0 }} />
                <canvas ref={canvasRef} width="1280" height="720" className="w-full h-full object-contain" />
                
                {!isCalibrated && !loading && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-64 h-64 border-2 border-dashed border-white/30 rounded-3xl flex items-center justify-center">
                            <div className="text-white/40 text-[10px] font-bold uppercase tracking-widest text-center px-4">
                                Coloque el QR <br/> aquí (en el suelo)
                            </div>
                        </div>
                    </div>
                )}

                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white">
                        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-[10px] font-bold tracking-widest uppercase">Iniciando IA...</p>
                    </div>
                )}
            </div>

            <div className="bg-slate-900 p-5 flex-shrink-0 border-t border-white/10 shadow-2xl">
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

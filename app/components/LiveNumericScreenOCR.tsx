import React, {
    useState,
    useRef,
    useEffect,
    useCallback,
    type CSSProperties,
} from "react";

// If you have Tesseract.js installed via npm and its types:
// import Tesseract from 'tesseract.js';

// Type declarations for Tesseract.js when using CDN
declare namespace Tesseract {
    interface Worker {
        recognize: (image: string) => Promise<any>;
        terminate: () => Promise<void>;
        setParameters: (params: any) => Promise<void>;
    }
    interface WorkerOptions {
        logger?: (msg: any) => void;
    }
    interface TesseractStatic {
        createWorker: (lang: string, oem: number, options?: WorkerOptions) => Promise<Worker>;
    }
}
declare var Tesseract: Tesseract.TesseractStatic;

interface LiveNumericScreenOCRProps {
    numberTuples: [number, number][]; // Current array of recognized numbers (passed in)
    setNumberTuples: React.Dispatch<React.SetStateAction<[number, number][]>>; // Setter for the array
}

interface SelectionRect {
    x: number;
    y: number;
    width: number;
    height: number;
    isDefining: boolean;
    startX: number;
    startY: number;
}

const OCR_BUFFER_SIZE = 7;


const calculateMedianPoint = (
    buffer: [number, number][],
): [number, number] | null => {
    if (buffer.length < OCR_BUFFER_SIZE) {
        return null;
    }

    // Ensure we are using the most recent 'OCR_BUFFER_SIZE' items
    const relevantReadings = buffer.slice(-OCR_BUFFER_SIZE);

    const longitudes = relevantReadings
        .map((pair) => pair[0])
        .sort((a, b) => a - b);
    const latitudes = relevantReadings
        .map((pair) => pair[1])
        .sort((a, b) => a - b);

    // Median of 3 is the middle element (index 1)
    const medianIndex = Math.floor(relevantReadings.length / 2);

    if (longitudes.length === 0 || latitudes.length === 0) return null;

    const medianLong = longitudes[medianIndex];
    const medianLat = latitudes[medianIndex];

    if (isNaN(medianLong) || isNaN(medianLat)) {
        return null;
    }

    return [medianLong, medianLat];
};

const LiveNumericScreenOCR: React.FC<LiveNumericScreenOCRProps> = ({
    numberTuples,
    setNumberTuples,
}) => {
    const videoElementRef = useRef<HTMLVideoElement>(null);
    const snapshotCanvasRef = useRef<HTMLCanvasElement>(null);
    const tesseractWorkerRef = useRef<Tesseract.Worker | null>(null);
    const animationFrameIdRef = useRef<number | null>(null);
    const lastOcrTimeRef = useRef<number>(0);

    const [stream, setStream] = useState<MediaStream | null>(null);
    const [selection, setSelection] = useState<SelectionRect>({
        x: 0, y: 0, width: 0, height: 0,
        isDefining: false, startX: 0, startY: 0,
    });
    const [snapshotDataUrl, setSnapshotDataUrl] = useState<string | null>(null);
    const [isLiveOcrActive, setIsLiveOcrActive] = useState(false);
    const [isOcrBusy, setIsOcrBusy] = useState(false);
    const [statusText, setStatusText] = useState("Initializing...");
    const [ocrResultText, setOcrResultText] = useState(
        "No text recognized yet."
    );
    const [ocrInterval, setOcrInterval] = useState(500);
    const [allowSelectionDrawing, setAllowSelectionDrawing] = useState(false);
const [ocrBuffer, setOcrBuffer] = useState<[number, number][]>([]);
    const [buttonsDisabled, setButtonsDisabled] = useState({
        startCapture: false,
        takeSnapshot: true,
        toggleLiveOcr: true,
    });

    useEffect(() => {
    if (ocrBuffer.length >= OCR_BUFFER_SIZE) {
        const medianPoint = calculateMedianPoint(ocrBuffer);
        if (medianPoint) {
            setNumberTuples([medianPoint]);
        }
    }
}, [ocrBuffer, setNumberTuples]);

    const drawInitialCanvasContent = useCallback(() => {
        const canvas = snapshotCanvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
                canvas.width = 640; // Default size
                canvas.height = 360;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "#e9e9e9";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "#555";
                ctx.textAlign = "center";
                ctx.font = "16px sans-serif";
                ctx.fillText(
                    "Start screen capture, then take a snapshot.",
                    canvas.width / 2,
                    canvas.height / 2
                );
            }
        }
    }, []);

    const resetUI = useCallback(() => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
        }
        if (animationFrameIdRef.current) {
            cancelAnimationFrame(animationFrameIdRef.current);
            animationFrameIdRef.current = null;
        }
        setIsLiveOcrActive(false);

        if (videoElementRef.current) {
            videoElementRef.current.srcObject = null;
        }

        drawInitialCanvasContent();

        setSnapshotDataUrl(null);
        setSelection({ x: 0, y: 0, width: 0, height: 0, isDefining: false, startX: 0, startY: 0 });
        setAllowSelectionDrawing(false);

        setButtonsDisabled({
            startCapture: false,
            takeSnapshot: true,
            toggleLiveOcr: true,
        });
        setOcrResultText("No text recognized yet.");
        setOcrBuffer([]);
        // Status will be set by initializeTesseractWorker or errors during it
    }, [stream, drawInitialCanvasContent]);

    const initializeTesseractWorker = useCallback(async () => {
        setStatusText("Loading Tesseract.js worker...");
        if (tesseractWorkerRef.current) {
            await tesseractWorkerRef.current.terminate();
            tesseractWorkerRef.current = null;
        }
        try {
            const worker = await Tesseract.createWorker("eng", 1, {
                logger: (m: { status: string; progress: number }) => {
                    if (m.status === "recognizing text") {
                        const progress = Math.round(m.progress * 100);
                        setStatusText(
                            `Recognizing numeric text... ${progress}% ${isLiveOcrActive ? "(Live OCR Active)" : ""
                            }`
                        );
                    }
                },
            });

            await worker.setParameters({
                tessedit_char_whitelist: "0123456789,.%£-",
            });
            tesseractWorkerRef.current = worker;
            setStatusText("Tesseract.js worker ready (Numeric Only).");
        } catch (error) {
            console.error("Error initializing Tesseract worker:", error);
            setStatusText("Error initializing Tesseract. OCR might not work.");
            tesseractWorkerRef.current = null;
        }
    }, [isLiveOcrActive]); // isLiveOcrActive for status text

    useEffect(() => {
        initializeTesseractWorker();
        return () => {
            tesseractWorkerRef.current?.terminate();
            tesseractWorkerRef.current = null;
        };
    }, [initializeTesseractWorker]);

    useEffect(() => {
        resetUI();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once on mount

    const drawSelectionRectOnCanvas = useCallback(
        (
            ctx: CanvasRenderingContext2D,
            currentSelection: Pick<SelectionRect, "x" | "y" | "width" | "height">
        ) => {
            if (currentSelection.width > 0 && currentSelection.height > 0) {
                ctx.strokeStyle = "red";
                ctx.lineWidth = 3;
                ctx.strokeRect(
                    currentSelection.x,
                    currentSelection.y,
                    currentSelection.width,
                    currentSelection.height
                );
            }
        },
        []
    );

    const performOcrOnSelection = useCallback(async () => {
        if (
            isOcrBusy ||
            !tesseractWorkerRef.current ||
            selection.width <= 0 ||
            selection.height <= 0
        ) {
            return;
        }

        setIsOcrBusy(true);
        // Avoid flashing "Processing..." text during rapid live updates
        if (!isLiveOcrActive) {
            setOcrResultText("Processing selection...");
        }

        const canvas = snapshotCanvasRef.current;
        if (!canvas) {
            setIsOcrBusy(false);
            return;
        }

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = selection.width;
        tempCanvas.height = selection.height;
        const tempCtx = tempCanvas.getContext("2d");

        if (!tempCtx) {
            setIsOcrBusy(false);
            return;
        }

        tempCtx.drawImage(
            canvas,
            selection.x, selection.y,
            selection.width, selection.height,
            0, 0,
            selection.width, selection.height
        );
        const imageDataUrl = tempCanvas.toDataURL("image/png");

        try {
            const { data: { text } } =
                await tesseractWorkerRef.current.recognize(imageDataUrl);
            setOcrResultText((text as string | null)?.replaceAll("%", "8").replaceAll("£", "8") || "(No numeric text found)");
            const values = ocrResultText.split("\n");
            if (values.length >= 2 && ((values[0]?.length||0)>4)) {
                const latT = values[0];
                const longT = values[1];

                // Add radix 10 for parseInt
                const lat = parseFloat(latT.replaceAll(",", "."));
                const long = parseFloat(longT.replaceAll(",", "."));

                const areNewCoordsValid =
                    !isNaN(lat) &&
                    !isNaN(long) &&
                    long > -560 &&
                    long < 674 &&
                    lat > -674 && 
                    lat < 674;

                if (areNewCoordsValid) {

                    if (areNewCoordsValid) {
                    setOcrBuffer((prevBuffer) => {
                        const newBuffer = [
                            ...prevBuffer,
                            [long, lat] as [number, number],
                        ];
                        if (newBuffer.length > OCR_BUFFER_SIZE) {
                            return newBuffer.slice(-OCR_BUFFER_SIZE); 
                        }
                        return newBuffer;
                    });
                }
                }
            }
        } catch (err: any) {
            console.error("OCR Error:", err);
            setOcrResultText(`OCR Error: ${err.message}`);
            if (isLiveOcrActive) {
                setStatusText("OCR failed. Retrying...");
            }
        } finally {
            setIsOcrBusy(false);
            if (isLiveOcrActive) {
                setStatusText(
                    `Live OCR Active.`
                );
            }
        }
    }, [isOcrBusy, selection, setNumberTuples, isLiveOcrActive]);

    const runRenderLoop = useCallback(() => {
        const video = videoElementRef.current;
        const canvas = snapshotCanvasRef.current;

        if (!video || !canvas || !video.srcObject || video.paused || video.ended) {
            setStatusText("Video stream not available for live OCR.");
            setIsLiveOcrActive(false); // This will trigger effect to stop loop
            return;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        if (
            canvas.width !== video.videoWidth ||
            canvas.height !== video.videoHeight
        ) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        drawSelectionRectOnCanvas(ctx, selection);

        if (isLiveOcrActive) {
            const now = Date.now();
            const currentOcrInterval = ocrInterval || 2000;
            if (now - lastOcrTimeRef.current > currentOcrInterval && !isOcrBusy) {
                lastOcrTimeRef.current = now;
                performOcrOnSelection();
            }
        }
        animationFrameIdRef.current = requestAnimationFrame(runRenderLoop);
    }, [
        isLiveOcrActive,
        ocrInterval,
        isOcrBusy,
        selection,
        performOcrOnSelection,
        drawSelectionRectOnCanvas,
    ]);

    const stopLiveOcr = useCallback(() => {
        setIsLiveOcrActive(false); 
        setButtonsDisabled((prev) => ({
            ...prev,
            takeSnapshot: !(stream && stream.active),
            toggleLiveOcr:
                selection.width > 5 && selection.height > 5 ? false : true,
        }));
        setStatusText("Live Numeric OCR stopped.");
        setAllowSelectionDrawing(true);

        if (snapshotDataUrl && snapshotCanvasRef.current) {
            const img = new Image();
            img.onload = () => {
                const canvas = snapshotCanvasRef.current;
                const ctx = canvas?.getContext("2d");
                if (!canvas || !ctx) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                drawSelectionRectOnCanvas(ctx, selection);
            };
            img.src = snapshotDataUrl;
        }
    }, [stream, selection, snapshotDataUrl, drawSelectionRectOnCanvas]);

    useEffect(() => {
        if (isLiveOcrActive) {
            setAllowSelectionDrawing(false);
            setButtonsDisabled((prev) => ({
                ...prev,
                takeSnapshot: true,
                toggleLiveOcr: false,
            }));
            setStatusText("Live Numeric OCR started.");
            lastOcrTimeRef.current = Date.now() - (ocrInterval + 1); // OCR on first frame
            if (animationFrameIdRef.current)
                cancelAnimationFrame(animationFrameIdRef.current);
            animationFrameIdRef.current = requestAnimationFrame(runRenderLoop);
        } else {
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
            // Other UI updates for stopping are in stopLiveOcr or button handlers
        }
        return () => {
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
            }
        };
    }, [isLiveOcrActive, runRenderLoop, ocrInterval]);

    const handleStartCapture = async () => {
        try {
            setStatusText("Requesting screen capture permission...");
            const mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always" } as MediaTrackConstraints,
                audio: false,
            });
            setStream(mediaStream);

            if (videoElementRef.current) {
                videoElementRef.current.srcObject = mediaStream;
                videoElementRef.current.onloadedmetadata = () => {
                    videoElementRef.current?.play();
                    setButtonsDisabled({
                        startCapture: true,
                        takeSnapshot: false,
                        toggleLiveOcr: true,
                    });
                    setStatusText('Screen capture started. Click "Take Snapshot".');
                };
            }

            mediaStream.getVideoTracks()[0].onended = () => {
                setStatusText("Screen capture ended by user.");
                stopLiveOcr();
                resetUI();
            };
        } catch (err: any) {
            console.error("Error starting screen capture:", err);
            setStatusText(`Error: ${err.message}`);
            resetUI();
        }
    };

    const handleTakeSnapshot = () => {
        const video = videoElementRef.current;
        const canvas = snapshotCanvasRef.current;
        if (!video || !canvas || !video.srcObject || video.videoWidth === 0) {
            setStatusText("Video stream not ready for snapshot.");
            return;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");
        setSnapshotDataUrl(dataUrl);

        setAllowSelectionDrawing(true);
        setButtonsDisabled((prev) => ({
            ...prev,
            takeSnapshot: true,
            toggleLiveOcr: true,
        })); // OCR button disabled until selection
        setSelection(prev => ({ ...prev, width: 0, height: 0 })); // Reset old selection
        setStatusText("Snapshot taken. Drag on the image to select a region.");
        if (isLiveOcrActive) stopLiveOcr();
    };

    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!allowSelectionDrawing || isLiveOcrActive) return;
        const canvas = snapshotCanvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        setSelection((prev) => ({
            ...prev,
            isDefining: true,
            startX: (e.clientX - rect.left) * scaleX,
            startY: (e.clientY - rect.top) * scaleY,
            x: (e.clientX - rect.left) * scaleX, // Initialize x,y for current rect
            y: (e.clientY - rect.top) * scaleY,
            width: 0,
            height: 0,
        }));
    };

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!allowSelectionDrawing || !selection.isDefining || !snapshotDataUrl)
            return;
        const canvas = snapshotCanvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const currentX = (e.clientX - rect.left) * scaleX;
        const currentY = (e.clientY - rect.top) * scaleY;

        const newSelectionWidth = currentX - selection.startX;
        const newSelectionHeight = currentY - selection.startY;

        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            ctx.strokeRect(
                selection.startX,
                selection.startY,
                newSelectionWidth,
                newSelectionHeight
            );
        };
        img.src = snapshotDataUrl;
    };

    const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!allowSelectionDrawing || !selection.isDefining || isLiveOcrActive)
            return;
        const canvas = snapshotCanvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const endX = (e.clientX - rect.left) * scaleX;
        const endY = (e.clientY - rect.top) * scaleY;

        const newSelX = Math.min(selection.startX, endX);
        const newSelY = Math.min(selection.startY, endY);
        const newSelWidth = Math.abs(endX - selection.startX);
        const newSelHeight = Math.abs(endY - selection.startY);

        const finalSelection: SelectionRect = {
            ...selection,
            isDefining: false,
            x: newSelX,
            y: newSelY,
            width: newSelWidth,
            height: newSelHeight,
        };
        setSelection(finalSelection);

        if (finalSelection.width > 5 && finalSelection.height > 5) {
            setButtonsDisabled((prev) => ({ ...prev, toggleLiveOcr: false }));
            setStatusText('Region selected. Click "Start Live Numeric OCR".');
        } else {
            setButtonsDisabled((prev) => ({ ...prev, toggleLiveOcr: true }));
            setStatusText("Selection too small. Please re-select on snapshot.");
            // finalSelection already has width/height potentially 0, so setSelection above handles it
        }

        // Redraw with final selection
        if (snapshotDataUrl) {
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                drawSelectionRectOnCanvas(ctx, finalSelection);
            };
            img.src = snapshotDataUrl;
        }
    };

    const handleToggleLiveOcr = () => {
        if (isLiveOcrActive) {
            stopLiveOcr();
        } else {
            if (selection.width <= 5 || selection.height <= 5) {
                setStatusText(
                    "No valid region selected. Take a snapshot and select first."
                );
                return;
            }
            if (!stream || !videoElementRef.current?.srcObject) {
                setStatusText("Screen capture not active.");
                return;
            }
            if (!tesseractWorkerRef.current) {
                setStatusText("Tesseract worker not ready. Please wait or refresh.");
                return;
            }
            setIsLiveOcrActive(true);
        }
    };

    const handleOcrIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setOcrInterval(parseInt(e.target.value, 10));
    };

    // Styles (can be moved to a separate CSS file for better organization)
    const styles: { [key: string]: CSSProperties } = {
        body: {
            fontFamily: "sans-serif",
            margin: "20px",
            backgroundColor: "#f4f4f4",
            color: "#333",
        },
        controlsAndResults: {
            marginBottom: "20px",
            padding: "15px",
            backgroundColor: "#fff",
            borderRadius: "8px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        },
        button: {
            padding: "10px 15px",
            marginRight: "10px",
            marginBottom: "5px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "16px",
        },
        buttonDisabled: {
            backgroundColor: "#ccc",
            cursor: "not-allowed",
        },
        snapshotCanvas: {
            border: "2px dashed #ccc",
            cursor: "crosshair",
            maxWidth: "100%",
            height: "auto",
            display: "block",
            backgroundColor: "#e9e9e9",
        },
        videoElement: { display: "none" },
        status: {
            marginTop: "10px",
            fontStyle: "italic",
            color: "#555",
        },
        ocrResult: {
            whiteSpace: "pre-wrap",
            backgroundColor: "#e9ecef",
            padding: "10px",
            borderRadius: "4px",
            border: "1px solid #ced4da",
            minHeight: "50px",
        },
        label: { fontWeight: "bold", marginRight: "5px" },
    };

    return (
        <div style={styles.body}>
            <h1>Live Screen Region OCR (Numeric Only)</h1>

            <div style={styles.controlsAndResults}>
                <button
                    style={{
                        ...styles.button,
                        ...(buttonsDisabled.startCapture ? styles.buttonDisabled : {}),
                    }}
                    onClick={handleStartCapture}
                    disabled={buttonsDisabled.startCapture}
                >
                    1. Start Screen Capture
                </button>
                <button
                    style={{
                        ...styles.button,
                        ...(buttonsDisabled.takeSnapshot ? styles.buttonDisabled : {}),
                    }}
                    onClick={handleTakeSnapshot}
                    disabled={buttonsDisabled.takeSnapshot}
                >
                    2. Take Snapshot for Selection
                </button>
                <button
                    style={{
                        ...styles.button,
                        ...(buttonsDisabled.toggleLiveOcr ? styles.buttonDisabled : {}),
                    }}
                    onClick={handleToggleLiveOcr}
                    disabled={buttonsDisabled.toggleLiveOcr}
                >
                    {isLiveOcrActive ? "Stop Live Numeric OCR" : "Start Live Numeric OCR"}
                </button>
                <br />
                <br />
                <label
                    htmlFor="ocrIntervalInput"
                    style={{ ...styles.label, marginLeft: "10px" }}
                >
                    OCR Interval (ms):
                </label>
                <input
                    type="number"
                    id="ocrIntervalInput"
                    value={ocrInterval}
                    onChange={handleOcrIntervalChange}
                    min="500"
                    step="100"
                    style={{ width: "70px" }}
                />
                <div style={styles.status}>{statusText}</div>
            </div>
            <div style={styles.controlsAndResults}>
                <h2>Recognized Numeric Text:</h2>
                <pre style={styles.ocrResult}>{ocrResultText}</pre>
            </div>
            <video
                ref={videoElementRef}
                style={styles.videoElement}
                autoPlay
                playsInline
            ></video>
            <canvas
                ref={snapshotCanvasRef}
                style={styles.snapshotCanvas}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
            ></canvas>


        </div>
    );
};

export default LiveNumericScreenOCR;

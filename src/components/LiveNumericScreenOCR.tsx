import { FlaskConical } from "lucide-react";
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type CSSProperties,
} from "react";

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
    createWorker: (
      lang: string,
      oem: number,
      options?: WorkerOptions,
    ) => Promise<Worker>;
  }
}
declare var Tesseract: Tesseract.TesseractStatic;

interface LiveNumericScreenOCRProps {
  numberTuples: [number, number][];
  setNumberTuples: React.Dispatch<React.SetStateAction<[number, number][]>>;
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

const OCR_BUFFER_SIZE = 4;

const calculateMedianPoint = (
  buffer: [number, number][],
): [number, number] | null => {
  if (buffer.length < OCR_BUFFER_SIZE) {
    return null;
  }
  const relevantReadings = buffer.slice(-OCR_BUFFER_SIZE);
  const longitudes = relevantReadings
    .map((pair) => pair[0])
    .sort((a, b) => a - b);
  const latitudes = relevantReadings
    .map((pair) => pair[1])
    .sort((a, b) => a - b);
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
  setNumberTuples,
}) => {
  const videoElementRef = useRef<HTMLVideoElement>(null);
  const snapshotCanvasRef = useRef<HTMLCanvasElement>(null);
  const tesseractWorkerRef = useRef<Tesseract.Worker | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const lastOcrTimeRef = useRef<number>(0);
  const [selectVisible, __] = useState(true);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selection, setSelection] = useState<SelectionRect>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    isDefining: false,
    startX: 0,
    startY: 0,
  });
  const [isLiveOcrActive, setIsLiveOcrActive] = useState(false);
  const [isOcrBusy, setIsOcrBusy] = useState(false);
  const [_, setStatusText] = useState("Initializing...");

  const [ocrInterval] = useState(500);
  const [allowSelectionDrawing, setAllowSelectionDrawing] = useState(false);
  const [ocrBuffer, setOcrBuffer] = useState<[number, number][]>([]);
  const [buttonsDisabled, setButtonsDisabled] = useState({
    startCapture: false,
    clearSelection: true,
    toggleLiveOcr: true,
  });

  useEffect(() => {
    if (ocrBuffer.length >= OCR_BUFFER_SIZE) {
      const medianPoint = calculateMedianPoint(ocrBuffer);
      if (medianPoint) {
        setNumberTuples([medianPoint]); // Update with the latest median point
      }
    }
  }, [ocrBuffer, setNumberTuples]);

  const drawInitialCanvasContent = useCallback(() => {
    const canvas = snapshotCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = 640;
        canvas.height = 360;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#e9e9e9";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#555";
        ctx.textAlign = "center";
        ctx.font = "16px sans-serif";
        ctx.fillText(
          "Start screen capture to begin.",
          canvas.width / 2,
          canvas.height / 2,
        );
      }
    }
  }, []);

  const resetUI = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null); // This will trigger useEffect to stop render loop
    }
    // animationFrameIdRef is managed by useEffect based on stream
    setIsLiveOcrActive(false);

    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null;
    }

    drawInitialCanvasContent();

    setSelection({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      isDefining: false,
      startX: 0,
      startY: 0,
    });
    setAllowSelectionDrawing(false);

    setButtonsDisabled({
      startCapture: false,
      clearSelection: true,
      toggleLiveOcr: true,
    });
    setOcrBuffer([]);
    // Status will be set by initializeTesseractWorker or errors during it
  }, [stream, drawInitialCanvasContent]); // Removed setStream from deps, it's being set

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
              `Recognizing numeric text... ${progress}% ${
                isLiveOcrActive ? "(Live OCR Active)" : ""
              }`,
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
  }, [isLiveOcrActive]);

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
      currentSelection: Pick<SelectionRect, "x" | "y" | "width" | "height">,
    ) => {
      if (currentSelection.width > 0 && currentSelection.height > 0) {
        ctx.strokeStyle = "red";
        ctx.lineWidth = 3;
        ctx.strokeRect(
          currentSelection.x,
          currentSelection.y,
          currentSelection.width,
          currentSelection.height,
        );
      }
    },
    [],
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

    const video = videoElementRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setIsOcrBusy(false);
      if (isLiveOcrActive) setStatusText("Video not ready for OCR. Retrying...");
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

    // Draw the selected region from the *video* element to the tempCanvas
    tempCtx.drawImage(
      video,
      selection.x,
      selection.y,
      selection.width,
      selection.height,
      0,
      0,
      selection.width,
      selection.height,
    );
    const imageDataUrl = tempCanvas.toDataURL("image/png");

    try {
      const {
        data: { text },
      } = await tesseractWorkerRef.current.recognize(imageDataUrl);
      const recognizedText =
        (text as string | null)?.replaceAll("%", "8").replaceAll("£", "8") ||
        "(No numeric text found)";

      const values = recognizedText.split("\n");
      if (values.length >= 2 && (values[0]?.length || 0) > 4) {
        const latT = values[0];
        const longT = values[1];
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
          setOcrBuffer((prevBuffer) => {
            const newBuffer = [...prevBuffer, [long, lat] as [number, number]];
            return newBuffer.length > OCR_BUFFER_SIZE
              ? newBuffer.slice(-OCR_BUFFER_SIZE)
              : newBuffer;
          });
        }
      }
    } catch (err: any) {
      console.error("OCR Error:", err);
      if (isLiveOcrActive) {
        setStatusText("OCR failed. Retrying...");
      }
    } finally {
      setIsOcrBusy(false);
      if (isLiveOcrActive) {
        setStatusText("Live OCR Active.");
      }
    }
  }, [
    isOcrBusy,
    selection,
    isLiveOcrActive,
    // setNumberTuples is used via ocrBuffer effect
  ]);

  const runRenderLoop = useCallback(() => {
    const video = videoElementRef.current;
    const canvas = snapshotCanvasRef.current;

    if (!video || !canvas || !video.srcObject || video.paused || video.ended) {
      if (isLiveOcrActive) {
        setIsLiveOcrActive(false); // This will trigger its own useEffect
        setStatusText("Video stream ended. Live OCR stopped.");
      }
      if (animationFrameIdRef.current)
        cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      animationFrameIdRef.current = requestAnimationFrame(runRenderLoop);
      return;
    }

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

  useEffect(() => {
    let videoEl: HTMLVideoElement | null = null;
    const onCanPlay = () => {
      if (
        !animationFrameIdRef.current &&
        videoEl &&
        videoEl.srcObject &&
        !videoEl.paused &&
        !videoEl.ended
      ) {
        animationFrameIdRef.current = requestAnimationFrame(runRenderLoop);
      }
    };

    if (stream && videoElementRef.current) {
      videoEl = videoElementRef.current;
      // Ensure video metadata is loaded before trying to draw or attach canplay
      if (videoEl.readyState >= videoEl.HAVE_METADATA) {
        onCanPlay();
      } else {
        videoEl.addEventListener("loadedmetadata", () => {
          // Check again if it's playable, or rely on canplay
          if (videoEl && videoEl.readyState >= videoEl.HAVE_ENOUGH_DATA) {
            onCanPlay();
          } else if (videoEl) {
            videoEl.addEventListener("canplay", onCanPlay);
          }
        });
      }
    } else {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }

    return () => {
      if (videoEl) {
        videoEl.removeEventListener("canplay", onCanPlay);
        videoEl.removeEventListener("loadedmetadata", onCanPlay); // Clean up just in case
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [stream, runRenderLoop]);

  const stopLiveOcr = useCallback(() => {
    setIsLiveOcrActive(false); // Triggers useEffect for isLiveOcrActive
    // Button states and allowSelectionDrawing are handled in the useEffect for isLiveOcrActive
    setStatusText("Live Numeric OCR stopped.");
  }, []);

  useEffect(() => {
    if (isLiveOcrActive) {
      setAllowSelectionDrawing(false);
      setButtonsDisabled((prev) => ({
        ...prev,
        clearSelection: true, // Cannot clear during live OCR
        toggleLiveOcr: false, // Button shows "Stop OCR"
      }));
      setStatusText("Live Numeric OCR started.");
      lastOcrTimeRef.current = Date.now() - (ocrInterval + 1);
    } else {
      // This runs when isLiveOcrActive becomes false or on initial load
      const canDraw = !!(stream && stream.active);
      setAllowSelectionDrawing(canDraw);
      setButtonsDisabled((prev) => ({
        ...prev,
        clearSelection: !(
          selection.width > 0 &&
          selection.height > 0 &&
          canDraw
        ),
        toggleLiveOcr: !(
          selection.width > 5 &&
          selection.height > 5 &&
          canDraw
        ),
      }));
      // Status text for stopping is handled by stopLiveOcr or stream end events
    }
  }, [
    isLiveOcrActive,
    stream,
    selection.width,
    selection.height,
    ocrInterval,
  ]);

  const handleStartCapture = async () => {
    try {
      setStatusText("Requesting screen capture permission...");
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" } as MediaTrackConstraints,
        audio: false,
      });
      setStream(mediaStream); // This will trigger useEffect to start render loop

      if (videoElementRef.current) {
        videoElementRef.current.srcObject = mediaStream;
        videoElementRef.current.onloadedmetadata = () => {
          videoElementRef.current?.play().then(() => {
            setButtonsDisabled({
              startCapture: true,
              clearSelection: true, // No selection yet
              toggleLiveOcr: true, // No selection yet
            });
            setAllowSelectionDrawing(true);
            setStatusText(
              'Screen capture started. Drag on the video to select a region. Then click "Start Live Numeric OCR".',
            );
          });
        };
      }

      mediaStream.getVideoTracks()[0].onended = () => {
        setStatusText("Screen capture ended by user.");
        // stopLiveOcr(); // isLiveOcrActive will be false via resetUI
        resetUI(); // This will also stop render loop by setting stream to null
      };
    } catch (err: any) {
      console.error("Error starting screen capture:", err);
      setStatusText(`Error: ${err.message}`);
      resetUI();
    }
  };

  const handleClearSelection = () => {
    setSelection({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      isDefining: false,
      startX: 0,
      startY: 0,
    });
    setButtonsDisabled((prev) => ({
      ...prev,
      clearSelection: true,
      toggleLiveOcr: true,
    }));
    setStatusText(
      "Selection cleared. Drag on the video to select a new region.",
    );
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!allowSelectionDrawing || isLiveOcrActive) return;
    const canvas = snapshotCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    setSelection({
      isDefining: true,
      startX: mouseX,
      startY: mouseY,
      x: mouseX,
      y: mouseY,
      width: 0,
      height: 0,
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!allowSelectionDrawing || !selection.isDefining || isLiveOcrActive)
      return;
    const canvas = snapshotCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;

    setSelection((prev) => ({
      ...prev,
      x: Math.min(prev.startX, currentX),
      y: Math.min(prev.startY, currentY),
      width: Math.abs(currentX - prev.startX),
      height: Math.abs(currentY - prev.startY),
    }));
  };

  const handleCanvasMouseUp = () => {
    if (!allowSelectionDrawing || !selection.isDefining || isLiveOcrActive)
      return;
    // Finalize selection based on current mouse position (already updated in selection state by mouseMove)
    const finalSelection = { ...selection, isDefining: false };
    setSelection(finalSelection); // Set isDefining to false

    const isValidSelection =
      finalSelection.width > 5 && finalSelection.height > 5;
    setButtonsDisabled((prev) => ({
      ...prev,
      clearSelection: !(finalSelection.width > 0 && finalSelection.height > 0),
      toggleLiveOcr: !isValidSelection,
    }));

    if (isValidSelection) {
      setStatusText(
        'Region selected. Click "Start Live Numeric OCR" or "Clear Selection".',
      );
    } else if (finalSelection.width > 0 || finalSelection.height > 0) {
      setStatusText(
        "Selection too small. Please re-select on video or clear selection.",
      );
    } else {
      setStatusText("Selection cleared. Drag on video to select a region.");
    }
  };

  const handleToggleLiveOcr = () => {
    if (isLiveOcrActive) {
      stopLiveOcr();
    } else {
      if (selection.width <= 5 || selection.height <= 5) {
        setStatusText(
          "No valid region selected. Drag on the video to select first.",
        );
        return;
      }
      if (!stream || !videoElementRef.current?.srcObject) {
        setStatusText(
          "Screen capture not active. Please start screen capture.",
        );
        return;
      }
      if (!tesseractWorkerRef.current) {
        setStatusText(
          "Tesseract worker not ready. Please wait or refresh.",
        );
        return;
      }
      setIsLiveOcrActive(true); // Triggers useEffect for isLiveOcrActive
    }
  };


  const styles: { [key: string]: CSSProperties } = {
    body: {
        height: "100%",
        background: "white",
        width: "100%",
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
      cursor: allowSelectionDrawing && !isLiveOcrActive ? "crosshair" : "default",
      maxWidth: "100%",
      height: "auto",
      display: "block",
      backgroundColor: "#e9e9e9", // Visible before stream starts
      visibility: selectVisible ? "visible":"hidden" 
    },
    videoElement: { display: "none", visibility: selectVisible ? "visible":"hidden" },
    status: {
      marginTop: "10px",
      fontStyle: "italic",
      color: "#555",
      minHeight: "1.2em", // Prevent layout shift
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
      <p className="flex"><FlaskConical/>Cordex</p>

      <div style={styles.controlsAndResults}>
        <div className="flex">
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
            ...(buttonsDisabled.clearSelection ? styles.buttonDisabled : {}),
          }}
          onClick={handleClearSelection}
          disabled={buttonsDisabled.clearSelection}
        >
          Clear Selection
        </button>
        <button
          style={{
            ...styles.button,
            ...(buttonsDisabled.toggleLiveOcr ? styles.buttonDisabled : {}),
          }}
          onClick={handleToggleLiveOcr}
          disabled={buttonsDisabled.toggleLiveOcr}
        >
          {isLiveOcrActive
            ? "Stop Cordex"
            : "Start Cordex"}
        </button>
        <ol>
          <li>1. Screen capture "TheIsle" window</li>
          <li>2. Click and drag to select the latitue and longitude coordinates like the image</li>
          <li>3. Click "Start Cordex", then "X" to return to the main map.</li>
        </ol>
        <img src="/theislemap/example.png" className="h-20" alt="ONLY SELECT THE NUMERIC COMPONENTS OF LATITUDE AND LONGITUDE"/>
        </div>
        {/* <br /> */}
        {/* <br /> */}
        {/* <label
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
          disabled={isLiveOcrActive}
        />
        <div style={styles.status}>{statusText}</div> */}
      </div>
      {/* <div style={styles.controlsAndResults}>
        <h2>Recognized Numeric Text:</h2>
        <pre style={styles.ocrResult}>{ocrResultText}</pre>
      </div> */}
      <video
        ref={videoElementRef}
        style={styles.videoElement   }
        autoPlay
        playsInline
        muted // Good practice for screen capture video elements
      ></video>
      <canvas
        ref={snapshotCanvasRef}
        style={styles.snapshotCanvas}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        // onMouseLeave={handleCanvasMouseUp} // Optional: treat leaving canvas as mouse up
      ></canvas>
    </div>
  );
};

export default LiveNumericScreenOCR;
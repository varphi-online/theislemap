import { MonitorDotIcon } from "lucide-react";
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom"; // Import createPortal
import type { Location } from "./map/types";

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
  numberTuples: Location[];
  setNumberTuples: React.Dispatch<React.SetStateAction<Location[]>>;
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

  const [ocrInterval] = useState(500);
  const [allowSelectionDrawing, setAllowSelectionDrawing] = useState(false);
  const [ocrBuffer, setOcrBuffer] = useState<[number, number][]>([]);
  const [buttonsDisabled, setButtonsDisabled] = useState({
    startCapture: false,
    toggleLiveOcr: true,
  });

  const [isSelectionModeActive, setIsSelectionModeActive] = useState(false);

  useEffect(() => {
    if (ocrBuffer.length >= OCR_BUFFER_SIZE) {
      const medianPoint = calculateMedianPoint(ocrBuffer);
      if (medianPoint) {
        setNumberTuples([{ lat: medianPoint[1], long: medianPoint[0] }]);
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
      }
    }
  }, []);

  const resetUI = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsLiveOcrActive(false);
    setIsSelectionModeActive(false);

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
      toggleLiveOcr: true,
    });
    setOcrBuffer([]);
  }, [stream, drawInitialCanvasContent]);

  const initializeTesseractWorker = useCallback(async () => {
    if (tesseractWorkerRef.current) {
      await tesseractWorkerRef.current.terminate();
      tesseractWorkerRef.current = null;
    }
    try {
      const worker = await Tesseract.createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") {
            // const progress = Math.round(m.progress * 100); // progress unused
          }
        },
      });
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789,.%£-",
      });
      tesseractWorkerRef.current = worker;
      console.log("Tesseract.js worker ready (Numeric Only).");
    } catch (error) {
      console.error("Error initializing Tesseract worker:", error);
      tesseractWorkerRef.current = null;
    }
  }, []);

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
  }, []);

  const drawSelectionRectOnCanvas = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      currentSelection: Pick<SelectionRect, "x" | "y" | "width" | "height">,
      isPreview: boolean,
    ) => {
      if (currentSelection.width > 0 && currentSelection.height > 0) {
        ctx.strokeStyle = "red";
        ctx.lineWidth = isPreview ? 12 : 5;
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
    } finally {
      setIsOcrBusy(false);
    }
  }, [isOcrBusy, selection]);

  const stopLiveOcr = useCallback(() => {
    setIsLiveOcrActive(false);
  }, []);

  const runRenderLoop = useCallback(() => {
    const video = videoElementRef.current;
    const canvas = snapshotCanvasRef.current;
    if (!video || !canvas || !video.srcObject || video.paused || video.ended) {
      if (isLiveOcrActive) {
        stopLiveOcr(); // Use the new stopLiveOcr
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
    drawSelectionRectOnCanvas(ctx, selection, !isSelectionModeActive);
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
    isSelectionModeActive,
    stopLiveOcr, // Added stopLiveOcr to dependencies
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
      if (videoEl.readyState >= videoEl.HAVE_METADATA) {
        onCanPlay();
      } else {
        videoEl.addEventListener("loadedmetadata", () => {
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
        videoEl.removeEventListener("loadedmetadata", onCanPlay);
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [stream, runRenderLoop]);

  useEffect(() => {
    if (isLiveOcrActive) {
      setAllowSelectionDrawing(false);
      setIsSelectionModeActive(false);
      setButtonsDisabled((prev) => ({
        ...prev,
        toggleLiveOcr: false,
      }));
      lastOcrTimeRef.current = Date.now() - (ocrInterval + 1);
    } else {
      const canDraw = !!(stream && stream.active);
      setAllowSelectionDrawing(canDraw && isSelectionModeActive);
      setButtonsDisabled((prev) => ({
        ...prev,
        toggleLiveOcr: !(
          selection.width > 5 &&
          selection.height > 5 &&
          canDraw &&
          !isSelectionModeActive
        ),
      }));
    }
  }, [
    isLiveOcrActive,
    stream,
    selection.width,
    selection.height,
    ocrInterval,
    isSelectionModeActive,
  ]);

  const handleStartCapture = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" } as MediaTrackConstraints,
        audio: false,
      });
      setStream(mediaStream);

      if (videoElementRef.current) {
        videoElementRef.current.srcObject = mediaStream;
        videoElementRef.current.onloadedmetadata = () => {
          videoElementRef.current?.play().then(() => {
            setButtonsDisabled({
              startCapture: true,
              toggleLiveOcr: true,
            });
            setAllowSelectionDrawing(true);
            setIsSelectionModeActive(true);
          });
        };
      }
      mediaStream.getVideoTracks()[0].onended = () => {
        resetUI();
      };
    } catch (err: any) {
      console.error("Error starting screen capture:", err);
      resetUI();
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!allowSelectionDrawing || isLiveOcrActive || !isSelectionModeActive)
      return;
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
    if (
      !allowSelectionDrawing ||
      !selection.isDefining ||
      isLiveOcrActive ||
      !isSelectionModeActive
    )
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
    if (
      !allowSelectionDrawing ||
      !selection.isDefining ||
      isLiveOcrActive ||
      !isSelectionModeActive
    )
      return;
    const finalSelection = { ...selection, isDefining: false };
    setSelection(finalSelection);
  };

  const handleToggleLiveOcr = () => {
    if (isLiveOcrActive) {
      stopLiveOcr();
    } else {
      if (selection.width <= 5 || selection.height <= 5) {
        return;
      }
      if (!stream || !videoElementRef.current?.srcObject) {
        return;
      }
      if (!tesseractWorkerRef.current) {
        return;
      }
      setIsLiveOcrActive(true);
    }
  };

  const canvasContainerStyles: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
    boxSizing: "border-box",
  };

  const canvasStyles: CSSProperties = isSelectionModeActive
    ? {
        maxWidth: "100%",
        maxHeight: "calc(100% - 70px)",
        border: "2px solid #fff",
        objectFit: "contain",
        backgroundColor: "transparent",
      }
    : {
        border: "",
        maxWidth: "95%",
        height: "auto",
        display: "block",
        borderRadius: "0.4rem",
        objectFit: "contain",
      };

  const canvasElement = (
    <canvas
      ref={snapshotCanvasRef}
      style={canvasStyles}
      className={`
        ${
          isSelectionModeActive
            ? allowSelectionDrawing // In selection mode, if drawing is allowed, use crosshair
              ? "cursor-crosshair"
              : "cursor-default"
            : stream && stream.active // In preview mode, if stream is active, it's clickable
              ? "cursor-pointer hover:opacity-90"
              : "cursor-default"
        }
        ${!stream || !stream.active ? "bg-gray-200" : ""}
        ${
          isSelectionModeActive && stream && stream.active
            ? "bg-transparent"
            : ""
        }
      `}
      onMouseDown={
        isSelectionModeActive ? handleCanvasMouseDown : undefined
      }
      onMouseMove={
        isSelectionModeActive ? handleCanvasMouseMove : undefined
      }
      onMouseUp={isSelectionModeActive ? handleCanvasMouseUp : undefined}
      onClick={
        !isSelectionModeActive && stream && stream.active // CHANGED: Allow click if stream active
          ? (e) => {
              e.stopPropagation();
              if (isLiveOcrActive) {
                stopLiveOcr(); // Stop OCR if it's running
              }
              setIsSelectionModeActive(true);
              setAllowSelectionDrawing(true);
            }
          : undefined
      }
    />
  );

  return (
    <div className="h-full w-full bg-none">
      <div className="mb-1 p-4 rounded-lg">
        <div className="flex-col flex">
          <button
            className={`px-4 py-2.5 mr-2.5 mb-1.5 text-base rounded bg-blue-600 text-white flex justify-between text-left w-full
              ${
                buttonsDisabled.startCapture
                  ? "bg-gray-300 cursor-not-allowed"
                  : "hover:bg-blue-700 cursor-pointer"
              }`}
            onClick={handleStartCapture}
            disabled={buttonsDisabled.startCapture}
          >
            1. Start Capture
            <MonitorDotIcon className="ml-2" />
          </button>
          <button
            className={`px-4 py-2.5 mr-2.5 mb-1.5 text-base rounded text-left w-full
              ${
                isLiveOcrActive
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-green-600 hover:bg-green-700"
              } text-white
              ${
                buttonsDisabled.toggleLiveOcr || isSelectionModeActive
                  ? "bg-gray-300 cursor-not-allowed"
                  : "cursor-pointer"
              }`}
            onClick={handleToggleLiveOcr}
            disabled={buttonsDisabled.toggleLiveOcr || isSelectionModeActive}
          >
            {isLiveOcrActive ? "Stop Cordex" : "2. Start Cordex"}
          </button>
          <ol className="list-decimal list-inside mt-2 text-sm text-gray-200">
            <li>Start screen capture of "TheIsle" window.</li>
            <li>
              Click and drag to select lat. & long. numbers (like the example
              image).
            </li>
            <li>Click "Confirm Selection".</li>
            <li>To edit selection, click the small video preview.</li>
          </ol>
          <img
            src="example.png"
            className="h-20 mt-2 border rounded"
            alt="Example: Select only numeric latitude and longitude"
          />
        </div>
      </div>

      <video
        ref={videoElementRef}
        className="hidden"
        autoPlay
        playsInline
        muted
      />

      {isSelectionModeActive
        ? createPortal(
            <div
              className="portal-selection-overlay"
              style={canvasContainerStyles}
            >
              {canvasElement}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (selection.isDefining) {
                    setSelection((prev) => ({ ...prev, isDefining: false }));
                  }
                  setIsSelectionModeActive(false);
                  const isValidSelection =
                    selection.width > 5 && selection.height > 5;

                  if (isValidSelection && stream && stream.active) {
                    handleToggleLiveOcr(); // This will start OCR if it was stopped
                  }
                }}
                className="mt-4 px-6 py-2.5 text-base bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
              >
                Confirm Selection & Start Cordex
              </button>
            </div>,
            document.body,
          )
        : stream && stream.active ? (
            <div className="canvas-preview-wrapper flex justify-center w-full p-1">
              {canvasElement}
            </div>
          ) : !stream &&
            snapshotCanvasRef.current &&
            snapshotCanvasRef.current.width === 640 ? (
            <div className="canvas-preview-wrapper flex justify-center w-full p-1">
              {canvasElement}
            </div>
          ) : null}
    </div>
  );
};

export default LiveNumericScreenOCR;
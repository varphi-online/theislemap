import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";

// --- Constants for configuration ---
const INITIAL_VIEW_WORLD_HALF_WIDTH = 10;
const GRID_TARGET_LINES_ON_SCREEN = 5;
const GRID_LINE_LOOP_COUNT = 25;
const POINT_RADIUS = 5; // Radius for plotted points
const LAST_POINT_PULSE_MAX_RADIUS = 30; // Max radius of the pulsating wave
const LAST_POINT_PULSE_SPEED = 0.06; // Speed of pulse expansion (pixels per frame)

// Helper functions
const superFloor = (mult: number, val: number): number => {
  return mult * Math.floor(val / mult);
};

const precision = (a: number): number => {
  if (!isFinite(a)) return 0;
  var e = 1,
    p = 0;
  while (Math.round(a * e) / e !== a) {
    e *= 10;
    p++;
  }
  return p;
};

interface ImageOverlayCanvasProps {
  imageUrls: string[];
  initialWidth?: number;
  initialHeight?: number;
  imageWorldWidth?: number;
  points?: Array<[number, number]>; // New prop for points
}

interface ImageLoadState {
  elements: HTMLImageElement[];
  allAttempted: boolean;
  errors: string[];
}

const ImageOverlayCanvas: React.FC<ImageOverlayCanvasProps> = ({
  imageUrls,
  initialWidth = 800,
  initialHeight = 600,
  imageWorldWidth = 20,
  points = [], // Default to an empty array
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoadData, setImageLoadData] = useState<ImageLoadState>({
    elements: [],
    allAttempted: false,
    errors: [],
  });

  const [zoom, setZoom] = useState(-6);
  const [screenTarget, setScreenTarget] = useState<[number, number]>([60, 0]);
  const [isDragging, setIsDragging] = useState(false);

  const mouseStartRef = useRef<[number, number]>([0, 0]);
  const initialScreenTargetOnDragRef = useRef<[number, number]>([0, 0]);

  // State for the pulsating effect on the last point
  const [pulseRadius, setPulseRadius] = useState(0);
  const [pulseOpacity, setPulseOpacity] = useState(1);

  const currentCanvasSize = useMemo(
    () => ({ width: initialWidth, height: initialHeight }),
    [initialWidth, initialHeight],
  );

  const canvasAspectRatio = useMemo(() => {
    if (currentCanvasSize.width === 0) return 1;
    return currentCanvasSize.height / currentCanvasSize.width;
  }, [currentCanvasSize]);

  const currentInitialBounds = useMemo(() => {
    const halfWidth = INITIAL_VIEW_WORLD_HALF_WIDTH;
    const halfHeight = halfWidth * canvasAspectRatio;
    return [-halfWidth, halfWidth, -halfHeight, halfHeight];
  }, [canvasAspectRatio]);

  const zoomLog = useMemo(() => Math.pow(2, zoom), [zoom]);

  const worldBounds = useMemo(() => {
    const inverseZL = 1 / zoomLog;
    return [
      screenTarget[0] + currentInitialBounds[0] * inverseZL,
      screenTarget[0] + currentInitialBounds[1] * inverseZL,
      screenTarget[1] + currentInitialBounds[2] * inverseZL,
      screenTarget[1] + currentInitialBounds[3] * inverseZL,
    ];
  }, [screenTarget, zoomLog, currentInitialBounds]);

  const panSpeedFactor = useMemo(() => {
    if (currentCanvasSize.width === 0) return 0.01;
    return (
      (2 * INITIAL_VIEW_WORLD_HALF_WIDTH) / currentCanvasSize.width
    );
  }, [currentCanvasSize.width]);

  const toScreenspace = useCallback(
    (worldX: number, worldY: number): [number, number] => {
      const currentWorldWidth = worldBounds[1] - worldBounds[0];
      const currentWorldHeight = worldBounds[3] - worldBounds[2];
      if (currentWorldWidth === 0 || currentWorldHeight === 0) return [0, 0];
      const normX = (worldX - worldBounds[0]) / currentWorldWidth;
      const normY = (worldY - worldBounds[2]) / currentWorldHeight;
      return [
        normX * currentCanvasSize.width,
        normY * currentCanvasSize.height,
      ];
    },
    [worldBounds, currentCanvasSize],
  );

  const urlsKey = JSON.stringify(imageUrls);
  // --- Image Loading ---
  useEffect(() => {
    if (!imageUrls || imageUrls.length === 0) {
      setImageLoadData({ elements: [], allAttempted: true, errors: [] });
      return;
    }
    setImageLoadData({ elements: [], allAttempted: false, errors: [] });
    const loadPromises = imageUrls.map((url) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.src = url;
        img.onload = () => resolve(img);
        img.onerror = () => reject({ url, error: `Failed to load ${url}` });
      });
    });
    Promise.allSettled(loadPromises).then((results) => {
      const successfullyLoadedElements: HTMLImageElement[] = [];
      const loadingErrors: string[] = [];
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successfullyLoadedElements.push(result.value);
        } else {
          console.error(result.reason.error);
          loadingErrors.push(result.reason.url);
        }
      });
      setImageLoadData({
        elements: successfullyLoadedElements,
        allAttempted: true,
        errors: loadingErrors,
      });
    });
  }, [urlsKey]);

  // --- Canvas Setup (DPR, size attributes) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = currentCanvasSize.width * dpr;
    canvas.height = currentCanvasSize.height * dpr;
    canvas.style.width = `${currentCanvasSize.width}px`;
    canvas.style.height = `${currentCanvasSize.height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, [currentCanvasSize]);

  // --- Grid Drawing Logic ---
  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.font = "13px Arial";
      ctx.textAlign = "center";
      const currentGraphWorldWidth = worldBounds[1] - worldBounds[0];
      const currentGraphWorldHeight = worldBounds[3] - worldBounds[2];
      if (currentGraphWorldWidth <= 0 || currentGraphWorldHeight <= 0) return;

      const getGridlineStep = (
        viewDimensionWorld: number,
        scaleFactorSeed: number,
      ) => {
        const opts = [
          100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01,
        ];
        const heuristicLimit =
          viewDimensionWorld / GRID_TARGET_LINES_ON_SCREEN;
        for (let j = 0; j < opts.length - 1; j++) {
          const stepCandidate = opts[j] * scaleFactorSeed;
          if (stepCandidate < heuristicLimit && stepCandidate > 0) {
            return stepCandidate;
          }
        }
        return Math.max(
          opts[opts.length - 1] * scaleFactorSeed,
          Number.EPSILON,
        );
      };
      const scaleFactorX = Math.pow(
        10,
        Math.floor(
          Math.log10(Math.max(currentGraphWorldWidth, Number.EPSILON)),
        ),
      );
      const scaleFactorY = Math.pow(
        10,
        Math.floor(
          Math.log10(Math.max(currentGraphWorldHeight, Number.EPSILON)),
        ),
      );
      const xScale = getGridlineStep(currentGraphWorldWidth, scaleFactorX);
      const yScale = getGridlineStep(currentGraphWorldHeight, scaleFactorY);
      if (xScale <= 0 || yScale <= 0) return;
      const worldOriginScreen = toScreenspace(0, 0);
      const drawTextWithOutline = (
        text: string,
        x: number,
        y: number,
      ) => {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 2.5;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
        ctx.fillText(text, x, y);
      };
      for (let i = -GRID_LINE_LOOP_COUNT; i <= GRID_LINE_LOOP_COUNT; i++) {
        const worldX = xScale * i + superFloor(xScale, screenTarget[0]);
        if (
          worldX < worldBounds[0] - xScale ||
          worldX > worldBounds[1] + xScale
        )
          continue;
        const screenPos = toScreenspace(worldX, 0);
        const isOriginLine = Math.abs(worldX) < xScale * 0.001;
        ctx.beginPath();
        ctx.moveTo(screenPos[0], 0);
        ctx.lineTo(screenPos[0], currentCanvasSize.height);
        ctx.lineWidth = isOriginLine ? 1.2 : 0.5;
        ctx.strokeStyle = isOriginLine
          ? "rgba(0,0,0,0.5)"
          : "rgba(0,0,0,0.25)";
        ctx.stroke();
        if (
          Math.abs(screenPos[0] - worldOriginScreen[0]) > 5 ||
          !isOriginLine
        ) {
          let textVal = worldX;
          textVal =
            precision(textVal) === 0
              ? Math.round(textVal)
              : parseFloat(
                  textVal.toFixed(Math.max(0, precision(xScale) + 1)),
                );
          if (Math.abs(textVal) < xScale / 10000 && textVal !== 0) continue;
          const textYPos = Math.min(
            Math.max(worldOriginScreen[1] + 15, 15),
            currentCanvasSize.height - 7,
          );
          if (
            screenPos[0] > 15 &&
            screenPos[0] < currentCanvasSize.width - 15
          ) {
            drawTextWithOutline(String(textVal), screenPos[0], textYPos);
          }
        }
      }
      for (let i = -GRID_LINE_LOOP_COUNT; i <= GRID_LINE_LOOP_COUNT; i++) {
        const worldY = yScale * i + superFloor(yScale, screenTarget[1]);
        if (
          worldY < worldBounds[2] - yScale ||
          worldY > worldBounds[3] + yScale
        )
          continue;
        const screenPos = toScreenspace(0, worldY);
        const isOriginLine = Math.abs(worldY) < yScale * 0.001;
        ctx.beginPath();
        ctx.moveTo(0, screenPos[1]);
        ctx.lineTo(currentCanvasSize.width, screenPos[1]);
        ctx.lineWidth = isOriginLine ? 1.2 : 0.5;
        ctx.strokeStyle = isOriginLine
          ? "rgba(0,0,0,0.5)"
          : "rgba(0,0,0,0.25)";
        ctx.stroke();
        if (
          Math.abs(screenPos[1] - worldOriginScreen[1]) > 5 ||
          !isOriginLine
        ) {
          let textVal = worldY;
          textVal =
            precision(textVal) === 0
              ? Math.round(textVal)
              : parseFloat(
                  textVal.toFixed(Math.max(0, precision(yScale) + 1)),
                );
          if (Math.abs(textVal) < yScale / 10000 && textVal !== 0) continue;
          let textAlign: CanvasTextAlign = "right";
          let textXPos = worldOriginScreen[0] - 7;
          if (worldOriginScreen[0] < 35) {
            textAlign = "left";
            textXPos = 5;
          } else if (worldOriginScreen[0] > currentCanvasSize.width - 35) {
            textAlign = "right";
            textXPos = currentCanvasSize.width - 5;
          }
          ctx.textAlign = textAlign;
          if (
            screenPos[1] > 10 &&
            screenPos[1] < currentCanvasSize.height - 5
          ) {
            drawTextWithOutline(String(textVal), textXPos, screenPos[1] + 4);
          }
          ctx.textAlign = "center";
        }
      }
      ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
      if (
        worldOriginScreen[0] >= 0 &&
        worldOriginScreen[0] <= currentCanvasSize.width
      ) {
        ctx.fillRect(
          worldOriginScreen[0] - 0.75,
          0,
          1.5,
          currentCanvasSize.height,
        );
      }
      if (
        worldOriginScreen[1] >= 0 &&
        worldOriginScreen[1] <= currentCanvasSize.height
      ) {
        ctx.fillRect(
          0,
          worldOriginScreen[1] - 0.75,
          currentCanvasSize.width,
          1.5,
        );
      }
      ctx.lineWidth = 0.2;
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      const minorXStep = xScale / 5;
      if (minorXStep > 0 && minorXStep > Number.EPSILON * 100) {
        for (
          let i = -GRID_LINE_LOOP_COUNT * 5;
          i <= GRID_LINE_LOOP_COUNT * 5;
          i++
        ) {
          const worldX =
            minorXStep * i + superFloor(minorXStep, screenTarget[0]);
          if (Math.abs(worldX % xScale) < minorXStep * 0.01) continue;
          if (
            worldX < worldBounds[0] - minorXStep ||
            worldX > worldBounds[1] + minorXStep
          )
            continue;
          const screenX = toScreenspace(worldX, 0)[0];
          ctx.beginPath();
          ctx.moveTo(screenX, 0);
          ctx.lineTo(screenX, currentCanvasSize.height);
          ctx.stroke();
        }
      }
      const minorYStep = yScale / 5;
      if (minorYStep > 0 && minorYStep > Number.EPSILON * 100) {
        for (
          let i = -GRID_LINE_LOOP_COUNT * 5;
          i <= GRID_LINE_LOOP_COUNT * 5;
          i++
        ) {
          const worldY =
            minorYStep * i + superFloor(minorYStep, screenTarget[1]);
          if (Math.abs(worldY % yScale) < minorYStep * 0.01) continue;
          if (
            worldY < worldBounds[2] - minorYStep ||
            worldY > worldBounds[3] + minorYStep
          )
            continue;
          const screenY = toScreenspace(0, worldY)[1];
          ctx.beginPath();
          ctx.moveTo(0, screenY);
          ctx.lineTo(currentCanvasSize.width, screenY);
          ctx.stroke();
        }
      }
    },
    [toScreenspace, screenTarget, worldBounds, currentCanvasSize],
  );

  // --- Effect for Last Point Pulsating Animation ---
  useEffect(() => {
    if (points.length === 0) {
      setPulseRadius(0); // Reset when no points
      setPulseOpacity(1);
      return;
    }

    let animationFrameId: number;
    const animatePulse = () => {
      setPulseRadius((prevRadius) => {
        let nextRadius = prevRadius + LAST_POINT_PULSE_SPEED;
        if (nextRadius > LAST_POINT_PULSE_MAX_RADIUS) {
          nextRadius = 0; // Loop the pulse
        }
        // Opacity is derived from the *current* frame's radius
        setPulseOpacity(1 - nextRadius / LAST_POINT_PULSE_MAX_RADIUS);
        return nextRadius;
      });
      animationFrameId = requestAnimationFrame(animatePulse);
    };

    animationFrameId = requestAnimationFrame(animatePulse);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [points.length]); // Rerun if the number of points changes

  // --- Main Drawing Effect ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, currentCanvasSize.width, currentCanvasSize.height);

    if (!imageLoadData.allAttempted) {
      ctx.fillStyle = "lightgray";
      ctx.fillRect(0, 0, currentCanvasSize.width, currentCanvasSize.height);
      ctx.fillStyle = "black";
      ctx.textAlign = "center";
      ctx.fillText(
        "Loading images...",
        currentCanvasSize.width / 2,
        currentCanvasSize.height / 2,
      );
      return;
    }

    if (
      imageLoadData.elements.length === 0 &&
      imageLoadData.allAttempted
    ) {
      ctx.fillStyle = "lightgray";
      ctx.fillRect(0, 0, currentCanvasSize.width, currentCanvasSize.height);
      ctx.fillStyle = "black";
      ctx.textAlign = "center";
      let message = "No images to display.";
      if (imageLoadData.errors.length > 0) {
        message = `Failed to load: ${imageLoadData.errors.slice(0, 3).join(", ")}${imageLoadData.errors.length > 3 ? "..." : ""}`;
      }
      ctx.fillText(
        message,
        currentCanvasSize.width / 2,
        currentCanvasSize.height / 2,
      );
      drawGrid(ctx);
      // Continue to draw points even if no image
    } else {
      // Draw background images
      imageLoadData.elements.forEach((img) => {
        const imgNativeAspectRatio = img.height / img.width;
        const actualImageWorldHeight = imageWorldWidth * imgNativeAspectRatio*.91;
        const imgWorldL = -imageWorldWidth / 2;
        const imgWorldR = imageWorldWidth / 2;
        const imgWorldT = -actualImageWorldHeight / 2;
        const imgWorldB = actualImageWorldHeight / 2;
        const [sL, sT] = toScreenspace(imgWorldL+113.5, imgWorldT-2);
        const [sR, sB] = toScreenspace(imgWorldR, imgWorldB);
        const sW = sR - sL;
        const sH = sB - sT;
        if (sW > 0 && sH > 0) {
          ctx.drawImage(img, sL, sT, sW, sH);
        }
      });
      drawGrid(ctx);
    }

    // --- Draw Points and Connecting Lines ---
    if (points && points.length > 0) {
      ctx.save(); // Save context state

      // 1. Draw dotted blue line connecting points
      if (points.length > 1) {
        ctx.beginPath();
        ctx.setLineDash([5, 3]); // 5px dash, 3px gap
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        const firstPointScreen = toScreenspace(points[0][0], points[0][1]);
        ctx.moveTo(firstPointScreen[0], firstPointScreen[1]);
        for (let i = 1; i < points.length; i++) {
          const [screenX, screenY] = toScreenspace(
            points[i][0],
            points[i][1],
          );
          ctx.lineTo(screenX, screenY);
        }
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
      }

      // 2. Draw points (circles)
      points.forEach((point, index) => {
        const [screenX, screenY] = toScreenspace(point[0], point[1]);
        const isLastPoint = index === points.length - 1;

        ctx.beginPath();
        ctx.arc(screenX, screenY, POINT_RADIUS*1.3, 0, 2 * Math.PI);
        ctx.fillStyle = "white";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(screenX, screenY, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = isLastPoint ? "red" : "blue";
        ctx.fill();

        // 3. Draw pulsating wave for the last point
        if (isLastPoint && pulseRadius > 0) {
          ctx.beginPath();
          ctx.arc(screenX, screenY, pulseRadius, 0, 2 * Math.PI);
          ctx.strokeStyle = `rgba(255, 255, 255, ${pulseOpacity})`;
          ctx.lineWidth = 2; // Pulse wave line width
          ctx.stroke();
        }
      });
      ctx.restore(); // Restore context state
    }
  }, [
    imageLoadData,
    screenTarget,
    zoomLog,
    currentCanvasSize,
    toScreenspace,
    drawGrid,
    imageWorldWidth,
    worldBounds,
    points, // New dependency
    pulseRadius, // New dependency
    pulseOpacity, // New dependency
  ]);

  // --- Event Handlers (remain the same) ---
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    mouseStartRef.current = [event.clientX, event.clientY];
    initialScreenTargetOnDragRef.current = [...screenTarget];
    event.currentTarget.style.cursor = "grabbing";
  };

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging) return;
      const dx = event.clientX - mouseStartRef.current[0];
      const dy = event.clientY - mouseStartRef.current[1];
      const worldUnitsPerPixel = panSpeedFactor / zoomLog;
      setScreenTarget([
        initialScreenTargetOnDragRef.current[0] - dx * worldUnitsPerPixel,
        initialScreenTargetOnDragRef.current[1] - dy * worldUnitsPerPixel,
      ]);
    },
    [isDragging, zoomLog, panSpeedFactor],
  );

  const handleMouseUpOrLeave = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    if (isDragging) {
      setIsDragging(false);
      event.currentTarget.style.cursor = "grab";
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const zoomAmount = event.deltaY * -0.001;
    const canvasRect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - canvasRect.left;
    const mouseY = event.clientY - canvasRect.top;
    const currentWorldWidth = worldBounds[1] - worldBounds[0];
    const currentWorldHeight = worldBounds[3] - worldBounds[2];
    const worldMouseXBeforeZoom =
      worldBounds[0] + (mouseX / currentCanvasSize.width) * currentWorldWidth;
    const worldMouseYBeforeZoom =
      worldBounds[2] +
      (mouseY / currentCanvasSize.height) * currentWorldHeight;
    const newZoom = Math.max(-7, Math.min(12, zoom + zoomAmount));
    const newZoomLog = Math.pow(2, newZoom);
    const normMouseX = mouseX / currentCanvasSize.width;
    const normMouseY = mouseY / currentCanvasSize.height;
    const newScreenTargetX =
      worldMouseXBeforeZoom -
      (currentInitialBounds[0] +
        (currentInitialBounds[1] - currentInitialBounds[0]) * normMouseX) /
        newZoomLog;
    const newScreenTargetY =
      worldMouseYBeforeZoom -
      (currentInitialBounds[2] +
        (currentInitialBounds[3] - currentInitialBounds[2]) * normMouseY) /
        newZoomLog;
    setZoom(newZoom);
    setScreenTarget([newScreenTargetX, newScreenTargetY]);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        if (canvasRef.current) canvasRef.current.style.cursor = "grab";
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (canvasElement) {
      const wheelHandler = (e: WheelEvent) => {
        e.preventDefault();
        handleWheel(e as unknown as React.WheelEvent<HTMLCanvasElement>);
      };
      
      // Add the event listener with passive: false
      canvasElement.addEventListener("wheel", wheelHandler, { passive: false });

      // Cleanup function to remove the event listener
      return () => {
        canvasElement.removeEventListener("wheel", wheelHandler);
      };
    }
  }, [handleWheel]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
      className=""
      style={{
        border: "1px solid black",
        cursor: "grab",
        touchAction: "none",
        backgroundColor: "#262b37", // Ensure this is the desired background for pulse visibility
        height: "100vh",
        width: "100vh"
      }}
    />
  );
};

export default ImageOverlayCanvas;
import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { MapImage, MapText, Path, Shape } from "./types";

// --- Constants for configuration ---
const INITIAL_VIEW_WORLD_HALF_WIDTH = 10;
const GRID_TARGET_LINES_ON_SCREEN = 5;
const GRID_LINE_LOOP_COUNT = 25;
const POINT_RADIUS = 5;
const LAST_POINT_PULSE_MAX_RADIUS = 30;
const LAST_POINT_PULSE_SPEED = 0.06;
const FONT = "Arial";

// Helper functions (moved outside to avoid recreation)
const superFloor = (mult: number, val: number): number => {
  return mult * Math.floor(val / mult);
};

const precision = (a: number): number => {
  if (!isFinite(a)) return 0;
  let e = 1,
    p = 0;
  while (Math.round(a * e) / e !== a) {
    e *= 10;
    p++;
  }
  return p;
};

interface ImageEntry {
  element?: HTMLImageElement;
  status: "pending" | "loading" | "loaded" | "error";
  error?: string;
}

interface Props {
  images: MapImage[];
  initialWidth?: number;
  initialHeight?: number;
  paths?: Path[];
  texts?: MapText[];
  doDrawGrid: boolean;
  shapes?: Shape[];
}

export default function MapComponent({
  images,
  initialWidth = 800,
  initialHeight = 600,
  paths = [],
  texts = [],
  doDrawGrid,
  shapes = []
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageEntries, setImageEntries] = useState<Record<string, ImageEntry>>(
    {}
  );

  const [zoom, setZoom] = useState(-6.7);
  const [screenTarget, setScreenTarget] = useState<[number, number]>([0, 0]);
  const [isDragging, setIsDragging] = useState(false);

  // Use refs for values that don't need to trigger re-renders
  const mouseStartRef = useRef<[number, number]>([0, 0]);
  const initialScreenTargetOnDragRef = useRef<[number, number]>([0, 0]);
  const animationFrameRef = useRef<number | undefined>(undefined);

  const [pulseRadius, setPulseRadius] = useState(0);
  const [pulseOpacity, setPulseOpacity] = useState(1);

  // Memoize canvas size
  const canvasSize = useMemo(
    () => ({ width: initialWidth, height: initialHeight }),
    [initialWidth, initialHeight]
  );

  // Memoize derived values
  const { initialBounds, zoomLog, worldBounds } = useMemo(() => {
    const aspectRatio =
      canvasSize.width === 0 ? 1 : canvasSize.height / canvasSize.width;
    const halfWidth = INITIAL_VIEW_WORLD_HALF_WIDTH;
    const halfHeight = halfWidth * aspectRatio;
    const bounds = [-halfWidth, halfWidth, -halfHeight, halfHeight];
    const zoomLogValue = Math.pow(2, zoom);
    const inverseZL = 1 / zoomLogValue;
    const wBounds = [
      screenTarget[0] + bounds[0] * inverseZL,
      screenTarget[0] + bounds[1] * inverseZL,
      screenTarget[1] + bounds[2] * inverseZL,
      screenTarget[1] + bounds[3] * inverseZL,
    ];

    return {
      canvasAspectRatio: aspectRatio,
      initialBounds: bounds,
      zoomLog: zoomLogValue,
      worldBounds: wBounds,
    };
  }, [canvasSize, zoom, screenTarget]);

  const panSpeedFactor = useMemo(() => {
    return canvasSize.width === 0
      ? 0.01
      : (2 * INITIAL_VIEW_WORLD_HALF_WIDTH) / canvasSize.width;
  }, [canvasSize.width]);

  // Memoize coordinate transformation
  const toScreenspace = useCallback(
    (worldX: number, worldY: number): [number, number] => {
      const currentWorldWidth = worldBounds[1] - worldBounds[0];
      const currentWorldHeight = worldBounds[3] - worldBounds[2];
      if (currentWorldWidth === 0 || currentWorldHeight === 0) return [0, 0];
      const normX = (worldX - worldBounds[0]) / currentWorldWidth;
      const normY = (worldY - worldBounds[2]) / currentWorldHeight;
      return [normX * canvasSize.width, normY * canvasSize.height];
    },
    [worldBounds, canvasSize]
  );

  // Optimized image loading effect
  const imageUrls = useMemo(() => images.map((img) => img.url), [images]);
  const imageUrlsString = imageUrls.join(",");

  useEffect(() => {
    const newEntriesToUpdate: Record<string, Partial<ImageEntry>> = {};
    let needsStateUpdate = false;

    imageUrls.forEach((url) => {
      const currentEntry = imageEntries[url];

      if (
        !currentEntry ||
        currentEntry.status === "pending" ||
        currentEntry.status === "error"
      ) {
        needsStateUpdate = true;
        const img = currentEntry?.element || new Image();

        newEntriesToUpdate[url] = {
          element: img,
          status: "loading",
          error: undefined,
        };

        if (
          img.src !== url ||
          currentEntry?.status === "error" ||
          !img.src
        ) {
          img.onload = () => {
            setImageEntries((prev) => ({
              ...prev,
              [url]: { ...prev[url], element: img, status: "loaded" },
            }));
          };
          img.onerror = () => {
            const errorMsg = `Failed to load ${url}`;
            console.error(errorMsg);
            setImageEntries((prev) => ({
              ...prev,
              [url]: {
                ...prev[url],
                element: img,
                status: "error",
                error: errorMsg,
              },
            }));
          };
          img.src = url;
        } else if (img.complete && img.naturalWidth > 0) {
          newEntriesToUpdate[url] = { element: img, status: "loaded" };
        }
      }
    });

    if (needsStateUpdate) {
      setImageEntries((prev) => {
        const updatedEntries = { ...prev };
        for (const url in newEntriesToUpdate) {
          updatedEntries[url] = {
            ...(prev[url] || {}),
            ...newEntriesToUpdate[url],
          } as ImageEntry;
        }
        return updatedEntries;
      });
    }
  }, [imageUrlsString]); // Use string dependency to avoid array reference changes

  // Canvas setup effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, [canvasSize]);

  // Memoized drawing functions
  const drawImages = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      let anyLoading = false;
      let drawnImageCount = 0;
      const errorUrls: string[] = [];

      if (images.length === 0) return;

      images.forEach((mapImage) => {
        const entry = imageEntries[mapImage.url];

        if (entry && entry.status === "loaded" && entry.element) {
          const htmlImg = entry.element;
          const worldImageMinX = mapImage.long - mapImage.width / 2;
          const worldImageMaxX = mapImage.long + mapImage.width / 2;
          const worldImageMinY = mapImage.lat - mapImage.height / 2;
          const worldImageMaxY = mapImage.lat + mapImage.height / 2;

          const [screenLeftX, screenTopY] = toScreenspace(
            worldImageMinX,
            worldImageMinY
          );
          const [screenRightX, screenBottomY] = toScreenspace(
            worldImageMaxX,
            worldImageMaxY
          );

          const screenPixelWidth = screenRightX - screenLeftX;
          const screenPixelHeight = screenBottomY - screenTopY;

          if (screenPixelWidth > 0 && screenPixelHeight > 0) {
            ctx.drawImage(
              htmlImg,
              screenLeftX,
              screenTopY,
              screenPixelWidth,
              screenPixelHeight
            );
            drawnImageCount++;
          }
        } else if (entry && entry.status === "loading") {
          anyLoading = true;
        } else if (entry && entry.status === "error") {
          if (!errorUrls.includes(mapImage.url)) {
            errorUrls.push(mapImage.url);
          }
        } else if (!entry) {
          anyLoading = true;
        }
      });

      // Handle loading/error states
      if (anyLoading && drawnImageCount === 0 && images.length > 0) {
        ctx.fillStyle = "lightgray";
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.fillText(
          "Loading images...",
          canvasSize.width / 2,
          canvasSize.height / 2
        );
      } else if (!anyLoading && drawnImageCount === 0 && images.length > 0) {
        ctx.fillStyle = "lightgray";
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        let message = "No images to display.";
        if (errorUrls.length > 0) {
          message = `Failed to load: ${errorUrls
            .slice(0, 3)
            .join(", ")}${errorUrls.length > 3 ? "..." : ""}`;
        }
        ctx.fillText(message, canvasSize.width / 2, canvasSize.height / 2);
      }
    },
    [images, imageEntries, toScreenspace, canvasSize]
  );

  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = "center";
      const currentGraphWorldWidth = worldBounds[1] - worldBounds[0];
      const currentGraphWorldHeight = worldBounds[3] - worldBounds[2];
      if (currentGraphWorldWidth <= 0 || currentGraphWorldHeight <= 0) return;

      const getGridlineStep = (
        viewDimensionWorld: number,
        scaleFactorSeed: number
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
          Number.EPSILON
        );
      };

      const scaleFactorX = Math.pow(
        10,
        Math.floor(
          Math.log10(Math.max(currentGraphWorldWidth, Number.EPSILON))
        )
      );
      const scaleFactorY = Math.pow(
        10,
        Math.floor(
          Math.log10(Math.max(currentGraphWorldHeight, Number.EPSILON))
        )
      );
      const xScale = getGridlineStep(currentGraphWorldWidth, scaleFactorX);
      const yScale = getGridlineStep(currentGraphWorldHeight, scaleFactorY);
      if (xScale <= 0 || yScale <= 0) return;

      const worldOriginScreen = toScreenspace(0, 0);
      const drawTextWithOutline = (text: string, x: number, y: number) => {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 2.5;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
        ctx.fillText(text, x, y);
      };

      // Draw vertical grid lines
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
        ctx.lineTo(screenPos[0], canvasSize.height);
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
                  textVal.toFixed(Math.max(0, precision(xScale) + 1))
                );
          if (Math.abs(textVal) < xScale / 10000 && textVal !== 0) continue;
          const textYPos = Math.min(
            Math.max(worldOriginScreen[1] + 15, 15),
            canvasSize.height - 7
          );
          if (screenPos[0] > 15 && screenPos[0] < canvasSize.width - 15) {
            drawTextWithOutline(String(textVal), screenPos[0], textYPos);
          }
        }
      }

      // Draw horizontal grid lines
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
        ctx.lineTo(canvasSize.width, screenPos[1]);
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
                  textVal.toFixed(Math.max(0, precision(yScale) + 1))
                );
          if (Math.abs(textVal) < yScale / 10000 && textVal !== 0) continue;
          let textAlign: CanvasTextAlign = "right";
          let textXPos = worldOriginScreen[0] - 7;
          if (worldOriginScreen[0] < 35) {
            textAlign = "left";
            textXPos = 5;
          } else if (worldOriginScreen[0] > canvasSize.width - 35) {
            textAlign = "right";
            textXPos = canvasSize.width - 5;
          }
          ctx.textAlign = textAlign;
          if (screenPos[1] > 10 && screenPos[1] < canvasSize.height - 5) {
            drawTextWithOutline(String(textVal), textXPos, screenPos[1] + 4);
          }
          ctx.textAlign = "center";
        }
      }

      // Draw origin axes
      ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
      if (
        worldOriginScreen[0] >= 0 &&
        worldOriginScreen[0] <= canvasSize.width
      ) {
        ctx.fillRect(worldOriginScreen[0] - 0.75, 0, 1.5, canvasSize.height);
      }
      if (
        worldOriginScreen[1] >= 0 &&
        worldOriginScreen[1] <= canvasSize.height
      ) {
        ctx.fillRect(0, worldOriginScreen[1] - 0.75, canvasSize.width, 1.5);
      }

      // Draw minor grid lines
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
          ctx.lineTo(screenX, canvasSize.height);
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
          ctx.lineTo(canvasSize.width, screenY);
          ctx.stroke();
        }
      }
    },
    [toScreenspace, screenTarget, worldBounds, canvasSize]
  );

  const drawPath = useCallback(
    (ctx: CanvasRenderingContext2D, path: Path) => {
      if (!path.enabled || path.path.length === 0) return;

      ctx.save();

      if (path.path.length > 1) {
        ctx.beginPath();
        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.moveTo(...toScreenspace(path.path[0].long, path.path[0].lat));
        path.path.forEach((point) => {
          ctx.lineTo(...toScreenspace(point.long, point.lat));
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      path.path.forEach((point, index) => {
        const [screenX, screenY] = toScreenspace(point.long, point.lat);
        const isLastPoint = index === path.path.length - 1;

        ctx.beginPath();
        ctx.arc(screenX, screenY, POINT_RADIUS * 1.3, 0, 2 * Math.PI);
        ctx.fillStyle = "white";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(screenX, screenY, POINT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = isLastPoint ? path.color || "red" : "blue";
        ctx.fill();

        if (isLastPoint && pulseRadius > 0) {
          ctx.beginPath();
          ctx.arc(screenX, screenY, pulseRadius, 0, 2 * Math.PI);
          ctx.strokeStyle = `rgba(255, 255, 255, ${pulseOpacity})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
      ctx.restore();
    },
    [toScreenspace, pulseRadius, pulseOpacity]
  );

  const drawText = useCallback(
    (ctx: CanvasRenderingContext2D, text: MapText) => {
      ctx.save();
      ctx.font = `${text.size}px ${FONT} bold`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      const [screenX, screenY] = toScreenspace(text.long, text.lat);
      ctx.strokeText(text.text, screenX, screenY);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(text.text, screenX, screenY);
      ctx.restore();
    },
    [toScreenspace]
  );

const drawShape = useCallback(
  (ctx: CanvasRenderingContext2D, shape: Shape) => {
    if (!shape || !shape.location) return;

    ctx.save();
    const [centerX, centerY] = toScreenspace(
      shape.location.long,
      shape.location.lat
    );

    const currentWorldWidth = worldBounds[1] - worldBounds[0];
    const currentWorldHeight = worldBounds[3] - worldBounds[2];

    const worldToScreenScaleX = canvasSize.width / currentWorldWidth;
    const worldToScreenScaleY = canvasSize.height / currentWorldHeight;

    const screenWidth = shape.width * worldToScreenScaleX;
    const screenHeight = shape.height * worldToScreenScaleY;

    ctx.translate(centerX, centerY);
    ctx.rotate(shape.rotation);

    ctx.beginPath();

    if (shape.shape === "ellipse") ctx.ellipse(0, 0, screenWidth / 2, screenHeight / 2, 0, 0, 2 * Math.PI);
    else if (shape.shape === "rectangle") ctx.rect(-screenWidth / 2, -screenHeight / 2, screenWidth, screenHeight);

    ctx.fillStyle = shape.color?.toString() || "green";
    ctx.globalAlpha = 0.3;
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = shape.color?.toString() || "green";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  },
  [toScreenspace, worldBounds, canvasSize]
);

  // Pulse animation effect
  useEffect(() => {
    if (paths.length === 0 || paths.every((p) => p.path.length === 0)) {
      setPulseRadius(0);
      setPulseOpacity(1);
      return;
    }

    const animatePulse = () => {
      setPulseRadius((prevRadius) => {
        let nextRadius = prevRadius + LAST_POINT_PULSE_SPEED;
        if (nextRadius > LAST_POINT_PULSE_MAX_RADIUS) {
          nextRadius = 0;
        }
        setPulseOpacity(1 - nextRadius / LAST_POINT_PULSE_MAX_RADIUS);
        return nextRadius;
      });
      animationFrameRef.current = requestAnimationFrame(animatePulse);
    };

    animationFrameRef.current = requestAnimationFrame(animatePulse);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [paths.length > 0 && paths.some((p) => p.path.length > 0)]); // Optimize dependency

  // Main drawing effect with optimized dependencies
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    drawImages(ctx);
    if (doDrawGrid) drawGrid(ctx);
    shapes.forEach((shape)=>drawShape(ctx,shape))
    texts.forEach((text) => drawText(ctx, text));
    paths.forEach((path) => drawPath(ctx, path));
  }, [
    drawImages,
    drawGrid,
    drawText,
    drawPath,
    drawShape,
    doDrawGrid,
    texts,
    paths,
    shapes,
    canvasSize,
  ]);

  // Wheel event handler
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const zoomAmount = event.deltaY * -0.001;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - canvasRect.left;
      const mouseY = event.clientY - canvasRect.top;

      const currentWorldWidth = worldBounds[1] - worldBounds[0];
      const currentWorldHeight = worldBounds[3] - worldBounds[2];

      const worldMouseXBeforeZoom =
        worldBounds[0] + (mouseX / canvasSize.width) * currentWorldWidth;
      const worldMouseYBeforeZoom =
        worldBounds[2] + (mouseY / canvasSize.height) * currentWorldHeight;

      const newZoom = Math.max(-7, Math.min(12, zoom + zoomAmount));
      const newZoomLog = Math.pow(2, newZoom);

      const normMouseX = mouseX / canvasSize.width;
      const normMouseY = mouseY / canvasSize.height;

      const newScreenTargetX =
        worldMouseXBeforeZoom -
        (initialBounds[0] +
          (initialBounds[1] - initialBounds[0]) * normMouseX) /
          newZoomLog;
      const newScreenTargetY =
        worldMouseYBeforeZoom -
        (initialBounds[2] +
          (initialBounds[3] - initialBounds[2]) * normMouseY) /
          newZoomLog;

      setZoom(newZoom);
      setScreenTarget([newScreenTargetX, newScreenTargetY]);
    },
    [zoom, worldBounds, canvasSize, initialBounds]
  );

  // Add wheel event listener with passive: false
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  // Optimized mouse event handlers
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      setIsDragging(true);
      mouseStartRef.current = [event.clientX, event.clientY];
      initialScreenTargetOnDragRef.current = [...screenTarget];
      event.currentTarget.style.cursor = "grabbing";
    },
    [screenTarget]
  );

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
    [isDragging, zoomLog, panSpeedFactor]
  );

  const handleMouseUpOrLeave = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging) {
        setIsDragging(false);
        event.currentTarget.style.cursor = "grab";
      }
    },
    [isDragging]
  );

  // Global mouse up handler
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

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
      style={{
        border: "1px solid black",
        cursor: "grab",
        touchAction: "none",
        backgroundColor: "#262b37",
        height: "100vh",
        width: "100vh",
      }}
    />
  );
}
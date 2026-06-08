import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Pencil } from "lucide-react";

interface DoodleParticle {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
}

interface DoodleLineSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function DoodlePageCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lineSegmentsRef = useRef<DoodleLineSegment[]>([]);
  const isDrawingRef = useRef(false);
  const lastPageParticleAtRef = useRef(0);
  const [cursorPoint, setCursorPoint] = useState<{ x: number; y: number } | null>(null);
  const [particles, setParticles] = useState<DoodleParticle[]>([]);

  useEffect(() => {
    const canvasElement = canvasRef.current;

    if (!canvasElement) {
      return;
    }

    function resizeCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      canvas.getContext("2d")?.scale(dpr, dpr);
      redrawPageDoodles();
    }

    function isDrawableTarget(event: globalThis.PointerEvent) {
      const target = event.target;
      return target instanceof Element && Boolean(target.closest(".login-shell, .lobby-page"));
    }

    function getWindowPoint(event: globalThis.PointerEvent) {
      return {
        x: Math.min(1, Math.max(0, event.clientX / Math.max(1, window.innerWidth))),
        y: Math.min(1, Math.max(0, event.clientY / Math.max(1, window.innerHeight)))
      };
    }

    function handlePointerDown(event: globalThis.PointerEvent) {
      if (!isDrawableTarget(event)) {
        return;
      }

      const point = getWindowPoint(event);
      isDrawingRef.current = true;
      lastPointRef.current = point;
      setCursorPoint(point);
      burst(point);
    }

    function handlePointerMove(event: globalThis.PointerEvent) {
      if (!isDrawableTarget(event)) {
        return;
      }

      const point = getWindowPoint(event);
      setCursorPoint(point);

      if (isDrawingRef.current && lastPointRef.current) {
        appendLineSegment(lastPointRef.current, point);
        lastPointRef.current = point;
        emitPageDrawingDust(point);
      }
    }

    function handlePointerUp() {
      isDrawingRef.current = false;
      lastPointRef.current = null;
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  function getCanvasSize() {
    const canvas = canvasRef.current;

    return {
      width: canvas ? canvas.width / (window.devicePixelRatio || 1) : window.innerWidth,
      height: canvas ? canvas.height / (window.devicePixelRatio || 1) : window.innerHeight
    };
  }

  function appendLineSegment(from: { x: number; y: number }, to: { x: number; y: number }) {
    lineSegmentsRef.current = [...lineSegmentsRef.current, { from, to }].slice(-1000);
    redrawPageDoodles();
  }

  function emitPageDrawingDust(point: { x: number; y: number }) {
    const now = Date.now();
    if (now - lastPageParticleAtRef.current < 70) {
      return;
    }

    lastPageParticleAtRef.current = now;
    burst(point, 3);
  }

  function redrawPageDoodles() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 5;
    const size = getCanvasSize();
    context.clearRect(0, 0, size.width, size.height);

    lineSegmentsRef.current.forEach((segment) => {
      context.strokeStyle = "#222222";
      context.beginPath();
      context.moveTo(segment.from.x * size.width, segment.from.y * size.height);
      context.lineTo(segment.to.x * size.width, segment.to.y * size.height);
      context.stroke();
    });
  }

  function burst(point: { x: number; y: number }, count = 8) {
    const nextParticles = Array.from({ length: count }, (_, index) => ({
      id: `pad-${Date.now()}-${index}-${Math.random()}`,
      x: point.x,
      y: point.y,
      dx: Math.cos((Math.PI * 2 * index) / count) * (8 + Math.random() * 14),
      dy: Math.sin((Math.PI * 2 * index) / count) * (8 + Math.random() * 14),
      color: "#222222"
    }));

    setParticles((currentParticles) => [...currentParticles.slice(-20), ...nextParticles]);
    window.setTimeout(() => {
      setParticles((currentParticles) =>
        currentParticles.filter(
          (particle) => !nextParticles.some((nextParticle) => nextParticle.id === particle.id)
        )
      );
    }, 700);
  }

  return (
    <div className="doodle-page-canvas" aria-hidden="true">
      <canvas ref={canvasRef} />
      {cursorPoint ? (
        <span
          className="page-pencil-cursor"
          style={{ left: `${cursorPoint.x * 100}%`, top: `${cursorPoint.y * 100}%` }}
          aria-hidden="true"
        >
          <Pencil size={18} />
        </span>
      ) : null}
      {particles.map((particle) => (
        <i
          className="doodle-particle"
          key={particle.id}
          style={{
            left: `${particle.x * 100}%`,
            top: `${particle.y * 100}%`,
            "--particle-color": particle.color,
            "--particle-x": `${particle.dx}px`,
            "--particle-y": `${particle.dy}px`
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

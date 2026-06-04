"use client";

import React, { useState, useRef, useEffect } from "react";
import { ZoomIn, RotateCw, Check, X, Upload } from "lucide-react";

interface ImageCropperProps {
  onCrop: (blob: Blob) => void;
  onClose: () => void;
}

export function ImageCropper({ onCrop, onClose }: ImageCropperProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
        setScale(1);
        setRotation(0);
        setOffset({ x: 0, y: 0 });
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageSrc) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !imageSrc) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch Support
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!imageSrc || e.touches.length === 0) return;
    setIsDragging(true);
    const touch = e.touches[0];
    setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDragging || !imageSrc || e.touches.length === 0) return;
    const touch = e.touches[0];
    setOffset({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  // Redraw image on canvas when settings change
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      imageRef.current = img;
      drawCanvas();
    };
  }, [imageSrc, scale, rotation, offset]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and fill dark background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0c0a09"; // Stone 950 matching dark theme
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    
    // Draw circular mask boundary in center
    const size = Math.min(canvas.width, canvas.height);
    const radius = size * 0.4;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Outer shading to highlight the crop region
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtract circle to keep it clear
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Reset composite operation to draw image inside the circle
    ctx.globalCompositeOperation = "destination-over";
    
    // Create clipped area
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();

    // Draw the image with scale, rotation and offsets
    ctx.translate(centerX + offset.x, centerY + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);

    // Calculate aspect ratio fit
    const imgRatio = img.width / img.height;
    let drawWidth = size * 0.8;
    let drawHeight = drawWidth / imgRatio;

    // Apply scale factor
    drawWidth *= scale;
    drawHeight *= scale;

    ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();

    // Reset composite for circular border overlay
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(99, 102, 241, 0.8)"; // Indigo border
    ctx.lineWidth = 3;
    ctx.stroke();
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    // We create a second hidden canvas to perform the actual high-quality square cropped output
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = 400;
    outputCanvas.height = 400;
    const oCtx = outputCanvas.getContext("2d");
    if (!oCtx) return;

    // Standard crop math
    const size = Math.min(canvas.width, canvas.height);
    const radius = size * 0.4;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    oCtx.save();
    // Circular crop output
    oCtx.beginPath();
    oCtx.arc(200, 200, 200, 0, Math.PI * 2);
    oCtx.clip();

    oCtx.translate(200, 200);
    // Draw the exact same relative transform on the output canvas
    // Relative coordinates
    const scaleFactor = 400 / (radius * 2);
    oCtx.translate(offset.x * scaleFactor, offset.y * scaleFactor);
    oCtx.rotate((rotation * Math.PI) / 180);

    const imgRatio = img.width / img.height;
    let drawWidth = size * 0.8 * scaleFactor * scale;
    let drawHeight = drawWidth / imgRatio;

    oCtx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    oCtx.restore();

    outputCanvas.toBlob((blob) => {
      if (blob) {
        onCrop(blob);
      }
    }, "image/png");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
      <div className="glass-3d w-full max-w-lg overflow-hidden rounded-[2.5rem] border border-white/10 flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black uppercase tracking-widest text-[#E8EAFF]">Profile Photo Cropper</h3>
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Drag to position, zoom, and rotate</p>
          </div>
          <button 
            onClick={onClose}
            className="h-10 w-10 rounded-full border border-white/10 hover:border-white/20 flex items-center justify-center transition-colors"
          >
            <X className="h-5 w-5 text-muted hover:text-white" />
          </button>
        </div>

        {/* Workspace */}
        <div className="p-8 flex flex-col items-center gap-6">
          {!imageSrc ? (
            <label className="w-full aspect-square max-w-[320px] rounded-[2rem] border-2 border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300">
              <Upload className="h-10 w-10 text-muted" />
              <div className="text-center">
                <span className="text-xs font-black uppercase tracking-widest text-indigo-400 block mb-1">Upload Photo</span>
                <span className="text-[9px] font-bold text-muted uppercase">JPG or PNG formats</span>
              </div>
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={320}
                height={320}
                className="rounded-[2rem] border border-white/15 cursor-move shadow-2xl"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
              />
            </div>
          )}

          {imageSrc && (
            <div className="w-full space-y-4">
              {/* Zoom Control */}
              <div className="flex items-center gap-4">
                <ZoomIn className="h-4 w-4 text-muted" />
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.05"
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  className="flex-1 accent-indigo-500 bg-white/5 h-1.5 rounded-full"
                />
                <span className="text-[10px] font-black text-muted w-10 text-right">{Math.round(scale * 100)}%</span>
              </div>

              {/* Rotation Control */}
              <div className="flex items-center gap-4">
                <RotateCw className="h-4 w-4 text-muted" />
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="1"
                  value={rotation}
                  onChange={(e) => setRotation(parseInt(e.target.value))}
                  className="flex-1 accent-indigo-500 bg-white/5 h-1.5 rounded-full"
                />
                <span className="text-[10px] font-black text-muted w-10 text-right">{rotation}°</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-8 py-6 border-t border-white/5 bg-white/5 flex gap-4">
          {imageSrc && (
            <button 
              onClick={() => setImageSrc(null)}
              className="flex-1 h-12 border border-white/10 hover:border-white/20 text-xs font-black uppercase tracking-widest text-muted hover:text-white rounded-full transition-all"
            >
              Reset Image
            </button>
          )}
          <button 
            disabled={!imageSrc}
            onClick={handleSave}
            className="flex-1 h-12 btn-primary rounded-full disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
          >
            Apply Crop <Check className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

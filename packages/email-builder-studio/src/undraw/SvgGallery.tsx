import React, { useState, useMemo, useEffect } from "react";
import { Search } from "lucide-react";
import {
  UNDRAW_CATALOG,
  renderUndrawSvg,
  type UndrawIllustration,
} from "./assetLibrary";

interface SvgGalleryProps {
  onInsert: (url: string, title: string) => void;
  defaultColor?: string;
}

const SVG_PREVIEW_LIMIT = 96;

export const SvgGallery: React.FC<SvgGalleryProps> = ({
  onInsert,
  defaultColor = "#6c63ff",
}) => {
  const [query, setQuery] = useState("");
  const [svgColor, setSvgColor] = useState(defaultColor);
  const [loadingSvgId, setLoadingSvgId] = useState<string | null>(null);
  const [svgPreviews, setSvgPreviews] = useState<Record<string, string>>({});

  const filteredSvg = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return UNDRAW_CATALOG;
    return UNDRAW_CATALOG.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.includes(q))
    );
  }, [query]);

  const visibleSvg = useMemo(
    () => filteredSvg.slice(0, SVG_PREVIEW_LIMIT),
    [filteredSvg]
  );

  useEffect(() => {
    let cancelled = false;
    const missing = visibleSvg.filter(
      (item) => !svgPreviews[`${item.exportName}:${svgColor}`]
    );
    if (!missing.length) return;

    void Promise.all(
      missing.map(async (item) => {
        try {
          const svg = await renderUndrawSvg(item, svgColor);
          return { key: `${item.exportName}:${svgColor}`, svg };
        } catch (error) {
          console.error("Failed to render SVG", error);
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const loaded = results.filter(
        (result): result is { key: string; svg: string } => Boolean(result)
      );
      if (!loaded.length) return;
      setSvgPreviews((current) => {
        const next = { ...current };
        loaded.forEach((result) => {
          next[result.key] = result.svg;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [svgColor, svgPreviews, visibleSvg]);

  const handleSvgInsert = async (item: UndrawIllustration) => {
    setLoadingSvgId(item.id);
    try {
      const svg = await renderUndrawSvg(item, svgColor);
      
      // Ensure xmlns is present, which is required for Image rendering
      let clean = svg.replace(/[\r\n]+/g, " ");
      if (!clean.includes("xmlns=")) {
        clean = clean.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      const dataUri = `data:image/svg+xml;base64,${btoa(clean)}`;

      const image = new window.Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("SVG could not be rendered"));
        image.src = dataUri;
      });

      const canvas = window.document.createElement("canvas");
      // Set to a high-quality width, e.g., 600px which is standard for emails
      const targetWidth = 600;
      const aspectRatio = image.height / image.width;
      canvas.width = targetWidth;
      canvas.height = targetWidth * aspectRatio;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const pngUrl = canvas.toDataURL("image/png");
      onInsert(pngUrl, item.title);
    } finally {
      setLoadingSvgId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", height: "100%", padding: "0 16px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <div
          style={{
            flex: 1,
            position: "relative",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Search
            size={14}
            style={{ position: "absolute", left: "12px", color: "#666" }}
          />
          <input
            type="text"
            placeholder="Search illustrations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px 8px 32px",
              borderRadius: "4px",
              border: "1px solid #ddd",
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "#666" }}>Color:</span>
          <input
            type="color"
            value={svgColor}
            onChange={(e) => setSvgColor(e.target.value)}
            style={{
              border: "none",
              padding: 0,
              width: "32px",
              height: "32px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: "12px",
          overflowY: "auto",
          alignContent: "start",
          paddingRight: "4px",
          paddingBottom: "16px",
        }}
      >
        {visibleSvg.map((item) => {
          const previewSvg = svgPreviews[`${item.exportName}:${svgColor}`];
          const isLoading = loadingSvgId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSvgInsert(item)}
              disabled={isLoading}
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid #eee",
                borderRadius: "6px",
                overflow: "hidden",
                cursor: isLoading ? "wait" : "pointer",
                background: "#fff",
                padding: 0,
                textAlign: "left",
                opacity: isLoading ? 0.7 : 1,
                transition: "border-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#ccc")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#eee")}
            >
              <div
                style={{
                  height: "80px",
                  background: "#f9fafb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  padding: "8px",
                }}
              >
                {previewSvg ? (
                  <div
                    style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                    dangerouslySetInnerHTML={{ __html: previewSvg }}
                  />
                ) : (
                  <div style={{ fontSize: "12px", color: "#999" }}>...</div>
                )}
              </div>
              <div style={{ padding: "8px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#333",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    fontSize: "9px",
                    color: "#888",
                    marginTop: "2px",
                  }}
                >
                  {isLoading ? "Inserting..." : "unDraw SVG"}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

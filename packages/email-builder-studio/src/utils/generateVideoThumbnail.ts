export async function generateYouTubeThumbnailWithPlayButton(youtubeUrl: string): Promise<string | null> {
  const ytMatch = youtubeUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (!ytMatch) return null;

  const videoId = ytMatch[1];
  return new Promise((resolve) => {
    const tryLoad = (resolution: string) => {
      // Use a CORS proxy to prevent "tainted canvas" errors when calling toDataURL()
      const thumbUrl = `https://corsproxy.io/?${encodeURIComponent(`https://img.youtube.com/vi/${videoId}/${resolution}.jpg`)}`;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        // If image is 120x90, it means maxresdefault doesn't exist (YouTube returns a tiny gray fallback image instead of 404)
        if (resolution === "maxresdefault" && img.width === 120) {
          tryLoad("hqdefault");
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }

        // Draw YouTube thumbnail (stretch hqdefault if necessary)
        ctx.drawImage(img, 0, 0, 1280, 720);

        // Draw Play Button Circle
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.beginPath();
        ctx.arc(640, 360, 80, 0, Math.PI * 2);
        ctx.fill();

        // Draw Play Button Triangle
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(610, 310);
        ctx.lineTo(700, 360);
        ctx.lineTo(610, 410);
        ctx.closePath();
        ctx.fill();

        try {
          const dataUri = canvas.toDataURL("image/jpeg", 0.9);
          resolve(dataUri);
        } catch (err) {
          console.error("Failed to generate thumbnail Data URI:", err);
          resolve(null);
        }
      };
      img.onerror = () => {
        if (resolution === "maxresdefault") tryLoad("hqdefault");
        else resolve(null);
      };
      img.src = thumbUrl;
    };

    tryLoad("maxresdefault");
  });
}

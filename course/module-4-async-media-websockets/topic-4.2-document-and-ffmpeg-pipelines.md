# Module 4 - Topic 4.2: FFmpeg Video Transcoding & Document Parsing Pipelines

## 1. Introduction & Learning Objectives
Welcome to **Topic 4.2**. In this chapter, you will master background document processing (`python-pptx`, `pypdf`, `qrcode`, `openpyxl`) and media transcoding using **FFmpeg** ([services/workers](file:///d:/DEV/conf-platform/services/workers)).

### Learning Outcomes:
- Parse `.pptx` and `.pdf` files to extract text, count slides, and detect embedded media.
- Transcode uploaded presentation recordings into HLS streams using FFmpeg CLI bindings.
- Generate SVG/PNG event check-in badges and QR codes dynamically.

---

## 2. Document & Slide Deck Validation Pipelines

### 2.1 PowerPoint (`.pptx`) Parsing with `python-pptx`
```python
from pptx import Presentation

def inspect_powerpoint(file_path: str) -> dict:
    prs = Presentation(file_path)
    slide_count = len(prs.slides)
    slide_texts = []
    
    for slide in prs.slides:
        text_runs = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for paragraph in shape.text_frame.paragraphs:
                    text_runs.append(paragraph.text)
        slide_texts.append(" ".join(text_runs))
        
    return {
        "slide_count": slide_count,
        "sample_text": slide_texts[:2]
    }
```

### 2.2 QR Code & Badge Generation
```python
import qrcode
import io

def generate_checkin_qr_code(ticket_id: str) -> bytes:
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(f"EVENTOS_TICKET:{ticket_id}")
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()
```

---

## 3. Media Processing with FFmpeg

Transcoding uploaded raw presentation videos into web-optimized HLS streams:

```python
import subprocess

def transcode_to_hls(input_video_path: str, output_hls_dir: str):
    command = [
        "ffmpeg",
        "-i", input_video_path,
        "-profile:v", "main",
        "-crf", "20",
        "-g", "48",
        "-keyint_min", "48",
        "-sc_threshold", "0",
        "-b:v", "2500k",
        "-maxrate", "2675k",
        "-bufsize", "3750k",
        "-hls_time", "4",
        "-hls_playlist_type", "vod",
        "-hls_segment_filename", f"{output_hls_dir}/segment_%03d.ts",
        f"{output_hls_dir}/playlist.m3u8"
    ]
    subprocess.run(command, check=True)
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Write a python function using `qrcode` that embeds a JSON payload inside a QR code.
2. Decode the QR code image using `python-magic` or OpenCV to verify data fidelity.

---

## 5. Chapter Summary & Next Steps
You have mastered document parsing, QR code badge rendering, and FFmpeg video transcoding. Next, move to **[Topic 4.3: Real-Time WebSockets & Socket.IO](./topic-4.3-websockets-and-socketio.md)**.

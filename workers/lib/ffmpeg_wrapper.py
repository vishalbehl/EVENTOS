# =============================================================
# Conference Platform — FFmpeg Video Wrapper
# workers/lib/ffmpeg_wrapper.py
#
# Normalises uploaded video files for venue playback:
#   - Re-encodes to H.264 + AAC in MP4 container
#   - Caps resolution at 1920×1080
#   - Caps bitrate at configurable limit (default 4 Mbps)
#   - Reports duration and codec metadata
# =============================================================

from __future__ import annotations

import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from loguru import logger

from workers.config import settings


@dataclass
class VideoMetadata:
    duration_seconds: float
    width: int
    height: int
    video_codec: str
    audio_codec: Optional[str]
    bit_rate_kbps: int
    frame_rate: float
    file_size_bytes: int


def get_video_metadata(data: bytes) -> Optional[VideoMetadata]:
    """
    Extract metadata from a video file using ffprobe.
    Returns None if ffprobe is unavailable or parsing fails.
    """
    if not _check_tool("ffprobe"):
        logger.warning("ffprobe not available.")
        return None

    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = Path(tmp_dir) / "input.mp4"
        input_path.write_bytes(data)

        try:
            result = subprocess.run(
                [
                    "ffprobe", "-v", "quiet",
                    "-print_format", "json",
                    "-show_streams",
                    "-show_format",
                    str(input_path),
                ],
                capture_output=True,
                timeout=30,
                check=True,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            logger.error(f"ffprobe failed: {exc}")
            return None

        try:
            info = json.loads(result.stdout)
        except json.JSONDecodeError:
            logger.error("ffprobe returned invalid JSON.")
            return None

        video_stream = next(
            (s for s in info.get("streams", []) if s.get("codec_type") == "video"),
            None,
        )
        audio_stream = next(
            (s for s in info.get("streams", []) if s.get("codec_type") == "audio"),
            None,
        )
        fmt = info.get("format", {})

        if video_stream is None:
            logger.error("No video stream found in file.")
            return None

        # Parse frame rate (may be "30000/1001" form)
        fr_str = video_stream.get("r_frame_rate", "0/1")
        try:
            num, den = fr_str.split("/")
            frame_rate = float(num) / float(den) if float(den) else 0.0
        except (ValueError, ZeroDivisionError):
            frame_rate = 0.0

        return VideoMetadata(
            duration_seconds=float(fmt.get("duration", 0)),
            width=int(video_stream.get("width", 0)),
            height=int(video_stream.get("height", 0)),
            video_codec=video_stream.get("codec_name", "unknown"),
            audio_codec=audio_stream.get("codec_name") if audio_stream else None,
            bit_rate_kbps=int(int(fmt.get("bit_rate", 0)) / 1000),
            frame_rate=round(frame_rate, 2),
            file_size_bytes=int(fmt.get("size", len(data))),
        )


def normalise_video(data: bytes) -> Optional[bytes]:
    """
    Re-encode video to H.264/AAC MP4 with capped resolution and bitrate.

    Returns normalised MP4 bytes, or None if FFmpeg is unavailable.
    If the video is already H.264 at ≤1080p with low bitrate,
    we still re-encode to guarantee container compatibility.
    """
    if not _check_tool("ffmpeg"):
        logger.warning("FFmpeg not available — skipping video normalisation.")
        return None

    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path  = Path(tmp_dir) / "input.mp4"
        output_path = Path(tmp_dir) / "output.mp4"
        input_path.write_bytes(data)

        vf_scale = (
            f"scale=w={settings.VIDEO_MAX_WIDTH}:h={settings.VIDEO_MAX_HEIGHT}"
            ":force_original_aspect_ratio=decrease"
            ",pad=ceil(iw/2)*2:ceil(ih/2)*2"          # ensure even dims
        )

        cmd = [
            "ffmpeg", "-y",
            "-i", str(input_path),
            "-c:v", settings.VIDEO_TARGET_CODEC,
            "-b:v", settings.VIDEO_TARGET_BITRATE,
            "-maxrate", settings.VIDEO_TARGET_BITRATE,
            "-bufsize", "8M",
            "-vf", vf_scale,
            "-c:a", settings.VIDEO_TARGET_AUDIO_CODEC,
            "-b:a", "192k",
            "-movflags", "+faststart",   # move moov atom to front for streaming
            "-preset", "fast",
            "-crf", "23",
            str(output_path),
        ]

        try:
            subprocess.run(cmd, capture_output=True, timeout=600, check=True)
        except subprocess.TimeoutExpired:
            logger.error("FFmpeg timed out (>600s).")
            return None
        except subprocess.CalledProcessError as exc:
            logger.error(
                f"FFmpeg encode failed: {exc.stderr.decode()[-500:]}"
            )
            return None

        if not output_path.exists():
            return None

        normalised = output_path.read_bytes()
        logger.info(
            f"Video normalised: {len(data):,} → {len(normalised):,} bytes"
        )
        return normalised


def _check_tool(tool: str) -> bool:
    try:
        result = subprocess.run(
            [tool, "-version"], capture_output=True, timeout=5
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False

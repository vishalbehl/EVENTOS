# workers/tests/test_ffmpeg_wrapper.py
"""Tests for FFmpeg wrapper — subprocess calls are mocked."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


# ── VideoMetadata dataclass ───────────────────────────────────

class TestVideoMetadata:
    def test_dataclass_fields(self):
        from workers.lib.ffmpeg_wrapper import VideoMetadata
        m = VideoMetadata(
            duration_seconds=120.5,
            width=1920, height=1080,
            video_codec="h264", audio_codec="aac",
            bit_rate_kbps=4000, frame_rate=30.0,
            file_size_bytes=5_000_000,
        )
        assert m.duration_seconds == 120.5
        assert m.width == 1920
        assert m.video_codec == "h264"


# ── get_video_metadata ────────────────────────────────────────

FFPROBE_OUTPUT = {
    "streams": [
        {
            "codec_type": "video",
            "codec_name": "h264",
            "width": 1920,
            "height": 1080,
            "r_frame_rate": "30/1",
        },
        {
            "codec_type": "audio",
            "codec_name": "aac",
        },
    ],
    "format": {
        "duration": "120.5",
        "bit_rate": "4000000",
        "size": "50000000",
    },
}


class TestGetVideoMetadata:
    def _make_proc(self, returncode=0):
        proc = MagicMock()
        proc.returncode = returncode
        proc.stdout = json.dumps(FFPROBE_OUTPUT).encode()
        return proc

    def test_returns_metadata_on_success(self):
        from workers.lib.ffmpeg_wrapper import get_video_metadata

        with patch("workers.lib.ffmpeg_wrapper._check_tool", return_value=True), \
             patch("subprocess.run", return_value=self._make_proc()):
            meta = get_video_metadata(b"fake_video_data")

        assert meta is not None
        assert meta.width == 1920
        assert meta.height == 1080
        assert meta.video_codec == "h264"
        assert meta.audio_codec == "aac"
        assert meta.duration_seconds == 120.5
        assert meta.frame_rate == 30.0
        assert meta.bit_rate_kbps == 4000

    def test_returns_none_when_ffprobe_unavailable(self):
        from workers.lib.ffmpeg_wrapper import get_video_metadata

        with patch("workers.lib.ffmpeg_wrapper._check_tool", return_value=False):
            meta = get_video_metadata(b"data")

        assert meta is None

    def test_returns_none_on_no_video_stream(self):
        from workers.lib.ffmpeg_wrapper import get_video_metadata

        no_video = {"streams": [{"codec_type": "audio", "codec_name": "aac"}],
                    "format": {"duration": "10"}}
        proc = MagicMock()
        proc.stdout = json.dumps(no_video).encode()

        with patch("workers.lib.ffmpeg_wrapper._check_tool", return_value=True), \
             patch("subprocess.run", return_value=proc):
            meta = get_video_metadata(b"data")

        assert meta is None

    def test_handles_fractional_framerate(self):
        from workers.lib.ffmpeg_wrapper import get_video_metadata

        data = {**FFPROBE_OUTPUT}
        data["streams"] = [{**FFPROBE_OUTPUT["streams"][0], "r_frame_rate": "30000/1001"}]
        proc = MagicMock()
        proc.stdout = json.dumps(data).encode()

        with patch("workers.lib.ffmpeg_wrapper._check_tool", return_value=True), \
             patch("subprocess.run", return_value=proc):
            meta = get_video_metadata(b"data")

        assert meta is not None
        assert abs(meta.frame_rate - 29.97) < 0.01


# ── normalise_video ───────────────────────────────────────────

class TestNormaliseVideo:
    def test_returns_none_when_ffmpeg_unavailable(self):
        from workers.lib.ffmpeg_wrapper import normalise_video

        with patch("workers.lib.ffmpeg_wrapper._check_tool", return_value=False):
            result = normalise_video(b"video_data")

        assert result is None

    def test_returns_bytes_on_success(self, tmp_path):
        from workers.lib.ffmpeg_wrapper import normalise_video

        # Simulate ffmpeg creating output file
        normalised_content = b"normalised_video_bytes"

        def fake_run(cmd, **kwargs):
            # Find output path from cmd and write fake output
            output_path = cmd[-1]
            with open(output_path, "wb") as f:
                f.write(normalised_content)
            proc = MagicMock()
            proc.returncode = 0
            return proc

        with patch("workers.lib.ffmpeg_wrapper._check_tool", return_value=True), \
             patch("subprocess.run", side_effect=fake_run):
            result = normalise_video(b"original_video")

        assert result == normalised_content

    def test_returns_none_on_ffmpeg_error(self):
        from workers.lib.ffmpeg_wrapper import normalise_video
        import subprocess

        with patch("workers.lib.ffmpeg_wrapper._check_tool", return_value=True), \
             patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, "ffmpeg", stderr=b"error")):
            result = normalise_video(b"bad_video")

        assert result is None


# ── _check_tool ───────────────────────────────────────────────

class TestCheckTool:
    def test_returns_true_when_available(self):
        from workers.lib.ffmpeg_wrapper import _check_tool

        proc = MagicMock()
        proc.returncode = 0
        with patch("subprocess.run", return_value=proc):
            assert _check_tool("ffmpeg") is True

    def test_returns_false_when_not_found(self):
        from workers.lib.ffmpeg_wrapper import _check_tool

        with patch("subprocess.run", side_effect=FileNotFoundError):
            assert _check_tool("ffmpeg") is False

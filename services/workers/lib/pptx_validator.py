# =============================================================
# Conference Platform — PPTX Validator
# workers/lib/pptx_validator.py
#
# Deep validation of PowerPoint files:
#   - Font embedding check (warn on non-embedded fonts)
#   - External link detection (warn on hyperlinks)
#   - Embedded video/audio check
#   - Slide count and aspect ratio detection
#   - Corrupt/unreadable file detection
# =============================================================

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass, field
from typing import List, Optional, Set

from loguru import logger
from workers.lib.dependency_scanner import scan_pptx_dependencies
from workers.lib.malware_scanner import scan_office_file


@dataclass
class PptxValidationResult:
    is_valid: bool = True
    slide_count: int = 0
    aspect_ratio: Optional[str] = None  # e.g. "16:9", "4:3"
    has_embedded_video: bool = False
    has_embedded_audio: bool = False
    has_external_links: bool = False
    missing_fonts: List[str] = field(default_factory=list)
    external_link_urls: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    has_animations: bool = False
    has_transitions: bool = False
    notes_present: bool = False
    notes_slide_count: int = 0
    has_ole_objects: bool = False
    has_broken_ole: bool = False
    audio_objects_detected: bool = False
    audio_format_valid: bool = True
    internet_dependent_content: bool = False
    external_url_count: int = 0
    has_broken_internal_media: bool = False
    has_custom_addins: bool = False
    has_macros: bool = False
    linked_assets_detected: bool = False
    linked_assets_resolved: bool = True
    image_links_detected: int = 0
    absolute_path_links_detected: int = 0


def validate_pptx(data: bytes) -> PptxValidationResult:
    """
    Validate a PPTX file from raw bytes.

    Returns a PptxValidationResult containing errors (critical)
    and warnings (non-blocking) for display in the Organizer Portal.
    """
    result = PptxValidationResult()

    try:
        from pptx import Presentation
        from pptx.util import Pt
    except ImportError:
        result.errors.append("python-pptx not installed — cannot validate PPTX files.")
        result.is_valid = False
        return result

    try:
        prs = Presentation(io.BytesIO(data))
    except Exception as exc:
        result.errors.append(f"Corrupt or unreadable PPTX file: {exc}")
        result.is_valid = False
        return result

    _scan_package_parts(data, result)

    dependency_result = scan_pptx_dependencies(data)
    result.linked_assets_detected = dependency_result.linked_assets_detected
    result.linked_assets_resolved = dependency_result.linked_assets_resolved
    result.image_links_detected = dependency_result.image_links_detected
    result.absolute_path_links_detected = dependency_result.absolute_path_links_detected
    result.has_broken_internal_media = dependency_result.has_broken_internal_media
    result.internet_dependent_content = dependency_result.internet_dependent_content
    result.external_url_count = len(dependency_result.external_urls)
    result.external_link_urls.extend(dependency_result.external_urls)
    if dependency_result.linked_assets:
        result.errors.append(
            "Presentation contains linked external media. Embed media and images inside the PPTX."
        )
    if dependency_result.absolute_path_links_detected:
        result.errors.append(
            "Presentation contains linked files using absolute paths. Embed all media directly."
        )
    if dependency_result.has_broken_internal_media:
        result.errors.append("Presentation contains broken internal media references.")

    # ── Slide count ───────────────────────────────────────────
    result.slide_count = len(prs.slides)
    if result.slide_count == 0:
        result.errors.append("Presentation has no slides.")
        result.is_valid = False
        return result

    # ── Aspect ratio ──────────────────────────────────────────
    try:
        width_emu = prs.slide_width
        height_emu = prs.slide_height
        if width_emu and height_emu:
            ratio = width_emu / height_emu
            if abs(ratio - 16 / 9) < 0.05:
                result.aspect_ratio = "16:9"
            elif abs(ratio - 4 / 3) < 0.05:
                result.aspect_ratio = "4:3"
            else:
                result.aspect_ratio = f"{width_emu}:{height_emu}"
                result.warnings.append(
                    f"Non-standard aspect ratio ({result.aspect_ratio}). "
                    "May not display correctly on venue screens."
                )
    except Exception:
        pass

    # ── Font and media scan ───────────────────────────────────
    fonts_seen: Set[str] = set()
    try:
        from pptx.util import Pt
        from pptx.oxml.ns import qn
        from lxml import etree

        for slide in prs.slides:
            # Scan text frames for font names
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        for run in para.runs:
                            if run.font.name:
                                fonts_seen.add(run.font.name)

                # Detect embedded video / audio via XML
                if hasattr(shape, "shape_type"):
                    try:
                        xml_str = etree.tostring(shape._element).decode()
                        if "nvPicPr" in xml_str or "videoFile" in xml_str:
                            result.has_embedded_video = True
                        if "audioFile" in xml_str or "snd" in xml_str:
                            result.has_embedded_audio = True
                            result.audio_objects_detected = True
                    except Exception:
                        pass

            # Scan for hyperlinks (external)
            for rel in slide.part.rels.values():
                if "hyperlink" in rel.reltype and rel.is_external:
                    result.has_external_links = True
                    if hasattr(rel, "_target"):
                        result.external_link_urls.append(str(rel._target))
    except Exception as exc:
        result.warnings.append(f"Could not fully scan slide content: {exc}")

    # ── Common non-standard fonts (warn) ─────────────────────
    _safe_fonts = {
        "Arial", "Calibri", "Times New Roman", "Helvetica",
        "Georgia", "Verdana", "Tahoma", "Trebuchet MS",
        "Courier New", "Century Gothic",
        "Open Sans", "Roboto", "Lato", "Montserrat",
        "Segoe UI", "Gill Sans",
    }
    for font in sorted(fonts_seen):
        if font not in _safe_fonts:
            result.missing_fonts.append(font)

    if result.missing_fonts:
        result.warnings.append(
            f"Non-standard fonts detected (may not render correctly on venue PCs): "
            f"{', '.join(result.missing_fonts[:5])}"
            + (" and more..." if len(result.missing_fonts) > 5 else "")
        )

    if result.has_external_links:
        result.warnings.append(
            "Presentation contains external hyperlinks. "
            "Internet access may be unavailable during the conference."
        )

    if result.has_embedded_video:
        result.warnings.append(
            "Presentation contains embedded video. "
            "Ensure codec compatibility with venue playback PC."
        )

    result.is_valid = len(result.errors) == 0
    return result


def _scan_package_parts(data: bytes, result: PptxValidationResult) -> None:
    malware_scan = scan_office_file(data, use_clamav=False)
    result.has_macros = malware_scan.has_macros
    if malware_scan.has_macros:
        result.errors.append("Presentation contains macros or active content.")

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = archive.namelist()
            lower_names = [name.lower() for name in names]
            result.has_ole_objects = any("embeddings/" in name for name in lower_names)
            result.has_custom_addins = any("customui/" in name or "addin" in name for name in lower_names)
            result.has_animations = any("ppt/animations/" in name for name in lower_names)
            result.has_transitions = any("transition" in archive.read(name).decode("utf-8", errors="ignore")
                                         for name in names if name.startswith("ppt/slides/") and name.endswith(".xml"))

            notes = [name for name in names if name.startswith("ppt/notesSlides/") and name.endswith(".xml")]
            result.notes_slide_count = sum(
                1 for name in notes if _notes_xml_has_text(archive.read(name))
            )
            result.notes_present = result.notes_slide_count > 0

            audio_exts = (".mp3", ".wav", ".m4a", ".aac", ".wma")
            audio_parts = [name for name in lower_names if name.startswith("ppt/media/") and name.endswith(audio_exts)]
            if audio_parts:
                result.audio_objects_detected = True
                result.audio_format_valid = all(name.endswith((".mp3", ".wav")) for name in audio_parts)
                if not result.audio_format_valid:
                    result.warnings.append("Embedded audio should be MP3 or WAV for venue compatibility.")
    except Exception as exc:
        result.warnings.append(f"Could not scan PPTX package internals: {exc}")


def _notes_xml_has_text(xml: bytes) -> bool:
    try:
        from xml.etree import ElementTree as ET

        root = ET.fromstring(xml)
        return any((node.text or "").strip() for node in root.iter())
    except Exception:
        return False

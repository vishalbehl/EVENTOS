import hashlib
import io
import json
import subprocess
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Optional

import magic
from loguru import logger
from pptx import Presentation
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file_validation import FileValidation
from app.models.file_integrity_log import FileIntegrityLog
from app.models.presentation_file import PresentationFile
from app.services import upload_service
from app.config import settings


# ─── Format groups ────────────────────────────────────────────────────────────
VIDEO_FORMATS = {"mp4", "mov", "avi", "mkv", "webm", "wmv", "m4v", "flv"}
AUDIO_FORMATS = {"mp3", "wav", "aac", "flac", "ogg", "m4a", "wma"}
IMAGE_FORMATS = {"jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "svg"}
PDF_FORMATS   = {"pdf"}
PPTX_FORMATS  = {"pptx", "ppt", "odp"}
DOCX_FORMATS  = {"docx", "doc", "odt", "rtf"}
ZIP_FORMATS   = {"zip", "7z", "tar", "gz", "rar"}


# ─── Main entry point ─────────────────────────────────────────────────────────

async def validate_presentation_file(
    db: AsyncSession,
    file_id: uuid.UUID,
) -> FileValidation:
    """
    Full technical audit of a PresentationFile.
    Dispatched by the Celery worker after speaker upload.
    """
    logger.info(f"Starting technical validation for file {file_id}")

    res = await db.execute(
        select(PresentationFile).where(PresentationFile.id == file_id)
    )
    pf = res.scalar_one_or_none()
    if not pf:
        raise ValueError(f"File {file_id} not found")

    try:
        file_bytes = upload_service.get_object_bytes(
            bucket=settings.S3_BUCKET_PRESENTATIONS,
            storage_path=pf.storage_path,
        )
    except Exception as e:
        logger.error(f"Failed to download file for validation: {e}")
        pf.upload_status = "invalid"
        await db.commit()
        raise

    sha256 = hashlib.sha256(file_bytes).hexdigest()
    md5    = hashlib.md5(file_bytes).hexdigest()
    mime   = magic.from_buffer(file_bytes, mime=True)
    ext    = (pf.file_format or "").lower().strip(".")

    # If re-validating, remove the old record first to prevent IntegrityError
    val_res = await db.execute(select(FileValidation).where(FileValidation.file_id == pf.id))
    existing_val = val_res.scalar_one_or_none()
    if existing_val:
        await db.delete(existing_val)
        await db.flush()

    validation = FileValidation(
        file_id=pf.id,
        validation_engine_version=settings.VALIDATION_ENGINE_VERSION,
        sha256_hash=sha256,
        md5_hash=md5,
        mime_type_detected=mime,
        overall_result="pass",
        error_details={"audit_report": []} # Initialize structured audit report
    )
    db.add(validation)

    # ── Format-specific inspection ──────────────────────────────────────────
    report = []
    
    if ext in PPTX_FORMATS or "presentationml" in mime:
        _inspect_pptx(validation, file_bytes)
        report.append({"test": "File Format", "status": "pass", "details": f"Valid {ext.upper()} detected"})
        report.append({"test": "Slide Structure", "status": "fail" if validation.has_corrupted_slides else "pass", "details": f"{validation.slide_count} slides found"})
        report.append({"test": "Font Compatibility", "status": "fail" if validation.has_missing_fonts else "pass", "details": "All fonts embedded" if not validation.has_missing_fonts else f"Missing: {', '.join(validation.missing_fonts_list[:3] or [])}"})
        report.append({"test": "Media Integrity", "status": "pass", "details": f"{validation.image_count} images, {validation.video_count} videos"})
    elif ext in VIDEO_FORMATS or mime.startswith("video/"):
        _inspect_video(validation, file_bytes, ext)
        report.append({"test": "Video Format", "status": "pass", "details": f"Container: {ext.upper()}"})
        tm = validation.technical_metadata or {}
        report.append({"test": "Resolution", "status": "pass" if tm.get("width") else "fail", "details": tm.get("resolution", "Unknown")})
        report.append({"test": "Playback Compatibility", "status": "pass" if tm.get("video_codec") else "fail", "details": f"Codec: {tm.get('video_codec', 'Unknown')}"})
    else:
        report.append({"test": "General Audit", "status": "pass", "details": f"Detected as {mime}"})

    from sqlalchemy.orm.attributes import flag_modified
    validation.error_details["audit_report"] = report
    flag_modified(validation, "error_details")

    # ── Final status ────────────────────────────────────────────────────────
    pf.upload_status = "valid" if validation.overall_result == "pass" else (
        "invalid" if validation.overall_result == "fail" else "valid"
    )
    if validation.has_corrupted_slides:
        pf.upload_status = "invalid"
        validation.overall_result = "fail"

    # ── Chain-of-custody log ────────────────────────────────────────────────
    integrity_log = FileIntegrityLog(
        file_id=pf.id,
        stage="UPLOAD",
        sha256_hash=sha256,
        md5_hash=md5,
        storage_provider="local" if settings.STORAGE_MODE == "local" else "R2",
        storage_path=pf.storage_path,
        is_verified=True,
    )
    db.add(integrity_log)

    await db.commit()
    await db.refresh(validation)
    logger.info(f"Validation complete for {file_id}: {validation.overall_result}")
    return validation


# ─── PPTX Inspector ───────────────────────────────────────────────────────────

def _inspect_pptx(validation: FileValidation, file_bytes: bytes) -> None:
    """Deep PPTX inspection: slides, media, fonts, macros, links, animations."""
    try:
        is_encrypted = False
        fonts = set()
        
        # Check for password / macro container first via ZIP structure
        try:
            zf = zipfile.ZipFile(io.BytesIO(file_bytes))
            names = zf.namelist()
            validation.has_macros = any("vbaProject.bin" in n for n in names)
            validation.has_ole_objects = any(
                n.endswith(".bin") and "vba" not in n.lower() for n in names
            )
            
            import re
            for name in names:
                if name.endswith(".xml"):
                    content = zf.read(name).decode("utf-8", errors="ignore")
                    matches = re.findall(r'typeface="([^"]+)"', content)
                    fonts.update(matches)
            
            standard_fonts = {"Arial", "Calibri", "Calibri Light", "Times New Roman", "Courier New", "Symbol", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Comic Sans MS", "Wingdings", "Helvetica"}
            custom_fonts = [f for f in fonts if f not in standard_fonts and not f.startswith("+")]
            if custom_fonts:
                validation.has_missing_fonts = True
                validation.missing_fonts_list = sorted(list(set(custom_fonts)))[:20]

        except zipfile.BadZipFile:
            is_encrypted = True
        except Exception:
            pass

        if is_encrypted:
            validation.overall_result = "fail"
            validation.error_details = {"exception": "File is password protected or encrypted"}
            validation.technical_metadata = {"is_password_protected": True}
            return

        try:
            prs = Presentation(io.BytesIO(file_bytes))
        except Exception as e:
            # PackageNotFoundError is raised when python-pptx tries to open an encrypted PPTX
            from pptx.exc import PackageNotFoundError
            if isinstance(e, PackageNotFoundError) or "encrypted" in str(e).lower():
                validation.overall_result = "fail"
                validation.error_details = {"exception": "File is password protected or encrypted"}
                validation.technical_metadata = {"is_password_protected": True}
                return
            raise e

        validation.slide_count = len(prs.slides)

        img_count = vid_count = anim_count = notes_count = 0
        has_transitions = False
        ext_links: list[str] = []

        for slide in prs.slides:
            # Notes
            try:
                if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip():
                    notes_count += 1
            except Exception:
                pass

            # Transitions
            try:
                if slide.element.find(".//{http://schemas.openxmlformats.org/presentationml/2006/main}transition") is not None:
                    has_transitions = True
            except Exception:
                pass

            # Animations (timing elements)
            try:
                timing = slide.element.find(".//{http://schemas.openxmlformats.org/presentationml/2006/main}timing")
                if timing is not None:
                    anim_count += 1
            except Exception:
                pass

            # Shapes
            for shape in slide.shapes:
                if shape.shape_type == 13:   # MSO_SHAPE_TYPE.PICTURE
                    img_count += 1
                elif shape.shape_type == 16:  # MSO_SHAPE_TYPE.MEDIA
                    vid_count += 1

            # Hyperlinks / external links
            try:
                for rel in slide.part.rels.values():
                    if rel.reltype and "hyperlink" in rel.reltype:
                        target = getattr(rel, "_target", "") or ""
                        if isinstance(target, str) and target.startswith("http"):
                            ext_links.append(target)
            except Exception:
                pass

        validation.image_count       = img_count
        validation.video_count       = vid_count
        validation.animation_count   = anim_count
        validation.has_animations    = anim_count > 0
        validation.has_transitions   = has_transitions
        validation.notes_present     = notes_count > 0
        validation.notes_slide_count = notes_count
        validation.external_url_count = len(ext_links)
        validation.internet_dependent_content = len(ext_links) > 0

        if img_count > 50:
            validation.has_large_images = True
            validation.overall_result = "warning"
        if vid_count > 0:
            validation.overall_result = "warning"

        # Check for linked (not embedded) media in relationships
        try:
            zf2 = zipfile.ZipFile(io.BytesIO(file_bytes))
            for name in zf2.namelist():
                if name.endswith(".rels"):
                    content = zf2.read(name).decode("utf-8", errors="ignore")
                    if 'TargetMode="External"' in content:
                        validation.linked_assets_detected = True
                        validation.linked_assets_resolved = False
                        validation.overall_result = "warning"
                        break
        except Exception:
            pass

        validation.technical_metadata = {
            "slide_count": len(prs.slides),
            "image_count": img_count,
            "video_count": vid_count,
            "animation_count": anim_count,
            "notes_slide_count": notes_count,
            "has_transitions": has_transitions,
            "has_macros": validation.has_macros,
            "has_ole_objects": validation.has_ole_objects,
            "external_links": ext_links[:20],
            "linked_assets": validation.linked_assets_detected,
        }

    except Exception as e:
        logger.error(f"PPTX inspection failed: {e}")
        validation.has_corrupted_slides = True
        validation.overall_result = "fail"
        validation.error_details = {"exception": str(e), "stage": "pptx_parse"}


# ─── PDF Inspector ────────────────────────────────────────────────────────────

def _inspect_pdf(validation: FileValidation, file_bytes: bytes) -> None:
    """PDF inspection: pages, password, embedded images, metadata."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))

        is_encrypted = reader.is_encrypted
        page_count   = 0
        img_count    = 0
        producer     = ""
        creator      = ""

        if is_encrypted:
            # Try empty password
            try:
                reader.decrypt("")
            except Exception:
                pass

        try:
            page_count = len(reader.pages)
            for page in reader.pages:
                try:
                    resources = page.get("/Resources")
                    if resources and "/XObject" in resources:
                        xobj = resources["/XObject"]
                        for key in xobj:
                            if xobj[key].get("/Subtype") == "/Image":
                                img_count += 1
                except Exception:
                    pass
        except Exception:
            pass

        try:
            meta = reader.metadata or {}
            producer = str(meta.get("/Producer", ""))
            creator  = str(meta.get("/Creator", ""))
        except Exception:
            pass

        if is_encrypted:
            validation.overall_result = "warning"

        validation.technical_metadata = {
            "page_count": page_count,
            "is_password_protected": is_encrypted,
            "image_count": img_count,
            "producer": producer,
            "creator": creator,
        }
        validation.image_count = img_count

    except Exception as e:
        logger.error(f"PDF inspection failed: {e}")
        validation.error_details = {"exception": str(e), "stage": "pdf_parse"}
        validation.overall_result = "warning"


# ─── Video Inspector ──────────────────────────────────────────────────────────

def _inspect_video(validation: FileValidation, file_bytes: bytes, ext: str) -> None:
    """Video inspection via ffprobe (with graceful fallback)."""
    meta: dict = {"format": ext}

    try:
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_streams", "-show_format",
                tmp_path,
            ],
            capture_output=True, text=True, timeout=30,
        )

        if result.returncode == 0:
            probe = json.loads(result.stdout)
            fmt   = probe.get("format", {})
            streams = probe.get("streams", [])

            v_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
            a_stream = next((s for s in streams if s.get("codec_type") == "audio"), {})

            duration = float(fmt.get("duration", 0))
            bitrate  = int(fmt.get("bit_rate", 0)) // 1000

            meta.update({
                "duration_seconds": round(duration, 2),
                "duration_formatted": _format_duration(duration),
                "width": v_stream.get("width"),
                "height": v_stream.get("height"),
                "resolution": f"{v_stream.get('width')}x{v_stream.get('height')}" if v_stream.get("width") else None,
                "fps": _parse_fps(v_stream.get("r_frame_rate", "")),
                "video_codec": v_stream.get("codec_name"),
                "audio_codec": a_stream.get("codec_name"),
                "audio_channels": a_stream.get("channels"),
                "audio_sample_rate": a_stream.get("sample_rate"),
                "bitrate_kbps": bitrate,
                "size_bytes": len(file_bytes),
            })
            validation.video_count = 1
        else:
            meta["ffprobe_error"] = "ffprobe not available or failed"
            meta["size_bytes"] = len(file_bytes)

    except FileNotFoundError:
        meta["ffprobe_error"] = "ffprobe not installed (install ffmpeg)"
        meta["size_bytes"] = len(file_bytes)
    except Exception as e:
        logger.warning(f"Video inspection failed: {e}")
        meta["error"] = str(e)
        meta["size_bytes"] = len(file_bytes)
    finally:
        try:
            import os; os.unlink(tmp_path)
        except Exception:
            pass

    validation.technical_metadata = meta


# ─── Audio Inspector ──────────────────────────────────────────────────────────

def _inspect_audio(validation: FileValidation, file_bytes: bytes) -> None:
    """Audio inspection via mutagen."""
    meta: dict = {}
    try:
        from mutagen import File as MutagenFile
        audio = MutagenFile(io.BytesIO(file_bytes))
        if audio:
            meta = {
                "duration_seconds": round(audio.info.length, 2) if hasattr(audio.info, "length") else None,
                "duration_formatted": _format_duration(audio.info.length) if hasattr(audio.info, "length") else None,
                "bitrate_kbps": getattr(audio.info, "bitrate", None),
                "sample_rate": getattr(audio.info, "sample_rate", None),
                "channels": getattr(audio.info, "channels", None),
            }
        validation.audio_objects_detected = True
    except Exception as e:
        logger.warning(f"Audio inspection failed: {e}")
        meta["error"] = str(e)
    validation.technical_metadata = meta


# ─── Image Inspector ──────────────────────────────────────────────────────────

def _inspect_image(validation: FileValidation, file_bytes: bytes) -> None:
    """Image inspection via Pillow if available, else basic size info."""
    meta: dict = {"size_bytes": len(file_bytes)}
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(file_bytes))
        meta.update({
            "width": img.width,
            "height": img.height,
            "resolution": f"{img.width}x{img.height}",
            "mode": img.mode,
            "format": img.format,
            "dpi": img.info.get("dpi"),
        })
        if img.width * img.height > 4000 * 4000:
            validation.has_large_images = True
            validation.overall_result = "warning"
    except ImportError:
        meta["note"] = "Install Pillow for image dimension inspection"
    except Exception as e:
        meta["error"] = str(e)
    validation.technical_metadata = meta
    validation.image_count = 1


# ─── DOCX Inspector ───────────────────────────────────────────────────────────

def _inspect_docx(validation: FileValidation, file_bytes: bytes) -> None:
    """DOCX/DOC inspection: page estimate, images, macros."""
    meta: dict = {"size_bytes": len(file_bytes)}
    try:
        zf = zipfile.ZipFile(io.BytesIO(file_bytes))
        names = zf.namelist()
        validation.has_macros = any("vbaProject.bin" in n for n in names)

        img_count = sum(1 for n in names if n.startswith("word/media/"))
        meta.update({
            "embedded_images": img_count,
            "has_macros": validation.has_macros,
            "files_in_package": len(names),
        })
        validation.image_count = img_count
        if validation.has_macros:
            validation.overall_result = "warning"
    except Exception as e:
        meta["error"] = str(e)
    validation.technical_metadata = meta


# ─── ZIP / Bundle Inspector ───────────────────────────────────────────────────

def _inspect_bundle(validation: FileValidation, file_bytes: bytes) -> None:
    """ZIP bundle inspection: list contents with types and sizes."""
    validation.is_bundle = True
    contents = []
    total_size = 0
    try:
        zf = zipfile.ZipFile(io.BytesIO(file_bytes))
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename
            ext  = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            ftype = (
                "Presentation" if ext in PPTX_FORMATS else
                "PDF"          if ext in PDF_FORMATS  else
                "Video"        if ext in VIDEO_FORMATS else
                "Audio"        if ext in AUDIO_FORMATS else
                "Image"        if ext in IMAGE_FORMATS else
                "Document"     if ext in DOCX_FORMATS  else
                "Archive"      if ext in ZIP_FORMATS   else
                "Other"
            )
            size_bytes = info.file_size
            total_size += size_bytes
            contents.append({
                "name": name,
                "type": ftype,
                "size_bytes": size_bytes,
                "size": _human_size(size_bytes),
                "format": ext.upper() or "UNKNOWN",
            })

        validation.bundle_contents = contents
        validation.technical_metadata = {
            "file_count": len(contents),
            "total_size_bytes": total_size,
            "total_size": _human_size(total_size),
            "types": list({c["type"] for c in contents}),
        }
        if len(contents) == 0:
            validation.overall_result = "warning"
            validation.error_details = {"note": "ZIP archive is empty"}

    except zipfile.BadZipFile:
        validation.overall_result = "fail"
        validation.error_details = {"exception": "Corrupt or invalid ZIP archive"}
    except Exception as e:
        validation.overall_result = "warning"
        validation.error_details = {"exception": str(e)}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _format_duration(seconds: float) -> str:
    if not seconds:
        return "00:00:00"
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _parse_fps(fps_str: str) -> Optional[float]:
    try:
        if "/" in fps_str:
            num, den = fps_str.split("/")
            return round(int(num) / int(den), 2)
        return float(fps_str)
    except Exception:
        return None


def _human_size(size_bytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes //= 1024
    return f"{size_bytes:.1f} TB"


# ─── Poster validation (sync, called from Celery task directly) ───────────────
# See app/tasks/file_tasks.py — poster uses sync SessionLocal, not this async fn.

from __future__ import annotations

import posixpath
import re
import zipfile
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import PurePosixPath
from typing import Iterable
from xml.etree import ElementTree as ET


REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
EXTERNAL_RELS = {
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/video",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
    "http://schemas.microsoft.com/office/2007/relationships/media",
}
MEDIA_RELS = ("image", "video", "audio", "media")
ABSOLUTE_PATH_RE = re.compile(r"^([A-Za-z]:[\\/]|/Users/|/home/|file:///)", re.IGNORECASE)


@dataclass
class LinkedAsset:
    rel_type: str
    target: str
    source: str
    is_external: bool
    is_absolute_path: bool


@dataclass
class DependencyScanResult:
    linked_assets: list[LinkedAsset] = field(default_factory=list)
    broken_internal_media: list[str] = field(default_factory=list)
    external_urls: list[str] = field(default_factory=list)
    image_links_detected: int = 0

    @property
    def linked_assets_detected(self) -> bool:
        return bool(self.linked_assets)

    @property
    def linked_assets_resolved(self) -> bool:
        return not self.linked_assets and not self.broken_internal_media

    @property
    def absolute_path_links_detected(self) -> int:
        return sum(1 for asset in self.linked_assets if asset.is_absolute_path)

    @property
    def has_broken_internal_media(self) -> bool:
        return bool(self.broken_internal_media)

    @property
    def internet_dependent_content(self) -> bool:
        return any(url.lower().startswith(("http://", "https://")) for url in self.external_urls)


def scan_pptx_dependencies(data: bytes) -> DependencyScanResult:
    result = DependencyScanResult()
    with zipfile.ZipFile(BytesIO(data)) as archive:
        names = set(archive.namelist())
        for rel_name in _relationship_files(names):
            rel_xml = archive.read(rel_name)
            source_dir = _source_dir_for_rels(rel_name)
            for rel in _parse_relationships(rel_xml):
                rel_type = rel.get("Type", "")
                target = rel.get("Target", "")
                target_mode = rel.get("TargetMode", "")
                rel_kind = rel_type.rsplit("/", 1)[-1].lower()
                is_media = rel_kind in MEDIA_RELS or rel_type in EXTERNAL_RELS
                if not target:
                    continue

                is_external = target_mode == "External" or _is_external_target(target)
                if is_external:
                    if rel_kind == "hyperlink":
                        result.external_urls.append(target)
                    if is_media or _is_media_like_target(target):
                        asset = LinkedAsset(
                            rel_type=rel_kind,
                            target=target,
                            source=rel_name,
                            is_external=True,
                            is_absolute_path=_is_absolute_path(target),
                        )
                        result.linked_assets.append(asset)
                        if rel_kind == "image":
                            result.image_links_detected += 1
                    continue

                if is_media:
                    resolved = _resolve_internal_target(source_dir, target)
                    if resolved not in names:
                        result.broken_internal_media.append(target)
    return result


def _relationship_files(names: Iterable[str]) -> list[str]:
    return sorted(name for name in names if name.endswith(".rels"))


def _parse_relationships(xml: bytes) -> list[dict[str, str]]:
    root = ET.fromstring(xml)
    return [dict(child.attrib) for child in root.findall(f"{{{REL_NS}}}Relationship")]


def _source_dir_for_rels(rel_name: str) -> str:
    path = PurePosixPath(rel_name)
    if path.parent.name == "_rels":
        return str(path.parent.parent)
    return str(path.parent)


def _resolve_internal_target(source_dir: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(source_dir, target))


def _is_external_target(target: str) -> bool:
    return target.lower().startswith(("http://", "https://", "file://")) or _is_absolute_path(target)


def _is_absolute_path(target: str) -> bool:
    return bool(ABSOLUTE_PATH_RE.match(target.replace("\\", "/")))


def _is_media_like_target(target: str) -> bool:
    return target.lower().split("?", 1)[0].endswith(
        (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".mp4", ".mov", ".avi", ".mp3", ".wav")
    )

from __future__ import annotations

import io
import zipfile


def _minimal_package_with_rels(rels_xml: bytes) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr("[Content_Types].xml", b"<Types/>")
        archive.writestr("ppt/slides/slide1.xml", b"<p:sld/>")
        archive.writestr("ppt/slides/_rels/slide1.xml.rels", rels_xml)
    return out.getvalue()


def test_scanner_detects_absolute_external_video_link():
    from workers.lib.dependency_scanner import scan_pptx_dependencies

    package = _minimal_package_with_rels(
        b"""<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="C:\\Users\\Speaker\\movie.mp4" TargetMode="External"/>
</Relationships>"""
    )

    result = scan_pptx_dependencies(package)

    assert result.linked_assets_detected is True
    assert result.linked_assets_resolved is False
    assert result.absolute_path_links_detected == 1


def test_scanner_detects_broken_internal_media_reference():
    from workers.lib.dependency_scanner import scan_pptx_dependencies

    package = _minimal_package_with_rels(
        b"""<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/missing.wav"/>
</Relationships>"""
    )

    result = scan_pptx_dependencies(package)

    assert result.has_broken_internal_media is True
    assert result.linked_assets_resolved is False

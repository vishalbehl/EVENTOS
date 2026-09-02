"""Live authenticated upload smoke test. Credentials are environment-only."""
import hashlib, io, os, sys, time, zipfile
import httpx

BASE = os.getenv("STAGING_API_URL", "http://127.0.0.1:8001")
EMAIL = os.getenv("STAGING_TEST_EMAIL")
PASSWORD = os.getenv("STAGING_TEST_PASSWORD")
EVENT_ID = os.getenv("STAGING_TEST_EVENT_ID")

def main() -> int:
    if not EMAIL or not PASSWORD or not EVENT_ID:
        print("blocked_external=STAGING_TEST_EMAIL, STAGING_TEST_PASSWORD, and STAGING_TEST_EVENT_ID are required")
        return 3
    with httpx.Client(base_url=BASE, timeout=30.0, follow_redirects=False) as client:
        login = client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
        login.raise_for_status()
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        def assert_status(response: httpx.Response, expected: set[int], label: str) -> None:
            if response.status_code not in expected:
                raise RuntimeError(f"{label} returned unexpected status {response.status_code}")

        # These checks stop before an upload record is created and protect the
        # public staging contract against unsafe metadata reaching storage.
        missing_auth = client.post(
            "/api/v1/files/uploads/session",
            json={"filename": "smoke.pdf", "mime_type": "application/pdf", "size_bytes": 10},
        )
        assert_status(missing_auth, {401, 403}, "missing authentication")
        oversized = client.post(
            "/api/v1/files/uploads/session",
            headers=headers,
            json={"filename": "large.pdf", "mime_type": "application/pdf", "size_bytes": 501 * 1024 * 1024},
        )
        assert_status(oversized, {413}, "oversized upload")
        invalid_mime = client.post(
            "/api/v1/files/uploads/session",
            headers=headers,
            json={"filename": "payload.exe", "mime_type": "application/x-msdownload", "size_bytes": 10},
        )
        assert_status(invalid_mime, {415}, "invalid MIME type")
        mismatch = client.post(
            "/api/v1/files/uploads/session",
            headers=headers,
            json={"filename": "payload.pdf", "mime_type": "application/octet-stream", "size_bytes": 10},
        )
        assert_status(mismatch, {415}, "MIME extension mismatch")

        def upload_and_wait(filename: str, mime_type: str, content: bytes) -> tuple[str, dict]:
            digest = hashlib.sha256(content).hexdigest()
            session = client.post(
                "/api/v1/files/uploads/session",
                headers=headers,
                json={"filename": filename, "mime_type": mime_type, "size_bytes": len(content), "checksum": digest},
            )
            session.raise_for_status()
            payload = session.json()
            client.put(payload["url"], content=content, headers={"Content-Type": mime_type}).raise_for_status()
            complete = client.post(f"/api/v1/files/uploads/{payload['upload_id']}/complete", headers=headers)
            complete.raise_for_status()
            current = complete.json()
            for _ in range(60):
                current = client.get(
                    f"/api/v1/files/uploads/{payload['upload_id']}/status", headers=headers
                ).json()
                if current.get("status") in {"ready", "failed", "quarantined"}:
                    break
                time.sleep(1)
            return payload["upload_id"], current

        checksum_content = b"%PDF-1.4\nchecksum-mismatch\n"
        checksum_session = client.post(
            "/api/v1/files/uploads/session",
            headers=headers,
            json={
                "filename": "checksum.pdf",
                "mime_type": "application/pdf",
                "size_bytes": len(checksum_content),
                "checksum": hashlib.sha256(b"different-content").hexdigest(),
            },
        )
        checksum_session.raise_for_status()
        checksum_payload = checksum_session.json()
        client.put(
            checksum_payload["url"],
            content=checksum_content,
            headers={"Content-Type": "application/pdf"},
        ).raise_for_status()
        client.post(
            f"/api/v1/files/uploads/{checksum_payload['upload_id']}/complete",
            headers=headers,
        ).raise_for_status()
        checksum_status = {}
        for _ in range(60):
            checksum_status = client.get(
                f"/api/v1/files/uploads/{checksum_payload['upload_id']}/status",
                headers=headers,
            ).json()
            if checksum_status.get("status") in {"ready", "failed", "quarantined"}:
                break
            time.sleep(1)
        if checksum_status.get("status") not in {"failed", "quarantined"}:
            raise RuntimeError(f"checksum mismatch ended in {checksum_status.get('status')}")
        print(f"checksum_validation=passed status={checksum_status.get('status')}")

        clean = b"%PDF-1.4\nlocal-production-like-upload\n"
        clean_id, clean_status = upload_and_wait("smoke.pdf", "application/pdf", clean)
        if clean_status.get("status") != "ready":
            raise RuntimeError(f"clean upload ended in {clean_status.get('status')}")
        duplicate = client.post(f"/api/v1/files/uploads/{clean_id}/complete", headers=headers)
        duplicate.raise_for_status()
        if duplicate.json().get("status") != "ready":
            raise RuntimeError("duplicate completion did not remain idempotently ready")
        print("authenticated_upload=passed status=ready duplicate_completion=passed")

        # Keep the presentation signature valid while embedding EICAR so the
        # request reaches ClamAV instead of being rejected by MIME validation.
        eicar_signature = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
        eicar_buffer = io.BytesIO()
        with zipfile.ZipFile(eicar_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", b"<?xml version=\"1.0\"?>")
            archive.writestr("docProps/core.xml", eicar_signature)
        eicar = eicar_buffer.getvalue()
        _, infected_status = upload_and_wait(
            "eicar.pptx",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            eicar,
        )
        if infected_status.get("status") != "quarantined":
            raise RuntimeError(f"EICAR upload ended in {infected_status.get('status')}")
        print("antivirus=passed status=quarantined")
    return 0

if __name__ == "__main__": sys.exit(main())

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.routers.auth import DeviceAuth
from app.device_manager.registry import registry

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])

# In-memory store for device configurations (such as scanner mode)
device_scan_modes = {}

class ScannerModeConfig(BaseModel):
    device_id: str
    scan_mode: str  # "entry", "workshop", "vip"

@router.get("/online")
async def get_online_devices(is_auth: DeviceAuth):
    """
    Returns a list of online Room Apps and Kiosks.
    Used by the Technician Dashboard to ensure projectors are connected.
    """
    devices = registry.get_all_online_devices()
    return {
        "count": len(devices),
        "devices": [
            {
                "device_id": d_id,
                "last_seen": last_seen.isoformat(),
                "status": "online",
                "scan_mode": device_scan_modes.get(d_id, "entry")
            }
            for d_id, last_seen in devices.items()
        ]
    }

@router.post("/config-mode")
async def configure_device_scan_mode(config: ScannerModeConfig, is_auth: DeviceAuth):
    """
    Configure scanner mode for a specific device.
    Options: entry, workshop, vip
    """
    if config.scan_mode not in ["entry", "workshop", "vip"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid scan mode. Must be 'entry', 'workshop', or 'vip'."
        )
    device_scan_modes[config.device_id] = config.scan_mode
    return {
        "status": "success",
        "device_id": config.device_id,
        "scan_mode": config.scan_mode
    }

@router.get("/config-mode/{device_id}")
async def get_device_scan_mode(device_id: str, is_auth: DeviceAuth):
    """
    Retrieve current scan mode configuration for a specific device.
    """
    return {
        "device_id": device_id,
        "scan_mode": device_scan_modes.get(device_id, "entry")
    }

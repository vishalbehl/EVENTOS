from typing import Dict, Optional
import datetime
from loguru import logger

class DeviceRegistry:
    def __init__(self):
        # Maps device_id -> last_seen timestamp
        self._devices: Dict[str, datetime.datetime] = {}

    def heartbeat(self, device_id: str):
        self._devices[device_id] = datetime.datetime.now(datetime.timezone.utc)
        logger.debug(f"[Device] Heartbeat from {device_id}")

    def is_online(self, device_id: str, timeout_seconds: int = 15) -> bool:
        last_seen = self._devices.get(device_id)
        if not last_seen:
            return False
        return (datetime.datetime.now(datetime.timezone.utc) - last_seen).total_seconds() < timeout_seconds

    def get_all_online_devices(self, timeout_seconds: int = 15) -> Dict[str, datetime.datetime]:
        return {
            d_id: last_seen for d_id, last_seen in self._devices.items() 
            if self.is_online(d_id, timeout_seconds)
        }

registry = DeviceRegistry()

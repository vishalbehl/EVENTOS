import subprocess
import json
import socket
import re
import asyncio
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, cast, String

from app.database import get_database
from app.models.room_device import RoomDevice
from app.models.network_config import NetworkConfig

router = APIRouter(prefix="/api/v1/venue/admin/network", tags=["network"])

# Common OUI Vendor prefixes for hardware identification
OUI_VENDORS = {
    "00:50:56": "VMware Virtual NIC",
    "00:0C:29": "VMware Virtual NIC",
    "0A:00:27": "VirtualBox Host NIC",
    "20:1E:88": "Intel Corporation",
    "F4:D4:88": "Intel Corporation",
    "B8:27:EB": "Raspberry Pi",
    "DC:A6:32": "Raspberry Pi",
    "E4:5F:01": "Raspberry Pi",
    "00:15:99": "Samsung Electronics",
    "F0:72:EA": "Apple Inc",
    "3C:06:30": "Apple Inc",
    "AC:DE:48": "Apple Inc",
    "00:07:4D": "Zebra Technologies",
    "00:04:F9": "Zebra Technologies",
    "00:1D:92": "Zebra Technologies",
    "00:80:77": "Brother Industries",
    "00:1E:C9": "Dell Inc",
    "18:66:DA": "Dell Inc",
    "70:85:C2": "HP Inc",
    "B4:B5:2F": "HP Inc",
    "00:E0:4C": "Realtek Semiconductor",
    "50:EB:71": "Realtek Semiconductor",
}

def resolve_vendor(mac: str) -> str:
    if not mac:
        return "Network Device"
    clean_mac = mac.upper().replace("-", ":")
    prefix = ":".join(clean_mac.split(":")[:3])
    return OUI_VENDORS.get(prefix, "Network Device / Workstation")

def resolve_hostname(ip: str) -> str:
    try:
        host, _, _ = socket.gethostbyaddr(ip)
        return host
    except Exception:
        return ""

class NetworkAdapterInfo(BaseModel):
    name: str
    description: str
    mac_address: Optional[str] = None
    status: str  # "Up" | "Disconnected"
    link_speed: Optional[str] = None
    media_type: str  # "Wi-Fi" | "Ethernet"
    ip_address: Optional[str] = None
    prefix_length: int = 24
    subnet: Optional[str] = None
    gateway: Optional[str] = None
    is_default: bool = False
    is_active: bool = False
    interface_index: Optional[int] = None

class DiscoveredDevice(BaseModel):
    ip_address: str
    mac_address: str
    hostname: Optional[str] = None
    vendor: Optional[str] = None
    interface_name: str
    media_type: str
    status: str = "Online"
    is_registered: bool = False
    bound_device_id: Optional[str] = None
    bound_device_name: Optional[str] = None
    bound_device_type: Optional[str] = None
    assigned_station: Optional[str] = None
    is_local: bool = False
    interface_index: Optional[int] = None
    discovery_source: str = "neighbor"
    last_seen: Optional[str] = None

class SelectAdapterRequest(BaseModel):
    adapter_name: str
    description: Optional[str] = None
    media_type: str = "Ethernet"
    ip_address: Optional[str] = None
    subnet: Optional[str] = None
    gateway: Optional[str] = None
    mac_address: Optional[str] = None

class ScanNetworkRequest(BaseModel):
    adapter_name: Optional[str] = None
    subnet: Optional[str] = None
    quick_sweep: bool = True

@router.get("/adapters", response_model=List[NetworkAdapterInfo])
async def get_network_adapters(db: AsyncSession = Depends(get_database)):
    """
    Discovers all physical and virtual network adapters on the host (Ethernet and Wi-Fi)
    and merges with database-persisted active configuration.
    """
    # 1. Fetch DB-persisted active adapter
    active_cfg = (await db.execute(select(NetworkConfig).where(NetworkConfig.is_active == True).limit(1))).scalar_one_or_none()
    active_adapter_name = active_cfg.active_adapter_name if active_cfg else None

    # 2. Query Windows/host interfaces via PowerShell
    cmd = (
        'powershell -NoProfile -Command "'
        '$adapters = Get-NetAdapter | Select-Object Name, InterfaceDescription, MacAddress, Status, LinkSpeed, MediaType, InterfaceIndex; '
        '$ips = Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, InterfaceIndex, IPAddress, PrefixLength; '
        '$routes = Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select-Object InterfaceIndex, NextHop; '
        '$result = @(); '
        'foreach ($a in $adapters) { '
        '  $ip = $ips | Where-Object { $_.InterfaceIndex -eq $a.InterfaceIndex -or $_.InterfaceAlias -eq $a.Name } | Select-Object -First 1; '
        '  $route = $routes | Where-Object { $_.InterfaceIndex -eq $a.InterfaceIndex } | Select-Object -First 1; '
        '  $result += [PSCustomObject]@{ '
        '    Name = $a.Name; '
        '    Description = $a.InterfaceDescription; '
        '    MacAddress = if ($a.MacAddress) { $a.MacAddress.Replace(\'-\', \':\').ToUpper() } else { $null }; '
        '    Status = $a.Status; '
        '    LinkSpeed = $a.LinkSpeed; '
        '    MediaType = if ($a.MediaType -like \'*802.11*\' -or $a.Name -like \'*Wi-Fi*\' -or $a.Name -like \'*WiFi*\') { \'Wi-Fi\' } else { \'Ethernet\' }; '
        '    IPAddress = if ($ip) { $ip.IPAddress } else { $null }; '
        '    PrefixLength = if ($ip) { $ip.PrefixLength } else { 24 }; '
        '    Gateway = if ($route) { $route.NextHop } else { $null }; '
        '    IsDefault = ($route -ne $null); '
        '    InterfaceIndex = $a.InterfaceIndex '
        '  } '
        '}; '
        '$result | ConvertTo-Json -Depth 3"'
    )
    
    try:
        proc = await asyncio.to_thread(subprocess.run, cmd, shell=True, capture_output=True, text=True)
        raw = json.loads(proc.stdout) if proc.stdout.strip() else []
        if isinstance(raw, dict):
            raw = [raw]
            
        adapters: List[NetworkAdapterInfo] = []
        for item in raw:
            name = item.get("Name", "Unknown Adapter")
            ip = item.get("IPAddress")
            prefix = item.get("PrefixLength") or 24
            subnet = None
            if ip and not ip.startswith("169.254"):
                parts = ip.split(".")
                if len(parts) == 4:
                    subnet = f"{parts[0]}.{parts[1]}.{parts[2]}.0/{prefix}"
                    
            is_active = (active_adapter_name == name) if active_adapter_name else bool(item.get("IsDefault"))
            
            adapters.append(NetworkAdapterInfo(
                name=name,
                description=item.get("Description", ""),
                mac_address=item.get("MacAddress"),
                status=item.get("Status", "Up"),
                link_speed=item.get("LinkSpeed", "Unknown"),
                media_type=item.get("MediaType", "Ethernet"),
                ip_address=ip,
                prefix_length=prefix,
                subnet=subnet,
                gateway=item.get("Gateway"),
                is_default=bool(item.get("IsDefault")),
                is_active=is_active,
                interface_index=item.get("InterfaceIndex")
            ))
        return adapters
    except Exception as e:
        print(f"Error querying host network adapters: {e}")
        # Fallback to database saved adapter if available
        if active_cfg:
            return [
                NetworkAdapterInfo(
                    name=active_cfg.active_adapter_name,
                    description=active_cfg.adapter_description or "Persisted Venue Network Adapter",
                    status="Up",
                    media_type=active_cfg.media_type,
                    ip_address=active_cfg.ip_address,
                    subnet=active_cfg.subnet,
                    gateway=active_cfg.gateway,
                    mac_address=active_cfg.mac_address,
                    is_active=True,
                    is_default=True
                )
            ]
        return []

@router.post("/select-adapter")
async def select_active_adapter(
    payload: SelectAdapterRequest,
    db: AsyncSession = Depends(get_database)
):
    """
    Saves the selected network adapter as the active venue interface in PostgreSQL.
    Binds the server operational subnet and enables auto-discovery of all connected nodes.
    """
    # Deactivate existing active configurations
    await db.execute(update(NetworkConfig).values(is_active=False))

    # Check if this adapter was previously configured
    existing_res = await db.execute(select(NetworkConfig).where(NetworkConfig.active_adapter_name == payload.adapter_name))
    existing = existing_res.scalar_one_or_none()

    if existing:
        existing.adapter_description = payload.description
        existing.media_type = payload.media_type
        existing.ip_address = payload.ip_address
        existing.subnet = payload.subnet
        existing.gateway = payload.gateway
        existing.mac_address = payload.mac_address
        existing.is_active = True
        existing.updated_at = datetime.now(timezone.utc)
    else:
        new_cfg = NetworkConfig(
            id=uuid.uuid4(),
            active_adapter_name=payload.adapter_name,
            adapter_description=payload.description,
            media_type=payload.media_type,
            ip_address=payload.ip_address,
            subnet=payload.subnet,
            gateway=payload.gateway,
            mac_address=payload.mac_address,
            is_active=True,
            updated_at=datetime.now(timezone.utc)
        )
        db.add(new_cfg)

    await db.commit()
    return {
        "status": "success",
        "message": f"Successfully bound active venue network to adapter '{payload.adapter_name}' ({payload.media_type}).",
        "active_adapter": payload.adapter_name,
        "subnet": payload.subnet
    }

async def ping_probe_ip(ip: str):
    loop = asyncio.get_running_loop()
    def _probe():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0.04)
            s.sendto(b"", (ip, 80))
            s.close()
        except Exception:
            pass
    await loop.run_in_executor(None, _probe)

async def sweep_subnet(base_ip: str):
    try:
        parts = base_ip.split(".")
        if len(parts) == 4 and not base_ip.startswith("169.254"):
            prefix = f"{parts[0]}.{parts[1]}.{parts[2]}"
            tasks = [ping_probe_ip(f"{prefix}.{i}") for i in range(1, 255)]
            await asyncio.gather(*tasks)
    except Exception:
        pass


async def get_local_adapter_identity(adapter_name: str) -> dict:
    """Read the selected adapter's live IP and MAC from Windows."""
    safe_name = re.sub(r"[^A-Za-z0-9 _().-]", "", adapter_name or "")
    if not safe_name:
        return {}
    cmd = (
        'powershell -NoProfile -Command "'
        f"$a=Get-NetAdapter -Name '{safe_name}' -ErrorAction SilentlyContinue; "
        f"$ip=Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias '{safe_name}' -ErrorAction SilentlyContinue | Where-Object {{$_.IPAddress -notlike '169.254*'}} | Select-Object -First 1; "
        "if ($a) { [PSCustomObject]@{ Name=$a.Name; MacAddress=($a.MacAddress -replace '-',':').ToUpper(); InterfaceIndex=$a.InterfaceIndex; Status=$a.Status; MediaType=if ($a.Name -match 'Wi-?Fi|Wireless') {'Wi-Fi'} else {'Ethernet'}; IPAddress=if ($ip) {$ip.IPAddress} else {$null} } | ConvertTo-Json -Compress }"
    )
    try:
        proc = await asyncio.to_thread(subprocess.run, cmd, shell=True, capture_output=True, text=True)
        raw = json.loads(proc.stdout) if proc.stdout.strip() else {}
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}

@router.post("/scan", response_model=List[DiscoveredDevice])
async def scan_network(
    req: ScanNetworkRequest = ScanNetworkRequest(),
    db: AsyncSession = Depends(get_database)
):
    """
    Scans the local subnet on the selected adapter to find all real-time connected workstations,
    kiosks, barcode scanners, and thermal printers with genuine IP, MAC, Hostname, and Registration status.
    Zero dummy data.
    """
    adapter_name = req.adapter_name or ""

    # Fetch active adapter IP to sweep if available
    active_cfg = (await db.execute(select(NetworkConfig).where(NetworkConfig.is_active == True).limit(1))).scalar_one_or_none()
    if active_cfg and active_cfg.ip_address:
        await sweep_subnet(active_cfg.ip_address)
    elif req.subnet and "/" in req.subnet:
        base = req.subnet.split("/")[0]
        await sweep_subnet(base)
    
    # 1. Fetch all registered room devices from DB to check bindings
    reg_res = await db.execute(select(RoomDevice))
    registered_devices = reg_res.scalars().all()
    registered_map = {}
    for rd in registered_devices:
        if rd.mac_address:
            clean_m = str(rd.mac_address).upper().replace("-", ":")
            registered_map[clean_m] = rd
        if rd.ip_address:
            registered_map[str(rd.ip_address)] = rd

    # A host does not normally appear in its own ARP/neighbor table. Add the
    # selected adapter explicitly so the operator can assign this workstation.
    local = await get_local_adapter_identity(adapter_name)
    persisted_selected = active_cfg if active_cfg and (not adapter_name or active_cfg.active_adapter_name == adapter_name) else None
    local_ip = str(local.get("IPAddress") or (persisted_selected.ip_address if persisted_selected and persisted_selected.ip_address else ""))
    local_mac = str(local.get("MacAddress") or (persisted_selected.mac_address if persisted_selected and persisted_selected.mac_address else "")).upper().replace("-", ":")
    local_iface = str(local.get("Name") or adapter_name or (persisted_selected.active_adapter_name if persisted_selected else "Ethernet"))

    # 2. Query OS Neighbor and ARP Tables
    cmd = (
        'powershell -NoProfile -Command "'
        '$neighbors = Get-NetNeighbor -AddressFamily IPv4 | Where-Object { $_.State -ne \'Unreachable\' -and $_.LinkLayerAddress -ne \'\' }; '
        'if (\'' + str(adapter_name) + '\' -ne \'\') { $neighbors = $neighbors | Where-Object { $_.InterfaceAlias -eq \'' + str(adapter_name) + '\' } }; '
        '$neighbors | Select-Object IPAddress, LinkLayerAddress, InterfaceAlias, State | ConvertTo-Json -Depth 2"'
    )
    
    discovered_list: List[DiscoveredDevice] = []
    seen_macs = set()

    if local_ip and local_mac:
        local_match = registered_map.get(local_mac) or registered_map.get(local_ip)
        seen_macs.add(local_mac)
        discovered_list.append(DiscoveredDevice(
            ip_address=local_ip,
            mac_address=local_mac,
            hostname=socket.gethostname(),
            vendor=resolve_vendor(local_mac),
            interface_name=local_iface,
            media_type=str(local.get("MediaType") or "Ethernet"),
            status="Online",
            is_registered=local_match is not None,
            bound_device_id=str(local_match.id) if local_match else None,
            bound_device_name=local_match.device_name if local_match else None,
            bound_device_type=local_match.device_type if local_match else None,
            is_local=True,
            interface_index=local.get("InterfaceIndex"),
            discovery_source="local adapter",
            last_seen=datetime.now(timezone.utc).isoformat(),
        ))

    try:
        proc = await asyncio.to_thread(subprocess.run, cmd, shell=True, capture_output=True, text=True)
        raw = json.loads(proc.stdout) if proc.stdout.strip() else []
        if isinstance(raw, dict):
            raw = [raw]
            
        for item in raw:
            ip = item.get("IPAddress", "").strip()
            mac = item.get("LinkLayerAddress", "").replace("-", ":").upper().strip()
            iface = item.get("InterfaceAlias", adapter_name or "Ethernet")
            
            if not ip or not mac:
                continue
            # Filter out multicast, broadcast, and invalid loopback
            if ip.startswith("224.") or ip.startswith("239.") or ip == "255.255.255.255" or ip.startswith("127."):
                continue
            if mac in ["FF:FF:FF:FF:FF:FF", "01:00:5E:7F:FF:FA", "01:00:5E:00:00:FC", "01:00:5E:00:00:FB", "01:00:5E:00:00:16"]:
                continue
            if mac in seen_macs:
                continue
                
            seen_macs.add(mac)
            
            # Resolve Hostname & Vendor
            hostname = await asyncio.to_thread(resolve_hostname, ip)
            vendor = resolve_vendor(mac)
            media_type = "Wi-Fi" if ("wi-fi" in iface.lower() or "wifi" in iface.lower() or "wireless" in iface.lower()) else "Ethernet"
            
            # Check DB registration match
            reg_match = registered_map.get(mac) or registered_map.get(ip)
            is_reg = reg_match is not None
            bound_id = str(reg_match.id) if reg_match else None
            bound_name = reg_match.device_name if reg_match else None
            bound_type = reg_match.device_type if reg_match else None
            
            discovered_list.append(DiscoveredDevice(
                ip_address=ip,
                mac_address=mac,
                hostname=hostname or (f"Node-{ip.split('.')[-1]}" if ip else None),
                vendor=vendor,
                interface_name=iface,
                media_type=media_type,
                status="Online",
                is_registered=is_reg,
                bound_device_id=bound_id,
                bound_device_name=bound_name,
                bound_device_type=bound_type,
                is_local=False,
                interface_index=item.get("InterfaceIndex"),
                discovery_source="Windows neighbor table",
                last_seen=datetime.now(timezone.utc).isoformat(),
            ))
    except Exception as e:
        print(f"Scan error: {e}")

    # Also include registered devices from database if not already in list so offline/disconnected nodes remain visible
    for rd in registered_devices:
        clean_m = str(rd.mac_address).upper().replace("-", ":") if rd.mac_address else None
        if clean_m and clean_m not in seen_macs:
            seen_macs.add(clean_m)
            discovered_list.append(DiscoveredDevice(
                ip_address=str(rd.ip_address) if rd.ip_address else "Disconnected",
                mac_address=clean_m,
                hostname=rd.hostname or rd.device_name,
                vendor=resolve_vendor(clean_m),
                interface_name=adapter_name or "Ethernet",
                media_type="Ethernet",
                status=rd.status.capitalize() if rd.status else "Registered",
                is_registered=True,
                bound_device_id=str(rd.id),
                bound_device_name=rd.device_name,
                bound_device_type=rd.device_type,
                is_local=False,
                discovery_source="registered database record",
            ))

    return discovered_list

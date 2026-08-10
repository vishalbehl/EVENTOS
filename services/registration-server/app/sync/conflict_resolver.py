from loguru import logger

def resolve_conflict(local_record: dict, cloud_record: dict) -> dict:
    """
    Implements a strict 'cloud-wins' strategy for event schedules.
    The Venue Server acts as a read-heavy edge node, so any conflict
    between the cloud schedule and local schedule resolves in favor of the cloud.
    """
    logger.debug(f"Resolving conflict for record ID {local_record.get('id', 'unknown')}")
    # Under 'cloud-wins', we simply return the cloud record.
    # In a more complex scenario, we might merge certain fields (like local playback state).
    return cloud_record

def merge_local_state(cloud_session: dict, local_session: dict) -> dict:
    """
    Merges local specific states (like active playback position) into the incoming cloud update
    so that a cloud update doesn't reset a live presentation.
    """
    if local_session.get("status") in ["active", "locked_for_preload"]:
        # Protect live running sessions from being forcefully reverted to draft by the cloud
        if cloud_session.get("status") != "archived":
            cloud_session["status"] = local_session["status"]
            
    return cloud_session

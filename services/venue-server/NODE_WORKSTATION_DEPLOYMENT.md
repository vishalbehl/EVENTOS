# Venue workstation deployment

1. On first desktop boot, Electron automatically creates an embedded SQLite fallback database under the app data folder and seeds only the local default admin account.
2. The first screen offers two paths:
   - **Admin login**: use the admin credentials, fetch/sync the event from the venue server, and keep PostgreSQL plus the SQLite fallback copy updated.
   - **Upload Local DB**: import the latest SQLite fallback DB exported from the Admin device.
3. On the Admin device, go to **Admin → Event & Local Data** and use **Download Updated Local DB** after the event has been fetched/synced. Feed that `.sqlite` file into new workstations from the first screen.
4. If a workstation can reach the shared Venue Server/PostgreSQL database, it uses the shared data path. If it cannot, it can use the imported local SQLite fallback DB through the local node agent.
5. Offline scan/registration writes local `venue_scan_events`, `venue_checkins`, and `node_outbox` rows immediately. When connectivity returns, `POST /sync` uploads pending operations to the authoritative Venue Server/PostgreSQL database.

`/node-setup` is legacy and redirects to the first screen. Workstation binding should be managed from Admin Devices, and local DB movement should happen through the first-screen import and Admin Event/Data export actions.

Admin can use **Re-sync** to issue a new snapshot version or **Revoke** to immediately deny bootstrap, heartbeat, and upload calls from a node.

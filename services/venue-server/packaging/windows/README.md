# Venue Server Windows appliance

The signed MSI payload must contain pinned Python, Node.js, PostgreSQL, Caddy, WinSW, the Venue API, the Next.js standalone UI, and the Electron console. `install.ps1` refuses to continue when any component is missing, creates unique credentials, restricts the environment file ACL, runs Alembic, installs supervised services, and opens only the private-profile HTTPS firewall rule.

Build the release artifact with `.\build-msi.ps1 -PayloadRoot C:\path\to\staged-payload -Version 1.0.0.0 -CertificateThumbprint <release-cert-thumbprint>`. The script validates the appliance payload, harvests it with WiX v4, builds the MSI, and signs it when a certificate thumbprint is supplied. An unsigned MSI is intentionally reported as a release blocker.

Build and release gates:

1. Build `venue-server-app` with Next.js standalone output and compile Electron.
2. Assemble the component tree expected by `install.ps1` using only pinned, checksum-verified binaries.
3. Sign every executable and the MSI with the Eventos release certificate.
4. Install on a clean supported Windows VM, complete `/setup`, reboot twice, and run API/UI/backup checks.
5. Upgrade over the previous signed version and confirm the automatic pre-upgrade backup.
6. Uninstall without `-PurgeData` and verify `%ProgramData%\Eventos\VenueServer` remains recoverable.

Production services bind to loopback. Caddy is the only LAN-facing process and creates the local venue CA. Export its root certificate to Registration and SRR machines through the approved connection package process.

# Stop any existing processes on common venue ports
Write-Host "🛑 Clearing existing node/python instances on venue ports..." -ForegroundColor Yellow
taskkill /F /IM "python.exe" /T 2>$null
taskkill /F /IM "node.exe" /T 2>$null

Write-Host "🚀 Starting EventOS Venue Offline Ecosystem..." -ForegroundColor Cyan

# 1. Start Venue Server (Port 8001 Auto-fallback) - Local Offline Hub
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:venue-server" -WindowStyle Normal

# 2. Start Registration Server (Port 8002 Auto-fallback) - Local Registration Authority
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:registration-server" -WindowStyle Normal

# 3. Start Venue Registration Desk & Badge Workstation (Port 3005)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:venue-registration" -WindowStyle Normal

# 4. Start Speaker Ready Room (SRR) Preview Workstation (Port 3007)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:preview-app" -WindowStyle Normal

# 5. Start Venue Server Local Admin Console (Port 3006)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:venue-server-app" -WindowStyle Normal

# 6. Start Room Presentation Controller (Port 5173)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:room-presentation" -WindowStyle Normal

# 7. Start Technician AV Dashboard (Port 5174)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:technician-dashboard" -WindowStyle Normal

Write-Host "✅ All Venue services and applications launched in separate windows!" -ForegroundColor Green
Write-Host "Venue Server API:         http://localhost:8001" -ForegroundColor Gray
Write-Host "Registration Server API:  http://localhost:8002" -ForegroundColor Gray
Write-Host "Venue Registration App:   http://localhost:3005" -ForegroundColor Gray
Write-Host "SRR Preview App:          http://localhost:3007" -ForegroundColor Gray
Write-Host "Venue Server App:         http://localhost:3006" -ForegroundColor Gray
Write-Host "Room Presentation App:    http://localhost:5173" -ForegroundColor Gray
Write-Host "Technician Dashboard:     http://localhost:5174" -ForegroundColor Gray

# Stop any existing processes on common ports
taskkill /F /IM "python.exe" /T 2>$null
taskkill /F /IM "node.exe" /T 2>$null

Write-Host "🚀 Starting Conference Platform Services..." -ForegroundColor Cyan

# 1. Start Backend (Uvicorn)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/backend; .\.venv\Scripts\activate; python -m uvicorn app.main:app --reload --port 8000" -WindowStyle Normal

# 2. Start Celery Worker
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/backend; .\.venv\Scripts\activate; python -m celery -A app.worker worker --loglevel=info -P solo" -WindowStyle Normal

# 3. Start Organizer Frontend (Port 3000)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:organizer" -WindowStyle Normal

# 4. Start Speaker Portal (Port 3002)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:speaker" -WindowStyle Normal

# 5. Start Registration Portal (Port 3003)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:registration" -WindowStyle Normal

Write-Host "✅ All services launched in separate windows!" -ForegroundColor Green

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Refresh-CommandPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Install-DockerDesktop {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "Docker Desktop is required. Install or update 'App Installer' from the Microsoft Store, then run setup.bat again."
  }

  Write-Host "Installing Docker Desktop with Windows Package Manager..."
  & winget install --id Docker.DockerDesktop --exact --silent --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "Couldn't install Docker Desktop. Install it manually, finish its first-time setup, then run setup.bat again."
  }
  Refresh-CommandPath
}

function Set-ComposeEnvironment {
  $envFile = Join-Path $PSScriptRoot ".env"
  if (Test-Path $envFile) {
    Write-Host "Keeping the existing .env configuration."
    return
  }

  $secretBytes = New-Object byte[] 32
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($secretBytes)
  }
  finally {
    $generator.Dispose()
  }

  $secret = [BitConverter]::ToString($secretBytes).Replace("-", "").ToLowerInvariant()
  [System.IO.File]::WriteAllText($envFile, "JWT_SECRET=$secret`r`n", [System.Text.Encoding]::ASCII)
  Write-Host "Created a unique local JWT secret in .env."
}

try {
  Set-Location $PSScriptRoot

  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Install-DockerDesktop
  }

  Refresh-CommandPath
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) {
    throw "Docker Desktop was installed, but its command isn't available yet. Restart Windows and run setup.bat again."
  }

  $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerDesktop) {
    Write-Host "Starting Docker Desktop..."
    Start-Process -FilePath $dockerDesktop
  }

  Write-Host "Waiting for Docker Desktop to start..."
  $dockerReady = $false
  for ($attempt = 0; $attempt -lt 36; $attempt++) {
    & $docker.Source info *> $null
    if ($LASTEXITCODE -eq 0) {
      $dockerReady = $true
      break
    }
    Start-Sleep -Seconds 5
  }
  if (-not $dockerReady) {
    throw "Docker Desktop hasn't started. Open Docker Desktop and complete its first-time setup (including any requested restart), then run setup.bat again."
  }

  & $docker.Source compose version *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose isn't available. Update Docker Desktop, then run setup.bat again."
  }

  Set-ComposeEnvironment

  Write-Host "Building and starting the app and MongoDB with Docker Compose..."
  & $docker.Source compose up -d --build mongo server client
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose couldn't build or start the app. Check Docker Desktop and try setup.bat again."
  }

  Write-Host "Preparing demo accounts and sample tasks..."
  & $docker.Source compose --profile setup run --rm seed
  if ($LASTEXITCODE -ne 0) {
    throw "Couldn't seed the demo database. Check that the MongoDB container is running, then run setup.bat again."
  }

  Write-Host ""
  Write-Host "Setup is complete. Open http://localhost:5173 in your browser."
  Write-Host "The app and MongoDB are running in Docker. You can close this window."
  Start-Process "http://localhost:5173"
}
catch {
  Write-Host ""
  Write-Host "SETUP ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

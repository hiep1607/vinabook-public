param(
	[switch]$Check
)

$ErrorActionPreference = 'Stop'
$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $backendDir '.env.local'
$exampleFile = Join-Path $backendDir '.env.local.example'

if (-not (Test-Path -LiteralPath $envFile)) {
	Copy-Item -LiteralPath $exampleFile -Destination $envFile
	Write-Host "Da tao $envFile"
	Write-Host 'Hay dan khoa Gemini vao AI_API_KEY roi chay lai run-gemini.cmd.'
	exit 1
}

foreach ($rawLine in Get-Content -LiteralPath $envFile -Encoding utf8) {
	$line = $rawLine.Trim()
	if (-not $line -or $line.StartsWith('#')) {
		continue
	}
	$separator = $line.IndexOf('=')
	if ($separator -le 0) {
		continue
	}
	$name = $line.Substring(0, $separator).Trim()
	$value = $line.Substring($separator + 1).Trim()
	if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
		($value.StartsWith("'") -and $value.EndsWith("'"))) {
		$value = $value.Substring(1, $value.Length - 2)
	}
	[Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

if (-not $env:AI_API_KEY -or $env:AI_API_KEY -eq 'PASTE_GEMINI_API_KEY_HERE') {
	Write-Host "Chua co khoa Gemini trong $envFile" -ForegroundColor Yellow
	Write-Host 'Mo file, thay PASTE_GEMINI_API_KEY_HERE bang khoa cua ban roi chay lai.'
	exit 1
}

if (-not $env:AI_PROVIDER) { $env:AI_PROVIDER = 'gemini' }
if (-not $env:AI_MODEL) { $env:AI_MODEL = 'gemini-3.1-flash-lite' }

$modelId = [Uri]::EscapeDataString($env:AI_MODEL)
try {
	$validationBody = @{
		contents = @(@{
			role = 'user'
			parts = @(@{ text = 'Reply with OK.' })
		})
		generationConfig = @{ maxOutputTokens = 16 }
	} | ConvertTo-Json -Depth 8
	$null = Invoke-RestMethod `
		-Method Post `
		-Uri "https://generativelanguage.googleapis.com/v1beta/models/$modelId`:generateContent" `
		-Headers @{ 'x-goog-api-key' = $env:AI_API_KEY } `
		-ContentType 'application/json; charset=utf-8' `
		-Body $validationBody `
		-TimeoutSec 15
} catch {
	throw "Khoa Gemini hoac model $($env:AI_MODEL) khong tao duoc noi dung. Hay kiem tra lai AI_API_KEY va quota."
}

Write-Host "Da xac thuc Gemini: model=$($env:AI_MODEL), API key hop le." -ForegroundColor Green
if ($Check) { exit 0 }

$listener = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
	Select-Object -First 1
if ($listener) {
	$running = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
	if (-not $running.CommandLine -or $running.CommandLine -notlike "*$backendDir*") {
		throw "Cong 8080 dang duoc process khac su dung (PID $($listener.OwningProcess))."
	}
	Write-Host 'Dang dung backend VinaBook cu de nap cau hinh Gemini moi...'
	Stop-Process -Id $listener.OwningProcess -Force
	Start-Sleep -Seconds 1
}

$preferredJava = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
if (-not $env:JAVA_HOME -and (Test-Path -LiteralPath $preferredJava)) {
	$env:JAVA_HOME = $preferredJava
}

Write-Host "Dang chay VinaBook backend voi $($env:AI_MODEL)..." -ForegroundColor Green
Set-Location -LiteralPath $backendDir
& .\mvnw.cmd spring-boot:run
exit $LASTEXITCODE

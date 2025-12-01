# Navigate to project root (one level up from this script)
Set-Location "$PSScriptRoot/.."

# Create the zip file
Compress-Archive -Path manifest.json, popup, scripts, styles, images -DestinationPath extension-build.zip -Force

Write-Host "Build created at $(Get-Location)\extension-build.zip"
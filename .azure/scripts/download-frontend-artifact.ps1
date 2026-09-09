param(
    [Parameter(Mandatory = $true)]
    [string]$StorageAccountName,

    [Parameter(Mandatory = $true)]
    [string]$ContainerName,

    [Parameter(Mandatory = $true)]
    [string]$ArtifactName,

    [Parameter(Mandatory = $true)]
    [string]$DestinationPath
)

$ErrorActionPreference = "Stop"

$DestinationDirectory = `
    Split-Path `
        -Path $DestinationPath `
        -Parent

New-Item `
    -ItemType Directory `
    -Path $DestinationDirectory `
    -Force | Out-Null

if (Test-Path $DestinationPath) {
    Remove-Item `
        -Path $DestinationPath `
        -Force
}

Write-Host "Authenticating VM Managed Identity..."

az login `
    --identity `
    --output none

if ($LASTEXITCODE -ne 0) {
    throw "Managed identity authentication failed."
}

Write-Host "Downloading frontend artifact..."

az storage blob download `
    --account-name $StorageAccountName `
    --container-name $ContainerName `
    --name $ArtifactName `
    --file $DestinationPath `
    --auth-mode login `
    --only-show-errors

if ($LASTEXITCODE -ne 0) {
    throw "Frontend artifact download failed."
}

if (-not (Test-Path $DestinationPath)) {
    throw "Downloaded frontend artifact was not found."
}

Write-Host "Artifact downloaded:"
Write-Host $DestinationPath

Write-Host "DOWNLOAD_RESULT=SUCCESS"
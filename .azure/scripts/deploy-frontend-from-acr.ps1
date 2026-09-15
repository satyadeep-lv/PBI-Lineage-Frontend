param(
    [Parameter(Mandatory = $false)]
    [string]$AcrName = "",

    [Parameter(Mandatory = $false)]
    [string]$Repository = "",

    [Parameter(Mandatory = $false)]
    [string]$ReleaseId = "",

    [Parameter(Mandatory = $false)]
    [string]$SiteName = "PBI-Lineage"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================="
Write-Host "PBI Lineage Frontend ACR Deployment"
Write-Host "========================================="

# ------------------------------------------------------------
# Validate parameters
# ------------------------------------------------------------

if ([string]::IsNullOrWhiteSpace($AcrName)) {
    throw "AcrName is required."
}

if ([string]::IsNullOrWhiteSpace($Repository)) {
    throw "Repository is required."
}

if ([string]::IsNullOrWhiteSpace($ReleaseId)) {
    throw "ReleaseId is required."
}

if ([string]::IsNullOrWhiteSpace($SiteName)) {
    throw "SiteName is required."
}

Write-Host "ACR name:   $AcrName"
Write-Host "Repository: $Repository"
Write-Host "Release:    $ReleaseId"
Write-Host "IIS site:   $SiteName"

# ------------------------------------------------------------
# Refresh PATH
#
# Azure VM Run Command runs under the VM Agent and can have an
# older PATH than an interactive administrator session.
# ------------------------------------------------------------

$MachinePath = [Environment]::GetEnvironmentVariable(
    "Path",
    "Machine"
)

$UserPath = [Environment]::GetEnvironmentVariable(
    "Path",
    "User"
)

$env:Path = "$MachinePath;$UserPath;$env:Path"

# ------------------------------------------------------------
# Locate Azure CLI
# ------------------------------------------------------------

$AzExe = $null

$AzCommand = Get-Command `
    az.cmd `
    -ErrorAction SilentlyContinue

if (-not $AzCommand) {
    $AzCommand = Get-Command `
        az.exe `
        -ErrorAction SilentlyContinue
}

if ($AzCommand) {
    $AzExe = $AzCommand.Source
}

if (-not $AzExe) {

    $AzCandidates = @(
        "C:\Program Files (x86)\Microsoft SDKs\Azure\CLI2\wbin\az.cmd",
        "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
    )

    foreach ($Candidate in $AzCandidates) {

        if (Test-Path $Candidate) {
            $AzExe = $Candidate
            break
        }
    }
}

if (-not $AzExe) {
    throw "Azure CLI could not be located on the VM."
}

Write-Host "Azure CLI located."

# ------------------------------------------------------------
# Locate ORAS
# ------------------------------------------------------------

$OrasExe = "C:\Program Files\oras\oras.exe"

if (-not (Test-Path $OrasExe)) {

    $OrasCommand = Get-Command `
        oras.exe `
        -ErrorAction SilentlyContinue

    if ($OrasCommand) {
        $OrasExe = $OrasCommand.Source
    }
}

if (-not (Test-Path $OrasExe)) {
    throw "ORAS CLI could not be located on the VM."
}

Write-Host "ORAS located."

# ------------------------------------------------------------
# Authenticate with VM Managed Identity
# ------------------------------------------------------------

Write-Host ""
Write-Host "Authenticating VM Managed Identity..."

& $AzExe login `
    --identity `
    --output none

$AzureLoginExitCode = $LASTEXITCODE

if ($AzureLoginExitCode -ne 0) {
    throw "Azure Managed Identity authentication failed."
}

Write-Host "Managed Identity authentication succeeded."

# ------------------------------------------------------------
# Resolve actual ACR login server
# ------------------------------------------------------------

Write-Host ""
Write-Host "Resolving ACR login server..."

$LoginServer = (
    & $AzExe acr show `
        --name $AcrName `
        --query loginServer `
        --output tsv |
        Out-String
).Trim()

$AcrShowExitCode = $LASTEXITCODE

if (
    $AcrShowExitCode -ne 0 -or
    [string]::IsNullOrWhiteSpace($LoginServer)
) {
    throw "Unable to resolve ACR login server."
}

Write-Host "ACR login server resolved:"
Write-Host $LoginServer

# ------------------------------------------------------------
# Obtain short-lived ACR access token
# ------------------------------------------------------------

Write-Host ""
Write-Host "Obtaining ACR access token..."

$AcrToken = (
    & $AzExe acr login `
        --name $AcrName `
        --expose-token `
        --query accessToken `
        --output tsv |
        Out-String
).Trim()

$AcrTokenExitCode = $LASTEXITCODE

if (
    $AcrTokenExitCode -ne 0 -or
    [string]::IsNullOrWhiteSpace($AcrToken)
) {
    throw "Unable to obtain ACR access token."
}

Write-Host "ACR token obtained."

# ------------------------------------------------------------
# Authenticate ORAS
# ------------------------------------------------------------

Write-Host ""
Write-Host "Authenticating ORAS to ACR..."

$AcrToken |
    & $OrasExe login `
        $LoginServer `
        --username "00000000-0000-0000-0000-000000000000" `
        --password-stdin

$OrasLoginExitCode = $LASTEXITCODE

# Do not retain token longer than required.
$AcrToken = $null

if ($OrasLoginExitCode -ne 0) {
    throw "ORAS authentication to ACR failed."
}

Write-Host "ORAS authentication succeeded."

# ------------------------------------------------------------
# Prepare temporary deployment directory
# ------------------------------------------------------------

$DeployRoot = "C:\pbi-lineage\deploy"

New-Item `
    -ItemType Directory `
    -Path $DeployRoot `
    -Force |
    Out-Null

$WorkPath = Join-Path `
    $DeployRoot `
    "frontend-$ReleaseId"

if (Test-Path $WorkPath) {

    Write-Host "Removing previous temporary deployment directory..."

    Remove-Item `
        -Path $WorkPath `
        -Recurse `
        -Force
}

New-Item `
    -ItemType Directory `
    -Path $WorkPath `
    -Force |
    Out-Null

# ------------------------------------------------------------
# Pull frontend OCI artifact from ACR
# ------------------------------------------------------------

$ArtifactReference = (
    "$LoginServer/" +
    "$Repository" +
    ":" +
    "$ReleaseId"
)

Write-Host ""
Write-Host "Pulling frontend artifact..."
Write-Host $ArtifactReference

& $OrasExe pull `
    --output $WorkPath `
    $ArtifactReference

$PullExitCode = $LASTEXITCODE

if ($PullExitCode -ne 0) {
    throw "Frontend artifact pull from ACR failed."
}

Write-Host "Frontend artifact pulled successfully."

# ------------------------------------------------------------
# Find deployment ZIP
# ------------------------------------------------------------

$ExpectedZipName = "frontend-$ReleaseId.zip"

$ArtifactZip = Get-ChildItem `
    -Path $WorkPath `
    -Recurse `
    -File `
    -Filter $ExpectedZipName |
    Select-Object -First 1

if (-not $ArtifactZip) {

    Write-Host "Files downloaded from ACR:"

    Get-ChildItem `
        -Path $WorkPath `
        -Recurse `
        -File |
        Select-Object FullName |
        Format-Table -AutoSize

    throw "Frontend ZIP '$ExpectedZipName' was not found."
}

Write-Host "Frontend ZIP:"
Write-Host $ArtifactZip.FullName

# ------------------------------------------------------------
# Find deploy-frontend.ps1
#
# The OCI artifact can preserve the original repository path:
# .azure/scripts/deploy-frontend.ps1
#
# Search recursively instead of assuming it is in the root.
# ------------------------------------------------------------

$DeployScript = Get-ChildItem `
    -Path $WorkPath `
    -Recurse `
    -File `
    -Filter "deploy-frontend.ps1" |
    Select-Object -First 1

if (-not $DeployScript) {

    Write-Host "Files downloaded from ACR:"

    Get-ChildItem `
        -Path $WorkPath `
        -Recurse `
        -File |
        Select-Object FullName |
        Format-Table -AutoSize

    throw "deploy-frontend.ps1 was not found in the ACR artifact."
}

Write-Host "Deployment script:"
Write-Host $DeployScript.FullName

# ------------------------------------------------------------
# Execute IIS deployment
# ------------------------------------------------------------

Write-Host ""
Write-Host "Starting frontend IIS deployment..."

& $DeployScript.FullName `
    -ArtifactZipPath $ArtifactZip.FullName `
    -ReleaseId $ReleaseId `
    -SiteName $SiteName

$DeployExitCode = $LASTEXITCODE

if ($DeployExitCode -ne 0) {
    throw "deploy-frontend.ps1 returned exit code $DeployExitCode."
}

# ------------------------------------------------------------
# Verify IIS site
# ------------------------------------------------------------

Import-Module WebAdministration

$Website = Get-Website `
    -Name $SiteName `
    -ErrorAction Stop

if ($Website.State -ne "Started") {
    throw "IIS site '$SiteName' is not started."
}

$CurrentPhysicalPath = $Website.PhysicalPath

Write-Host ""
Write-Host "Current IIS physical path:"
Write-Host $CurrentPhysicalPath

$IndexFile = Join-Path `
    $CurrentPhysicalPath `
    "index.html"

$WebConfigFile = Join-Path `
    $CurrentPhysicalPath `
    "web.config"

if (-not (Test-Path $IndexFile)) {
    throw "index.html is missing from deployed IIS release."
}

if (-not (Test-Path $WebConfigFile)) {
    throw "web.config is missing from deployed IIS release."
}

# ------------------------------------------------------------
# Local IIS smoke test
# ------------------------------------------------------------

Write-Host ""
Write-Host "Testing frontend through IIS..."

$Headers = @{
    Host = "lvpowerbilineage.com"
}

$Response = Invoke-WebRequest `
    -Uri "http://127.0.0.1/" `
    -Headers $Headers `
    -UseBasicParsing `
    -TimeoutSec 30

if ($Response.StatusCode -ne 200) {
    throw "Frontend IIS health check returned HTTP $($Response.StatusCode)."
}

if ($Response.Content -notmatch "<html") {
    throw "Frontend IIS response does not appear to contain HTML."
}

Write-Host "IIS frontend smoke test passed."

# ------------------------------------------------------------
# Cleanup temporary deployment files
# ------------------------------------------------------------

try {

    Remove-Item `
        -Path $WorkPath `
        -Recurse `
        -Force `
        -ErrorAction SilentlyContinue
}
catch {

    Write-Host "Temporary directory cleanup warning:"
    Write-Host $_.Exception.Message
}

Write-Host ""
Write-Host "========================================="
Write-Host "Frontend deployment completed"
Write-Host "Release: $ReleaseId"
Write-Host "========================================="

Write-Host "DEPLOYMENT_RESULT=SUCCESS"
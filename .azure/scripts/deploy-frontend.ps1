param(
    [Parameter(Mandatory = $true)]
    [string]$ArtifactZipPath,

    [Parameter(Mandatory = $true)]
    [string]$ReleaseId,

    [Parameter(Mandatory = $false)]
    [string]$SiteName = "PBI-Lineage",

    [Parameter(Mandatory = $false)]
    [int]$KeepReleases = 5
)

$ErrorActionPreference = "Stop"

Write-Host "========================================="
Write-Host "PBI Lineage Frontend Deployment"
Write-Host "========================================="
Write-Host "Artifact: $ArtifactZipPath"
Write-Host "Release:  $ReleaseId"
Write-Host "IIS Site: $SiteName"

# ------------------------------------------------------------
# Directories
# ------------------------------------------------------------

$AppRoot = "C:\pbi-lineage"
$FrontendRoot = Join-Path $AppRoot "frontend"
$ReleasesRoot = Join-Path $FrontendRoot "releases"

$ReleasePath = Join-Path $ReleasesRoot $ReleaseId
$StagingPath = "$ReleasePath.staging"

$CurrentReleaseFile = Join-Path `
    $FrontendRoot `
    "current-release.txt"

foreach ($Directory in @(
    $AppRoot,
    $FrontendRoot,
    $ReleasesRoot
)) {
    if (-not (Test-Path $Directory)) {
        New-Item `
            -ItemType Directory `
            -Path $Directory `
            -Force | Out-Null
    }
}

# ------------------------------------------------------------
# Validate artifact
# ------------------------------------------------------------

if (-not (Test-Path $ArtifactZipPath)) {
    throw "Frontend artifact does not exist: $ArtifactZipPath"
}

if ([System.IO.Path]::GetExtension($ArtifactZipPath) -ne ".zip") {
    throw "Frontend artifact must be a ZIP file."
}

# ------------------------------------------------------------
# Prepare staging directory
# ------------------------------------------------------------

if (Test-Path $StagingPath) {
    Remove-Item `
        -Path $StagingPath `
        -Recurse `
        -Force
}

New-Item `
    -ItemType Directory `
    -Path $StagingPath `
    -Force | Out-Null

Write-Host "Extracting frontend artifact..."

Expand-Archive `
    -Path $ArtifactZipPath `
    -DestinationPath $StagingPath `
    -Force

# ------------------------------------------------------------
# Validate extracted release
# ------------------------------------------------------------

$IndexFile = Join-Path $StagingPath "index.html"
$WebConfigFile = Join-Path $StagingPath "web.config"

if (-not (Test-Path $IndexFile)) {
    throw "Frontend artifact is invalid: index.html not found."
}

if (-not (Test-Path $WebConfigFile)) {
    throw "Frontend artifact is invalid: web.config not found."
}

Write-Host "Frontend artifact validation passed."

# ------------------------------------------------------------
# Promote staging release
# ------------------------------------------------------------

if (Test-Path $ReleasePath) {

    Write-Host "Release already exists. Removing old copy..."

    Remove-Item `
        -Path $ReleasePath `
        -Recurse `
        -Force
}

Move-Item `
    -Path $StagingPath `
    -Destination $ReleasePath

# Staging no longer exists after promotion.
$IndexFile = Join-Path $ReleasePath "index.html"
$WebConfigFile = Join-Path $ReleasePath "web.config"

if (-not (Test-Path $IndexFile)) {
    throw "Promoted release has no index.html."
}

if (-not (Test-Path $WebConfigFile)) {
    throw "Promoted release has no web.config."
}

Write-Host "Promoted release validation passed."

Write-Host "Release staged successfully:"
Write-Host $ReleasePath

# ------------------------------------------------------------
# Load IIS tooling
# ------------------------------------------------------------

Import-Module WebAdministration

if (-not (Test-Path "IIS:\Sites\$SiteName")) {
    throw "IIS site '$SiteName' does not exist."
}

$Site = Get-Website -Name $SiteName

$PreviousPath = $Site.physicalPath

Write-Host "Current IIS path:"
Write-Host $PreviousPath

Write-Host "New IIS path:"
Write-Host $ReleasePath

# ------------------------------------------------------------
# Atomic IIS deployment
# ------------------------------------------------------------

try {

    Write-Host "Switching IIS to new release..."

    Set-ItemProperty `
        "IIS:\Sites\$SiteName" `
        -Name physicalPath `
        -Value $ReleasePath

    $Site = Get-Website -Name $SiteName
    $AppPoolName = $Site.applicationPool

    if ($Site.state -ne "Started") {
        Start-Website -Name $SiteName
    }

    if ($AppPoolName) {

        Write-Host "Recycling application pool:"
        Write-Host $AppPoolName

        Restart-WebAppPool `
            -Name $AppPoolName
    }

    # --------------------------------------------------------
    # Validate IIS configuration
    # --------------------------------------------------------

    Start-Sleep -Seconds 3

    $UpdatedSite = Get-Website -Name $SiteName

    if ($UpdatedSite.state -ne "Started") {
        throw "IIS site did not enter Started state."
    }

    $ResolvedPhysicalPath = `
        $UpdatedSite.physicalPath.TrimEnd("\")

    $ExpectedPhysicalPath = `
        $ReleasePath.TrimEnd("\")

    if ($ResolvedPhysicalPath -ne $ExpectedPhysicalPath) {
        throw (
            "IIS physical path verification failed. " +
            "Expected '$ExpectedPhysicalPath', " +
            "found '$ResolvedPhysicalPath'."
        )
    }

    if (-not (Test-Path $IndexFile)) {
        throw "index.html disappeared after IIS deployment."
    }

    Write-Host "IIS deployment validation passed."

    # --------------------------------------------------------
    # Record deployed version
    # --------------------------------------------------------

    $FrontendResponse = Invoke-WebRequest `
        -Uri "http://127.0.0.1/" `
        -UseBasicParsing `
        -TimeoutSec 15

    if ($FrontendResponse.StatusCode -ne 200) {
        throw "Local frontend HTTP validation failed."
    }

    Set-Content `
        -Path $CurrentReleaseFile `
        -Value $ReleaseId `
        -Encoding UTF8

    Write-Host "Current release recorded:"
    Write-Host $ReleaseId
}
catch {

    Write-Host ""
    Write-Host "Frontend deployment failed."
    Write-Host "Attempting rollback..."

    if (
        $PreviousPath -and
        (Test-Path $PreviousPath)
    ) {

        Set-ItemProperty `
            "IIS:\Sites\$SiteName" `
            -Name physicalPath `
            -Value $PreviousPath

        $Site = Get-Website -Name $SiteName
        $AppPoolName = $Site.applicationPool

        if ($AppPoolName) {
            Restart-WebAppPool `
                -Name $AppPoolName
        }

        Write-Host "Rollback completed."
        Write-Host "Restored:"
        Write-Host $PreviousPath
    }
    else {
        Write-Host (
            "No valid previous IIS path was available " +
            "for rollback."
        )
    }

    throw
}

# ------------------------------------------------------------
# Remove older releases
# ------------------------------------------------------------

Write-Host "Cleaning old frontend releases..."

$CurrentPhysicalPath = `
    (Get-Website -Name $SiteName).physicalPath

$ReleaseDirectories = Get-ChildItem `
    -Path $ReleasesRoot `
    -Directory |
    Where-Object {
        $_.Name -notlike "*.staging"
    } |
    Sort-Object LastWriteTime `
        -Descending

$ProtectedPaths = @(
    $CurrentPhysicalPath
    $PreviousPath
) |
Where-Object {
    $_
} |
ForEach-Object {
    [System.IO.Path]::GetFullPath($_).TrimEnd("\")
}

$Counter = 0

foreach ($Directory in $ReleaseDirectories) {

    $FullPath = `
        [System.IO.Path]::GetFullPath(
            $Directory.FullName
        ).TrimEnd("\")

    if ($ProtectedPaths -contains $FullPath) {
        continue
    }

    $Counter++

    if ($Counter -ge $KeepReleases) {

        Write-Host "Removing old release:"
        Write-Host $Directory.FullName

        Remove-Item `
            -Path $Directory.FullName `
            -Recurse `
            -Force
    }
}

Write-Host ""
Write-Host "========================================="
Write-Host "Frontend deployment completed successfully"
Write-Host "Release: $ReleaseId"
Write-Host "DEPLOYMENT_RESULT=SUCCESS"
Write-Host "========================================="
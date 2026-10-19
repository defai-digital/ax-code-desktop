# AX Code Desktop bootstrap for native Windows x64. PowerShell 5.1 or newer.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# The Windows PowerShell 5.1 progress bar makes large Invoke-WebRequest downloads
# crawl to the point of looking frozen; suppress it for the duration of the script.
$ProgressPreference = 'SilentlyContinue'
$Base = 'https://download.automatosx.com/ax-code-desktop'
$PublicKey = 'RWSlDu++afxCz01OqhYWhfo8+L8pVbSYXJBEb2zoWBuK0WACIzbGVZRO'
$NativeArchitecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($env:OS -ne 'Windows_NT' -or $NativeArchitecture -ne 'AMD64') {
    throw 'AX Code Desktop supports native Windows x64 only; Windows ARM64 is unsupported.'
}
# Read the native OS architecture as well, including x64-emulated processes.
if (-not ('AxDesktopNativeSystemInfo' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AxDesktopNativeSystemInfo {
    [DllImport("kernel32.dll")]
    public static extern void GetNativeSystemInfo(IntPtr info);
}
'@
}
$SystemInfo = [Runtime.InteropServices.Marshal]::AllocHGlobal(64)
try {
    [AxDesktopNativeSystemInfo]::GetNativeSystemInfo($SystemInfo)
    if ([Runtime.InteropServices.Marshal]::ReadInt16($SystemInfo) -ne 9) { throw 'Native Windows x64 is required; Windows ARM64 is unsupported.' }
} finally {
    [Runtime.InteropServices.Marshal]::FreeHGlobal($SystemInfo)
}
# Add TLS 1.2 without removing protocols (such as TLS 1.3) the system already enables.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$Temporary = Join-Path ([IO.Path]::GetTempPath()) ('ax-code-desktop-install-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Temporary | Out-Null
function Download([string]$Url, [string]$Destination) {
    if (-not $Url.StartsWith('https://', [StringComparison]::Ordinal)) { throw 'HTTPS is required' }
    # Reject redirects rather than downgrade or leave the release origin silently.
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination -MaximumRedirection 0 -TimeoutSec 600
}
function Hash([string]$File) { return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() }
try {
    $VerifierArchive = Join-Path $Temporary 'minisign.zip'
    # GitHub release downloads redirect to their authenticated asset CDN.
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/jedisct1/minisign/releases/download/0.12/minisign-0.12-win64.zip' -OutFile $VerifierArchive -TimeoutSec 120
    if ((Hash $VerifierArchive) -ne '37b600344e20c19314b2e82813db2bfdcc408b77b876f7727889dbd46d539479') { throw 'Verifier SHA-256 mismatch' }
    Expand-Archive -LiteralPath $VerifierArchive -DestinationPath (Join-Path $Temporary 'verifier')
    $Verifier = Join-Path $Temporary 'verifier/minisign-win64/x86_64/minisign.exe'
    function SignedDownload([string]$Url, [string]$Destination) {
        Download $Url $Destination
        Download ($Url + '.minisig') ($Destination + '.minisig')
        & $Verifier -Vm $Destination -x ($Destination + '.minisig') -P $PublicKey | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Invalid release signature' }
    }
    $Latest = Join-Path $Temporary 'latest.txt'
    Write-Output 'AX Code Desktop: resolving the latest signed release...'
    SignedDownload ($Base + '/latest.txt') $Latest
    $Tag = [IO.File]::ReadAllText($Latest).TrimEnd("`n")
    if ($Tag -cnotmatch '^v[0-9]+\.[0-9]+\.[0-9]+$') { throw 'Invalid stable release tag' }
    $Version = $Tag.Substring(1)
    $Release = $Base + '/releases/download/' + $Tag
    $Manifest = Join-Path $Temporary 'release.tsv'
    SignedDownload ($Release + '/release.tsv') $Manifest
    $Rows = [IO.File]::ReadAllLines($Manifest)
    if ($Rows.Count -ne 5) { throw 'Invalid installer inventory' }
    $Header = $Rows[0].Split("`t")
    if ($Header.Count -ne 3 -or $Header[0] -cne 'release' -or $Header[1] -cne $Tag -or $Header[2] -cnotmatch '^[a-f0-9]{40}$') { throw 'Invalid release header' }
    $Names = @{
        'darwin-arm64' = "AX-Code-$Version-mac-arm64.dmg"
        'win32-x64' = "AX-Code-$Version-win-x64.exe"
        'linux-x64' = "AX-Code-$Version-linux-amd64.deb"
        'linux-arm64' = "AX-Code-$Version-linux-arm64.deb"
    }
    $Seen = @{}
    $InstallerRow = $null
    foreach ($Line in $Rows[1..4]) {
        $Row = $Line.Split("`t")
        if ($Row.Count -ne 4 -or -not $Names.ContainsKey($Row[0]) -or $Seen.ContainsKey($Row[0]) -or
            $Row[1] -cne $Names[$Row[0]] -or $Row[2] -cnotmatch '^[1-9][0-9]*$' -or $Row[3] -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid installer inventory' }
        $Seen[$Row[0]] = $true
        if ($Row[0] -ceq 'win32-x64') { $InstallerRow = $Row }
    }
    if ($null -eq $InstallerRow) { throw 'Missing Windows x64 installer' }
    $Ready = Join-Path $Temporary 'release-ready.txt'
    SignedDownload ($Release + '/release-ready.txt') $Ready
    $ExpectedReady = $Tag + "`n" + $Header[2] + "`n" + (Hash $Manifest) + "`n"
    if ([IO.File]::ReadAllText($Ready) -cne $ExpectedReady) { throw 'Release is not ready for this manifest' }
    $Installer = Join-Path $Temporary $InstallerRow[1]
    Write-Output "AX Code Desktop: downloading AX-Code-$Version-win-x64.exe ($([math]::Round([long]$InstallerRow[2] / 1MB)) MB)..."
    SignedDownload ($Release + '/' + $InstallerRow[1]) $Installer
    Write-Output 'AX Code Desktop: verifying the installer hash and signature...'
    if ((Get-Item -LiteralPath $Installer).Length -ne [long]$InstallerRow[2]) { throw 'Installer size mismatch' }
    if ((Hash $Installer) -cne $InstallerRow[3]) { throw 'Installer SHA-256 mismatch' }
    $Signature = Get-AuthenticodeSignature -LiteralPath $Installer
    if ($Signature.Status -ne 'Valid' -or $null -eq $Signature.SignerCertificate -or
        $Signature.SignerCertificate.Thumbprint -ne 'FC40F1109912C025E751E804AA9BD1538A2D12EF') { throw 'Unexpected Windows Authenticode signature' }
    if (Get-Process -Name 'AX Code' -ErrorAction SilentlyContinue) { throw 'Close AX Code before installing' }
    Write-Output 'AX Code Desktop: opening the installer - complete the installer window to finish.'
    # With -Wait, Windows PowerShell 5.1 Start-Process waits for every process in the
    # installer's job, including AX Code when the finish page launches it, so the
    # console would hang until the app closes. Wait for the installer itself only.
    $Process = Start-Process -FilePath $Installer -PassThru
    # Read the handle before exit so Windows PowerShell keeps the exit code.
    $null = $Process.Handle
    $Process.WaitForExit()
    if ($Process.ExitCode -notin @(0, 3010)) { throw "NSIS installation failed: $($Process.ExitCode)" }
    Write-Output "Installed AX Code Desktop $Version. User data and credentials were preserved."
} finally {
    # Antivirus can briefly hold verified installer files. Cleanup must not replace
    # installation success or the original verification/installer error.
    Remove-Item -LiteralPath $Temporary -Recurse -Force -ErrorAction SilentlyContinue
}

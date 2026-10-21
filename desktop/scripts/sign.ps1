<#
.SYNOPSIS
    Authenticode-sign a file with a code-signing certificate from a PFX.

.DESCRIPTION
    The PFX password is read from the MEMMON_SIGN_PASSWORD environment variable so it never
    appears on a command line. After signing, the script checks that the file's signature was
    made by that certificate. A certificate from a trusted CA (or Azure Trusted Signing) is what
    makes SmartScreen trust the app; a self-signed one only proves the pipeline works.
#>
param(
    [Parameter(Mandatory = $true)][string]$File,
    [Parameter(Mandatory = $true)][string]$PfxPath,
    [string]$TimestampServer = 'http://timestamp.digicert.com'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$password = [Environment]::GetEnvironmentVariable('MEMMON_SIGN_PASSWORD')
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($PfxPath, $password)
if (-not $cert.HasPrivateKey) { throw 'the PFX has no private key' }
$isCodeSigning = $cert.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } |
    ForEach-Object { $_.EnhancedKeyUsages } | Where-Object { $_.Value -eq '1.3.6.1.5.5.7.3.3' }
if (-not $isCodeSigning) { throw 'the certificate is not valid for code signing' }

$options = @{ FilePath = $File; Certificate = $cert; HashAlgorithm = 'SHA256' }
if ($TimestampServer) { $options['TimestampServer'] = $TimestampServer }
$null = Set-AuthenticodeSignature @options

$signature = Get-AuthenticodeSignature -FilePath $File
if ($null -eq $signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint -ne $cert.Thumbprint) {
    throw "signing failed: $($signature.StatusMessage)"
}
$timestamped = $null -ne $signature.TimeStamperCertificate
"signed by $($cert.Subject) (status: $($signature.Status), timestamped: $timestamped)"

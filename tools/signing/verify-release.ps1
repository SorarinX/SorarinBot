param(
    [Parameter(Mandatory = $true)]
    [string[]] $Path
)

$failed = 0

foreach ($item in $Path) {
    if (-not (Test-Path -LiteralPath $item -PathType Leaf)) {
        Write-Host "MISSING  $item" -ForegroundColor Red
        $failed++
        continue
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $item
    $stamp = if ($signature.TimeStamperCertificate) { 'timestamped' } else { 'NO TIMESTAMP' }

    if ($signature.Status -eq 'Valid') {
        Write-Host ("VALID    {0}  [{1}]  {2}" -f $item, $signature.SignerCertificate.Subject, $stamp) -ForegroundColor Green
    } else {
        Write-Host ("INVALID  {0}  [{1}]  {2}" -f $item, $signature.Status, $stamp) -ForegroundColor Red
        $failed++
    }
}

if ($failed -gt 0) {
    Write-Host "$failed file(s) failed verification" -ForegroundColor Red
    exit 1
}

Write-Host "all files are validly signed" -ForegroundColor Green

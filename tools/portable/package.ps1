param(
    [Parameter(Mandatory = $true)]
    [string] $Version,
    [string] $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string] $ExePath = '',
    [string] $OutDir = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ExePath)) {
    $ExePath = Join-Path $RepoRoot 'SorarinBot.exe'
}
if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $RepoRoot 'artifacts\portable'
}

$stage = Join-Path ([IO.Path]::GetTempPath()) ("sorarinbot-portable-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage -Force | Out-Null

try {
    Copy-Item -LiteralPath $ExePath -Destination (Join-Path $stage 'SorarinBot.exe')
    New-Item -ItemType File -Path (Join-Path $stage 'config.yaml') -Force | Out-Null

    foreach ($name in @('LICENSE', 'NOTICE', 'PRIVACY.md', 'README.md', 'README.zh-CN.md', 'THIRD_PARTY_NOTICES.md')) {
        Copy-Item -LiteralPath (Join-Path $RepoRoot $name) -Destination $stage
    }

    New-Item -ItemType Directory -Path (Join-Path $stage 'internal\openwechat') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $RepoRoot 'internal\openwechat\LICENSE') -Destination (Join-Path $stage 'internal\openwechat\LICENSE')

    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    $zip = Join-Path $OutDir ("SorarinBot-v{0}-win64-portable.zip" -f $Version)
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal

    $item = Get-Item -LiteralPath $zip
    $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Output ("portable: {0}" -f $item.FullName)
    Write-Output ("size: {0}" -f $item.Length)
    Write-Output ("sha256: {0}" -f $hash)
} finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}

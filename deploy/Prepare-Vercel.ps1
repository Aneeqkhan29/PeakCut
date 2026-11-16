param(
    [Parameter(Mandatory = $true)]
    [uri]$BackendUrl,
    [switch]$ReplaceStatic
)
$ErrorActionPreference = 'Stop'
if ($BackendUrl.Scheme -ne 'https' -or -not $BackendUrl.Host -or
    $BackendUrl.UserInfo -or $BackendUrl.Query -or $BackendUrl.Fragment -or
    $BackendUrl.AbsolutePath -ne '/') {
    throw 'Use the HTTPS origin of your backend, for example https://backend.example.com (no path or credentials).'
}
$root = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root 'vercel.json'
if (Test-Path -LiteralPath $target) {
    $existing = Get-Content -LiteralPath $target -Raw | ConvertFrom-Json
    if (-not $ReplaceStatic -or $existing.buildCommand -ne 'node deploy/build-vercel.mjs') {
        throw 'vercel.json already exists. Use -ReplaceStatic only to replace the static website configuration.'
    }
}
$origin = $BackendUrl.GetLeftPart([System.UriPartial]::Authority)
$config = [ordered]@{
    '$schema' = 'https://openapi.vercel.sh/vercel.json'
    framework = $null
    buildCommand = ''
    installCommand = ''
    outputDirectory = 'web'
    routes = @(@{ src = '/(.*)'; dest = "$origin/`$1" })
}
[System.IO.File]::WriteAllText($target, ($config | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
Write-Host 'Created vercel.json. Review it, then deploy with: npx vercel --prod'

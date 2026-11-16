$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
Set-Location $PSScriptRoot
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'Install first: python -m venv .venv, then .\.venv\Scripts\python.exe -m pip install -r requirements.txt'
}
& $python -m studio.server
exit $LASTEXITCODE

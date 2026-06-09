$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\nodejs;$env:Path"
Set-Location -LiteralPath $PSScriptRoot
node ".\node_modules\next\dist\bin\next" start -H 0.0.0.0 -p 3000

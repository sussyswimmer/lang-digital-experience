# Slight PhotoCraft edit of the upscaled team photos (headless photocraft-cli).
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File photocraft\run_slight_edit.ps1
$ErrorActionPreference = "Stop"
$cli = "C:\Program Files\PhotoCraft\photocraft-cli.exe"
if (-not (Test-Path $cli)) { $cli = (Get-Command photocraft-cli -ErrorAction Stop).Source }
$in = Resolve-Path "raw-assets\photos\upscaled"
$out = Join-Path (Get-Location) "raw-assets\photos\edited"
New-Item -ItemType Directory -Force $out | Out-Null
$special = @{ "p3-poem.jpg" = "photocraft\nonla-slight-nosharpen.json"; "p2-chin-straps.jpg" = "photocraft\nonla-slight-denoise.json" }
$manifest = @()
Get-ChildItem $in -Filter *.jpg | Sort-Object Name | ForEach-Object {
  $recipe = if ($special.ContainsKey($_.Name)) { $special[$_.Name] } else { "photocraft\nonla-slight.json" }
  $steps = Get-Content $recipe -Raw | ConvertFrom-Json
  $cliArgs = @("run", $_.FullName)
  foreach ($s in $steps) {
    $params = $s[1] | ConvertTo-Json -Compress
    # Windows PowerShell 5.1 (legacy native argument passing) strips unescaped inner quotes from native args
    if ($PSNativeCommandArgumentPassing -notin "Standard", "Windows") { $params = $params -replace '"', '\"' }
    $cliArgs += @("--cmd", $s[0], "--params", $params)
  }
  $dest = Join-Path $out $_.Name
  $cliArgs += @("--out", $dest, "--quality", "92", "--jpeg-format", "progressive")
  & $cli @cliArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "photocraft-cli failed on $($_.Name) (exit $LASTEXITCODE)" }
  $info = & $cli info $dest --compact | ConvertFrom-Json
  $manifest += [ordered]@{
    file = $_.Name; recipe = (Split-Path $recipe -Leaf); bytes = (Get-Item $dest).Length
    width = $(if ($info.width) { $info.width } else { $info.size.width })
    height = $(if ($info.height) { $info.height } else { $info.size.height })
    sha256 = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
    source_sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
  }
  Write-Host "edited $($_.Name) with $recipe"
}
# UTF-8 without BOM and LF endings: 5.1's Set-Content -Encoding utf8 adds a BOM (breaks JSON.parse), and git stores LF
$json = ($manifest | ConvertTo-Json -Depth 4).Replace("`r`n", "`n") + "`n"
[IO.File]::WriteAllText((Join-Path $out "manifest.json"), $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host "done: $($manifest.Count) photos"

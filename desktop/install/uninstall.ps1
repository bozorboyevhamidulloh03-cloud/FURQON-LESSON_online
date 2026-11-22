# FURQON Online — o'chirish. Darslaringiz (brauzer ma'lumotlari) va yozuvlaringiz (Videolar\FURQON Recordings) saqlanib qoladi.
$name = 'FURQON Online'; $dest = Join-Path $env:LOCALAPPDATA "Programs\$name"
Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) { Remove-Item (Join-Path $dir "$name.lnk") -Force -ErrorAction SilentlyContinue }
Remove-Item 'HKCU:\Software\Classes\FURQON.fur' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'HKCU:\Software\Classes\.fur' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FURQON Online' -Recurse -Force -ErrorAction SilentlyContinue
# o'z papkamizni keyin o'chiramiz (skript shu papkada turibdi)
Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -Command Start-Sleep 2; Remove-Item -LiteralPath '$dest' -Recurse -Force"
Write-Host "$name o'chirildi." -ForegroundColor Yellow

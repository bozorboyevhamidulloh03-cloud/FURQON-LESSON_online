# FURQON Online — o'rnatish (administrator huquqi shart emas). Windows 10/11.
$ErrorActionPreference = 'Stop'
$src  = Split-Path -Parent $MyInvocation.MyCommand.Path
$name = 'FURQON Online'
$dest = Join-Path $env:LOCALAPPDATA "Programs\$name"
Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Path (Join-Path $src '*') -Destination $dest -Recurse -Force
$exe = Join-Path $dest "$name.exe"
$ico = Join-Path $dest 'fur.ico'
# yorliqlar: ish stoli va Start menyu
$sh = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {
  $lnk = $sh.CreateShortcut((Join-Path $dir "$name.lnk")); $lnk.TargetPath = $exe; $lnk.WorkingDirectory = $dest; $lnk.IconLocation = "$exe,0"; $lnk.Save()
}
# .fur fayllarni FURQON bilan ochish ("Open with" ro'yxatida chiqadi va ikki marta bosganda ochiladi)
$cls = 'HKCU:\Software\Classes'
New-Item -Path "$cls\.fur" -Force | Out-Null
Set-ItemProperty -Path "$cls\.fur" -Name '(default)' -Value 'FURQON.fur'
New-Item -Path "$cls\.fur\OpenWithProgids" -Force | Out-Null
New-ItemProperty -Path "$cls\.fur\OpenWithProgids" -Name 'FURQON.fur' -Value ([byte[]]@()) -PropertyType None -Force | Out-Null
New-Item -Path "$cls\FURQON.fur" -Force | Out-Null
Set-ItemProperty -Path "$cls\FURQON.fur" -Name '(default)' -Value 'FURQON dars fayli'
New-Item -Path "$cls\FURQON.fur\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$cls\FURQON.fur\DefaultIcon" -Name '(default)' -Value $ico
New-Item -Path "$cls\FURQON.fur\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$cls\FURQON.fur\shell\open\command" -Name '(default)' -Value ('"{0}" "%1"' -f $exe)
# "Dasturlar va imkoniyatlar" ro'yxatiga qo'shish (o'chirish uchun)
$un = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FURQON Online'
New-Item -Path $un -Force | Out-Null
Set-ItemProperty -Path $un -Name DisplayName -Value $name
Set-ItemProperty -Path $un -Name DisplayIcon -Value $exe
Set-ItemProperty -Path $un -Name Publisher -Value 'FURQON'
Set-ItemProperty -Path $un -Name InstallLocation -Value $dest
Set-ItemProperty -Path $un -Name UninstallString -Value ('powershell -NoProfile -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $dest 'uninstall.ps1'))
Add-Type -Namespace W -Name N -MemberDefinition '[System.Runtime.InteropServices.DllImport("shell32.dll")] public static extern void SHChangeNotify(int e,int f,System.IntPtr a,System.IntPtr b);'
[W.N]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Host "`n$name o'rnatildi: $dest" -ForegroundColor Green
Start-Process $exe

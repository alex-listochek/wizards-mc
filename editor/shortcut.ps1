# Создаёт ярлык «Редактор Wizards» в папке проекта — с путями этого компьютера.
# Нужен после переноса проекта на другой компьютер или в другую папку: старый ярлык помнит прежний путь.

$editor = $PSScriptRoot
$project = Split-Path $editor
$lnkPath = Join-Path $project 'Редактор Wizards.lnk'

$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut($lnkPath)
$lnk.TargetPath = Join-Path $editor 'start.cmd'
$lnk.WorkingDirectory = $editor
$lnk.IconLocation = (Join-Path $editor 'icon.ico') + ',0'
$lnk.Description = 'Запустить редактор базы знаний'
$lnk.WindowStyle = 7  # окно консоли свёрнуто
$lnk.Save()

Write-Host ''
Write-Host "Ярлык создан: $lnkPath" -ForegroundColor Green
Write-Host 'Его можно перетащить на рабочий стол.'

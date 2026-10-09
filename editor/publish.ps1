# Публикация сайта: сохраняет все правки в git и отправляет на GitHub.
# GitHub сам соберёт сайт и обновит его через 1–2 минуты (.github/workflows/deploy.yml).

$Host.UI.RawUI.WindowTitle = 'Публикация Wizards'
Set-Location (Split-Path $PSScriptRoot)
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { $env:Path += ";$env:ProgramFiles\Git\cmd" }

function Finish($text, $color) {
  Write-Host ''
  Write-Host $text -ForegroundColor $color
  Write-Host ''
  Read-Host 'Нажмите Enter, чтобы закрыть окно' | Out-Null
  exit
}

git -c core.safecrlf=false add -A
if ($LASTEXITCODE) { Finish 'Не получилось подготовить файлы. Пришлите текст выше.' Red }

$changed = @(git diff --cached --name-only)
if ($changed.Count) {
  Write-Host 'Изменения:' -ForegroundColor Cyan
  git -c core.quotepath=false status --short
  Write-Host ''

  # Статьи src/content/<раздел>/<имя>.md попадают в описание как раздел/имя.
  $articles = @($changed | Where-Object { $_ -like 'src/content/*.md' } | ForEach-Object { $_ -replace '^src/content/|\.md$' })
  $default = 'Обновление сайта'
  if ($articles.Count) {
    $default = 'Обновлено: ' + ($articles[0..4] -join ', ')
    if ($articles.Count -gt 5) { $default += " и ещё $($articles.Count - 5)" }
  }

  Write-Host "Опишите изменения или просто нажмите Enter — будет «$default»."
  Write-Host 'Чтобы отменить публикацию, закройте окно.'
  $msg = (Read-Host 'Описание').Trim()
  if (-not $msg) { $msg = $default }

  # Через файл, чтобы кавычки и русские буквы в описании дошли до git без искажений.
  $file = Join-Path $env:TEMP 'wizards-commit.txt'
  [IO.File]::WriteAllText($file, $msg, (New-Object Text.UTF8Encoding $false))
  git commit -q -F $file
  Remove-Item $file
  if ($LASTEXITCODE) { Finish 'Не получилось сохранить изменения. Пришлите текст выше.' Red }
}

$ahead = git rev-list --count '@{u}..HEAD' 2>$null
if ($ahead -eq '0') { Finish 'Новых изменений нет — на сайте уже последняя версия.' Green }

Write-Host ''
Write-Host 'Отправляю на GitHub...' -ForegroundColor Cyan
git push -q
if ($LASTEXITCODE) {
  Finish "Не получилось отправить. Пришлите текст выше.`nЕсли написано «rejected» — на GitHub есть правки, которых нет на этом компьютере." Red
}

$done = 'Готово! Сайт обновится через 1–2 минуты.'
if ((git remote get-url origin) -match 'github\.com[/:]([^/]+)/([^/]+?)(\.git)?$') {
  $done += "`nСайт:   https://$($Matches[1]).github.io/$($Matches[2])/"
  $done += "`nСборка: https://github.com/$($Matches[1])/$($Matches[2])/actions"
}
Finish $done Green

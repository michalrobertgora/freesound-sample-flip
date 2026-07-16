# Build and publish dist/ to the gh-pages branch (branch-mode GitHub Pages).
# Needed while GitHub Actions is locked on this account; once Actions works,
# pushes to master deploy automatically via .github/workflows/deploy.yml and
# Pages can be flipped back to workflow mode.
$ErrorActionPreference = "Stop"

npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

$tmp = Join-Path ([IO.Path]::GetTempPath()) "freesound-flip-ghpages"
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
Copy-Item -Recurse dist $tmp

Push-Location $tmp
try {
  git init -b gh-pages | Out-Null
  git add -A
  git commit -m "Deploy built site to gh-pages" | Out-Null
  git push --force https://github.com/michalrobertgora/freesound-sample-flip.git gh-pages
}
finally {
  Pop-Location
}

# Branch pushes don't always trigger the Pages build on their own; ask for one.
gh api repos/michalrobertgora/freesound-sample-flip/pages/builds -X POST | Out-Null
Write-Host "Deployed: https://michalrobertgora.github.io/freesound-sample-flip/"

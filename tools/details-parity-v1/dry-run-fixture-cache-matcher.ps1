$ErrorActionPreference = "Stop"

$fixturePath = "tools\details-parity-v1\expanded-details-fixture.json"
$cachePath = "poster-cache.json"
$report = "tools\details-parity-v1\DETAILS_8D_FIXTURE_CACHE_DRY_RUN_MATCHER.md"

function CleanTitle($value) {
  $s = [string]$value
  $s = $s.ToLower()
  $s = $s.Replace("**series**", "")
  $s = $s.Replace("**movie**", "")
  $s = $s -replace "[^a-z0-9]+", " "
  $s = $s.Trim()
  return $s
}

function HasUsefulMetadata($entry) {
  if ($null -eq $entry) { return $false }
  if ($entry.PSObject.Properties["genre"] -and [string]$entry.genre) { return $true }
  if ($entry.PSObject.Properties["runtime"] -and [string]$entry.runtime) { return $true }
  if ($entry.PSObject.Properties["language"] -and [string]$entry.language) { return $true }
  if ($entry.PSObject.Properties["director"] -and [string]$entry.director) { return $true }
  if ($entry.PSObject.Properties["productionCompanies"] -and [string]$entry.productionCompanies) { return $true }
  return $false
}

$fixtureRaw = Get-Content $fixturePath -Raw | ConvertFrom-Json
$cacheRaw = Get-Content $cachePath -Raw | ConvertFrom-Json
$rows = @($fixtureRaw)
$cacheProps = @($cacheRaw.PSObject.Properties)

$posterMatches = 0
$backdropMatches = 0
$titleMatches = 0
$anyMatches = 0
$usefulMatches = 0
$samples = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $rows.Count; $i++) {
  $row = $rows[$i]
  $title = ""
  if ($row.PSObject.Properties["title"]) { $title = [string]$row.title }
  elseif ($row.PSObject.Properties["name"]) { $title = [string]$row.name }
  elseif ($row.PSObject.Properties["key"]) { $title = [string]$row.key }

  $rowTitle = CleanTitle $title
  $matchedKey = ""
  $matchedBy = ""
  $matchedUseful = $false

  foreach ($prop in $cacheProps) {
    $entry = $prop.Value
    $cacheTitle = CleanTitle $prop.Name

    $posterHit = $false
    $backdropHit = $false
    $titleHit = $false

    if ($row.PSObject.Properties["poster"] -and $entry.PSObject.Properties["poster"] -and $row.poster -and $entry.poster -and $row.poster -eq $entry.poster) { $posterHit = $true }
    if ($row.PSObject.Properties["backdrop"] -and $entry.PSObject.Properties["backdrop"] -and $row.backdrop -and $entry.backdrop -and $row.backdrop -eq $entry.backdrop) { $backdropHit = $true }
    if ($rowTitle -and $cacheTitle -and $rowTitle -eq $cacheTitle) { $titleHit = $true }

    if ($posterHit -or $backdropHit -or $titleHit) {
      $matchedKey = $prop.Name
      if ($posterHit) { $matchedBy = "poster"; $posterMatches++ }
      elseif ($backdropHit) { $matchedBy = "backdrop"; $backdropMatches++ }
      else { $matchedBy = "title"; $titleMatches++ }
      $anyMatches++
      $matchedUseful = HasUsefulMetadata $entry
      if ($matchedUseful) { $usefulMatches++ }
      break
    }
  }

  if ($matchedKey -and $samples.Count -lt 50) {
    $samples.Add("- [$i] $title => $matchedKey | matchedBy=$matchedBy | usefulMetadata=$matchedUseful")
  }
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("StreamVault Haskell Details 8D Fixture Cache Dry Run Matcher")
$lines.Add("============================================================")
$lines.Add("")
$lines.Add("Status:")
$lines.Add("- Task type: dry-run matcher only")
$lines.Add("- Runtime/frontend/playback files changed: no")
$lines.Add("- expanded-details-fixture.json mutated: no")
$lines.Add("")
$lines.Add("Inputs:")
$lines.Add("- fixture: $fixturePath")
$lines.Add("- cache: $cachePath")
$lines.Add("")
$lines.Add("Counts:")
$lines.Add("- fixture rows: $($rows.Count)")
$lines.Add("- poster-cache entries: $($cacheProps.Count)")
$lines.Add("- poster matches: $posterMatches")
$lines.Add("- backdrop matches: $backdropMatches")
$lines.Add("- normalized title matches: $titleMatches")
$lines.Add("- any matches: $anyMatches")
$lines.Add("- matches with useful metadata: $usefulMatches")
$lines.Add("")
$lines.Add("Decision rule:")
$lines.Add("- If useful metadata matches are high enough, next task can add a guarded mutation mode.")
$lines.Add("- If useful metadata matches are low, use stronger TMDB/source metadata instead.")
$lines.Add("")
$lines.Add("Sample matches:")
if ($samples.Count -gt 0) { foreach ($sample in $samples) { $lines.Add($sample) } } else { $lines.Add("- none") }

Set-Content -Encoding UTF8 $report $lines
Get-Content $report

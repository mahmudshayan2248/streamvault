param([switch]$Apply)
$ErrorActionPreference = "Stop"

$fixturePath = "tools\details-parity-v1\expanded-details-fixture.json"
$cachePath = "poster-cache.json"
$report = "tools\details-parity-v1\DETAILS_8G_GUARDED_FIXTURE_ENRICHER.md"
$previewPath = Join-Path $env:TEMP "sv-details-enrichment-preview-8g.json"
$backupPath = Join-Path $env:TEMP ("sv-expanded-details-fixture-backup-8g-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
$targetFields = @("genre","runtime","language","director","productionCompanies")

function CleanTitle($value) {
  $s = [string]$value
  $s = $s.ToLower()
  $s = $s.Replace("**series**", "")
  $s = $s.Replace("**movie**", "")
  $s = $s -replace "[^a-z0-9]+", " "
  return $s.Trim()
}

function GetField($obj, $name) {
  if ($null -eq $obj) { return $null }
  $p = $obj.PSObject.Properties[$name]
  if ($null -eq $p) { return $null }
  return $p.Value
}

function SetField($obj, $name, $value) {
  $p = $obj.PSObject.Properties[$name]
  if ($null -eq $p) {
    $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value
  } else {
    $obj.$name = $value
  }
}

function HasValue($value) {
  if ($null -eq $value) { return $false }
  if ($value -is [System.Array]) { return $value.Count -gt 0 }
  $s = [string]$value
  return $s.Trim().Length -gt 0
}

function CloneObject($obj) {
  return ($obj | ConvertTo-Json -Depth 80 | ConvertFrom-Json)
}

if ($Apply) {
  if ($env:SV_DETAILS_ENRICHMENT_APPLY -ne "YES_I_ACCEPT_FIXTURE_MUTATION") {
    throw "Apply mode blocked. Set SV_DETAILS_ENRICHMENT_APPLY=YES_I_ACCEPT_FIXTURE_MUTATION to mutate fixture."
  }
}

$fixtureRaw = Get-Content $fixturePath -Raw | ConvertFrom-Json
$cacheRaw = Get-Content $cachePath -Raw | ConvertFrom-Json
$rows = @($fixtureRaw)
$cacheProps = @($cacheRaw.PSObject.Properties)

$posterMatches = 0
$backdropMatches = 0
$titleMatches = 0
$anyMatches = 0
$candidateRows = 0
$fieldCounts = @{}
foreach ($field in $targetFields) { $fieldCounts[$field] = 0 }
$samples = New-Object System.Collections.Generic.List[string]
$enrichedRows = New-Object System.Collections.Generic.List[object]

for ($i = 0; $i -lt $rows.Count; $i++) {
  $row = $rows[$i]
  $clone = CloneObject $row

  $title = ""
  $titleValue = GetField $row "title"
  $nameValue = GetField $row "name"
  $keyValue = GetField $row "key"
  if (HasValue $titleValue) { $title = [string]$titleValue }
  elseif (HasValue $nameValue) { $title = [string]$nameValue }
  elseif (HasValue $keyValue) { $title = [string]$keyValue }

  $rowTitle = CleanTitle $title
  $rowPoster = GetField $row "poster"
  $rowBackdrop = GetField $row "backdrop"
  $matchedKey = ""
  $matchedBy = ""
  $matchedEntry = $null

  foreach ($prop in $cacheProps) {
    $entry = $prop.Value
    $cacheTitle = CleanTitle $prop.Name
    $cachePoster = GetField $entry "poster"
    $cacheBackdrop = GetField $entry "backdrop"

    $posterHit = $false
    $backdropHit = $false
    $titleHit = $false

    if ((HasValue $rowPoster) -and (HasValue $cachePoster) -and $rowPoster -eq $cachePoster) { $posterHit = $true }
    if ((HasValue $rowBackdrop) -and (HasValue $cacheBackdrop) -and $rowBackdrop -eq $cacheBackdrop) { $backdropHit = $true }
    if ((HasValue $rowTitle) -and (HasValue $cacheTitle) -and $rowTitle -eq $cacheTitle) { $titleHit = $true }

    if ($posterHit -or $backdropHit -or $titleHit) {
      $matchedKey = $prop.Name
      $matchedEntry = $entry
      if ($posterHit) { $matchedBy = "poster"; $posterMatches++ }
      elseif ($backdropHit) { $matchedBy = "backdrop"; $backdropMatches++ }
      else { $matchedBy = "title"; $titleMatches++ }
      $anyMatches++
      break
    }
  }

  if ($matchedEntry) {
    $fillable = New-Object System.Collections.Generic.List[string]
    foreach ($field in $targetFields) {
      $rowValue = GetField $row $field
      $entryValue = GetField $matchedEntry $field
      if ((-not (HasValue $rowValue)) -and (HasValue $entryValue)) {
        SetField $clone $field $entryValue
        $fillable.Add($field)
        $fieldCounts[$field] = $fieldCounts[$field] + 1
      }
    }

    if ($fillable.Count -gt 0) {
      $candidateRows++
      if ($samples.Count -lt 50) {
        $fieldList = [string]::Join(",", @($fillable))
        $samples.Add("- [$i] $title => $matchedKey | matchedBy=$matchedBy | wouldFill=$fieldList")
      }
    }
  }

  $enrichedRows.Add($clone)
}

$enrichedRows | ConvertTo-Json -Depth 80 | Set-Content -Encoding UTF8 $previewPath

if ($Apply) {
  Copy-Item $fixturePath $backupPath -Force
  $enrichedRows | ConvertTo-Json -Depth 80 | Set-Content -Encoding UTF8 $fixturePath
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("StreamVault Haskell Details 8G Guarded Fixture Enricher")
$lines.Add("=======================================================")
$lines.Add("")
$lines.Add("Status:")
$lines.Add("- Task type: guarded enrichment tool")
$lines.Add("- Runtime/frontend/playback files changed: no")
$lines.Add("- apply mode enabled: $Apply")
$lines.Add("- expanded-details-fixture.json mutated: $Apply")
$lines.Add("")
$lines.Add("Inputs:")
$lines.Add("- fixture: $fixturePath")
$lines.Add("- cache: $cachePath")
$lines.Add("- preview output: $previewPath")
$lines.Add("- backup output when apply mode is used: $backupPath")
$lines.Add("")
$lines.Add("Counts:")
$lines.Add("- fixture rows: $($rows.Count)")
$lines.Add("- poster-cache entries: $($cacheProps.Count)")
$lines.Add("- poster matches: $posterMatches")
$lines.Add("- backdrop matches: $backdropMatches")
$lines.Add("- normalized title matches: $titleMatches")
$lines.Add("- any matches: $anyMatches")
$lines.Add("- candidate rows with at least one fill: $candidateRows")
$lines.Add("")
$lines.Add("Field fill candidates:")
foreach ($field in $targetFields) { $lines.Add("- ${field}: $($fieldCounts[$field])") }
$lines.Add("")
$lines.Add("Safety:")
$lines.Add("- Default run is preview-only.")
$lines.Add("- Real fixture mutation requires -Apply and SV_DETAILS_ENRICHMENT_APPLY=YES_I_ACCEPT_FIXTURE_MUTATION.")
$lines.Add("- This task ran without apply mode.")
$lines.Add("")
$lines.Add("Sample candidate rows:")
if ($samples.Count -gt 0) { foreach ($sample in $samples) { $lines.Add($sample) } } else { $lines.Add("- none") }

Set-Content -Encoding UTF8 $report $lines
Get-Content $report

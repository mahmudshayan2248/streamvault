$ErrorActionPreference = "Stop"

$fixturePath = "tools\details-parity-v1\expanded-details-fixture.json"
$cachePath = "poster-cache.json"
$report = "tools\details-parity-v1\DETAILS_8H_STRONG_MATCH_ENRICHMENT_PREVIEW.md"
$previewPath = Join-Path $env:TEMP "sv-details-strong-match-enrichment-preview-8h.json"
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

function HasValue($value) {
  if ($null -eq $value) { return $false }
  if ($value -is [System.Array]) { return $value.Count -gt 0 }
  $s = [string]$value
  return $s.Trim().Length -gt 0
}

$fixtureRaw = Get-Content $fixturePath -Raw | ConvertFrom-Json
$cacheRaw = Get-Content $cachePath -Raw | ConvertFrom-Json
$rows = @($fixtureRaw)
$cacheProps = @($cacheRaw.PSObject.Properties)

$posterStrongMatches = 0
$backdropStrongMatches = 0
$titleWeakMatches = 0
$strongMatches = 0
$weakOnlyMatches = 0
$candidateRows = 0
$fieldCounts = @{}
foreach ($field in $targetFields) { $fieldCounts[$field] = 0 }
$samples = New-Object System.Collections.Generic.List[string]
$weakSamples = New-Object System.Collections.Generic.List[string]
$previewRows = New-Object System.Collections.Generic.List[object]

for ($i = 0; $i -lt $rows.Count; $i++) {
  $row = $rows[$i]

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
  $weakMatchedKey = ""

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

    if ($posterHit -or $backdropHit) {
      $matchedKey = $prop.Name
      $matchedEntry = $entry
      if ($posterHit) { $matchedBy = "poster"; $posterStrongMatches++ }
      else { $matchedBy = "backdrop"; $backdropStrongMatches++ }
      $strongMatches++
      break
    }

    if ($titleHit -and (-not $weakMatchedKey)) {
      $weakMatchedKey = $prop.Name
    }
  }

  if ($matchedEntry) {
    $fillable = New-Object System.Collections.Generic.List[string]
    foreach ($field in $targetFields) {
      $rowValue = GetField $row $field
      $entryValue = GetField $matchedEntry $field
      if ((-not (HasValue $rowValue)) -and (HasValue $entryValue)) {
        $fillable.Add($field)
        $fieldCounts[$field] = $fieldCounts[$field] + 1
      }
    }

    if ($fillable.Count -gt 0) {
      $candidateRows++
      $previewRows.Add([pscustomobject][ordered]@{
        index = $i
        title = $title
        matchedKey = $matchedKey
        matchedBy = $matchedBy
        wouldFill = @($fillable)
      })

      if ($samples.Count -lt 50) {
        $fieldList = [string]::Join(",", @($fillable))
        $samples.Add("- [$i] $title => $matchedKey | strongMatch=$matchedBy | wouldFill=$fieldList")
      }
    }
  } elseif ($weakMatchedKey) {
    $titleWeakMatches++
    $weakOnlyMatches++
    if ($weakSamples.Count -lt 25) {
      $weakSamples.Add("- [$i] $title => $weakMatchedKey | weakMatch=normalizedTitleOnly | not used for fill")
    }
  }
}

$previewRows | ConvertTo-Json -Depth 80 | Set-Content -Encoding UTF8 $previewPath

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("StreamVault Haskell Details 8H Strong Match Enrichment Preview")
$lines.Add("=============================================================")
$lines.Add("")
$lines.Add("Status:")
$lines.Add("- Task type: strong-match preview-only enrichment")
$lines.Add("- Runtime/frontend/playback files changed: no")
$lines.Add("- expanded-details-fixture.json mutated: no")
$lines.Add("")
$lines.Add("Safety model:")
$lines.Add("- Poster URL and backdrop URL matches are treated as strong matches.")
$lines.Add("- Normalized title-only matches are counted but not used for field filling.")
$lines.Add("- This task writes only a temp preview output and this markdown report.")
$lines.Add("")
$lines.Add("Inputs:")
$lines.Add("- fixture: $fixturePath")
$lines.Add("- cache: $cachePath")
$lines.Add("- preview output: $previewPath")
$lines.Add("")
$lines.Add("Counts:")
$lines.Add("- fixture rows: $($rows.Count)")
$lines.Add("- poster-cache entries: $($cacheProps.Count)")
$lines.Add("- strong poster matches: $posterStrongMatches")
$lines.Add("- strong backdrop matches: $backdropStrongMatches")
$lines.Add("- strong matches total: $strongMatches")
$lines.Add("- weak normalized title-only matches: $titleWeakMatches")
$lines.Add("- weak-only matches not used for fill: $weakOnlyMatches")
$lines.Add("- candidate rows with at least one strong-fill: $candidateRows")
$lines.Add("")
$lines.Add("Field fill candidates from strong matches only:")
foreach ($field in $targetFields) { $lines.Add("- ${field}: $($fieldCounts[$field])") }
$lines.Add("")
$lines.Add("Decision rule:")
$lines.Add("- If strong-fill candidate counts are good, next task can create guarded apply branch.")
$lines.Add("- If strong-fill candidate counts are low, do not mutate the fixture.")
$lines.Add("")
$lines.Add("Sample strong-fill candidate rows:")
if ($samples.Count -gt 0) { foreach ($sample in $samples) { $lines.Add($sample) } } else { $lines.Add("- none") }
$lines.Add("")
$lines.Add("Sample weak title-only matches ignored for fill:")
if ($weakSamples.Count -gt 0) { foreach ($sample in $weakSamples) { $lines.Add($sample) } } else { $lines.Add("- none") }

Set-Content -Encoding UTF8 $report $lines
Get-Content $report

$ErrorActionPreference = "Stop"

$fixturePath = "tools\details-parity-v1\expanded-details-fixture.json"
$cachePath = "poster-cache.json"
$report = "tools\details-parity-v1\DETAILS_8I_TEMP_ENRICHED_FIXTURE_VALIDATION.md"
$previewPath = Join-Path $env:TEMP "sv-details-temp-enriched-fixture-8i.json"
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

$fixtureRaw = Get-Content $fixturePath -Raw | ConvertFrom-Json
$cacheRaw = Get-Content $cachePath -Raw | ConvertFrom-Json
$rows = @($fixtureRaw)
$cacheProps = @($cacheRaw.PSObject.Properties)

$beforeCoverage = @{}
$afterCoverage = @{}
$fillCounts = @{}
foreach ($field in $targetFields) {
  $beforeCoverage[$field] = 0
  $afterCoverage[$field] = 0
  $fillCounts[$field] = 0
}

foreach ($row in $rows) {
  foreach ($field in $targetFields) {
    if (HasValue (GetField $row $field)) { $beforeCoverage[$field] = $beforeCoverage[$field] + 1 }
  }
}

$posterStrongMatches = 0
$backdropStrongMatches = 0
$strongMatches = 0
$candidateRows = 0
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

  $rowPoster = GetField $row "poster"
  $rowBackdrop = GetField $row "backdrop"
  $matchedKey = ""
  $matchedBy = ""
  $matchedEntry = $null

  foreach ($prop in $cacheProps) {
    $entry = $prop.Value
    $cachePoster = GetField $entry "poster"
    $cacheBackdrop = GetField $entry "backdrop"

    $posterHit = $false
    $backdropHit = $false

    if ((HasValue $rowPoster) -and (HasValue $cachePoster) -and $rowPoster -eq $cachePoster) { $posterHit = $true }
    if ((HasValue $rowBackdrop) -and (HasValue $cacheBackdrop) -and $rowBackdrop -eq $cacheBackdrop) { $backdropHit = $true }

    if ($posterHit -or $backdropHit) {
      $matchedKey = $prop.Name
      $matchedEntry = $entry
      if ($posterHit) { $matchedBy = "poster"; $posterStrongMatches++ }
      else { $matchedBy = "backdrop"; $backdropStrongMatches++ }
      $strongMatches++
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
        $fillCounts[$field] = $fillCounts[$field] + 1
      }
    }

    if ($fillable.Count -gt 0) {
      $candidateRows++
      if ($samples.Count -lt 50) {
        $fieldList = [string]::Join(",", @($fillable))
        $samples.Add("- [$i] $title => $matchedKey | strongMatch=$matchedBy | wouldFill=$fieldList")
      }
    }
  }

  $enrichedRows.Add($clone)
}

$enrichedRows | ConvertTo-Json -Depth 80 | Set-Content -Encoding UTF8 $previewPath
$previewRaw = Get-Content $previewPath -Raw | ConvertFrom-Json
$previewRows = @($previewRaw)

foreach ($row in $previewRows) {
  foreach ($field in $targetFields) {
    if (HasValue (GetField $row $field)) { $afterCoverage[$field] = $afterCoverage[$field] + 1 }
  }
}

$rowCountOk = "no"
if ($previewRows.Count -eq $rows.Count) { $rowCountOk = "yes" }

$jsonValid = "yes"
try {
  $null = Get-Content $previewPath -Raw | ConvertFrom-Json
} catch {
  $jsonValid = "no"
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("StreamVault Haskell Details 8I Temp Enriched Fixture Validation")
$lines.Add("==============================================================")
$lines.Add("")
$lines.Add("Status:")
$lines.Add("- Task type: temp-only enriched fixture validation")
$lines.Add("- Runtime/frontend/playback files changed: no")
$lines.Add("- expanded-details-fixture.json mutated: no")
$lines.Add("")
$lines.Add("Inputs:")
$lines.Add("- real fixture: $fixturePath")
$lines.Add("- cache: $cachePath")
$lines.Add("- temp enriched preview: $previewPath")
$lines.Add("")
$lines.Add("Validation:")
$lines.Add("- temp preview JSON valid: $jsonValid")
$lines.Add("- temp preview row count equals fixture row count: $rowCountOk")
$lines.Add("- fixture rows: $($rows.Count)")
$lines.Add("- temp preview rows: $($previewRows.Count)")
$lines.Add("")
$lines.Add("Strong match counts:")
$lines.Add("- strong poster matches: $posterStrongMatches")
$lines.Add("- strong backdrop matches: $backdropStrongMatches")
$lines.Add("- strong matches total: $strongMatches")
$lines.Add("- candidate rows with at least one fill: $candidateRows")
$lines.Add("")
$lines.Add("Metadata coverage before and after temp enrichment:")
foreach ($field in $targetFields) {
  $before = $beforeCoverage[$field]
  $after = $afterCoverage[$field]
  $fill = $fillCounts[$field]
  $lines.Add("- ${field}: before=$before after=$after wouldFill=$fill")
}
$lines.Add("")
$lines.Add("Decision rule:")
$lines.Add("- This validates a temp enriched output only.")
$lines.Add("- Real fixture overwrite is still blocked until counts and samples are accepted.")
$lines.Add("- Next task can be guarded apply only if candidate rows and samples look correct.")
$lines.Add("")
$lines.Add("Sample temp enrichment candidates:")
if ($samples.Count -gt 0) { foreach ($sample in $samples) { $lines.Add($sample) } } else { $lines.Add("- none") }

Set-Content -Encoding UTF8 $report $lines
Get-Content $report

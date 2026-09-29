$ErrorActionPreference = "Stop"

$fixturePath = "tools\details-parity-v1\expanded-details-fixture.json"
$cachePath = "poster-cache.json"
$report = "tools\details-parity-v1\DETAILS_8J_FIXTURE_ENRICHMENT_REVIEW_PACK.md"
$outJson = "tools\details-parity-v1\out\fixture-enrichment-candidates-8j.json"
$targetFields = @("genre","runtime","language","director","productionCompanies")

New-Item -ItemType Directory -Force "tools\details-parity-v1\out" | Out-Null

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

function ToText($value) {
  if ($null -eq $value) { return "" }
  if ($value -is [System.Array]) { return [string]::Join(", ", @($value)) }
  return [string]$value
}

$fixtureRaw = Get-Content $fixturePath -Raw | ConvertFrom-Json
$cacheRaw = Get-Content $cachePath -Raw | ConvertFrom-Json
$rows = @($fixtureRaw)
$cacheProps = @($cacheRaw.PSObject.Properties)

$posterStrongMatches = 0
$backdropStrongMatches = 0
$strongMatches = 0
$candidateRows = 0
$fieldCounts = @{}
foreach ($field in $targetFields) { $fieldCounts[$field] = 0 }
$reviewRows = New-Object System.Collections.Generic.List[object]
$samples = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $rows.Count; $i++) {
  $row = $rows[$i]

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
    $candidateValues = [ordered]@{}

    foreach ($field in $targetFields) {
      $rowValue = GetField $row $field
      $entryValue = GetField $matchedEntry $field
      if ((-not (HasValue $rowValue)) -and (HasValue $entryValue)) {
        $fillable.Add($field)
        $candidateValues[$field] = $entryValue
        $fieldCounts[$field] = $fieldCounts[$field] + 1
      }
    }

    if ($fillable.Count -gt 0) {
      $candidateRows++
      $reviewRows.Add([pscustomobject][ordered]@{
        index = $i
        title = $title
        matchedKey = $matchedKey
        matchedBy = $matchedBy
        fixturePoster = ToText $rowPoster
        fixtureBackdrop = ToText $rowBackdrop
        wouldFill = @($fillable)
        values = [pscustomobject]$candidateValues
      })

      if ($samples.Count -lt 80) {
        $fieldList = [string]::Join(",", @($fillable))
        $samples.Add("- [$i] $title => $matchedKey | strongMatch=$matchedBy | wouldFill=$fieldList")
      }
    }
  }
}

$reviewRows | ConvertTo-Json -Depth 80 | Set-Content -Encoding UTF8 $outJson

$jsonValid = "yes"
try {
  $null = Get-Content $outJson -Raw | ConvertFrom-Json
} catch {
  $jsonValid = "no"
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("StreamVault Haskell Details 8J Fixture Enrichment Review Pack")
$lines.Add("============================================================")
$lines.Add("")
$lines.Add("Status:")
$lines.Add("- Task type: persistent review pack only")
$lines.Add("- Runtime/frontend/playback files changed: no")
$lines.Add("- expanded-details-fixture.json mutated: no")
$lines.Add("")
$lines.Add("Outputs:")
$lines.Add("- candidate review JSON: $outJson")
$lines.Add("- report: $report")
$lines.Add("")
$lines.Add("Validation:")
$lines.Add("- candidate review JSON valid: $jsonValid")
$lines.Add("")
$lines.Add("Counts:")
$lines.Add("- fixture rows: $($rows.Count)")
$lines.Add("- poster-cache entries: $($cacheProps.Count)")
$lines.Add("- strong poster matches: $posterStrongMatches")
$lines.Add("- strong backdrop matches: $backdropStrongMatches")
$lines.Add("- strong matches total: $strongMatches")
$lines.Add("- candidate rows with at least one fill: $candidateRows")
$lines.Add("")
$lines.Add("Field fill candidates from strong matches only:")
foreach ($field in $targetFields) { $lines.Add("- ${field}: $($fieldCounts[$field])") }
$lines.Add("")
$lines.Add("Safety:")
$lines.Add("- This creates a review file only.")
$lines.Add("- It does not overwrite expanded-details-fixture.json.")
$lines.Add("- Next task should only apply changes after this review pack looks correct.")
$lines.Add("")
$lines.Add("Sample review candidates:")
if ($samples.Count -gt 0) { foreach ($sample in $samples) { $lines.Add($sample) } } else { $lines.Add("- none") }

Set-Content -Encoding UTF8 $report $lines
Get-Content $report

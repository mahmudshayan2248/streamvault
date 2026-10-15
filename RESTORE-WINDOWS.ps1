[CmdletBinding()]
param(
 [string]$Snapshot=$PSScriptRoot,
 [string]$Target=(Join-Path $env:USERPROFILE 'streamvault-stage2-isolated-restore'),
 [ValidateSet('frontend','backend','database','persistent')][string]$Component='frontend',
 [string]$PrivateKey,
 [switch]$Apply,
 [switch]$DryRun,
 [switch]$Verify
)
$ErrorActionPreference='Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22+ first.' }
$restoreArgs=@((Join-Path $Snapshot 'restore/restore.js'),'--snapshot',$Snapshot,'--target',$Target,'--component',$Component)
if ($PrivateKey) {$restoreArgs+=@('--private-key',$PrivateKey)}
if ($Apply) {$restoreArgs+='--apply'} else {$restoreArgs+='--dry-run'}
if ($Verify) {$restoreArgs+='--verify'}
& node @restoreArgs
if ($LASTEXITCODE -ne 0) {throw "Restore exited $LASTEXITCODE"}

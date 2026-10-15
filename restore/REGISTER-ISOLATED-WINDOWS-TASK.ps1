[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$Backend,[string]$TaskName='StreamVault-GS2-Isolated',[switch]$Apply)
$ErrorActionPreference='Stop'
if ($TaskName -notlike 'StreamVault-GS2-Isolated*') {throw 'Use a separate isolated task name.'}
if (-not (Test-Path (Join-Path $Backend 'server.js'))) {throw 'Verified backend capture missing.'}
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {throw 'Task already exists; no overwrite.'}
$node=(Get-Command node -ErrorAction Stop).Source
$action=New-ScheduledTaskAction -Execute $node -Argument 'server.js' -WorkingDirectory $Backend
if (-not $Apply) {Write-Output "DRY-RUN: register $TaskName at $Backend; do not start it";return}
if ($PSCmdlet.ShouldProcess($TaskName,'Register a separate task without starting it')) {
 Register-ScheduledTask -TaskName $TaskName -Action $action -Description 'Isolated GS2 restore; configure private environment before manual start' -User $env:USERNAME
}

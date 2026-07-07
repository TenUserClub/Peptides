# Registers Windows Task Scheduler jobs for the peptide SEO pipeline.
# Run once from an elevated PowerShell:  powershell -ExecutionPolicy Bypass -File .\setup-scheduler.ps1
# Re-running updates existing tasks. Remove all with:  .\setup-scheduler.ps1 -Uninstall

param([switch]$Uninstall)

$Root = $PSScriptRoot
$Prefix = "PeptideSEO"

# Claude Code headless flags: adjust --allowedTools if a stage gets blocked on permissions.
$ClaudeFlags = '--permission-mode acceptEdits --allowedTools "Bash(node:*)" "Bash(npm:*)" "Bash(git:*)" "Read" "Write" "Edit" "Glob" "Grep" "WebFetch"'

$Tasks = @(
    @{ Name = "fetch-news";     Times = @("01:00", "09:00", "17:00"); Cmd = "node pipeline\scripts\exa-fetch.mjs news" },
    @{ Name = "fetch-clinics";  Times = @("02:00");                   Cmd = "node pipeline\scripts\exa-fetch.mjs clinics" },
    @{ Name = "fetch-doctors";  Times = @("02:30");                   Cmd = "node pipeline\scripts\exa-fetch.mjs doctors" },
    @{ Name = "verify";         Times = @("03:00");                   Cmd = "claude -p `"Read and execute pipeline/prompts/verify.md`" $ClaudeFlags" },
    @{ Name = "write-clinics";  Times = @("04:00");                   Cmd = "claude -p `"Read and execute pipeline/prompts/write-clinics.md`" $ClaudeFlags" },
    @{ Name = "write-doctors";  Times = @("04:30");                   Cmd = "claude -p `"Read and execute pipeline/prompts/write-doctors.md`" $ClaudeFlags" },
    @{ Name = "write-news";     Times = @("01:30", "09:30", "17:30"); Cmd = "claude -p `"Read and execute pipeline/prompts/write-news.md`" $ClaudeFlags" },
    @{ Name = "write-updates";  Times = @("05:00"); Weekly = "Sunday"; Cmd = "claude -p `"Read and execute pipeline/prompts/write-updates.md`" $ClaudeFlags" },
    @{ Name = "humanise";       Times = @("05:30", "10:00", "18:00"); Cmd = "claude -p `"Read and execute pipeline/prompts/humanise.md`" $ClaudeFlags" },
    @{ Name = "publish";        Times = @("06:00", "10:30", "18:30"); Cmd = "claude -p `"Read and execute pipeline/prompts/publish.md`" $ClaudeFlags" },
    @{ Name = "monitor";        Times = @("06:30");                   Cmd = "claude -p `"Read and execute pipeline/prompts/monitor.md`" $ClaudeFlags" }
)

if ($Uninstall) {
    foreach ($t in $Tasks) {
        Unregister-ScheduledTask -TaskName "$Prefix-$($t.Name)" -Confirm:$false -ErrorAction SilentlyContinue
        Write-Host "Removed $Prefix-$($t.Name)"
    }
    exit 0
}

foreach ($t in $Tasks) {
    $action = New-ScheduledTaskAction -Execute "cmd.exe" `
        -Argument "/c cd /d `"$Root`" && $($t.Cmd) >> pipeline\logs\scheduler.log 2>&1" `
        -WorkingDirectory $Root

    $triggers = foreach ($time in $t.Times) {
        if ($t.Weekly) {
            New-ScheduledTaskTrigger -Weekly -DaysOfWeek $t.Weekly -At $time
        } else {
            New-ScheduledTaskTrigger -Daily -At $time
        }
    }

    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew

    Register-ScheduledTask -TaskName "$Prefix-$($t.Name)" -Action $action `
        -Trigger $triggers -Settings $settings -Force | Out-Null
    Write-Host "Registered $Prefix-$($t.Name) at $($t.Times -join ', ')$(if ($t.Weekly) { " ($($t.Weekly))" })"
}

Write-Host "`nDone. Tasks run when the laptop is on; -StartWhenAvailable catches missed runs after wake."
Write-Host "Prerequisites: 'node' and 'claude' must be on PATH for cmd.exe; .env filled in at repo root."

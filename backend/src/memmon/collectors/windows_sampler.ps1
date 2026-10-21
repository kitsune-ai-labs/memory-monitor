<#
.SYNOPSIS
    Read-only memory sampler for Memory Monitor.

.DESCRIPTION
    Reads one command per line from stdin:
        s   write one JSON sample line to stdout
        q   exit
    Any other line is ignored. The sampler only reads performance counters and the process
    list; it takes no other input and changes nothing on the system.

    Output line (all sizes in bytes):
        {"v":1,"mem":{...},"procs":[{"pid","name","bytes"}],"gpuProcs":[{"pid","name","bytes"}]}
    or, if a sample fails:
        {"v":1,"error":"<message>"}
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$utf8 = New-Object System.Text.UTF8Encoding($false)
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)
$stdout = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$stdout.AutoFlush = $true

$memoryCounters = @{}
foreach ($counterName in 'Available Bytes', 'Committed Bytes', 'Commit Limit', 'Cache Bytes') {
    $memoryCounters[$counterName] = New-Object System.Diagnostics.PerformanceCounter('Memory', $counterName, $true)
}

# Per-process GPU memory is the counter Task Manager uses. It is missing on some systems
# (old drivers, no WDDM 2.x GPU), in which case GPU process lists are simply empty.
$gpuCategory = $null
try {
    $gpuCategory = New-Object System.Diagnostics.PerformanceCounterCategory('GPU Process Memory')
    $null = $gpuCategory.ReadCategory()
}
catch {
    $gpuCategory = $null
}

function Get-Sample {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem -Property TotalVisibleMemorySize

    $names = @{}
    $procs = New-Object System.Collections.Generic.List[object]
    foreach ($p in Get-Process) {
        $names[[int]$p.Id] = $p.ProcessName
        if ($p.WorkingSet64 -gt 0) {
            $procs.Add([ordered]@{ pid = [int]$p.Id; name = $p.ProcessName; bytes = [long]$p.WorkingSet64 })
        }
    }

    $gpuProcs = New-Object System.Collections.Generic.List[object]
    if ($null -ne $gpuCategory) {
        $dedicated = $gpuCategory.ReadCategory()['Dedicated Usage']
        foreach ($sample in $dedicated.Values) {
            if ($sample.InstanceName -match '^pid_(\d+)_' -and $sample.RawValue -gt 0) {
                $gpuPid = [int]$Matches[1]
                $name = if ($names.ContainsKey($gpuPid)) { $names[$gpuPid] } else { "pid $gpuPid" }
                $gpuProcs.Add([ordered]@{ pid = $gpuPid; name = $name; bytes = [long]$sample.RawValue })
            }
        }
    }

    $result = [ordered]@{
        v        = 1
        mem      = [ordered]@{
            totalBytes       = [long]$os.TotalVisibleMemorySize * 1024
            availableBytes   = [long]$memoryCounters['Available Bytes'].RawValue
            committedBytes   = [long]$memoryCounters['Committed Bytes'].RawValue
            commitLimitBytes = [long]$memoryCounters['Commit Limit'].RawValue
            cacheBytes       = [long]$memoryCounters['Cache Bytes'].RawValue
        }
        procs    = $procs.ToArray()
        gpuProcs = $gpuProcs.ToArray()
    }
    return ConvertTo-Json -InputObject $result -Compress -Depth 4
}

while ($true) {
    $command = $stdin.ReadLine()
    if ($null -eq $command -or $command.Trim() -eq 'q') {
        break
    }
    if ($command.Trim() -ne 's') {
        continue
    }
    try {
        $stdout.WriteLine((Get-Sample))
    }
    catch {
        $failure = [ordered]@{ v = 1; error = $_.Exception.Message }
        $stdout.WriteLine((ConvertTo-Json -InputObject $failure -Compress))
    }
}

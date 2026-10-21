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
        {"v":1,"mem":{...},"procs":[{"pid","name","bytes"}],"gpuProcs":[{"pid","name","bytes"}],
         "gpu":{"name","dedicatedUsedBytes","dedicatedTotalBytes"} or null}
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

# The GPU adapter with the most dedicated memory, for machines without nvidia-smi (AMD, Intel).
# Its name and size come from the display-adapter class key in the registry (readable without
# admin rights); usage comes from the "GPU Adapter Memory" counter that Task Manager also uses.
function Get-PrimaryAdapter {
    $classKey = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
    $best = $null
    foreach ($key in Get-ChildItem -Path $classKey -ErrorAction SilentlyContinue) {
        if ($key.PSChildName -notmatch '^\d{4}$') { continue }
        $props = Get-ItemProperty -Path $key.PSPath -ErrorAction SilentlyContinue
        if ($null -eq $props -or -not $props.PSObject.Properties['DriverDesc']) { continue }
        $size = [long]0
        $qw = $props.PSObject.Properties['HardwareInformation.qwMemorySize']
        $dw = $props.PSObject.Properties['HardwareInformation.MemorySize']
        if ($null -ne $qw) {
            $size = [long]$qw.Value
        }
        elseif ($null -ne $dw) {
            $size = if ($dw.Value -is [byte[]]) { [long][BitConverter]::ToUInt32($dw.Value, 0) } else { [long]$dw.Value }
        }
        if ($size -gt 0 -and ($null -eq $best -or $size -gt $best.Size)) {
            $best = [pscustomobject]@{ Name = [string]$props.DriverDesc; Size = $size }
        }
    }
    return $best
}

$adapter = $null
$adapterCategory = $null
try {
    $adapter = Get-PrimaryAdapter
    if ($null -ne $adapter) {
        $adapterCategory = New-Object System.Diagnostics.PerformanceCounterCategory('GPU Adapter Memory')
        $null = $adapterCategory.ReadCategory()
    }
}
catch {
    $adapter = $null
    $adapterCategory = $null
}

function Get-AdapterSample {
    if ($null -eq $adapter -or $null -eq $adapterCategory) {
        return $null
    }
    $used = [long]0
    foreach ($sample in $adapterCategory.ReadCategory()['Dedicated Usage'].Values) {
        if ($sample.RawValue -gt $used) { $used = [long]$sample.RawValue }
    }
    return [ordered]@{
        name                = $adapter.Name
        dedicatedUsedBytes  = [Math]::Min($used, $adapter.Size)
        dedicatedTotalBytes = $adapter.Size
    }
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
        gpu      = Get-AdapterSample
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

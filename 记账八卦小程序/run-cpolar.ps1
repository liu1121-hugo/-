$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "D:\cploar\cpolar.exe"
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.WorkingDirectory = "D:\cploar"

if ($args.Count -gt 0) {
    $psi.Arguments = $args -join " "
}

$p = [System.Diagnostics.Process]::Start($psi)
$out = $p.StandardOutput.ReadToEnd()
$err = $p.StandardError.ReadToEnd()
$p.WaitForExit()
Write-Host "EXIT:$($p.ExitCode)"
Write-Host "OUT:$out"
Write-Host "ERR:$err"
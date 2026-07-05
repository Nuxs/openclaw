#Requires -Version 5.1
<#
.SYNOPSIS
  WSL1 完整恢复脚本：针对你的系统定制，修复损坏的WSL，同时保证游戏能正常运行
.DESCRIPTION
  1. 自动修复 REGDB_E_CLASSNOTREG COM注册损坏问题
  2. 强制安装WSL1，不开启Hypervisor，游戏和WSL同时用
  3. 自动处理内存完整性/VBS导致的Hypervisor强制开启问题
  4. 彻底清理之前的残留，一步到位
.NOTES
  必须以管理员身份运行
#>
[CmdletBinding()]
param(
    [switch]$Repair,
    [switch]$MsiRepairOnly,
    [switch]$NonInteractive,
    [switch]$SkipAptSetup,
    [string]$Distro = 'Ubuntu-22.04',
    [string]$LogPath = ''
)
$ErrorActionPreference = 'Stop'
$script:ScriptRoot = $PSScriptRoot
if (-not $script:ScriptRoot) {
    $script:ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if (-not $script:ScriptRoot) {
    $script:ScriptRoot = (Get-Location).Path
}
if (-not $LogPath) {
    $LogPath = Join-Path $script:ScriptRoot 'wsl-restore.log'
}
if ($LogPath) {
    Start-Transcript -Path $LogPath -Force | Out-Null
}
$script:RebootPending = $false

# ==============================================
# 新增：针对你的系统的前置检查和修复
# ==============================================
function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Check-MemoryIntegrity {
    Write-Host ''
    Write-Host "=== 检查内存完整性状态（避免VBS强制开启Hypervisor） ===" -ForegroundColor Cyan
    try {
        $mi = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' -ErrorAction SilentlyContinue
        if ($mi -and $mi.Enabled -eq 1) {
            Write-Host "检测到内存完整性已开启，这会强制开启Hypervisor，导致游戏报错！正在帮你关闭..." -ForegroundColor Yellow
            Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' -Name 'Enabled' -Value 0 -Type DWord -Force
            $script:RebootPending = $true
            Write-Host "内存完整性已关闭，需要重启生效。" -ForegroundColor Green
        }
        else {
            Write-Host "内存完整性已关闭，没问题。" -ForegroundColor Green
        }
    }
    catch {
        Write-Warning "无法检查内存完整性：$_"
    }
}

function Check-HypervisorState {
    Write-Host ''
    Write-Host "=== 检查Hypervisor状态 ===" -ForegroundColor Cyan
    try {
        $hv = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Hyper-V' -ErrorAction SilentlyContinue
        $hypervisorPresent = (Get-CimInstance -ClassName Win32_ComputerSystem).HypervisorPresent
        if ($hypervisorPresent) {
            Write-Host "警告：当前Hypervisor仍处于开启状态，这会导致游戏反作弊报错！" -ForegroundColor Red
            Write-Host "正在帮你关闭Hypervisor启动项..." -ForegroundColor Yellow
            bcdedit /set hypervisorlaunchtype off
            $script:RebootPending = $true
            Write-Host "Hypervisor已设置为关闭，重启后生效。" -ForegroundColor Green
        }
        else {
            Write-Host "Hypervisor已关闭，游戏可以正常运行！" -ForegroundColor Green
        }
    }
    catch {
        Write-Warning "无法检查Hypervisor状态：$_"
    }
}

# 前置检查
if (-not (Test-IsAdministrator)) {
    Write-Error '请以管理员身份运行此脚本！'
    exit 1
}

Write-Host ''
Write-Host '==============================================' -ForegroundColor White
Write-Host ' WSL1 完整恢复脚本（针对你的系统定制）' -ForegroundColor White
Write-Host ' 安装后：WSL1正常用 + 游戏正常玩，同时运行！' -ForegroundColor White
Write-Host '==============================================' -ForegroundColor White

# 先做系统状态检查和修复
Check-MemoryIntegrity
Check-HypervisorState

if ($script:RebootPending) {
    Write-Host ''
    Write-Host '⚠️  系统状态已修复，需要先重启电脑才能继续安装WSL！' -ForegroundColor Yellow
    $restart = Read-Host '是否立即重启？(Y/N)'
    if ($restart -eq "Y" -or $restart -eq "y") {
        shutdown /r /t 0
    }
    else {
        Write-Host '请手动重启后，再次运行此脚本继续安装！' -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ''
Write-Host '✅ 系统状态检查通过，开始安装WSL1...' -ForegroundColor Green

# ==============================================
# 原有的WSL安装修复逻辑（已优化）
# ==============================================
function Test-ExternalExitSuccess {
    param([int]$ExitCode)
    return ($ExitCode -eq 0) -or ($ExitCode -eq 3010) -or ($ExitCode -eq 1641)
}
function Register-RebootIfRequired {
    param([int]$ExitCode)
    if ($ExitCode -eq 3010 -or $ExitCode -eq 1641) {
        $script:RebootPending = $true
    }
}
function Invoke-External {
    param(
        [string]$Label,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [switch]$AllowNonZero
    )
    Write-Host ''
    Write-Host ">>> $Label" -ForegroundColor Cyan
    Write-Host ("$FilePath " + ($ArgumentList -join ' ')) -ForegroundColor DarkGray
    & $FilePath @ArgumentList
    $exitCode = $LASTEXITCODE
    Register-RebootIfRequired -ExitCode $exitCode
    if ($exitCode -eq 3010 -or $exitCode -eq 1641) {
        Write-Host '  (操作成功，需要重启后生效)' -ForegroundColor Yellow
    }
    if (-not $AllowNonZero -and -not (Test-ExternalExitSuccess -ExitCode $exitCode)) {
        throw ('{0} failed with exit code {1}' -f $Label, $exitCode)
    }
    return $exitCode
}
function Invoke-WslCapture {
    param([string[]]$ArgumentList)
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = & wsl.exe @ArgumentList 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousEap
    }
    $textParts = @()
    foreach ($line in $lines) {
        if ($line -is [System.Management.Automation.ErrorRecord]) {
            $textParts += $line.Exception.Message
            $textParts += [string]$line
        }
        else {
            $textParts += [string]$line
        }
    }
    return @{
        Text     = ($textParts -join "`n")
        ExitCode = $exitCode
    }
}
function Test-WslOutputIndicatesCorruption {
    param(
        [string]$Text,
        [int]$ExitCode = 0
    )
    if (-not $Text) {
        return $false
    }
    if ($Text -match 'REGDB_E_CLASSNOTREG|CLASSNOTREG|CallMsi|E_CLASSNOTREG|Class not registered|没有注册类|未注册|安装.{0,20}损坏|损坏.{0,20}安装|Wsl/CallMsi') {
        return $true
    }
    return $false
}
function Invoke-WslWithInput {
    param(
        [string]$Label,
        [string[]]$ArgumentList,
        [switch]$AllowNonZero
    )
    Write-Host ''
    Write-Host ">>> $Label" -ForegroundColor Cyan
    Write-Host ("wsl.exe " + ($ArgumentList -join ' ')) -ForegroundColor DarkGray
    $argString = ($ArgumentList | ForEach-Object {
            if ($_ -match '\s') { '"' + ($_ -replace '"', '""') + '"' } else { $_ }
        }) -join ' '
    $cmdLine = "echo.| wsl.exe $argString"
    $exitCode = Invoke-External -Label $Label -FilePath 'cmd.exe' -ArgumentList @('/c', $cmdLine) -AllowNonZero
    if (-not $AllowNonZero -and $exitCode -ne 0) {
        throw ('{0} failed with exit code {1}' -f $Label, $exitCode)
    }
    return $exitCode
}
function Test-WindowsOptionalFeatureEnabled {
    param([string]$FeatureName)
    $output = & dism.exe /online /get-featureinfo /featurename:$FeatureName 2>&1
    $state = $output |
    Select-String -Pattern 'State\s*:\s*(\S+)' |
    ForEach-Object { $_.Matches[0].Groups[1].Value }
    return $state -eq 'Enabled'
}
function Enable-WindowsOptionalFeatureIfNeeded {
    param(
        [string]$FeatureName,
        [string]$Label
    )
    if (Test-WindowsOptionalFeatureEnabled -FeatureName $FeatureName) {
        Write-Host "$Label 已启用。" -ForegroundColor DarkGray
        return $false
    }
    Write-Host "$Label 未启用，正在启用..." -ForegroundColor Yellow
    $exitCode = Invoke-External -Label "启用 $Label" -FilePath 'dism.exe' -ArgumentList @(
        '/online', '/enable-feature',
        "/featurename:$FeatureName",
        '/norestart', '/quiet'
    )
    return ($exitCode -eq 3010) -or ($exitCode -eq 1641) -or ($exitCode -eq 0)
}
function Disable-WindowsOptionalFeatureIfEnabled {
    param(
        [string]$FeatureName,
        [string]$Label
    )
    if (-not (Test-WindowsOptionalFeatureEnabled -FeatureName $FeatureName)) {
        Write-Host "$Label 未启用，跳过。" -ForegroundColor DarkGray
        return
    }
    Write-Host "$Label 已启用，正在禁用（WSL1 无需虚拟化，避免影响游戏）..." -ForegroundColor DarkYellow
    Invoke-External -Label "禁用 $Label" -FilePath 'dism.exe' -ArgumentList @(
        '/online', '/disable-feature',
        "/featurename:$FeatureName",
        '/norestart', '/quiet'
    )
}
function Test-WslCorrupted {
    $probes = @(
        @('--status'),
        @('-l', '-q'),
        @('--version')
    )
    foreach ($args in $probes) {
        $result = Invoke-WslCapture -ArgumentList $args
        if (Test-WslOutputIndicatesCorruption -Text $result.Text -ExitCode $result.ExitCode) {
            if ($result.Text) {
                Write-Host "WSL 探测失败 ($($args -join ' ')): $($result.Text.Trim())" -ForegroundColor DarkYellow
            }
            else {
                Write-Host "WSL 探测失败 ($($args -join ' '))，exit=$($result.ExitCode)" -ForegroundColor DarkYellow
            }
            return $true
        }
    }
    return $false
}
function Install-WslMsiFromGitHub {
    $arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
    $msiName = "wsl-$arch.msi"
    $msiPath = Join-Path $env:TEMP $msiName
    $url = "https://github.com/microsoft/WSL/releases/latest/download/$msiName"
    Write-Host "下载 WSL 官方安装包: $url" -ForegroundColor DarkGray
    try {
        Invoke-WebRequest -Uri $url -OutFile $msiPath -UseBasicParsing -TimeoutSec 60
    }
    catch {
        Write-Warning "无法从 GitHub 下载 MSI：$($_.Exception.Message)"
        return $false
    }
    if (-not (Test-Path $msiPath)) {
        return $false
    }
    Write-Host "安装 WSL MSI: $msiPath" -ForegroundColor DarkGray
    $exitCode = Invoke-External -Label '安装 WSL MSI' -FilePath 'msiexec.exe' -ArgumentList @(
        '/i', $msiPath,
        '/qn', '/norestart'
    ) -AllowNonZero
    return (Test-ExternalExitSuccess -ExitCode $exitCode)
}
function Install-WslViaWinget {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $winget) {
        Write-Host '未找到 winget，跳过 Store 包安装。' -ForegroundColor DarkGray
        return $false
    }
    $exitCode = Invoke-External -Label 'winget 安装 Microsoft.WSL' -FilePath $winget.Source -ArgumentList @(
        'install', '--id', 'Microsoft.WSL',
        '--accept-package-agreements', '--accept-source-agreements',
        '--disable-interactivity'
    ) -AllowNonZero
    return $exitCode -eq 0
}
function Repair-WslMsiRegistration {
    Write-Host ''
    Write-Host '=== 修复损坏的WSL注册（解决REGDB_E_CLASSNOTREG） ===' -ForegroundColor Magenta
    $featureChanged = Enable-WindowsOptionalFeatureIfNeeded -FeatureName 'Microsoft-Windows-Subsystem-Linux' -Label 'Windows Subsystem for Linux'
    $rebootNeeded = $featureChanged -or $script:RebootPending
    if ($rebootNeeded) {
        Write-Host ''
        Write-Host '已启用 WSL 核心功能，需要重启才能继续。' -ForegroundColor Yellow
        if (-not $NonInteractive) {
            $answer = Read-Host '是否现在重启？(Y/N，默认 Y)'
            if ($answer -notmatch '^[Nn]') {
                Restart-Computer -Force
                return
            }
            Write-Host '已跳过重启。请手动重启后，再次运行此脚本。' -ForegroundColor Yellow
            return
        }
        return
    }
    $repaired = $false
    if (Install-WslViaWinget) {
        Write-Host 'winget 安装/更新 WSL 完成。' -ForegroundColor Green
        $repaired = $true
    }
    if (-not $repaired -and (Install-WslMsiFromGitHub)) {
        Write-Host '官方MSI安装完成。' -ForegroundColor Green
        $repaired = $true
    }
    Write-Host ''
    Write-Host '>>> 更新WSL组件' -ForegroundColor Cyan
    Invoke-WslWithInput -Label 'wsl --update --web-download' -ArgumentList @('--update', '--web-download') -AllowNonZero | Out-Null
    if (-not (Test-WslCorrupted)) {
        Write-Host 'WSL注册已修复完成！' -ForegroundColor Green
        return
    }
    Write-Host ''
    Write-Host '>>> 尝试完整安装WSL核心' -ForegroundColor Cyan
    Invoke-WslWithInput -Label 'wsl --install --web-download --no-distribution' -ArgumentList @(
        '--install', '--web-download', '--no-distribution', '--quiet'
    ) -AllowNonZero | Out-Null
    if (Test-WslCorrupted) {
        throw @'
WSL修复失败，请手动操作：
  1. 重启电脑
  2. 以管理员运行: wsl --update --web-download
  3. 再次运行此脚本
'@
    }
    Write-Host 'WSL注册已修复完成！' -ForegroundColor Green
}
function Repair-WslEnvironment {
    param([switch]$ForceMsiRepair)
    Write-Host ''
    Write-Host '=== 修复WSL环境 ===' -ForegroundColor Magenta
    $needsMsiRepair = $ForceMsiRepair -or (Test-WslCorrupted)
    if ($needsMsiRepair) {
        Repair-WslMsiRegistration
    }
    else {
        Write-Host 'WSL核心组件正常，跳过修复。' -ForegroundColor DarkGray
    }
    if (-not (Test-WslCorrupted)) {
        Invoke-WslWithInput -Label '关闭所有WSL实例' -ArgumentList @('--shutdown') -AllowNonZero | Out-Null
    }
    Disable-WindowsOptionalFeatureIfEnabled -FeatureName 'VirtualMachinePlatform' -Label 'Virtual Machine Platform'
    Disable-WindowsOptionalFeatureIfEnabled -FeatureName 'HypervisorPlatform' -Label 'Hypervisor Platform'
}
function Get-WslDistroNames {
    if (Test-WslCorrupted) {
        return @()
    }
    $listResult = Invoke-WslCapture -ArgumentList @('-l', '-v')
    if (Test-WslOutputIndicatesCorruption -Text $listResult.Text -ExitCode $listResult.ExitCode) {
        return @()
    }
    $raw = $listResult.Text -split "`r?`n"
    $names = @()
    foreach ($line in $raw) {
        $trimmed = ([string]$line).Trim()
        if (-not $trimmed -or $trimmed -match '^(NAME|----|\x00)') {
            continue
        }
        $name = ($trimmed -replace '^\*?\s*', '' -split '\s+')[0]
        if ($name) {
            $names += $name
        }
    }
    return $names
}
function Test-WslDistroInstalled {
    param([string]$Name)
    $installed = Get-WslDistroNames
    foreach ($item in $installed) {
        if ($item -eq $Name) {
            return $true
        }
    }
    return $false
}

# 主流程
$script:WslIsCorrupted = Test-WslCorrupted
if ($Repair -or $MsiRepairOnly -or $script:WslIsCorrupted) {
    if ($script:WslIsCorrupted) {
        Write-Host '检测到WSL安装损坏，优先执行修复。' -ForegroundColor Yellow
    }
    Repair-WslEnvironment
    $script:WslIsCorrupted = Test-WslCorrupted
}
if ($MsiRepairOnly) {
    Write-Host ''
    Write-Host 'MSI修复完成，重启后再次运行此脚本继续。' -ForegroundColor Green
    if ($LogPath) { Stop-Transcript | Out-Null }
    exit 0
}

Write-Host ''
Write-Host '=== 1/4 启用WSL核心功能 ===' -ForegroundColor Cyan
Enable-WindowsOptionalFeatureIfNeeded -FeatureName 'Microsoft-Windows-Subsystem-Linux' -Label 'Windows Subsystem for Linux' | Out-Null

if ($script:WslIsCorrupted) {
    Repair-WslMsiRegistration
    $script:WslIsCorrupted = Test-WslCorrupted
}

Write-Host ''
Write-Host '=== 2/4 安装WSL核心组件 ===' -ForegroundColor Cyan
Invoke-WslWithInput -Label '安装WSL核心' -ArgumentList @(
    '--install', '--web-download', '--no-distribution', '--quiet'
) -AllowNonZero | Out-Null

Write-Host ''
Write-Host '=== 3/4 设置默认WSL版本为1（不依赖Hypervisor） ===' -ForegroundColor Cyan
$setVersionExit = Invoke-WslWithInput -Label '设置默认WSL版本' -ArgumentList @(
    '--set-default-version', '1'
) -AllowNonZero
if ($setVersionExit -ne 0) {
    Write-Host '提示：若仍失败，重启后执行 wsl --set-default-version 1' -ForegroundColor Yellow
}

Write-Host ''
Write-Host "=== 4/4 安装Ubuntu 22.04 === " -ForegroundColor Cyan
if (Test-WslDistroInstalled -Name $Distro) {
    Write-Host "$Distro 已存在，跳过安装。" -ForegroundColor DarkYellow
}
else {
    Invoke-WslWithInput -Label "安装 $Distro" -ArgumentList @(
        '--install', '-d', $Distro, '--quiet'
    ) -AllowNonZero | Out-Null
}

Write-Host ''
Write-Host '=== 初始化Ubuntu ===' -ForegroundColor Yellow
Write-Host '接下来会弹出Ubuntu窗口，请设置你的Linux用户名和密码。'
Write-Host '输入密码时不会显示字符，这是正常的。'
Write-Host '设置完成后关闭Ubuntu窗口即可。'
if (-not $NonInteractive) {
    Read-Host '按回车继续'
}

if (-not $SkipAptSetup) {
    Write-Host ''
    Write-Host '=== 安装OpenClaw所需的开发依赖 ===' -ForegroundColor Cyan
    if (Test-WslDistroInstalled -Name $Distro) {
        $aptScript = @'
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y build-essential git python3 python3-pip nodejs npm curl wget
'@.Trim()
        Invoke-External -Label '安装开发依赖' -FilePath 'wsl.exe' -ArgumentList @(
            '-d', $Distro,
            '--user', 'root',
            'bash', '-lc', $aptScript
        ) -AllowNonZero
    }
}

Write-Host ''
Write-Host '✅ 全部完成！' -ForegroundColor Green
Write-Host ''
Write-Host '🎉 现在你可以：' -ForegroundColor Cyan
Write-Host '  1. 直接玩《三角洲行动》，Hypervisor已关闭，反作弊不会报错！'
Write-Host '  2. 打开WSL运行OpenClaw，输入: wsl -d Ubuntu-22.04'
Write-Host '  3. 两个可以同时运行，不用重启切换！'
Write-Host ''
Write-Host 'Windows的磁盘在WSL里的路径是: /mnt/c、/mnt/d，你的代码直接就能访问！'

if ($LogPath) {
    Stop-Transcript | Out-Null
}

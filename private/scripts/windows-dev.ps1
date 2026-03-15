param(
    [ValidateSet("bootstrap", "doctor", "gateway-install", "gateway-run", "gateway-status", "docker-up", "docker-down", "status", "init-template")]
    [string]$Action = "bootstrap",

    [ValidateSet("dev", "staging", "prod")]
    [string]$Environment = "dev",

    [ValidateSet("auto", "winget", "choco", "scoop", "manual")]
    [string]$NodeInstallMethod = "auto",

    [ValidateSet("auto", "standalone", "manual")]
    [string]$PnpmInstallMethod = "auto",

    [switch]$SkipBuild,
    [switch]$SkipUiBuild,
    [switch]$SkipDoctor,
    [switch]$NoLocalEnv,
    [switch]$ForceLocalEnv,
    [switch]$GatewayService,
    [switch]$AllowLan,
    [switch]$SkipBun,

    [string]$PresetFile = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$script:InputBoundParameters = @{}
foreach ($pair in $PSBoundParameters.GetEnumerator()) {
    $script:InputBoundParameters[[string]$pair.Key] = $pair.Value
}

$script:InitialEnvNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($key in [System.Environment]::GetEnvironmentVariables().Keys) {
    [void]$script:InitialEnvNames.Add([string]$key)
}

$script:WindowsDevPreset = $null
$script:LoadedPresetPath = $null

function Write-Step {
    param([string]$Message)
    Microsoft.PowerShell.Host\Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Microsoft.PowerShell.Host\Write-Host "  - $Message" -ForegroundColor DarkGray
}

function Write-Ok {
    param([string]$Message)
    Microsoft.PowerShell.Host\Write-Host "  ✓ $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Microsoft.PowerShell.Host\Write-Host "  ! $Message" -ForegroundColor Yellow
}

function Throw-UserError {
    param([string]$Message)
    throw $Message
}

$windowsConfigHelper = Join-Path $PSScriptRoot "windows\windows-dev.config.ps1"
if (-not (Test-Path $windowsConfigHelper)) {
    Throw-UserError "缺少 helper：$windowsConfigHelper"
}
. $windowsConfigHelper
Initialize-WindowsDevPreset -ExplicitPath $PresetFile

function Refresh-Path {
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @($machine, $user) | Where-Object { $_ -and $_.Trim() }
    if ($parts.Count -gt 0) {
        $env:Path = ($parts -join ";")
    }
}

function Ensure-ExecutionPolicy {
    $policy = Get-ExecutionPolicy
    if ($policy -in @("Restricted", "AllSigned")) {
        Write-Step "调整当前 PowerShell 进程执行策略"
        Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force
        Write-Ok "已为当前进程启用 RemoteSigned"
    }
}

function Get-CommandPath {
    param([string[]]$Names)

    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return $command.Source
        }
    }

    return $null
}

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$IgnoreExitCode
    )

    & $FilePath @Arguments
    $exitCode = $LASTEXITCODE
    if (-not $IgnoreExitCode -and $exitCode -ne 0) {
        Throw-UserError "命令失败（exit=$exitCode）：$FilePath $($Arguments -join ' ')"
    }

    return $exitCode
}

function Get-NodeVersionString {
    $node = Get-CommandPath @("node.exe", "node")
    if (-not $node) {
        return $null
    }

    $raw = & $node --version 2>$null
    if (-not $raw) {
        return $null
    }

    return ([string]$raw).Trim()
}

function Test-SupportedNodeVersion {
    param([string]$VersionString)

    if (-not $VersionString) {
        return $false
    }

    $normalized = $VersionString.Trim().TrimStart("v")
    $parsed = $null
    if (-not [version]::TryParse($normalized, [ref]$parsed)) {
        return $false
    }

    if ($parsed.Major -lt 22) {
        return $false
    }

    if ($parsed.Major -eq 22 -and $parsed -lt [version]"22.16.0") {
        return $false
    }

    return $true
}

function Install-Node {
    param([string]$Method)

    Write-Step "安装 Node.js（推荐 Node 24；兼容 Node 22.16+）"

    $attempts = switch ($Method) {
        "auto" { @("winget", "choco", "scoop") }
        default { @($Method) }
    }

    foreach ($attempt in $attempts) {
        switch ($attempt) {
            "winget" {
                $winget = Get-CommandPath @("winget.exe", "winget")
                if ($winget) {
                    Write-Info "使用 winget 安装 OpenJS.NodeJS.LTS"
                    Invoke-Native -FilePath $winget -Arguments @("install", "OpenJS.NodeJS.LTS", "--accept-package-agreements", "--accept-source-agreements")
                    Refresh-Path
                    return
                }
            }
            "choco" {
                $choco = Get-CommandPath @("choco.exe", "choco")
                if ($choco) {
                    Write-Info "使用 Chocolatey 安装 nodejs-lts"
                    Invoke-Native -FilePath $choco -Arguments @("install", "nodejs-lts", "-y")
                    Refresh-Path
                    return
                }
            }
            "scoop" {
                $scoop = Get-CommandPath @("scoop.cmd", "scoop")
                if ($scoop) {
                    Write-Info "使用 Scoop 安装 nodejs-lts"
                    Invoke-Native -FilePath $scoop -Arguments @("install", "nodejs-lts")
                    Refresh-Path
                    return
                }
            }
            "manual" {
                Throw-UserError "未检测到受支持的 Node 版本，请先手动安装 Node 24（推荐）或 Node 22.16+。"
            }
        }
    }

    Throw-UserError "无法自动安装 Node.js。请先安装 Node 24（推荐）或 Node 22.16+。"
}

function Ensure-Node {
    $version = Get-NodeVersionString
    if ($version -and (Test-SupportedNodeVersion -VersionString $version)) {
        Write-Ok "检测到 Node $version"
        return
    }

    if ($version) {
        Write-Warn "检测到 Node $version，但仓库要求 Node 22.16+（推荐 Node 24）"
    }

    Install-Node -Method $NodeInstallMethod

    $installedVersion = Get-NodeVersionString
    if (-not (Test-SupportedNodeVersion -VersionString $installedVersion)) {
        Throw-UserError "Node 安装后版本仍不满足要求：${installedVersion}"
    }

    Write-Ok "Node 已就绪：$installedVersion"
}

function Ensure-Git {
    $git = Get-CommandPath @("git.exe", "git")
    if ($git) {
        $version = & $git --version 2>$null
        Write-Ok "检测到 $version"
        return
    }

    Write-Step "安装 Git"
    $winget = Get-CommandPath @("winget.exe", "winget")
    if ($winget) {
        Invoke-Native -FilePath $winget -Arguments @("install", "Git.Git", "--accept-package-agreements", "--accept-source-agreements")
        Refresh-Path
        Write-Ok "Git 已安装"
        return
    }

    Throw-UserError "未检测到 Git，且当前机器没有可用的 winget。请先安装 Git for Windows。"
}

function Resolve-PnpmCommand {
    return Get-CommandPath @("pnpm.cmd", "pnpm.exe", "pnpm")
}

function Get-NpmCommand {
    return Get-CommandPath @("npm.cmd", "npm.exe", "npm")
}

function Install-Pnpm {
    param([string]$Method)

    Write-Step "安装 pnpm"
    Ensure-ExecutionPolicy

    $attempts = switch ($Method) {
        "auto" { @("standalone") }
        default { @($Method) }
    }

    foreach ($attempt in $attempts) {
        switch ($attempt) {
            "standalone" {
                Write-Info "使用 pnpm 官方独立安装脚本（不依赖 npm 全局安装）"
                try {
                    Invoke-Expression ((Invoke-WebRequest "https://get.pnpm.io/install.ps1" -UseBasicParsing).Content)
                    Refresh-Path
                    if (Resolve-PnpmCommand) {
                        return
                    }
                } catch {
                    if ($Method -ne "auto") {
                        throw
                    }
                    Write-Warn "pnpm 官方独立安装失败：$($_.Exception.Message)"
                }
            }
            "manual" {
                Throw-UserError "未检测到 pnpm，请先手动安装（推荐使用 https://get.pnpm.io/install.ps1）。"
            }
        }
    }

    $npm = Get-NpmCommand
    if ($Method -eq "auto" -and $npm) {
        Write-Warn "退回到 npm 全局安装 pnpm（如果你不想这么做，请预先安装 pnpm）"
        Invoke-Native -FilePath $npm -Arguments @("install", "-g", "pnpm")
        Refresh-Path
        if (Resolve-PnpmCommand) {
            return
        }
    }

    Throw-UserError "无法自动安装 pnpm。"
}

function Ensure-Pnpm {
    $pnpm = Resolve-PnpmCommand
    if ($pnpm) {
        $version = & $pnpm --version 2>$null
        Write-Ok "检测到 pnpm $version"
        return
    }

    Install-Pnpm -Method $PnpmInstallMethod
    $resolved = Resolve-PnpmCommand
    if (-not $resolved) {
        Throw-UserError "pnpm 安装后仍不可用。"
    }

    $version = & $resolved --version 2>$null
    Write-Ok "pnpm 已就绪：$version"
}

function Ensure-Bun {
    if ($SkipBun) {
        Write-Info "按参数要求跳过 Bun 安装"
        return
    }

    $bun = Get-CommandPath @("bun.exe", "bun")
    if ($bun) {
        $version = & $bun --version 2>$null
        Write-Ok "检测到 Bun $version"
        return
    }

    Write-Step "安装 Bun（可选，但建议保留 Node + Bun 双路径）"
    Ensure-ExecutionPolicy

    try {
        Invoke-Expression ((Invoke-WebRequest "https://bun.sh/install.ps1" -UseBasicParsing).Content)
        Refresh-Path
        $bun = Get-CommandPath @("bun.exe", "bun")
        if ($bun) {
            $version = & $bun --version 2>$null
            Write-Ok "Bun 已安装：$version"
            return
        }
        Write-Warn "Bun 安装后仍未出现在 PATH，后续可手动补装。"
    } catch {
        Write-Warn "Bun 安装失败，不阻塞当前流程：$($_.Exception.Message)"
    }
}

function Invoke-Pnpm {
    param([string[]]$Arguments)

    $pnpm = Resolve-PnpmCommand
    if (-not $pnpm) {
        Throw-UserError "pnpm 不可用，请先执行 bootstrap。"
    }

    Invoke-Native -FilePath $pnpm -Arguments $Arguments
}

function Ensure-RepoRoot {
    if (-not (Test-Path (Join-Path $script:RepoRoot "package.json"))) {
        Throw-UserError "脚本必须在 OpenClaw 仓库中运行。"
    }

    Set-Location $script:RepoRoot
}

function Ensure-LocalCliPrereqs {
    Ensure-RepoRoot
    Ensure-ExecutionPolicy
    Ensure-Node
    Ensure-Pnpm
}

function Get-StateDirDisplay {
    return Get-ConfiguredStateDir
}

function Get-LoadedPresetDisplay {
    if (-not $script:LoadedPresetPath) {
        return "未加载"
    }

    return (Format-RepoRelativePath -Path $script:LoadedPresetPath)
}

function Ensure-OfficialConfigAndPreset {
    Ensure-OpenClawSetup
    Ensure-OpenClawConfigFromPreset
    Apply-PresetBranding
}

function Bootstrap-WindowsDev {
    Ensure-RepoRoot
    Ensure-ExecutionPolicy
    Ensure-Node
    Ensure-Git
    Ensure-Pnpm
    Ensure-Bun
    Ensure-ExpectedOriginRemote

    Write-Step "确认 workspace 扩展策略"
    Write-Info "当前脚本不会运行 filter-extensions，也不会修改 pnpm-workspace.yaml。"
    Write-Info "这会保留官方全部 workspace 包，同时保留私有 Web3 扩展（如 web3-core / market-core）。"

    if (-not $NoLocalEnv) {
        Ensure-LocalEnvFile -EnvName $Environment -Force:$ForceLocalEnv -UseLanBinding:$AllowLan | Out-Null
    }

    Write-Step "安装依赖"
    Invoke-Pnpm -Arguments @("install")

    if (-not $SkipUiBuild) {
        Write-Step "构建 UI"
        Invoke-Pnpm -Arguments @("ui:build")
    } else {
        Write-Info "按参数要求跳过 ui:build"
    }

    if (-not $SkipBuild) {
        Write-Step "构建仓库"
        Invoke-Pnpm -Arguments @("build")
    } else {
        Write-Info "按参数要求跳过 build"
    }

    Import-PrivateEnv -EnvName $Environment
    Ensure-OfficialConfigAndPreset

    if (-not $SkipDoctor) {
        Write-Step "运行官方诊断"
        Invoke-Pnpm -Arguments @("openclaw", "doctor")
    }

    if ($GatewayService) {
        Install-GatewayService
        Show-GatewayStatus
    }

    Write-Step "Bootstrap 完成"
    Write-Info "Repo Root: $script:RepoRoot"
    Write-Info "State Dir: $(Get-StateDirDisplay)"
    Write-Info "Config Path: $(Get-ConfiguredOpenClawConfigPath)"
    Write-Info "Preset: $(Get-LoadedPresetDisplay)"
    Write-Info "默认不会改官方路径；除非你在进程环境或 private/env 覆盖它们。"
    Write-Info "本地运行：powershell -File private/scripts/windows-dev.ps1 -Action gateway-run -Environment $Environment"
    Write-Info "托管启动：powershell -File private/scripts/windows-dev.ps1 -Action gateway-install -Environment $Environment"
    Write-Info "Docker：powershell -File private/scripts/windows-dev.ps1 -Action docker-up -Environment $Environment"
}

function Install-GatewayService {
    Ensure-LocalCliPrereqs
    Import-PrivateEnv -EnvName $Environment
    Ensure-OfficialConfigAndPreset

    Write-Step "安装/更新 Windows 原生 Gateway 托管启动"
    Write-Info "这里直接调用官方 CLI：openclaw gateway install"
    Invoke-Pnpm -Arguments @("openclaw", "gateway", "install")
    Write-Ok "Gateway 托管启动已配置"
}

function Run-Gateway {
    Ensure-LocalCliPrereqs
    Import-PrivateEnv -EnvName $Environment
    Ensure-OfficialConfigAndPreset

    Write-Step "在当前 PowerShell 会话启动 Gateway"
    Write-Info "这里直接调用官方 CLI：openclaw gateway run"
    Invoke-Pnpm -Arguments @("openclaw", "gateway", "run")
}

function Show-GatewayStatus {
    Ensure-LocalCliPrereqs
    Import-PrivateEnv -EnvName $Environment

    Write-Step "查询 Gateway 状态"
    Invoke-Pnpm -Arguments @("openclaw", "gateway", "status", "--json")
}

function Run-Doctor {
    Ensure-LocalCliPrereqs
    Import-PrivateEnv -EnvName $Environment
    Ensure-OfficialConfigAndPreset

    Write-Step "运行官方诊断"
    Invoke-Pnpm -Arguments @("openclaw", "doctor")
}

function Ensure-Docker {
    $docker = Get-CommandPath @("docker.exe", "docker")
    if (-not $docker) {
        Throw-UserError "未检测到 Docker。请先安装 Docker Desktop。"
    }

    try {
        Invoke-Native -FilePath $docker -Arguments @("compose", "version") | Out-Null
    } catch {
        Throw-UserError "检测到了 docker，但 docker compose 不可用。请确认 Docker Desktop 已正确安装。"
    }
}

function Invoke-DockerCompose {
    param([string[]]$Arguments)

    $docker = Get-CommandPath @("docker.exe", "docker")
    if (-not $docker) {
        Throw-UserError "未检测到 Docker。"
    }

    $allArguments = @("compose") + $Arguments
    Invoke-Native -FilePath $docker -Arguments $allArguments
}

function Ensure-ComposeLocalEnvFile {
    param([string]$EnvName)

    $local = Join-Path $script:RepoRoot "private\env\$EnvName.env.local"
    if (-not (Test-Path $local)) {
        Set-Content -Path $local -Value @("# Machine-local overrides for Docker Compose") -Encoding UTF8
        Write-Ok "已补充空的本地 env 文件：private/env/$EnvName.env.local"
    }
}

function Docker-Up {
    Ensure-RepoRoot
    Ensure-Docker

    if (-not $NoLocalEnv) {
        Ensure-LocalEnvFile -EnvName $Environment -Force:$ForceLocalEnv -UseLanBinding:$AllowLan | Out-Null
    } else {
        Ensure-ComposeLocalEnvFile -EnvName $Environment
    }

    Import-PrivateEnv -EnvName $Environment
    Ensure-OfficialConfigAndPreset
    $env:DEPLOY_ENV = $Environment

    $trackedEnv = Join-Path $script:RepoRoot "private\env\$Environment.env"
    $composeArgs = @(
        "--env-file", $trackedEnv,
        "-f", "docker-compose.yml",
        "-f", "private/docker-compose.override.yml"
    )

    $image = $env:OPENCLAW_IMAGE
    if (-not $image) {
        $image = "openclaw:dev"
        $env:OPENCLAW_IMAGE = $image
    }

    $pnpmForce = if ($env:OPENCLAW_PNPM_FORCE) { $env:OPENCLAW_PNPM_FORCE } else { "0" }

    Write-Step "Docker Compose 部署（Windows 原生）"
    if ($image -eq "openclaw:dev" -or $image.EndsWith(":local")) {
        Write-Info "检测到本地镜像模式，先构建镜像：$image"
        $docker = Get-CommandPath @("docker.exe", "docker")
        Invoke-Native -FilePath $docker -Arguments @("build", "--build-arg", "OPENCLAW_PNPM_FORCE=$pnpmForce", "-t", $image, ".")
    } else {
        Write-Info "检测到远端镜像模式，先拉取镜像：$image"
        Invoke-DockerCompose -Arguments ($composeArgs + @("pull"))
    }

    Invoke-DockerCompose -Arguments ($composeArgs + @("up", "-d"))
    Write-Ok "Docker Compose 已启动"
}

function Docker-Down {
    Ensure-RepoRoot
    Ensure-Docker
    Ensure-ComposeLocalEnvFile -EnvName $Environment
    $env:DEPLOY_ENV = $Environment

    $trackedEnv = Join-Path $script:RepoRoot "private\env\$Environment.env"
    $composeArgs = @(
        "--env-file", $trackedEnv,
        "-f", "docker-compose.yml",
        "-f", "private/docker-compose.override.yml"
    )

    Write-Step "停止 Docker Compose"
    Invoke-DockerCompose -Arguments ($composeArgs + @("down"))
    Write-Ok "Docker Compose 已停止"
}

function Show-Status {
    Ensure-LocalCliPrereqs
    Import-PrivateEnv -EnvName $Environment

    Write-Step "OpenClaw Windows 私有化状态"
    Write-Info "Repo Root: $script:RepoRoot"
    Write-Info "State Dir: $(Get-StateDirDisplay)"
    Write-Info "Config Path: $(Get-ConfiguredOpenClawConfigPath)"
    Write-Info "Preset: $(Get-LoadedPresetDisplay)"

    try {
        Show-GatewayStatus
    } catch {
        Write-Warn "Gateway 状态查询失败：$($_.Exception.Message)"
    }

    $docker = Get-CommandPath @("docker.exe", "docker")
    if ($docker) {
        try {
            Ensure-ComposeLocalEnvFile -EnvName $Environment
            $env:DEPLOY_ENV = $Environment
            $trackedEnv = Join-Path $script:RepoRoot "private\env\$Environment.env"
            $composeArgs = @(
                "--env-file", $trackedEnv,
                "-f", "docker-compose.yml",
                "-f", "private/docker-compose.override.yml",
                "ps"
            )
            Write-Step "Docker Compose 状态"
            Invoke-DockerCompose -Arguments $composeArgs
        } catch {
            Write-Warn "Docker Compose 状态查询失败：$($_.Exception.Message)"
        }
    } else {
        Write-Info "未检测到 Docker，跳过 compose 状态查询。"
    }
}

switch ($Action) {
    "bootstrap" { Bootstrap-WindowsDev }
    "doctor" { Run-Doctor }
    "gateway-install" { Install-GatewayService }
    "gateway-run" { Run-Gateway }
    "gateway-status" { Show-GatewayStatus }
    "docker-up" { Docker-Up }
    "docker-down" { Docker-Down }
    "status" { Show-Status }
    "init-template" { Initialize-WindowsDevTemplate }
    default { Throw-UserError "未知 Action: $Action" }
}

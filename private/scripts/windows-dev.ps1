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
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host "  - $Message" -ForegroundColor DarkGray
}

function Write-Ok {
    param([string]$Message)
    Write-Host "   $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  ! $Message" -ForegroundColor Yellow
}

function Throw-UserError {
    param([string]$Message)
    throw $Message
}

$windowsConfigHelper = Join-Path $PSScriptRoot "windows\windows-dev.config.ps1"
if (-not (Test-Path $windowsConfigHelper)) {
    Throw-UserError " helper:$windowsConfigHelper"
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
        Write-Step " PowerShell "
        Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force
        Write-Ok " RemoteSigned"
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
        Throw-UserError "(exit=$exitCode):$FilePath $($Arguments -join ' ')"
    }

    return $exitCode
}

function Get-CurrentPowerShellPath {
    $currentProcess = Get-Process -Id $PID -ErrorAction SilentlyContinue
    if ($currentProcess -and $currentProcess.Path -and (Test-Path $currentProcess.Path)) {
        return $currentProcess.Path
    }

    return Get-CommandPath @("pwsh.exe", "pwsh", "powershell.exe", "powershell")
}

function Invoke-RemotePowerShellScript {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [string[]]$Arguments = @(),
        [switch]$IgnoreExitCode
    )

    $powerShell = Get-CurrentPowerShellPath
    if (-not $powerShell) {
        Throw-UserError " PowerShell "
    }

    $tempScript = Join-Path ([System.IO.Path]::GetTempPath()) ("openclaw-" + [guid]::NewGuid().ToString("N") + ".ps1")
    try {
        # 远端脚本在不同 PowerShell 版本下有时会返回 byte[] 或与当前作用域变量冲突，
        # 统一落盘后用独立进程执行更稳妥。
        Invoke-WebRequest $Url -OutFile $tempScript -UseBasicParsing
        Invoke-Native -FilePath $powerShell -Arguments (@("-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $tempScript) + $Arguments) -IgnoreExitCode:$IgnoreExitCode
    } finally {
        Remove-Item -Path $tempScript -Force -ErrorAction SilentlyContinue
    }
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

    Write-Step " Node.js( Node 24; Node 22.16+)"

    $attempts = switch ($Method) {
        "auto" { @("winget", "choco", "scoop") }
        default { @($Method) }
    }

    foreach ($attempt in $attempts) {
        switch ($attempt) {
            "winget" {
                $winget = Get-CommandPath @("winget.exe", "winget")
                if ($winget) {
                    Write-Info " winget  OpenJS.NodeJS.LTS"
                    Invoke-Native -FilePath $winget -Arguments @("install", "OpenJS.NodeJS.LTS", "--accept-package-agreements", "--accept-source-agreements")
                    Refresh-Path
                    return
                }
            }
            "choco" {
                $choco = Get-CommandPath @("choco.exe", "choco")
                if ($choco) {
                    Write-Info " Chocolatey  nodejs-lts"
                    Invoke-Native -FilePath $choco -Arguments @("install", "nodejs-lts", "-y")
                    Refresh-Path
                    return
                }
            }
            "scoop" {
                $scoop = Get-CommandPath @("scoop.cmd", "scoop")
                if ($scoop) {
                    Write-Info " Scoop  nodejs-lts"
                    Invoke-Native -FilePath $scoop -Arguments @("install", "nodejs-lts")
                    Refresh-Path
                    return
                }
            }
            "manual" {
                Throw-UserError " Node , Node 24() Node 22.16+"
            }
        }
    }

    Throw-UserError " Node.js Node 24() Node 22.16+"
}

function Ensure-Node {
    $version = Get-NodeVersionString
    if ($version -and (Test-SupportedNodeVersion -VersionString $version)) {
        Write-Ok " Node $version"
        return
    }

    if ($version) {
        Write-Warn " Node $version, Node 22.16+( Node 24)"
    }

    Install-Node -Method $NodeInstallMethod

    $installedVersion = Get-NodeVersionString
    if (-not (Test-SupportedNodeVersion -VersionString $installedVersion)) {
        Throw-UserError "Node :${installedVersion}"
    }

    Write-Ok "Node :$installedVersion"
}

function Ensure-Git {
    $git = Get-CommandPath @("git.exe", "git")
    if ($git) {
        $version = & $git --version 2>$null
        Write-Ok " $version"
        return
    }

    Write-Step " Git"
    $winget = Get-CommandPath @("winget.exe", "winget")
    if ($winget) {
        Invoke-Native -FilePath $winget -Arguments @("install", "Git.Git", "--accept-package-agreements", "--accept-source-agreements")
        Refresh-Path
        Write-Ok "Git "
        return
    }

    Throw-UserError " Git, winget Git for Windows"
}

function Resolve-PnpmCommand {
    return Get-CommandPath @("pnpm.cmd", "pnpm.exe", "pnpm")
}

function Get-NpmCommand {
    return Get-CommandPath @("npm.cmd", "npm.exe", "npm")
}

function Install-Pnpm {
    param([string]$Method)

    Write-Step " pnpm"
    Ensure-ExecutionPolicy

    $attempts = switch ($Method) {
        "auto" { @("standalone") }
        default { @($Method) }
    }

    foreach ($attempt in $attempts) {
        switch ($attempt) {
            "standalone" {
                Write-Info " pnpm ( npm )"
                try {
                    Invoke-RemotePowerShellScript -Url "https://get.pnpm.io/install.ps1"
                    Refresh-Path
                    if (Resolve-PnpmCommand) {
                        return
                    }
                } catch {

                    if ($Method -ne "auto") {
                        throw
                    }
                    Write-Warn "pnpm :$($_.Exception.Message)"
                }
            }
            "manual" {
                Throw-UserError " pnpm,( https://get.pnpm.io/install.ps1)"
            }
        }
    }

    $npm = Get-NpmCommand
    if ($Method -eq "auto" -and $npm) {
        Write-Warn " npm  pnpm(, pnpm)"
        Invoke-Native -FilePath $npm -Arguments @("install", "-g", "pnpm")
        Refresh-Path
        if (Resolve-PnpmCommand) {
            return
        }
    }

    Throw-UserError " pnpm"
}

function Ensure-Pnpm {
    $pnpm = Resolve-PnpmCommand
    if ($pnpm) {
        $version = & $pnpm --version 2>$null
        Write-Ok " pnpm $version"
        return
    }

    Install-Pnpm -Method $PnpmInstallMethod
    $resolved = Resolve-PnpmCommand
    if (-not $resolved) {
        Throw-UserError "pnpm "
    }

    $version = & $resolved --version 2>$null
    Write-Ok "pnpm :$version"
}

function Ensure-Bun {
    if ($SkipBun) {
        Write-Info " Bun "
        return
    }

    $bun = Get-CommandPath @("bun.exe", "bun")
    if ($bun) {
        $version = & $bun --version 2>$null
        Write-Ok " Bun $version"
        return
    }

    Write-Step " Bun(, Node + Bun )"
    Ensure-ExecutionPolicy

    try {
        Invoke-RemotePowerShellScript -Url "https://bun.sh/install.ps1"
        Refresh-Path
        $bun = Get-CommandPath @("bun.exe", "bun")
        if ($bun) {
            $version = & $bun --version 2>$null
            Write-Ok "Bun :$version"
            return
        }
        Write-Warn "Bun  PATH,"
    } catch {
        Write-Warn "Bun ,:$($_.Exception.Message)"
    }
}

function Invoke-Pnpm {
    param([string[]]$Arguments)

    $pnpm = Resolve-PnpmCommand
    if (-not $pnpm) {
        Throw-UserError "pnpm , bootstrap"
    }

    Invoke-Native -FilePath $pnpm -Arguments $Arguments
}

function Get-NodeCommand {
    return Get-CommandPath @("node.exe", "node")
}

function Invoke-OpenClawCli {
    param([string[]]$Arguments)

    $node = Get-NodeCommand
    if (-not $node) {
        Throw-UserError "Node.js , bootstrap"
    }

    $runner = Join-Path $script:RepoRoot "scripts\run-node.mjs"
    if (-not (Test-Path $runner)) {
        Throw-UserError " OpenClaw CLI :$runner"
    }

    # Windows 下经由 pnpm.cmd 传递 JSON 参数容易被 cmd/PowerShell 重写引号，
    # 这里直接调用 Node runner，保留参数原样传递给官方 CLI。
    Invoke-Native -FilePath $node -Arguments (@($runner) + $Arguments)
}

function Ensure-RepoRoot {

    if (-not (Test-Path (Join-Path $script:RepoRoot "package.json"))) {
        Throw-UserError " OpenClaw "
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
        return ""
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

    Write-Step " workspace "
    Write-Info " filter-extensions, pnpm-workspace.yaml"
    Write-Info " workspace , Web3 ( web3-core / market-core)"

    if (-not $NoLocalEnv) {
        Ensure-LocalEnvFile -EnvName $Environment -Force:$ForceLocalEnv -UseLanBinding:$AllowLan | Out-Null
    }

    Write-Step ""
    Invoke-Pnpm -Arguments @("install")

    if (-not $SkipUiBuild) {
        Write-Step " UI"
        Invoke-Pnpm -Arguments @("ui:build")
    } else {
        Write-Info " ui:build"
    }

    if (-not $SkipBuild) {
        Write-Step ""
        Invoke-Pnpm -Arguments @("build")
    } else {
        Write-Info "Skip build because of input flags"
    }

    Import-PrivateEnv -EnvName $Environment
    Ensure-OfficialConfigAndPreset

    if (-not $SkipDoctor) {
        Write-Step "Run upstream diagnostics"
        Invoke-OpenClawCli -Arguments @("doctor")
    }


    if ($GatewayService) {
        Install-GatewayService
        Show-GatewayStatus
    }

    Write-Step "Bootstrap complete"
    Write-Info "Repo Root: $script:RepoRoot"
    Write-Info "State Dir: $(Get-StateDirDisplay)"
    Write-Info "Config Path: $(Get-ConfiguredOpenClawConfigPath)"
    Write-Info "Preset: $(Get-LoadedPresetDisplay)"
    Write-Info "Upstream default paths stay unchanged unless you override them via process env or private/env files."
    Write-Info "Run locally: powershell -File private/scripts/windows-dev.ps1 -Action gateway-run -Environment $Environment"
    Write-Info "Install service: powershell -File private/scripts/windows-dev.ps1 -Action gateway-install -Environment $Environment"
    Write-Info "Docker: powershell -File private/scripts/windows-dev.ps1 -Action docker-up -Environment $Environment"
}

function Install-GatewayService {
    Ensure-LocalCliPrereqs
    Import-PrivateEnv -EnvName $Environment
    Ensure-OfficialConfigAndPreset

    Write-Step "/ Windows  Gateway "
    Write-Info " CLI:openclaw gateway install"
    Invoke-OpenClawCli -Arguments @("gateway", "install")
    Write-Ok "Gateway "

}

function Run-Gateway {
    Ensure-LocalCliPrereqs
    Import-PrivateEnv -EnvName $Environment
    Ensure-OfficialConfigAndPreset

    Write-Step " PowerShell  Gateway"
    Write-Info " CLI:openclaw gateway run"
    Invoke-OpenClawCli -Arguments @("gateway", "run")
}

function Show-GatewayStatus {
    Ensure-LocalCliPrereqs
    Import-PrivateEnv -EnvName $Environment

    Write-Step " Gateway "
    Invoke-OpenClawCli -Arguments @("gateway", "status", "--json")

}

function Run-Doctor {
    Ensure-LocalCliPrereqs
    Import-PrivateEnv -EnvName $Environment
    Ensure-OfficialConfigAndPreset

    Write-Step ""
    Invoke-OpenClawCli -Arguments @("doctor")

}

function Ensure-Docker {
    $docker = Get-CommandPath @("docker.exe", "docker")
    if (-not $docker) {
        Throw-UserError " Docker Docker Desktop"
    }

    try {
        Invoke-Native -FilePath $docker -Arguments @("compose", "version") | Out-Null
    } catch {
        Throw-UserError " docker, docker compose  Docker Desktop "
    }
}

function Invoke-DockerCompose {
    param([string[]]$Arguments)

    $docker = Get-CommandPath @("docker.exe", "docker")
    if (-not $docker) {
        Throw-UserError " Docker"
    }

    $allArguments = @("compose") + $Arguments
    Invoke-Native -FilePath $docker -Arguments $allArguments
}

function Ensure-ComposeLocalEnvFile {
    param([string]$EnvName)

    $local = Join-Path $script:RepoRoot "private\env\$EnvName.env.local"
    if (-not (Test-Path $local)) {
        Set-Content -Path $local -Value @("# Machine-local overrides for Docker Compose") -Encoding UTF8
        Write-Ok " env :private/env/$EnvName.env.local"
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

    Write-Step "Docker Compose (Windows )"
    if ($image -eq "openclaw:dev" -or $image.EndsWith(":local")) {
        Write-Info ",:$image"
        $docker = Get-CommandPath @("docker.exe", "docker")
        Invoke-Native -FilePath $docker -Arguments @("build", "--build-arg", "OPENCLAW_PNPM_FORCE=$pnpmForce", "-t", $image, ".")
    } else {
        Write-Info ",:$image"
        Invoke-DockerCompose -Arguments ($composeArgs + @("pull"))
    }

    Invoke-DockerCompose -Arguments ($composeArgs + @("up", "-d"))
    Write-Ok "Docker Compose "
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

    Write-Step " Docker Compose"
    Invoke-DockerCompose -Arguments ($composeArgs + @("down"))
    Write-Ok "Docker Compose "
}

function Show-Status {
    Ensure-LocalCliPrereqs
    Import-PrivateEnv -EnvName $Environment

    Write-Step "OpenClaw Windows "
    Write-Info "Repo Root: $script:RepoRoot"
    Write-Info "State Dir: $(Get-StateDirDisplay)"
    Write-Info "Config Path: $(Get-ConfiguredOpenClawConfigPath)"
    Write-Info "Preset: $(Get-LoadedPresetDisplay)"

    try {
        Show-GatewayStatus
    } catch {
        Write-Warn "Gateway :$($_.Exception.Message)"
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
            Write-Step "Docker Compose "
            Invoke-DockerCompose -Arguments $composeArgs
        } catch {
            Write-Warn "Docker Compose :$($_.Exception.Message)"
        }
    } else {
        Write-Info " Docker, compose "
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
    default { Throw-UserError " Action: $Action" }
}

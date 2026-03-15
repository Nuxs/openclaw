function ConvertTo-PlainData {
    param([Parameter(Mandatory = $true)]$Value)

    if ($null -eq $Value) {
        return $null
    }

    if ($Value -is [System.Collections.IDictionary]) {
        $map = @{}
        foreach ($key in $Value.Keys) {
            $map[[string]$key] = ConvertTo-PlainData -Value $Value[$key]
        }
        return $map
    }

    if ($Value -is [pscustomobject]) {
        $map = @{}
        foreach ($property in $Value.PSObject.Properties) {
            $map[$property.Name] = ConvertTo-PlainData -Value $property.Value
        }
        return $map
    }

    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        $items = @()
        foreach ($item in $Value) {
            $items += @(ConvertTo-PlainData -Value $item)
        }
        return $items
    }

    return $Value
}

function Test-DictionaryLike {
    param($Value)

    return ($Value -is [System.Collections.IDictionary]) -or ($Value -is [pscustomobject])
}

function Format-RepoRelativePath {
    param([string]$Path)

    if (-not $Path) {
        return $Path
    }

    if ($Path.StartsWith($script:RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relative = $Path.Substring($script:RepoRoot.Length).TrimStart('\', '/')
        return ($relative -replace '\\', '/')
    }

    return $Path
}

function Get-WindowsDevTemplatePath {
    return Join-Path $script:RepoRoot "private\windows-dev.template.psd1"
}

function Get-WindowsDevLocalPresetPath {
    return Join-Path $script:RepoRoot "private\windows-dev.local.psd1"
}

function Resolve-WindowsDevPresetPath {
    param([string]$ExplicitPath)

    if ($ExplicitPath -and $ExplicitPath.Trim()) {
        if ([System.IO.Path]::IsPathRooted($ExplicitPath)) {
            return $ExplicitPath
        }

        return Join-Path $script:RepoRoot $ExplicitPath
    }

    $local = Get-WindowsDevLocalPresetPath
    if (Test-Path $local) {
        return $local
    }

    return $null
}

function Get-WindowsDevPresetSection {
    param([string]$Name)

    if (-not $script:WindowsDevPreset) {
        return $null
    }

    if (-not $script:WindowsDevPreset.ContainsKey($Name)) {
        return $null
    }

    return $script:WindowsDevPreset[$Name]
}

function Set-ScriptValueFromPresetDefault {
    param(
        [string]$Name,
        $Value
    )

    if ($script:InputBoundParameters.ContainsKey($Name)) {
        return
    }

    Set-Variable -Scope Script -Name $Name -Value $Value
    Write-Info "预设默认：$Name"
}

function Apply-WindowsDevPresetDefaults {
    $bootstrap = Get-WindowsDevPresetSection -Name "Bootstrap"
    if (-not (Test-DictionaryLike -Value $bootstrap)) {
        return
    }

    $defaults = $bootstrap["Defaults"]
    if (-not (Test-DictionaryLike -Value $defaults)) {
        return
    }

    $plainDefaults = ConvertTo-PlainData -Value $defaults
    foreach ($key in $plainDefaults.Keys) {
        Set-ScriptValueFromPresetDefault -Name $key -Value $plainDefaults[$key]
    }
}

function Initialize-WindowsDevPreset {
    param([string]$ExplicitPath)

    $presetPath = Resolve-WindowsDevPresetPath -ExplicitPath $ExplicitPath
    if (-not $presetPath) {
        return
    }

    if (-not (Test-Path $presetPath)) {
        Throw-UserError "预设文件不存在：$presetPath"
    }

    try {
        $loaded = Import-PowerShellDataFile -Path $presetPath
    } catch {
        Throw-UserError "加载预设文件失败：$($_.Exception.Message)"
    }

    $script:LoadedPresetPath = $presetPath
    $script:WindowsDevPreset = ConvertTo-PlainData -Value $loaded
    Write-Ok "已加载预设模板：$(Format-RepoRelativePath -Path $presetPath)"
    Apply-WindowsDevPresetDefaults
}

function Initialize-WindowsDevTemplate {
    $templatePath = Get-WindowsDevTemplatePath
    $localPresetPath = Get-WindowsDevLocalPresetPath

    if (-not (Test-Path $templatePath)) {
        Throw-UserError "缺少预设模板：$templatePath"
    }

    if (Test-Path $localPresetPath) {
        Write-Ok "已存在本地预设文件：$(Format-RepoRelativePath -Path $localPresetPath)"
        return
    }

    Copy-Item -Path $templatePath -Destination $localPresetPath
    Write-Ok "已生成本地预设文件：$(Format-RepoRelativePath -Path $localPresetPath)"
    Write-Info "这是仓库内 bootstrap 预设，不负责 clone 仓库。请先确保同事已经 clone 到本地，再编辑仓库地址、镜像名、Branding 和 OpenClawConfig 默认值后运行 bootstrap。"
}

function Convert-EnvValue {
    param([string]$RawValue)

    $value = $RawValue.Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        return $value.Substring(1, $value.Length - 2)
    }

    return $value
}

function Import-EnvFile {
    param([string]$FilePath)

    if (-not (Test-Path $FilePath)) {
        return
    }

    foreach ($line in Get-Content -Path $FilePath) {
        if ($line -match '^\s*#' -or $line -match '^\s*$') {
            continue
        }

        $match = [regex]::Match($line, '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$')
        if (-not $match.Success) {
            continue
        }

        $name = $match.Groups[1].Value
        $value = Convert-EnvValue -RawValue $match.Groups[2].Value

        # 进程里显式传入的变量优先级最高；否则允许 .env.local 覆盖 .env。
        if ($script:InitialEnvNames.Contains($name)) {
            continue
        }

        [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
        Set-Item -Path "Env:$name" -Value $value
    }
}

function Import-PrivateEnv {
    param([string]$EnvName)

    $tracked = Join-Path $script:RepoRoot "private\env\$EnvName.env"
    $local = Join-Path $script:RepoRoot "private\env\$EnvName.env.local"

    Import-EnvFile -FilePath $tracked
    Import-EnvFile -FilePath $local
}

function New-DevToken {
    return "win-dev-" + [guid]::NewGuid().ToString("N")
}

function Convert-EnvScalarToString {
    param($Value)

    if ($null -eq $Value) {
        return ""
    }

    if ($Value -is [bool]) {
        if ($Value) {
            return "1"
        }
        return "0"
    }

    return [string]$Value
}

function Get-PresetEnvironmentDefaults {
    param([string]$EnvName)

    $defaults = Get-WindowsDevPresetSection -Name "EnvironmentDefaults"
    if (-not (Test-DictionaryLike -Value $defaults)) {
        return $null
    }

    if (-not $defaults.ContainsKey($EnvName)) {
        return $null
    }

    $section = $defaults[$EnvName]
    if (-not (Test-DictionaryLike -Value $section)) {
        return $null
    }

    return (ConvertTo-PlainData -Value $section)
}

function Add-MissingEnvDefaultsToFile {
    param(
        [string]$FilePath,
        [string]$EnvName
    )

    $defaults = Get-PresetEnvironmentDefaults -EnvName $EnvName
    if (-not $defaults -or $defaults.Count -eq 0) {
        return
    }

    $existingKeys = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($line in Get-Content -Path $FilePath) {
        $match = [regex]::Match($line, '^\s*([A-Za-z_][A-Za-z0-9_]*)=')
        if ($match.Success) {
            [void]$existingKeys.Add($match.Groups[1].Value)
        }
    }

    $appendLines = @()
    foreach ($key in $defaults.Keys) {
        if ($existingKeys.Contains($key)) {
            continue
        }

        $value = Convert-EnvScalarToString -Value $defaults[$key]
        $appendLines += "$key=$value"
    }

    if ($appendLines.Count -eq 0) {
        return
    }

    Add-Content -Path $FilePath -Value @("", "# Defaults from private/windows-dev.local.psd1")
    Add-Content -Path $FilePath -Value $appendLines
    Write-Ok "已把预设 env 默认值补充到：private/env/$EnvName.env.local"
}

function Ensure-LocalEnvFile {
    param(
        [string]$EnvName,
        [switch]$Force,
        [switch]$UseLanBinding
    )

    $tracked = Join-Path $script:RepoRoot "private\env\$EnvName.env"
    if (-not (Test-Path $tracked)) {
        Throw-UserError "缺少环境模板：$tracked"
    }

    $local = Join-Path $script:RepoRoot "private\env\$EnvName.env.local"
    if ((Test-Path $local) -and -not $Force) {
        Write-Ok "已存在本地覆盖文件：private/env/$EnvName.env.local"
        Add-MissingEnvDefaultsToFile -FilePath $local -EnvName $EnvName
        return $local
    }

    $bind = if ($UseLanBinding) { "lan" } else { "loopback" }
    $lines = @(
        "# Generated by private/scripts/windows-dev.ps1",
        "# This file is machine-local and ignored by git.",
        "OPENCLAW_GATEWAY_TOKEN=$(New-DevToken)",
        "OPENCLAW_GATEWAY_BIND=$bind"
    )

    if ($EnvName -eq "dev") {
        $lines += "OPENCLAW_ALLOW_UNCONFIGURED=1"
        $lines += "NODE_ENV=development"
        $lines += "LOG_LEVEL=debug"
    }

    $lines += @(
        "# OPENAI_API_KEY=",
        "# ANTHROPIC_API_KEY=",
        "# GEMINI_API_KEY=",
        "# OPENROUTER_API_KEY="
    )

    Set-Content -Path $local -Value $lines -Encoding UTF8
    Add-MissingEnvDefaultsToFile -FilePath $local -EnvName $EnvName
    Write-Ok "已生成本地覆盖文件：private/env/$EnvName.env.local"
    return $local
}

function Merge-OverlayData {
    param(
        $Base,
        $Overlay
    )

    if ((Test-DictionaryLike -Value $Base) -and (Test-DictionaryLike -Value $Overlay)) {
        $merged = ConvertTo-PlainData -Value $Base
        $overlayMap = ConvertTo-PlainData -Value $Overlay

        foreach ($key in $overlayMap.Keys) {
            if ($merged.ContainsKey($key)) {
                $merged[$key] = Merge-OverlayData -Base $merged[$key] -Overlay $overlayMap[$key]
            } else {
                $merged[$key] = ConvertTo-PlainData -Value $overlayMap[$key]
            }
        }

        return $merged
    }

    return (ConvertTo-PlainData -Value $Overlay)
}

function Apply-PresetBranding {
    $branding = Get-WindowsDevPresetSection -Name "Branding"
    if (-not (Test-DictionaryLike -Value $branding)) {
        return
    }

    $applyOnBootstrap = if ($branding.ContainsKey("ApplyOnBootstrap")) {
        [bool]$branding["ApplyOnBootstrap"]
    } else {
        $false
    }

    if (-not $applyOnBootstrap) {
        return
    }

    $overlay = $branding["Json"]
    if (-not (Test-DictionaryLike -Value $overlay)) {
        Write-Warn "Branding.ApplyOnBootstrap=true，但未提供 Branding.Json；已跳过。"
        return
    }

    $brandPath = Join-Path $script:RepoRoot "private\brand.json"
    if (-not (Test-Path $brandPath)) {
        Throw-UserError "缺少品牌配置文件：$brandPath"
    }

    $currentRaw = Get-Content -Path $brandPath -Raw
    $current = ConvertTo-PlainData -Value ($currentRaw | ConvertFrom-Json)
    $next = Merge-OverlayData -Base $current -Overlay $overlay

    $currentJson = ($current | ConvertTo-Json -Depth 50)
    $nextJson = ($next | ConvertTo-Json -Depth 50)
    if ($currentJson -eq $nextJson) {
        Write-Info "品牌配置已与预设一致。"
        return
    }

    Set-Content -Path $brandPath -Value $nextJson -Encoding UTF8
    Write-Ok "已按预设更新：private/brand.json"
}

function Ensure-ExpectedOriginRemote {
    $repository = Get-WindowsDevPresetSection -Name "Repository"
    if (-not (Test-DictionaryLike -Value $repository)) {
        return
    }

    $expectedOrigin = $repository["OriginUrl"]
    if (-not $expectedOrigin -or -not ([string]$expectedOrigin).Trim()) {
        return
    }

    $git = Get-CommandPath @("git.exe", "git")
    if (-not $git) {
        return
    }

    $origin = & $git -C $script:RepoRoot remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "当前仓库没有 origin remote，预设期望：$expectedOrigin"
        return
    }

    $actual = ([string]$origin).Trim()
    if ($actual -ne $expectedOrigin) {
        Write-Warn "origin remote 与预设不一致：当前=$actual；预设=$expectedOrigin"
        return
    }

    Write-Ok "origin remote 已匹配预设仓库"
}

function Get-ConfiguredStateDir {
    $stateDir = [System.Environment]::GetEnvironmentVariable("OPENCLAW_STATE_DIR", "Process")
    if ($stateDir -and $stateDir.Trim()) {
        return $stateDir
    }

    return (Join-Path $env:USERPROFILE ".openclaw")
}

function Get-ConfiguredWorkspaceDir {
    $workspaceDir = [System.Environment]::GetEnvironmentVariable("OPENCLAW_WORKSPACE_DIR", "Process")
    if ($workspaceDir -and $workspaceDir.Trim()) {
        return $workspaceDir
    }

    return (Join-Path (Get-ConfiguredStateDir) "workspace")
}

function Get-ConfiguredOpenClawConfigPath {
    $configPath = [System.Environment]::GetEnvironmentVariable("OPENCLAW_CONFIG_PATH", "Process")
    if ($configPath -and $configPath.Trim()) {
        return $configPath
    }

    return (Join-Path (Get-ConfiguredStateDir) "openclaw.json")
}

function Ensure-OpenClawSetup {
    $workspaceDir = Get-ConfiguredWorkspaceDir
    Write-Step "初始化官方 openclaw 配置与工作区"
    Invoke-Pnpm -Arguments @("openclaw", "setup", "--workspace", $workspaceDir)
}

function Escape-OpenClawConfigPathSegment {
    param([string]$Segment)

    return $Segment.Replace('\', '\\').Replace('.', '\.').Replace('[', '\[').Replace(']', '\]')
}

function Join-OpenClawConfigPath {
    param(
        [string]$Prefix,
        [string]$Segment
    )

    $escaped = Escape-OpenClawConfigPathSegment -Segment $Segment
    if (-not $Prefix) {
        return $escaped
    }

    return "$Prefix.$escaped"
}

function Get-OpenClawConfigValue {
    param([string]$Path)

    $pnpm = Resolve-PnpmCommand
    if (-not $pnpm) {
        Throw-UserError "pnpm 不可用，无法读取 OpenClaw 配置。"
    }

    $output = & $pnpm openclaw config get $Path --json 2>$null
    if ($LASTEXITCODE -ne 0) {
        return @{ Found = $false; Value = $null }
    }

    $rawText = ($output | Out-String).Trim()
    if (-not $rawText) {
        return @{ Found = $true; Value = $null }
    }

    try {
        $value = ConvertFrom-Json -InputObject $rawText
    } catch {
        $value = $rawText
    }

    return @{ Found = $true; Value = (ConvertTo-PlainData -Value $value) }
}

function Set-OpenClawConfigValue {
    param(
        [string]$Path,
        $Value
    )

    $json = ConvertTo-PlainData -Value $Value | ConvertTo-Json -Depth 100 -Compress
    Invoke-Pnpm -Arguments @("openclaw", "config", "set", $Path, $json, "--strict-json")
}

function Seed-OpenClawConfigPath {
    param(
        [string]$Path,
        $Value
    )

    $current = Get-OpenClawConfigValue -Path $Path
    if (-not $current.Found) {
        Set-OpenClawConfigValue -Path $Path -Value $Value
        Write-Ok "已写入缺省配置：$Path"
        return
    }

    $plainValue = ConvertTo-PlainData -Value $Value
    if ((Test-DictionaryLike -Value $plainValue) -and (Test-DictionaryLike -Value $current.Value)) {
        foreach ($key in $plainValue.Keys) {
            $childPath = Join-OpenClawConfigPath -Prefix $Path -Segment $key
            Seed-OpenClawConfigPath -Path $childPath -Value $plainValue[$key]
        }
        return
    }
}

function Ensure-OpenClawConfigFromPreset {
    $configPreset = Get-WindowsDevPresetSection -Name "OpenClawConfig"
    if (-not (Test-DictionaryLike -Value $configPreset)) {
        return
    }

    $applyOnBootstrap = if ($configPreset.ContainsKey("ApplyOnBootstrap")) {
        [bool]$configPreset["ApplyOnBootstrap"]
    } else {
        $true
    }

    if (-not $applyOnBootstrap) {
        return
    }

    $root = $configPreset["Root"]
    if (-not (Test-DictionaryLike -Value $root)) {
        Write-Warn "OpenClawConfig.ApplyOnBootstrap=true，但未提供 OpenClawConfig.Root；已跳过。"
        return
    }

    Write-Step "按预设补齐官方 openclaw.json 缺省值"
    $plainRoot = ConvertTo-PlainData -Value $root
    foreach ($key in $plainRoot.Keys) {
        Seed-OpenClawConfigPath -Path (Escape-OpenClawConfigPathSegment -Segment $key) -Value $plainRoot[$key]
    }

    Invoke-Pnpm -Arguments @("openclaw", "config", "validate")
    Write-Ok "官方 openclaw.json 缺省值已同步"
}

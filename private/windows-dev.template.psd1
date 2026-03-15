@{
    Repository = @{
        #  origin remotebootstrap 
        OriginUrl = "git@github.com:your-org/openclaw-private.git"
        # : clone , clone
        CloneUrl = "https://github.com/your-org/openclaw-private.git"
    }

    Bootstrap = @{
        Defaults = @{
            Environment = "dev"
            NodeInstallMethod = "auto"
            PnpmInstallMethod = "auto"
            AllowLan = $true
            GatewayService = $false
            SkipBun = $false
        }
    }

    Branding = @{
        # true ,bootstrap / gateway-run / gateway-install / docker-up  Json overlay  private/brand.json
        ApplyOnBootstrap = $false
        Json = @{
            name = "OpenClaw Private"
            nameLower = "openclaw-private"
            description = "Your private OpenClaw distribution"
            ui = @{
                title = "OpenClaw Private"
                primaryColor = "#6366f1"
            }
            docker = @{
                registry = "ghcr.io"
                imageName = "your-org/openclaw-private"
            }
            deploy = @{
                domain = "gateway.example.com"
                gatewayPort = 18789
                bridgePort = 18790
            }
        }
    }

    EnvironmentDefaults = @{
        dev = @{
            OPENCLAW_IMAGE = "ghcr.io/your-org/openclaw-private:dev"
            OPENCLAW_GATEWAY_BIND = "lan"
            OPENCLAW_GATEWAY_PORT = "18789"
            OPENCLAW_BRIDGE_PORT = "18790"
            OPENCLAW_ALLOW_UNCONFIGURED = "1"
            OPENCLAW_WORKSPACE_DIR = "~/.openclaw/workspace"
            OPENAI_API_KEY = ""
            ANTHROPIC_API_KEY = ""
            GEMINI_API_KEY = ""
            OPENROUTER_API_KEY = ""
            PINATA_JWT = ""
            WEB3_CHAIN_PRIVATE_KEY = ""
        }
        staging = @{
            OPENCLAW_IMAGE = "ghcr.io/your-org/openclaw-private:staging"
            OPENCLAW_GATEWAY_BIND = "lan"
            OPENCLAW_GATEWAY_PORT = "18789"
            OPENCLAW_BRIDGE_PORT = "18790"
        }
        prod = @{
            OPENCLAW_IMAGE = "ghcr.io/your-org/openclaw-private:latest"
            OPENCLAW_GATEWAY_BIND = "lan"
            OPENCLAW_GATEWAY_PORT = "18789"
            OPENCLAW_BRIDGE_PORT = "18790"
        }
    }

    OpenClawConfig = @{
        # true , ~/.openclaw/openclaw.json( OPENCLAW_CONFIG_PATH),
        ApplyOnBootstrap = $true
        Root = @{
            gateway = @{
                mode = "local"
            }
            agents = @{
                defaults = @{
                    workspace = "~/.openclaw/workspace"
                }
            }

        }
    }
}

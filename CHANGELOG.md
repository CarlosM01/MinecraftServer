# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **ZeroTier VPN Gateway**: Integrated ZeroTier as a VPN gateway for the Minecraft server. The server is now accessible exclusively through the ZeroTier virtual network, making it invisible from the public internet.
  - New `zerotier` service in `docker-compose.yml` using `zyclonite/zerotier:latest`.
  - Minecraft container shares ZeroTier's network namespace via `network_mode: service:zerotier`.
  - ZeroTier node identity persisted in `./zerotier-config/` (git-ignored).
- **ZeroTier management commands** in `Makefile`:
  - `make zt-status` — Show ZeroTier daemon status.
  - `make zt-info` — List joined networks and assigned IPs.
  - `make zt-peers` — List connected ZeroTier peers.
- **ZeroTier setup documentation** (`zerotier.md`): Complete guide covering network creation, server setup, player connection, and troubleshooting.
- **Environment variables**: `ZEROTIER_NETWORK_ID` and `ZEROTIER_PORT` in `.env` / `.env.example` for VPN configuration.

### Changed
- `docker-compose.yml`: Minecraft server ports are now exposed through the ZeroTier container instead of directly on the host.
- `README.md`: Added "VPN Access (ZeroTier)" section, ZeroTier as a prerequisite, and documented new `make zt-*` commands.
- `.gitignore`: Added `/zerotier-config/` to exclude ZeroTier identity and private keys.

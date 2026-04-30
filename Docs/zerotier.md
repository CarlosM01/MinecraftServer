# ZeroTier VPN Integration

This project uses [ZeroTier](https://www.zerotier.com/) as a VPN gateway to secure access to the Minecraft server. Instead of exposing ports directly to the internet, the server is only reachable through the ZeroTier virtual network.

## How It Works

1. A `zerotier` Docker container runs alongside the Minecraft server.
2. The Minecraft container shares the ZeroTier container's network namespace (`network_mode: service:zerotier`).
3. Players must install ZeroTier and join the authorized network to connect.
4. The server is **invisible** from the public internet.

## Setup

### 1. Create a ZeroTier Network

1. Go to [my.zerotier.com](https://my.zerotier.com) and create an account.
2. Click **"Create A Network"**.
3. Copy the **Network ID** (16-character hex string, e.g. `8056c2e21c000001`).

### 2. Configure the Server

Add your Network ID to the `.env` file:

```env
ZEROTIER_NETWORK_ID=your_network_id_here
```

### 3. Start the Server

```bash
make up
```

### 4. Authorize the Server Node

1. After starting, check the ZeroTier status:
   ```bash
   make zt-status
   ```
2. Go to [my.zerotier.com](https://my.zerotier.com) → Your Network → **Members**.
3. You'll see a new node — **check the "Auth?" checkbox** to authorize it.
4. Note the **Managed IP** assigned to your server (e.g. `10.147.20.5`).

### 5. Connect Players

Each player must:

1. Install ZeroTier: [zerotier.com/download](https://www.zerotier.com/download)
2. Join your network:
   ```bash
   sudo zerotier-cli join <your_network_id>
   ```
3. Be authorized by you in the ZeroTier Central dashboard.
4. Connect to Minecraft using the server's **ZeroTier IP** (e.g. `10.147.20.5:25565`).

## Management Commands

| Command           | Description                                   |
|-------------------|-----------------------------------------------|
| `make zt-status`  | Show ZeroTier daemon status                   |
| `make zt-info`    | List joined networks and assigned IPs         |
| `make zt-peers`   | List connected ZeroTier peers                 |

## Troubleshooting

### Node not appearing in ZeroTier Central

```bash
# Verify ZeroTier is running
make zt-status

# Check network membership
make zt-info
```

If the network shows `ACCESS_DENIED`, the node hasn't been authorized yet in the dashboard.

### Players can't connect

1. Verify the player has joined the correct network and is authorized.
2. Check that the server's ZeroTier IP is correct:
   ```bash
   make zt-info
   ```
3. Ensure the Minecraft server is fully started:
   ```bash
   make logs
   ```

### Container won't start

Ensure the host has the TUN device available:

```bash
ls -la /dev/net/tun
```

If missing, load the kernel module:

```bash
sudo modprobe tun
```
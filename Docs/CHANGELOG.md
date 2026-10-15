# Changelog — Minecraft Server

Bitácora de desarrollo del proyecto. Cada entrada corresponde a un commit y
registra qué cambió, por qué, y cómo encontrarlo en el historial de git.

> **Convención de tipos:**
> `feat` · `fix` · `chore` · `docs` · `refactor` · `test` · `perf`

---

<!--
  ┌─────────────────────────────────────────────────────┐
  │  PLANTILLA PARA NUEVAS ENTRADAS                     │
  │                                                     │
  │  ## [tipo] título corto                             │
  │                                                     │
  │  | Meta          | Valor                            │
  │  |---------------|-----------------------------------│
  │  | **Commit**    | `hash`                           │
  │  | **Fecha**     | YYYY-MM-DD                       │
  │  | **Rama**      | `branch`                         │
  │  | **Autor**     | Nombre                           │
  │  | **Archivos**  | lista de archivos clave          │
  │  | **Tags**      | #etiqueta #etiqueta              │
  │                                                     │
  │  ### ¿Qué cambió?                                   │
  │  Descripción clara del cambio.                      │
  │                                                     │
  │  ### ¿Por qué?                                      │
  │  Motivación / problema que resuelve.                │
  │                                                     │
  │  ### Notas técnicas                                 │
  │  Detalles de implementación relevantes.             │
  └─────────────────────────────────────────────────────┘
-->

---

## [feat] Módulo de monitoreo de Docker (Stats & Logs)

| Meta          | Valor                                                                                    |
|---------------|------------------------------------------------------------------------------------------|
| **Commit**    | `current`                                                                                |
| **Fecha**     | 2026-05-01                                                                               |
| **Rama**      | `dev`                                                                                    |
| **Autor**     | CarlosM01                                                                                |
| **Archivos**  | `webapp/backend/` · `webapp/frontend/hooks/` · `Makefile` · `README.md`                  |
| **Tags**      | #monitoring #docker #backend #websockets #react                                          |

### ¿Qué cambió?

- Implementación del servicio `DockerService` para la obtención de métricas y logs en tiempo real.
- Exposición de endpoints REST y namespaces de Socket.io (`/docker/stats`, `/docker/logs`).
- Creación de hooks de React optimizados para el consumo de métricas y logs desde el frontend.
- Integración de nuevos comandos en el `Makefile` para gestión y testing del módulo webapp.

### ¿Por qué?

Habilitar el monitoreo centralizado del servidor de Minecraft (CPU, RAM, Uptime) y visualización de logs directamente desde un dashboard web, mejorando la operatividad.

### Notas técnicas

- Cálculo de CPU mediante el método de deltas de Docker.
- Demultiplexación de streams de logs (stdout/stderr) usando el modem de `dockerode`.
- Los hooks de frontend implementan batching de renders (`requestAnimationFrame`) para manejar flujos de logs intensos.

---

## [feat] Integración de ZeroTier como VPN gateway

| Meta         | Valor                                                                |
|--------------|----------------------------------------------------------------------|
| **Commit**   | `dd0c1ba`                                                            |
| **Fecha**    | 2026-04-29                                                           |
| **Rama**     | `dev`                                                                |
| **Autor**    | CarlosM01                                                            |
| **Archivos** | `docker-compose.yml` · `Makefile` · `.env.example` · `zerotier.md` · `README.md` · `.gitignore` |
| **Tags**     | #vpn #networking #security #docker                                   |

### ¿Qué cambió?

- Nuevo servicio `zerotier` en `docker-compose.yml` usando `zyclonite/zerotier:latest`.
- El servidor de Minecraft comparte el namespace de red de ZeroTier mediante `network_mode: service:zerotier`; los puertos ya no se exponen directamente al host.
- Nuevas variables de entorno: `ZEROTIER_NETWORK_ID`, `ZEROTIER_PORT`.
- Nuevos comandos en el `Makefile`: `make zt-status`, `make zt-info`, `make zt-peers`.
- `zerotier.md` reemplaza el Dockerfile desactualizado con una guía de setup completa.
- `/zerotier-config/` añadido al `.gitignore` (contiene claves privadas del nodo).

### ¿Por qué?

Evitar exponer el puerto 25565 directamente a Internet. Solo los jugadores autorizados dentro de la red ZeroTier pueden conectarse al servidor.

### Notas técnicas

- Al usar `network_mode: service:zerotier`, el contenedor de Minecraft pierde su propio stack de red; **todos los puertos deben declararse en el servicio `zerotier`**.
- La identidad del nodo se persiste en `./zerotier-config/` para evitar re-autorizaciones tras cada reinicio.
- El nodo debe ser autorizado manualmente en [my.zerotier.com](https://my.zerotier.com) tras el primer arranque.

---

## [feat] Dashboard — primer prototipo

| Meta         | Valor                                         |
|--------------|-----------------------------------------------|
| **Commit**   | `68e308a`                                     |
| **Fecha**    | —                                             |
| **Rama**     | `dashboard`                                   |
| **Autor**    | CarlosM01                                     |
| **Archivos** | `dashboard/`                                  |
| **Tags**     | #dashboard #frontend                          |

### ¿Qué cambió?

Primer prototipo del panel de administración web dentro del directorio `dashboard/`.

---

## [feat] Test de integridad de backups

| Meta         | Valor                                                           |
|--------------|-----------------------------------------------------------------|
| **Commit**   | `1dffe01`                                                       |
| **Fecha**    | —                                                               |
| **Rama**     | `dev`                                                           |
| **Autor**    | CarlosM01                                                       |
| **Archivos** | `scripts/test_backup.py` · `docker-compose.test.yml`            |
| **Tags**     | #backup #testing #devops                                        |

### ¿Qué cambió?

Script `test_backup.py` que extrae un backup, levanta un servidor de prueba temporal con `docker-compose.test.yml` y verifica que el mundo cargue correctamente. Soporte para modo manual (`--manual`) para inspección en vivo.

---

## [chore] Estado futuro / ideas

| Meta         | Valor          |
|--------------|----------------|
| **Commit**   | `842a22f`      |
| **Fecha**    | —              |
| **Rama**     | `main`         |
| **Autor**    | CarlosM01      |
| **Tags**     | #docs          |

### ¿Qué cambió?

Sección "Future Features / Ideas" añadida al `README.md`.

---

## [chore] Commit inicial

| Meta         | Valor          |
|--------------|----------------|
| **Commit**   | `6c7b178`      |
| **Fecha**    | —              |
| **Rama**     | `main`         |
| **Autor**    | CarlosM01      |
| **Tags**     | #init          |

### ¿Qué cambió?

Setup base del proyecto: `docker-compose.yml`, `.env.example`, `Makefile`, scripts de backup y bots de Node.js.

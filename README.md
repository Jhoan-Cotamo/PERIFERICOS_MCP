# hardware-mcp

> **Universal Hardware MCP Server** — Capa universal y modular de acceso a periféricos físicos (lectores de códigos de barras USB HID, impresoras térmicas ESC/POS, balanzas y dispositivos seriales) para Agentes de Inteligencia Artificial y aplicaciones modernas mediante el protocolo estándar **Model Context Protocol (MCP)**.

---

## 📋 Tabla de Contenidos

1. [Visión General](#-visión-general)
2. [Arquitectura del Sistema](#-arquitectura-del-sistema)
3. [Periféricos Soportados](#-periféricos-soportados)
4. [Requerimientos del Sistema](#-requerimientos-del-sistema)
5. [Instalación y Puesta en Marcha](#-instalación-y-puesta-en-marcha)
6. [Configuración (`hardware.config.json`)](#-configuración-hardwareconfigjson)
7. [Catálogo de Herramientas MCP](#-catálogo-de-herramientas-mcp)
   - [Gestión de Dispositivos](#1-gestión-de-dispositivos)
   - [Lectores de Códigos de Barras / QR](#2-lectores-de-códigos-de-barras--qr)
   - [Impresoras Térmicas y Facturación](#3-impresoras-térmicas-y-facturación)
   - [Monitoreo y Estado](#4-monitoreo-y-estado)
8. [Configuración en Clientes MCP](#-configuración-en-clientes-mcp)
   - [Claude Desktop](#claude-desktop)
   - [Cursor IDE](#cursor-ide)
   - [Antigravity / Gemini CLI](#antigravity--gemini-cli)
9. [Flujos de Trabajo para Agentes IA](#-flujos-de-trabajo-para-agentes-ia)
10. [Guía para Agregar Nuevos Drivers de Hardware](#-guía-para-agregar-nuevos-drivers-de-hardware)
11. [Solución de Problemas (Troubleshooting)](#-solución-de-problemas-troubleshooting)
12. [Licencia](#-licencia)

---

## 🎯 Visión General

`hardware-mcp` desacopla a los modelos de lenguaje (LLMs) y a las aplicaciones de software de los controladores de bajo nivel de hardware. Proporciona una interfaz unificada sobre comunicación **stdio**, permitiendo a cualquier agente:

- 🛒 **Atender puntos de venta (POS)**: Escanear artículos en tiempo real, calcular totales y expedir tickets de compra.
- 🖨️ **Imprimir recibos y etiquetas**: Formateo tabular automático, logotipos, códigos QR dinámicos y corte de guillotina.
- 💰 **Controlar cajas registradoras**: Apertura automática del cajón monedero vía pulso eléctrico ESC/POS.
- 📦 **Automatizar logística e inventario**: Escucha continua de lectores de códigos de barras (1D y 2D).
- 🧪 **Desarrollo sin hardware físico**: Incluye dispositivos virtuales con visualizador de tickets en archivo spool para pruebas y CI/CD sin requerir cables ni periféricos físicos conectados.

---

## 🏗️ Arquitectura del Sistema

El diseño se fundamenta en una arquitectura desacoplada basada en drivers y servicios:

```
src/
├── server/
│   └── index.ts               # Punto de entrada MCP Stdio & ciclo de vida
├── devices/
│   ├── common/
│   │   ├── base-driver.ts      # Clase abstracta: reconexión, estados y salud
│   │   ├── driver-registry.ts  # Registro extensible de drivers y plugins
│   │   └── print-queue.ts      # Cola de impresión, deduplicación y reintentos
│   ├── barcode/
│   │   ├── hid-barcode-driver.ts     # Lector USB HID (decodificación scancodes)
│   │   ├── serial-barcode-driver.ts  # Lector Serial RS-232 / USB-VCP
│   │   └── virtual-barcode-driver.ts # Lector simulado para pruebas
│   ├── printers/
│   │   ├── escpos-printer-driver.ts  # Driver estándar ESC/POS
│   │   ├── xprinter-driver.ts        # Especialización XPrinter (Buzzer, CP850)
│   │   ├── network-printer-driver.ts # Impresora TCP/IP socket (puerto 9100)
│   │   └── virtual-printer-driver.ts # Impresora virtual con preview en spool
│   └── serial/
│       └── generic-serial-driver.ts  # Dispositivos seriales genéricos
├── services/
│   ├── device-manager.ts      # Descubrimiento automático, hotplug y ciclo de vida
│   ├── barcode-manager.ts     # Escucha continua, esperas asíncronas y buffer
│   └── printer-manager.ts     # Cola de impresión, formateo de tickets y cajón
├── tools/
│   ├── device-tools.ts        # listDevices, getDeviceStatus
│   ├── barcode-tools.ts       # waitForBarcode, getLastBarcode, simulateBarcode
│   └── printer-tools.ts       # printReceipt, printText, cutPaper, openCashDrawer
├── models/                    # Definiciones TypeScript y tipos de dominio
├── config/                    # Carga y validación de hardware.config.json
└── utils/
    ├── logger.ts              # Logger seguro para stdio (escritura en stderr/archivo)
    ├── errors.ts              # Excepciones tipadas
    └── hid-utils.ts           # Parser de tablas de scancodes USB HID
```

### Principio de Comunicación Limpia en Stdio
> [!IMPORTANT]
> Los servidores MCP que operan sobre `stdio` reservan `stdout` estrictamente para tramas JSON-RPC. En `hardware-mcp`, **todas las salidas de log, depuración y diagnósticos se canalizan a `process.stderr` o a un archivo en disco**, garantizando que el canal de comunicación del protocolo jamás se corrompa.

---

## 🔌 Periféricos Soportados

| Categoría | Protocolos / Interfaces | Marcas y Modelos Comprobados |
| :--- | :--- | :--- |
| **Impresoras Térmicas** | ESC/POS (USB, Red TCP 9100, Serial COM) | **XPrinter** (XP-N160I, XP-58, XP-80C, XP-Q800), Epson TM-T20 / TM-T88, Star Micronics, Bixolon, Rongta, Zjiang |
| **Lectores de Códigos** | USB HID (Keyboard / POS Raw), Serial VCP | Zebra / Symbol, Honeywell / Metrologic, Datalogic, Netum, Newland, Eyoyo, Tera, Lectores QR 2D genéricos |
| **Cajones Monederos** | Conexión RJ-11 / RJ-12 (Pin 2 y 5) | Cualquier cajón accionado por solenoide de 12V / 24V conectado a la impresora |
| **Dispositivos Seriales** | RS-232, USB-UART (FTDI, CP2102, CH340) | Balanzas comerciales (CAS, Torrey, Toledo, Dibal), Lectores RFID/NFC, Arduinos, Sensores industriales |
| **Dispositivos Virtuales** | Emulación en memoria y disco | Virtual Barcode Scanner & Virtual Thermal Printer con visualizador de tickets |

---

## 💻 Requerimientos del Sistema

- **Node.js**: v18.0.0 o superior (probado en Node.js v22 LTS).
- **Sistemas Operativos**:
  - **Windows** 10 / 11 / Server (x64 / ARM64).
  - **Linux** (Ubuntu, Debian, Fedora, Arch, Raspberry Pi OS).
  - **macOS** 12+ (Intel y Apple Silicon).
- **Puertos**: Permisos de lectura/escritura en puertos USB y Seriales.

---

## 🚀 Instalación y Puesta en Marcha

### 1. Clonar el Repositorio
```bash
git clone https://github.com/Jhoan-Cotamo/PERIFERICOS_MCP.git
cd PERIFERICOS_MCP
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Compilar el Proyecto TypeScript
```bash
npm run build
```

### 4. Ejecutar las Pruebas de Integración Automatizadas
El proyecto incluye un banco de pruebas exhaustivo que comprueba todos los componentes sin requerir hardware físico:
```bash
npm test
```

### 5. Permisos en Linux (Opcional si usas Linux)
En sistemas Linux, el acceso a dispositivos USB HID y puertos seriales requiere configurar reglas `udev` y pertenecer al grupo `dialout`:
```bash
# Agregar tu usuario al grupo dialout para puertos seriales
sudo usermod -a -G dialout $USER

# Crear regla udev para impresoras y lectores USB
echo 'SUBSYSTEM=="usb", ATTRS{idVendor}=="*", MODE="0666"' | sudo tee /etc/udev/rules.d/99-hardware-mcp.rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

---

## ⚙️ Configuración (`hardware.config.json`)

El servidor busca su archivo de configuración en:
1. La variable de entorno `HARDWARE_CONFIG_PATH`.
2. El archivo `./hardware.config.json` en la raíz de ejecución.
3. El archivo predeterminado generado automáticamente en `src/config/hardware.config.json`.

### Estructura de Ejemplo

```json
{
  "server": {
    "name": "hardware-mcp",
    "version": "1.0.0",
    "enableVirtualFallback": true
  },
  "logging": {
    "level": "info",
    "logToFile": true,
    "filePath": "logs/hardware-mcp.log"
  },
  "autoDiscovery": {
    "enabled": true,
    "intervalMs": 5000,
    "scanUsbHid": true,
    "scanSerial": true,
    "includeKnownVendorsOnly": false
  },
  "printQueue": {
    "maxConcurrentJobsPerPrinter": 1,
    "maxRetries": 3,
    "retryDelayMs": 1500,
    "jobTimeoutMs": 15000,
    "enableDeduplication": true,
    "deduplicationWindowMs": 4000
  },
  "devices": [
    {
      "id": "scanner-virtual-01",
      "type": "barcode_scanner",
      "driver": "virtual-barcode",
      "name": "Virtual Barcode Scanner (Demo/Test)",
      "enabled": true,
      "isDefault": true,
      "connectionType": "virtual",
      "options": {
        "autoScanIntervalMs": 0
      }
    },
    {
      "id": "printer-virtual-01",
      "type": "thermal_printer",
      "driver": "virtual-printer",
      "name": "Virtual Thermal Printer (Preview/Spool)",
      "enabled": true,
      "isDefault": true,
      "connectionType": "virtual",
      "options": {
        "width": 48,
        "spoolFile": "logs/virtual-printer-spool.txt"
      }
    },
    {
      "id": "printer-xprinter-01",
      "type": "thermal_printer",
      "driver": "xprinter",
      "name": "XPrinter XP-N160I (Red)",
      "enabled": false,
      "isDefault": false,
      "connectionType": "tcp",
      "connectionParams": {
        "host": "192.168.1.100",
        "tcpPort": 9100
      },
      "options": {
        "width": 48,
        "characterSet": "PC850_MULTILINGUAL"
      }
    }
  ]
}
```

---

## 🛠️ Catálogo de Herramientas MCP

### 1. Gestión de Dispositivos

#### `listDevices()`
Devuelve todos los periféricos detectados, su tipo, estado de conexión y parámetros.
```json
// Salida de ejemplo:
{
  "devices": [
    {
      "id": "printer-virtual-01",
      "type": "thermal_printer",
      "name": "Virtual Thermal Printer (Preview/Spool)",
      "status": "connected",
      "connectionType": "virtual"
    },
    {
      "id": "scanner-virtual-01",
      "type": "barcode_scanner",
      "name": "Virtual Barcode Scanner (Demo/Test)",
      "status": "connected",
      "connectionType": "virtual"
    }
  ]
}
```

#### `getDeviceStatus(deviceId)`
Consulta el estado de salud, disponibilidad y marca temporal de un dispositivo específico.

---

### 2. Lectores de Códigos de Barras / QR

#### `waitForBarcode(timeout?, deviceId?)`
Espera asíncronamente a que el usuario dispare una lectura con un lector físico o virtual. Se suspende hasta recibir los datos o alcanzar el timeout.
```json
// Argumentos:
{
  "timeout": 30000,
  "deviceId": "scanner-virtual-01" // opcional
}

// Salida:
{
  "success": true,
  "barcode": "7701234567890",
  "deviceId": "scanner-virtual-01",
  "timestamp": "2026-11-11T20:13:44.167Z"
}
```

#### `getLastBarcode(deviceId?)`
Recupera el último código escaneado almacenado en el búfer de memoria sin suspender la ejecución.

#### `startBarcodeListener(deviceId?)` / `stopBarcodeListener(deviceId?)`
Inicia o detiene el modo de recepción continua en segundo plano.

#### `simulateBarcodeScan(barcode, deviceId?)`
Inyecta una lectura manual simulada para fines de prueba y demostración.

---

### 3. Impresoras Térmicas y Facturación

#### `printReceipt(opciones)`
Herramienta de alto nivel para generar comprobantes y facturas POS profesionales alineadas en columnas.

**Parámetros:**
- `header` *(string)*: Nombre o razón social del negocio.
- `subheader` *(string)*: Slogan o sucursal.
- `businessInfo` *(objeto)*: `taxId` (NIT/RUT/RFC), `address`, `phone`, `email`.
- `orderNumber` *(string)*: Número de comprobante o factura.
- `cashier` *(string)*: Nombre del vendedor o agente.
- `items` *(array)*: Arreglo de artículos con `name`, `quantity`, `price`, `discount`, `note`.
- `taxes` *(array)*: Impuestos con `name` y `amount`.
- `total` *(number)*: Importe total de la compra.
- `paymentMethod` *(string)*: Efectivo, Tarjeta, QR, etc.
- `openDrawer` *(boolean)*: Abre el cajón monedero automáticamente.
- `cut` *(boolean)*: Corta el papel automáticamente.
- `beep` *(boolean)*: Emite sonido de aviso en impresoras compatibles (XPrinter).

#### `printText(text, bold?, align?, lineFeed?, cut?)`
Imprime líneas de texto simple con formateo de estilos.

#### `printBarcode(barcode, type?, width?, height?, cut?)`
Genera un código de barras 1D nativo (CODE128, EAN13, CODE39, etc.) impreso directamente por la impresora térmica.

#### `printQRCode(qrData, size?, errorCorrection?, cut?)`
Genera e imprime un código QR nativo 2D para enlaces, comprobantes fiscales electrónicos o pasarelas de pago.

#### `cutPaper(partial?, deviceId?)`
Acciona la guillotina de corte total o parcial.

#### `openCashDrawer(pin?, deviceId?)`
Envía el impulso eléctrico para abrir el cajón monedero (Pin 2 o Pin 5 del conector RJ11).

---

### 4. Monitoreo y Estado

- `getPrinterStatus(deviceId?)`: Estado de la impresora, longitud de la cola y total de trabajos procesados.
- `getConnectedPrinters()`: Lista exclusiva de impresoras térmicas activas.
- `getConnectedScanners()`: Lista exclusiva de lectores de códigos detectados.

---

## 💻 Configuración en Clientes MCP

### Claude Desktop

Edita el archivo de configuración de Claude Desktop:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "hardware-mcp": {
      "command": "node",
      "args": [
        "C:/Users/WINDOWS/OneDrive/Documentos/PERIFERICOS_MCP/dist/server/index.js"
      ],
      "env": {
        "HARDWARE_CONFIG_PATH": "C:/Users/WINDOWS/OneDrive/Documentos/PERIFERICOS_MCP/hardware.config.json"
      }
    }
  }
}
```

---

### Cursor IDE

Crea o edita el archivo `.cursor/mcp.json` en la raíz de tu proyecto en Cursor:

```json
{
  "mcpServers": {
    "hardware-mcp": {
      "command": "node",
      "args": [
        "C:/Users/WINDOWS/OneDrive/Documentos/PERIFERICOS_MCP/dist/server/index.js"
      ],
      "env": {
        "HARDWARE_CONFIG_PATH": "C:/Users/WINDOWS/OneDrive/Documentos/PERIFERICOS_MCP/hardware.config.json"
      }
    }
  }
}
```

---

### Antigravity / Gemini CLI

Agrega la configuración en `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "hardware-mcp": {
      "command": "node",
      "args": [
        "C:/Users/WINDOWS/OneDrive/Documentos/PERIFERICOS_MCP/dist/server/index.js"
      ],
      "env": {
        "HARDWARE_CONFIG_PATH": "C:/Users/WINDOWS/OneDrive/Documentos/PERIFERICOS_MCP/hardware.config.json"
      }
    }
  }
}
```

---

## 🤖 Flujos de Trabajo para Agentes IA

### Prompt para Agente de Punto de Venta (POS)

```markdown
Eres un cajero y asistente inteligente de ventas minoristas.
Tienes acceso a las herramientas del servidor hardware-mcp:
1. Usa 'waitForBarcode' para esperar a que el cliente pase un producto por el lector físico.
2. Tras leer el código, busca el producto en tu catálogo y confirma el valor al cliente.
3. Cuando el cliente decida pagar, usa 'printReceipt' para emitir la factura con su desglose, activa 'openDrawer: true' para abrir la caja y 'cut: true' para entregar el comprobante.
```

---

## 🔌 Guía para Agregar Nuevos Drivers de Hardware

Gracias a la arquitectura basada en `BaseDriver` y `driverRegistry`, incorporar un nuevo periférico (por ejemplo, una balanza electrónica, un lector RFID o un sensor) toma solo dos pasos sencillos:

### 1. Extender `BaseDriver`
Crea una clase que herede de `BaseDriver` e implemente los métodos `doConnect()` y `doDisconnect()`:

```typescript
// src/devices/scales/electronic-scale-driver.ts
import { BaseDriver, BaseDriverConfig } from '../common/base-driver.js';
import { SerialPort } from 'serialport';

export class ElectronicScaleDriver extends BaseDriver {
  private port: SerialPort | null = null;

  constructor(config: BaseDriverConfig) {
    super({
      ...config,
      type: 'scale',
      connectionType: 'serial',
    });
  }

  protected async doConnect(): Promise<void> {
    const portName = this.connectionParams?.port || 'COM3';
    this.port = new SerialPort({ path: portName, baudRate: 9600 });
    this.port.on('data', (data) => {
      // Parsear la cadena de peso recibida (ej: "ST,GS,1.250kg")
      this.emit('weight', data.toString());
    });
  }

  protected async doDisconnect(): Promise<void> {
    if (this.port?.isOpen) {
      this.port.close();
      this.port = null;
    }
  }
}
```

### 2. Registrar el Driver en `driverRegistry`
```typescript
import { driverRegistry } from '../devices/common/driver-registry.js';
import { ElectronicScaleDriver } from './electronic-scale-driver.js';

driverRegistry.register(
  'electronic-scale',
  'scale',
  'Balanza electrónica RS-232 comercial',
  (config) => new ElectronicScaleDriver(config)
);
```

Ahora el nuevo periférico puede ser declarado en `hardware.config.json` con `"driver": "electronic-scale"` y estará disponible de inmediato en todo el ecosistema.

---

## ❓ Solución de Problemas (Troubleshooting)

### 1. El lector de código de barras no responde en Windows
- **Causa**: Muchos lectores vienen de fábrica en modo "USB HID Keyboard Wedge" y Windows puede bloquear el acceso exclusivo al teclado.
- **Solución**: Escanea el código de barras del manual del fabricante que dice **"USB Virtual COM"** o **"USB POS HID"**. Esto asignará un puerto COM virtual o un endpoint POS directo que `hardware-mcp` detectará automáticamente.
- **Alternativa de pruebas**: Puedes usar la herramienta `simulateBarcodeScan` para probar toda la lógica de tu aplicación sin necesidad de hardware físico.

### 2. La impresora térmica imprime caracteres extraños
- **Causa**: Discrepancia en la página de códigos (codepage).
- **Solución**: En `hardware.config.json`, configura `"characterSet": "PC850_MULTILINGUAL"` o `"CP437_USA"` según el firmware de tu impresora. Para modelos XPrinter, el driver `"driver": "xprinter"` aplica automáticamente la inicialización ESC @ y la tabla PC850.

### 3. La impresora de red (TCP) no conecta
- **Causa**: Dirección IP incorrecta o firewall local bloqueando el puerto 9100.
- **Solución**: Asegúrate de que la impresora responda a un ping (`ping 192.168.1.100`) y que el puerto RAW 9100 esté abierto en la red local.

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia **MIT**. Consulta el archivo `LICENSE` para más información.

# Vibe Kanban Electron App

Desktop application wrapper for [Vibe Kanban](https://github.com/vibekanban/vibe) that automatically launches the server and provides a native desktop experience.

## Features

- **Auto-launch**: Automatically detects and starts the Vibe Kanban server
- **Native experience**: Full desktop application with native menus and icons
- **WebSocket support**: Handles WebSocket connections properly for real-time updates
- **Clean shutdown**: Gracefully stops the server when the app closes
- **Cross-platform**: Supports macOS, Windows, and Linux

## Prerequisites

- Node.js (v16 or higher)
- Vibe Kanban installed globally:
  ```bash
  npm install -g vibe-kanban
  ```

> **⚠️ Important**: If the Vibe Kanban window doesn't open or displays a blank screen, you may need to start Vibe Kanban manually first:
> ```bash
> npx vibe-kanban start
> ```
> Then launch the Electron app. This ensures the server is running before the app tries to connect.

## Installation

```bash
npm install
```

## Usage

### Development Mode

```bash
npm start
```

The app will:
1. Check if Vibe Kanban server is already running on `http://127.0.0.1:58045`
2. If not running, automatically start the server
3. Open a native desktop window with the Vibe Kanban interface

### Building for Production

Generate icons (optional, already done):
```bash
npm run generate-icons
```

Build for macOS:
```bash
npm run build:mac
```

Build for Windows:
```bash
npm run build:win
```

Build for Linux:
```bash
npm run build:linux
```

The built applications will be available in the `dist/` directory.

## Project Structure

```
vibeKanbanElectron/
├── assets/               # Logo and icon assets
│   ├── Logo_Vibe_kanban2.svg
│   └── Logo_Vibe_kanban2.png
├── build/               # Generated icons (gitignored)
│   ├── icon.png
│   ├── icon.icns       # macOS
│   └── icon.ico        # Windows
├── main.js             # Electron main process
├── preload.js          # Preload script for security
├── generate-macos-icon.js  # Icon generation script
└── package.json        # Project configuration
```

## How It Works

### Server Detection & Launch

The app tries multiple methods to start Vibe Kanban:
1. `vibe start`
2. `vibe-kanban start`
3. `npx vibe-kanban start`

It waits up to 30 seconds for the server to become available before showing an error.

### WebSocket Fix

The app automatically fixes WebSocket URLs that are relative (e.g., `/api/tasks/stream/ws`) by converting them to absolute URLs. This is injected before the page loads.

### Menu Customization

On macOS, the app creates a custom menu with French labels and proper app naming ("Vibe Kanban" instead of "Electron").

## Configuration

The app connects to Vibe Kanban on:
- **Host**: `127.0.0.1`
- **Port**: `58045`

These can be changed in [main.js](main.js:72-73).

## Development

To modify the icons, update the logo files in `assets/` and run:
```bash
npm run generate-icons
```

## Security

This app implements several security measures:
- Content Security Policy (CSP) to prevent XSS attacks
- Navigation restricted to localhost only
- Sandboxed renderer process
- No Node.js integration in renderer
- Context isolation enabled
- Filtered environment variables passed to server
- DevTools disabled in production builds

## License

MIT

## Author

Created by [timiliris](https://github.com/timiliris)

**Note**: This is a community-created wrapper for Vibe Kanban and is not officially affiliated with the Vibe Kanban team.

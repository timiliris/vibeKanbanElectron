# Changelog

All notable changes to Vibe Kanban Electron will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-01

### Added
- Initial release of Vibe Kanban desktop application
- Automatic Vibe Kanban server detection and launch
- Support for multiple server start commands (vibe, vibe-kanban, npx)
- WebSocket URL auto-correction for real-time updates
- Custom macOS menu with French localization
- Native application icons for macOS, Windows, and Linux
- Dark mode support matching Vibe Kanban's theme
- Clean server shutdown on app close
- Error handling with user-friendly dialogs
- Custom icon generation script for all platforms

### Technical Details
- Built with Electron 28.0.0
- Uses electron-builder for packaging
- Proper context isolation and security settings
- Preload script for WebSocket URL fixes
- Support for Apple Silicon (M1/M2/M3) and Intel Macs

### Platforms
- macOS (Apple Silicon and Intel)
- Windows (planned)
- Linux (planned)

## [Unreleased]

### Planned Features
- Auto-update functionality
- Windows and Linux builds
- Code signing for macOS
- Customizable server port
- System tray integration
- Settings panel
- Multi-instance support

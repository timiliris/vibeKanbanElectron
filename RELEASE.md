# How to Create a GitHub Release

This guide explains how to publish the macOS build as a GitHub release.

## Files Ready for Release

The `releases/v1.0.0-mac/` folder contains:

- **Vibe Kanban-1.0.0-arm64.dmg** (90 MB) - DMG installer
- **Vibe Kanban-1.0.0-arm64-mac.zip** (86 MB) - ZIP archive
- **SHA256SUMS.txt** - Checksums for verification
- **README.md** - Installation instructions
- **RELEASE_NOTES.md** - Release notes

## Option 1: GitHub CLI (Recommended)

If you have [GitHub CLI](https://cli.github.com/) installed:

```bash
cd /Users/timiliris/Documents/GitHub/vibeKanbanElctron

# Create release
gh release create v1.0.0 \
  --title "Vibe Kanban Desktop v1.0.0" \
  --notes-file releases/v1.0.0-mac/RELEASE_NOTES.md \
  releases/v1.0.0-mac/*.dmg \
  releases/v1.0.0-mac/*.zip \
  releases/v1.0.0-mac/SHA256SUMS.txt
```

## Option 2: GitHub Web Interface

1. **Push your code to GitHub**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/vibeKanbanElectron.git
   git branch -M main
   git push -u origin main
   ```

2. **Create a new release**:
   - Go to your repository on GitHub
   - Click "Releases" → "Create a new release"
   - Click "Choose a tag" → Type `v1.0.0` → "Create new tag"
   - Set release title: **Vibe Kanban Desktop v1.0.0**
   - Copy content from `releases/v1.0.0-mac/RELEASE_NOTES.md` into description
   - Check "Set as the latest release"

3. **Upload release assets**:
   - Drag and drop or click to upload:
     - `Vibe Kanban-1.0.0-arm64.dmg`
     - `Vibe Kanban-1.0.0-arm64-mac.zip`
     - `SHA256SUMS.txt`

4. **Publish**:
   - Click "Publish release"

## Option 3: Manual Upload

If you just want to share the files:

1. **Create a folder** to share (e.g., upload to Google Drive, Dropbox, etc.)
2. **Copy the entire** `releases/v1.0.0-mac/` folder
3. **Share the link** with instructions from the README.md

## After Publishing

Users can download and verify files:

```bash
# Download the DMG
# Then verify:
shasum -a 256 "Vibe Kanban-1.0.0-arm64.dmg"

# Compare with SHA256SUMS.txt
```

## Next Steps for Future Releases

1. **Version Intel Build**:
   ```bash
   # Build for x64 (Intel Macs)
   npm run build:mac -- --x64
   ```

2. **Create Universal Binary**:
   ```bash
   # Build for both architectures
   npm run build:mac -- --universal
   ```

3. **Code Signing** (requires Apple Developer account):
   - Get Developer ID certificate
   - Update package.json with signing config
   - Rebuild with signing enabled

4. **Notarization** (requires Apple Developer account):
   - Add notarization config to package.json
   - Submit to Apple for notarization
   - Staple notarization ticket

## Release Checklist

- [ ] All tests pass
- [ ] Version bumped in package.json
- [ ] CHANGELOG.md updated
- [ ] Icons generated (`npm run generate-icons`)
- [ ] Build created (`npm run build:mac`)
- [ ] Files copied to releases folder
- [ ] SHA256 checksums generated
- [ ] README and RELEASE_NOTES written
- [ ] Code committed and pushed
- [ ] GitHub release created
- [ ] Release assets uploaded
- [ ] Release published

## Tips

- Use semantic versioning (MAJOR.MINOR.PATCH)
- Tag releases in git: `git tag v1.0.0`
- Keep CHANGELOG.md up to date
- Test the release files before publishing
- Include checksums for security

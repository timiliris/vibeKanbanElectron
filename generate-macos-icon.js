const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const svgPath = path.join(__dirname, 'assets', 'Logo_Vibe_kanban2.svg');
const pngPath = path.join(__dirname, 'assets', 'Logo_Vibe_kanban2.png');
const buildDir = path.join(__dirname, 'build');
const iconPngPath = path.join(buildDir, 'icon.png');

// Create build folder if it doesn't exist
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

async function generateMacOSIcon() {
  console.log('Creating optimized macOS icon from Vibe Kanban logo...');

  try {
    // Use SVG or PNG depending on what's available
    let sourceFile = fs.existsSync(pngPath) ? pngPath : svgPath;

    // Read the original image
    const image = sharp(sourceFile);
    const metadata = await image.metadata();

    console.log(`Original image size: ${metadata.width}x${metadata.height}`);

    // Create square icon with logo background color (macOS will apply rounded corners)
    // Keep just VK letters centered on #32322E background
    const iconSize = 1024;
    const logoSize = 700; // Size of VK letters

    // Create square with logo color 1024x1024
    await sharp({
      create: {
        width: iconSize,
        height: iconSize,
        channels: 4,
        background: { r: 50, g: 50, b: 46, alpha: 1 } // Color #32322E
      }
    })
    .composite([
      {
        input: await sharp(sourceFile)
          .resize(logoSize, logoSize, {
            fit: 'inside',
            kernel: sharp.kernel.lanczos3
          })
          .toBuffer(),
        gravity: 'center' // Center the logo
      }
    ])
    .png()
    .toFile(iconPngPath);

    console.log('✓ Optimized icon created: build/icon.png');

    // For macOS: create ICNS
    if (process.platform === 'darwin') {
      console.log('\nGenerating macOS icon (ICNS)...');
      const iconsetDir = path.join(buildDir, 'icon.iconset');

      if (!fs.existsSync(iconsetDir)) {
        fs.mkdirSync(iconsetDir);
      }

      // Generate all necessary sizes for macOS
      const sizes = [16, 32, 64, 128, 256, 512, 1024];

      for (const size of sizes) {
        const outputFile = path.join(iconsetDir, `icon_${size}x${size}.png`);

        await sharp(iconPngPath)
          .resize(size, size, {
            fit: 'fill',
            kernel: sharp.kernel.lanczos3
          })
          .toFile(outputFile);

        // Also create @2x versions
        if (size <= 512) {
          const size2x = size * 2;
          const outputFile2x = path.join(iconsetDir, `icon_${size}x${size}@2x.png`);

          await sharp(iconPngPath)
            .resize(size2x, size2x, {
              fit: 'fill',
              kernel: sharp.kernel.lanczos3
            })
            .toFile(outputFile2x);
        }
      }

      // Convert iconset to ICNS
      const icnsPath = path.join(buildDir, 'icon.icns');
      execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'inherit' });

      // Clean up temporary folder
      execSync(`rm -rf "${iconsetDir}"`);

      console.log('✓ ICNS created: build/icon.icns');
    }

    // For Windows: create ICO
    console.log('\nGenerating Windows icon (ICO)...');

    try {
      execSync('which convert', { stdio: 'pipe' });
      const icoPath = path.join(buildDir, 'icon.ico');
      execSync(`convert "${iconPngPath}" -define icon:auto-resize=256,128,96,64,48,32,16 "${icoPath}"`, { stdio: 'inherit' });
      console.log('✓ ICO created: build/icon.ico');
    } catch (err) {
      console.log('⚠ ImageMagick not found, skipping ICO generation');
      console.log('  Install with: brew install imagemagick');
    }

    console.log('\n✓ macOS-optimized icon generation complete!');
    console.log('\nGenerated files:');
    if (fs.existsSync(path.join(buildDir, 'icon.icns'))) {
      console.log('  ✓ build/icon.icns (macOS)');
    }
    if (fs.existsSync(path.join(buildDir, 'icon.ico'))) {
      console.log('  ✓ build/icon.ico (Windows)');
    }
    console.log('  ✓ build/icon.png (Linux/Universal)');

    console.log('\n📱 Icon optimized for macOS with proper sizing!');
    console.log('You can now run:');
    console.log('  npm start           # to test with the new icons');
    console.log('  npm run build:mac   # to build the app for macOS');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

generateMacOSIcon();

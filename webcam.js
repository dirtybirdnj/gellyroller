// Webcam Controller Class
// Manages webcam capture using fswebcam

import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

class Webcam {
  constructor(options = {}) {
    this.devMode = options.devMode ?? (process.env.DEV_MODE === 'true');
    this.device = options.device ?? process.env.WEBCAM_DEVICE ?? '/dev/video0';
    this.width = options.width ?? parseInt(process.env.WEBCAM_WIDTH) ?? 1920;
    this.height = options.height ?? parseInt(process.env.WEBCAM_HEIGHT) ?? 1080;
    this.quality = options.quality ?? parseInt(process.env.WEBCAM_QUALITY) ?? 95;
    this.imageDir = options.imageDir ?? process.env.WEBCAM_IMAGE_DIR ?? '/var/www/gellyroller/img';
    this.skip = options.skip ?? parseInt(process.env.WEBCAM_SKIP) ?? 5;
    this.delay = options.delay ?? parseInt(process.env.WEBCAM_DELAY) ?? 1;
    
    // Ensure image directory exists
    this.ensureImageDirectory();
  }
  
  // Ensure image directory exists
  async ensureImageDirectory() {
    try {
      if (!existsSync(this.imageDir)) {
        await mkdir(this.imageDir, { recursive: true });
        console.log(`Webcam: Created image directory: ${this.imageDir}`);
      }
    } catch (error) {
      console.error('Webcam: Error creating image directory:', error.message);
    }
  }
  
  // Generate filename with timestamp
  generateFilename(prefix = 'photo') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${prefix}_${timestamp}.jpg`;
  }
  
  // Capture photo
  async capturePhoto(options = {}) {
    const filename = options.filename || this.generateFilename();
    const filepath = path.join(this.imageDir, filename);
    
    if (this.devMode) {
      console.log(`Webcam DEV: Would capture photo to ${filepath}`);
      return {
        success: true,
        filename: filename,
        filepath: filepath,
        url: `/img/${filename}`,
        message: 'DEV MODE: Photo capture simulated',
        devMode: true
      };
    }
    
    try {
      const command = `fswebcam -d ${this.device} -r ${this.width}x${this.height} --no-banner --jpeg ${this.quality} -D ${this.delay} --skip ${this.skip} ${filepath}`;
      
      console.log(`Webcam: Executing: ${command}`);
      const { stdout, stderr } = await execAsync(command);
      
      // Check if file was created
      const fileExists = existsSync(filepath);
      
      if (!fileExists) {
        throw new Error('Photo file was not created');
      }
      
      // Get file stats
      const stats = await stat(filepath);
      
      return {
        success: true,
        filename: filename,
        filepath: filepath,
        url: `/img/${filename}`,
        size: stats.size,
        timestamp: new Date().toISOString(),
        resolution: `${this.width}x${this.height}`,
        output: stdout || stderr
      };
    } catch (error) {
      console.error('Webcam: Capture error:', error.message);
      throw new Error(`Failed to capture photo: ${error.message}`);
    }
  }
  
  // Get webcam configuration/info
  async getConfig() {
    if (this.devMode) {
      return {
        success: true,
        device: this.device,
        resolution: `${this.width}x${this.height}`,
        quality: this.quality,
        imageDir: this.imageDir,
        skip: this.skip,
        delay: this.delay,
        devMode: true,
        message: 'DEV MODE: Webcam config (simulated)'
      };
    }
    
    try {
      // Get device info
      const deviceCommand = `v4l2-ctl -d ${this.device} --all`;
      let deviceInfo = '';
      
      try {
        const { stdout } = await execAsync(deviceCommand);
        deviceInfo = stdout;
      } catch (error) {
        deviceInfo = 'v4l2-ctl not available or device not found';
      }
      
      // Get supported formats
      const formatsCommand = `v4l2-ctl -d ${this.device} --list-formats-ext`;
      let formats = '';
      
      try {
        const { stdout } = await execAsync(formatsCommand);
        formats = stdout;
      } catch (error) {
        formats = 'Format information not available';
      }
      
      return {
        success: true,
        device: this.device,
        resolution: `${this.width}x${this.height}`,
        quality: this.quality,
        imageDir: this.imageDir,
        skip: this.skip,
        delay: this.delay,
        deviceInfo: deviceInfo,
        supportedFormats: formats
      };
    } catch (error) {
      throw new Error(`Failed to get webcam config: ${error.message}`);
    }
  }
  
  // List captured images
  async listImages() {
    try {
      await this.ensureImageDirectory();
      
      const files = await readdir(this.imageDir);
      
      // Filter for image files only
      const imageFiles = files.filter(file => 
        file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png')
      );
      
      // Get stats for each image
      const images = await Promise.all(
        imageFiles.map(async (filename) => {
          const filepath = path.join(this.imageDir, filename);
          const stats = await stat(filepath);
          
          return {
            filename: filename,
            url: `/img/${filename}`,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
      );
      
      // Sort by creation date (newest first)
      images.sort((a, b) => b.created - a.created);
      
      return {
        success: true,
        count: images.length,
        images: images,
        imageDir: this.imageDir
      };
    } catch (error) {
      throw new Error(`Failed to list images: ${error.message}`);
    }
  }
  
  // Delete an image
  async deleteImage(filename) {
    try {
      const filepath = path.join(this.imageDir, filename);
      
      // Security check - ensure filename doesn't contain path traversal
      if (filename.includes('..') || filename.includes('/')) {
        throw new Error('Invalid filename');
      }
      
      if (!existsSync(filepath)) {
        throw new Error('Image not found');
      }
      
      await execAsync(`rm ${filepath}`);
      
      return {
        success: true,
        message: `Image ${filename} deleted`,
        filename: filename
      };
    } catch (error) {
      throw new Error(`Failed to delete image: ${error.message}`);
    }
  }
  
  // Test if webcam is available
  async testWebcam() {
    if (this.devMode) {
      return {
        success: true,
        available: true,
        message: 'DEV MODE: Webcam test simulated',
        devMode: true
      };
    }
    
    try {
      // Check if device exists
      const deviceExists = existsSync(this.device);
      
      if (!deviceExists) {
        return {
          success: false,
          available: false,
          message: `Webcam device ${this.device} not found`
        };
      }
      
      // Try to get device info
      const { stdout } = await execAsync(`v4l2-ctl -d ${this.device} --info`);
      
      return {
        success: true,
        available: true,
        device: this.device,
        info: stdout
      };
    } catch (error) {
      return {
        success: false,
        available: false,
        message: `Webcam test failed: ${error.message}`
      };
    }
  }
}

export default Webcam;
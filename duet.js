// Duet Controller Class
// Manages communication with Duet mainboard via serial

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { EventEmitter } from 'events';

class Duet extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.devMode = options.devMode ?? (process.env.DEV_MODE === 'true');
    this.serialPath = options.serialPath ?? process.env.SERIAL_PATH ?? '/dev/ttyUSB0';
    this.baudRate = options.baudRate ?? parseInt(process.env.BAUD_RATE) ?? 115200;
    this.commandTimeout = options.commandTimeout ?? parseInt(process.env.COMMAND_TIMEOUT) ?? 5000;
    
    this.serialPort = null;
    this.parser = null;
    this.ready = false;
    
    // Machine configuration
    this.config = {
      xDimension: options.xDimension ?? parseFloat(process.env.X_DIMENSION) ?? 200,
      yDimension: options.yDimension ?? parseFloat(process.env.Y_DIMENSION) ?? 200
    };
    
    // State tracking
    this.state = {
      position: { x: 0, y: 0, z: 0, e: 0 },
      status: 'idle',
      lastUpdate: null
    };
    
    if (!this.devMode) {
      this.initialize();
    } else {
      console.log('Duet: Running in DEV MODE');
      this.ready = true;
      this.emit('ready');
    }
  }
  
  // Initialize serial connection
  initialize() {
    try {
      this.serialPort = new SerialPort({
        path: this.serialPath,
        baudRate: this.baudRate,
        autoOpen: false
      });
      
      this.parser = this.serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
      
      this.serialPort.open((err) => {
        if (err) {
          console.error('Duet: Error opening serial port:', err.message);
          this.ready = false;
          this.emit('error', err);
        } else {
          console.log('Duet: Serial port opened successfully');
          this.ready = true;
          this.emit('ready');
        }
      });
      
      this.parser.on('data', (data) => {
        console.log('Duet response:', data);
        this.emit('data', data);
        this.parseResponse(data);
      });
      
      this.serialPort.on('error', (err) => {
        console.error('Duet: Serial port error:', err.message);
        this.ready = false;
        this.emit('error', err);
      });
      
      this.serialPort.on('close', () => {
        console.log('Duet: Serial port closed');
        this.ready = false;
        this.emit('close');
      });
      
    } catch (error) {
      console.error('Duet: Failed to initialize:', error.message);
      this.emit('error', error);
    }
  }
  
  // Parse responses to update state
  parseResponse(data) {
    // Parse position data (M114 response)
    if (data.includes('X:')) {
      const xMatch = data.match(/X:([-\d.]+)/);
      const yMatch = data.match(/Y:([-\d.]+)/);
      const zMatch = data.match(/Z:([-\d.]+)/);
      const eMatch = data.match(/E:([-\d.]+)/);
      
      if (xMatch) this.state.position.x = parseFloat(xMatch[1]);
      if (yMatch) this.state.position.y = parseFloat(yMatch[1]);
      if (zMatch) this.state.position.z = parseFloat(zMatch[1]);
      if (eMatch) this.state.position.e = parseFloat(eMatch[1]);
      
      this.state.lastUpdate = new Date();
      this.emit('position', this.state.position);
    }
  }
  
  // Send G-code command
  sendGCode(command, timeout = null) {
    return new Promise((resolve, reject) => {
      if (!this.ready) {
        return reject(new Error('Duet not ready'));
      }
      
      // DEV MODE: Simulate responses
      if (this.devMode) {
        setTimeout(() => {
          const mockResponse = this.generateMockResponse(command);
          console.log(`Duet DEV: ${command} -> ${mockResponse}`);
          this.parseResponse(mockResponse);
          resolve(mockResponse);
        }, 100);
        return;
      }
      
      const cmdTimeout = timeout || this.commandTimeout;
      let response = '';
      
      const responseHandler = (data) => {
        response += data + '\n';
        if (data.includes('ok') || data.includes('Done') || data.includes('Error')) {
          this.parser.removeListener('data', responseHandler);
          clearTimeout(timer);
          
          if (data.includes('Error')) {
            reject(new Error(response));
          } else {
            resolve(response);
          }
        }
      };
      
      const timer = setTimeout(() => {
        this.parser.removeListener('data', responseHandler);
        reject(new Error('Command timeout'));
      }, cmdTimeout);
      
      this.parser.on('data', responseHandler);
      
      this.serialPort.write(command + '\n', (err) => {
        if (err) {
          this.parser.removeListener('data', responseHandler);
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }
  
  // Generate mock responses for DEV MODE
  generateMockResponse(command) {
    const cmd = command.trim().toUpperCase();
    
    if (cmd.startsWith('M114')) {
      return 'X:100.00 Y:50.00 Z:10.00 E:0.00 Count 8000 4000 800\nok';
    } else if (cmd.startsWith('M20')) {
      return 'Begin file list\ntest.g 1234\nproject.gcode 5678\ncalibration.g 910\nEnd file list\nok';
    } else if (cmd.startsWith('M39')) {
      return 'SD card ok. Size: 8GB, Free: 4GB\nok';
    } else if (cmd.startsWith('M23')) {
      return 'File opened: ' + cmd.split(' ')[1] + '\nFile selected\nok';
    } else if (cmd.startsWith('M24')) {
      return 'File printing started\nok';
    } else if (cmd.startsWith('M28')) {
      const filename = cmd.split(' ')[1] || 'unknown.g';
      return `Writing to file: ${filename}\nok`;
    } else if (cmd.startsWith('M29')) {
      return 'File saved\nok';
    } else if (cmd.startsWith('M25')) {
      return 'Print paused\nok';
    } else if (cmd.startsWith('M0')) {
      return 'Print stopped\nok';
    } else if (cmd.startsWith('M112')) {
      return 'Emergency stop activated\nok';
    } else if (cmd.startsWith('G28')) {
      return 'Homing complete\nok';
    } else if (cmd.startsWith('G0') || cmd.startsWith('G1')) {
      return 'Move queued\nok';
    } else if (cmd.startsWith('M42')) {
      return 'GPIO command executed\nok';
    } else if (cmd.startsWith('M400')) {
      return 'Wait for moves to finish\nok';
    }
    
    return 'ok';
  }
  
  // High-level convenience methods
  
  async getPosition() {
    const response = await this.sendGCode('M114');
    return this.state.position;
  }
  
  async listSDFiles() {
    return await this.sendGCode('M20');
  }
  
  async getSDInfo() {
    return await this.sendGCode('M39');
  }
  
  async executeFile(filename) {
    await this.sendGCode(`M23 ${filename}`);
    return await this.sendGCode('M24');
  }
  
  async uploadFile(filename, content) {
    // Duet uploads via M28 (begin write) and M29 (end write)
    // Content is sent line by line between these commands
    try {
      // Begin file write
      await this.sendGCode(`M28 ${filename}`);
      
      // Send content line by line
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          await this.sendGCode(line);
        }
      }
      
      // End file write
      await this.sendGCode('M29');
      
      return `File ${filename} uploaded successfully`;
    } catch (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }
  
  async pause() {
    return await this.sendGCode('M25');
  }
  
  async stop() {
    return await this.sendGCode('M0');
  }
  
  async emergencyStop() {
    return await this.sendGCode('M112');
  }
  
  async home(axes = '') {
    return await this.sendGCode(`G28 ${axes}`);
  }
  
  async moveRapid(coords) {
    let gcode = 'G0';
    if (coords.x !== undefined) gcode += ` X${coords.x}`;
    if (coords.y !== undefined) gcode += ` Y${coords.y}`;
    if (coords.z !== undefined) gcode += ` Z${coords.z}`;
    return await this.sendGCode(gcode);
  }
  
  async moveLinear(coords, feedRate = null) {
    let gcode = 'G1';
    if (coords.x !== undefined) gcode += ` X${coords.x}`;
    if (coords.y !== undefined) gcode += ` Y${coords.y}`;
    if (coords.z !== undefined) gcode += ` Z${coords.z}`;
    if (feedRate !== null) gcode += ` F${feedRate}`;
    return await this.sendGCode(gcode);
  }
  
  async setGPIO(pin, value) {
    return await this.sendGCode(`M42 P${pin} S${value}`);
  }
  
  async readGPIO(pin) {
    return await this.sendGCode(`M42 P${pin}`);
  }
  
  async waitForIdle() {
    return await this.sendGCode('M400');
  }
  
  // Get current state
  getState() {
    return { 
      ...this.state,
      config: this.config
    };
  }
  
  // Get machine configuration
  getConfig() {
    return { ...this.config };
  }
  
  // Update machine configuration
  updateConfig(newConfig) {
    if (newConfig.xDimension !== undefined) {
      this.config.xDimension = parseFloat(newConfig.xDimension);
    }
    if (newConfig.yDimension !== undefined) {
      this.config.yDimension = parseFloat(newConfig.yDimension);
    }
    this.emit('config-updated', this.config);
  }
  
  isReady() {
    return this.ready;
  }
  
  // Close connection
  close() {
    if (this.serialPort && this.serialPort.isOpen) {
      this.serialPort.close();
    }
  }
}

export default Duet;
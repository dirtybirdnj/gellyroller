// System Management Class
// Handles Raspberry Pi shutdown and restart operations

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class System {
  constructor(options = {}) {
    this.devMode = options.devMode ?? (process.env.DEV_MODE === 'true');
    this.defaultShutdownMinutes = options.defaultShutdownMinutes ?? 5;
  }
  
  // Shutdown the Raspberry Pi
  async shutdown(minutes = null) {
    const shutdownMinutes = minutes ?? this.defaultShutdownMinutes;
    
    if (this.devMode) {
      console.log(`System: DEV MODE - Would shutdown in ${shutdownMinutes} minutes`);
      return { 
        success: true, 
        message: `DEV MODE: System shutdown scheduled in ${shutdownMinutes} minutes`,
        devMode: true
      };
    }
    
    try {
      const command = `sudo shutdown -h +${shutdownMinutes}`;
      const { stdout, stderr } = await execAsync(command);
      console.log(`System: Shutdown scheduled in ${shutdownMinutes} minutes`);
      
      return { 
        success: true, 
        message: `System shutdown scheduled in ${shutdownMinutes} minutes`,
        output: stdout || stderr
      };
    } catch (error) {
      console.error('System: Shutdown error:', error.message);
      throw new Error(`Failed to schedule shutdown: ${error.message}`);
    }
  }
  
  // Cancel a scheduled shutdown
  async cancelShutdown() {
    if (this.devMode) {
      console.log('System: DEV MODE - Would cancel shutdown');
      return { 
        success: true, 
        message: 'DEV MODE: Shutdown cancelled',
        devMode: true
      };
    }
    
    try {
      const { stdout, stderr } = await execAsync('sudo shutdown -c');
      console.log('System: Shutdown cancelled');
      
      return { 
        success: true, 
        message: 'Shutdown cancelled',
        output: stdout || stderr
      };
    } catch (error) {
      console.error('System: Cancel shutdown error:', error.message);
      throw new Error(`Failed to cancel shutdown: ${error.message}`);
    }
  }
  
  // Restart the Raspberry Pi
  async restart() {
    if (this.devMode) {
      console.log('System: DEV MODE - Would restart now');
      return { 
        success: true, 
        message: 'DEV MODE: System restart initiated',
        devMode: true
      };
    }
    
    try {
      console.log('System: Restarting now...');
      // Don't await this as the system will shutdown
      exec('sudo reboot');
      
      return { 
        success: true, 
        message: 'System restart initiated'
      };
    } catch (error) {
      console.error('System: Restart error:', error.message);
      throw new Error(`Failed to restart: ${error.message}`);
    }
  }
  
  // Immediate shutdown (no delay)
  async shutdownNow() {
    if (this.devMode) {
      console.log('System: DEV MODE - Would shutdown immediately');
      return { 
        success: true, 
        message: 'DEV MODE: Immediate shutdown initiated',
        devMode: true
      };
    }
    
    try {
      console.log('System: Shutting down now...');
      // Don't await this as the system will shutdown
      exec('sudo shutdown -h now');
      
      return { 
        success: true, 
        message: 'Immediate shutdown initiated'
      };
    } catch (error) {
      console.error('System: Immediate shutdown error:', error.message);
      throw new Error(`Failed to shutdown: ${error.message}`);
    }
  }
  
  // Get system uptime
  async getUptime() {
    if (this.devMode) {
      return { 
        success: true, 
        uptime: '2 days, 4 hours',
        devMode: true
      };
    }
    
    try {
      const { stdout } = await execAsync('uptime -p');
      return { 
        success: true, 
        uptime: stdout.trim()
      };
    } catch (error) {
      throw new Error(`Failed to get uptime: ${error.message}`);
    }
  }
}

export default System;
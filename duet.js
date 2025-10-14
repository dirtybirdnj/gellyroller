const { SerialPort } = require('serialport')
//const port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200 })
//const sendCommand = 'M20';

class Duet {


  async getPosition(){
    return await sendCommand('M114');
  }

  async getSDStats(){
    return await sendCommand('M39 P0 S2');
  }

  async getSDFileList(){
    return await sendCommand('M20');
  }  

  async sendCommand(command, args){
    
    const port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200 })
    const payload = `${command} ${args}`;

  port.write(`${payload}\n`, function(err) {
    if (err) return console.log('TX Err: ', err.message); // TX specific err
    console.log(`TX: ${sendCommand}`);
    })
    
    // Open errors will be emitted as an error event
    port.on('error', function(err) {
      console.log('Error: ', err.message);
      return err.message; //General Error
    })
    
    port.on('data', async function (data) {
      const buf = Buffer.from(data);
      console.log('RX:', buf.toString());
      return buf.toString(); //Success
    });

    //Timeout deadman switch in case comms fail
    setTimeout(() => {
      console.log("10 Second RX window closed.");
      process.exit(0); // Exit with a success code
    }, 10000); // 5000 milliseconds = 10 seconds 

    
};

}

export { Duet };



//Endpoints needed
// Get Position - M114
// Get list of files - M20
// Report SD info (size, s pace left) - M39 P0 S2
// Execute filename.g
// Pause M226
// Cancel / End - M0/M1/M2
// Reset - M999
// Emergency Stop - M112
// Home All - G28
// Goto location (fast/slow) G90 / G1
// Trigger GPIO M42 P13 S0 / M42 P22 S1

// On connection, get machine state
// port.write(`${sendCommand}\n`, function(err) {
//   if (err) {
//     return console.log('Error on write: ', err.message)
//   }
//   console.log(`TX: ${sendCommand}`)
// })
 
// // Open errors will be emitted as an error event
// port.on('error', function(err) {
//   console.log('Error: ', err.message)
// })
 
// port.on('data', async function (data) {
//   const buf = Buffer.from(data);
//   console.log('RX:', buf.toString());
//   const portList = await SerialPort.list();
//   console.log(portList);
//   process.exit(0)
// });
 
// setTimeout(() => {
//   console.log("10 Second RX window closed.");
//   process.exit(0); // Exit with a success code
// }, 10000); // 5000 milliseconds = 10 seconds
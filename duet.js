const { SerialPort } = require('serialport')
const port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200 })
 
const sendCommand = 'M20';

// On connection, get machine state
port.write(`${sendCommand}\n`, function(err) {
  if (err) {
    return console.log('Error on write: ', err.message)
  }
  console.log(`TX: ${sendCommand}`)
})
 
// Open errors will be emitted as an error event
port.on('error', function(err) {
  console.log('Error: ', err.message)
})
 
port.on('data', async function (data) {
  const buf = Buffer.from(data);
  console.log('RX:', buf.toString());
  const portList = await SerialPort.list();
  console.log(portList);
  process.exit(0)
});
 
setTimeout(() => {
  console.log("10 Second RX window closed.");
  process.exit(0); // Exit with a success code
}, 10000); // 5000 milliseconds = 10 seconds
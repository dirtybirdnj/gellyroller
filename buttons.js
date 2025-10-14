const RPiGPIOButtons = require('rpi-gpio-buttons');
let buttons = new RPiGPIOButtons({
  pins: [17, 27] // use GPIO 17 and 27 for buttons
});

buttons
  .on('clicked', pin => {
    switch(pin) {
      case 17:
      console.log('up');
      break;

      case 27:
      console.log('down');
      break;
    }
  })
  .on('double_clicked', pin => {
    switch(pin) {
      case 17:
      console.log('left');
      break;

      case 27:
      console.log('right');
      break;
    }
  })

  console.log('buttons')

  buttons
  .init()
  .catch(error => {
    console.log('ERROR', error.stack);
    process.exit(1);
  });
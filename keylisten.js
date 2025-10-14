var keypress = require('keypress')
let PhotoD = require('./camera')
var async = require("async")
var fs = require('fs')

const photoDelay = 3000

function register() {

  console.log('registering keypress listeners')

  // make `process.stdin` begin emitting "keypress" events
  keypress(process.stdin)

  PhotoD.findFirst((err, camera) => {

    if (err) {

      console.log('detection of camera failed')
      process.exit()

    } else {

      // listen for the "keypress" event
      process.stdin.on('keypress', function (ch, key) {

        if (key.name === 'up') {

          console.log('keyup pressed, begin photo sequence');

          async.waterfall([

              (callback) => {

                let filePath = process.cwd() + '/input/picture1.jpg'

                console.log(process.cwd());
                console.log(filePath);
                //process.exit();

                PhotoD.takePhoto(camera, filePath, false, (err, result) => {

                  if (err) {

                    console.log('error trying to take photo')
                    process.exit()

                  } else {

                    console.log(`photo written to : ${result}`)
                    callback(null, filePath)

                  }

                })

              },
              (err, callback) => {

                let filePath = process.cwd() + '/input/picture2.jpg'

                PhotoD.takePhoto(camera, filePath, false, (err, result) => {

                  if (err) {

                    console.log('error trying to take photo')
                    process.exit()

                  } else {

                    console.log(`photo written to : ${result}`)
                    callback(null, filePath)

                  }

                })


              },
              (err, callback) => {

                let filePath = process.cwd() + '/input/picture3.jpg'

                PhotoD.takePhoto(camera, filePath, false, (err, result) => {

                  if (err) {

                    console.log('error trying to take photo')
                    process.exit()

                  } else {

                    console.log(`photo written to : ${result}`)
                    callback(null, filePath)

                  }

                })
              }

            ], (err, result) => {

              console.log('done taking three photos!')


            }

          )

        }

        if (key.name === 'down') {
          console.log('exit')
          process.exit()
        }

        if (key.name === '`') {
          console.log('Different Action!')
        }

        if (key && key.ctrl && key.name == 'c') {
          process.stdin.pause()
        }
      });

      process.stdin.setRawMode(true)
      process.stdin.resume()

    }

  })

}

module.exports = {
  register: register
}
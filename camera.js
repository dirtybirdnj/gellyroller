'use strict'

var fs = require('fs');
var gphoto2 = require('gphoto2');

function findFirst(callback){

    var GPhoto = new gphoto2.GPhoto2();
    GPhoto.setLogLevel(2);

    // List cameras / assign list item to variable to use below options
    GPhoto.list(function (list) {

        if (list.length === 0){ 
            return callback(true, null)
        } else {
            let camera = list[0];
            return callback(null, camera);
        }                            
    })
    

}    

function takePhoto(camera, filePath, timeout, callback){

    console.log('takePhoto')

    if(timeout){
        
        console.log(`Photo will fire in ${(timeout/1000)}sec`);

        setTimeout(takePhoto, timeout, camera, filePath, false);

    } else {

        console.log(`Using: ${camera.model}`);
        console.log('Say Cheese!');
        //Take picture immediately

        camera.takePicture({
            download: true,
            keep: true
            }, function (err, data) {

            console.log(err);

            fs.writeFileSync(filePath, data);

            console.log(`file written to ${filePath}`);

            //Just return with the filepath created
            callback(null, filePath);

        });

    }        


}

module.exports = {
    findFirst : findFirst,
    takePhoto : takePhoto
}

//}
import { Duet } from './duet.js';

const submitButton = document.getElementById('submit');
submitButton.on('click', async (e) => {

    e.preventDefault();
    console.log('button pressed');
    const machinePosition = await Duet.getPosition();
    const outputDiv = document.getElementById('outputDiv')
    outputDiv.innerHTML = machinePosition;
    return false;
});
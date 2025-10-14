import { Duet } from './duet';

const submitButton = document.getElementById('submit');
submitButton.on('click', async (e) => {

    console.log('button pressed');
    const machinePosition = await Duet.getPosition();
    const outputDiv = document.getElementById('outputDiv')
    outputDiv.innerHTML = machinePosition;
    return false;
});
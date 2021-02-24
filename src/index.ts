import _ from 'lodash';
import './style.css';
import Buttons from './buttons.png';

function component() {
    const element = document.createElement('div');

    // Lodash, now imported by this script
    element.innerHTML = _.join(['Hello', 'webpack'], ' ');

    // Add the image to our existing div.
    const buttons = new Image();
    buttons.src = Buttons;

    element.appendChild(buttons);

    return element;
}

document.body.appendChild(component());
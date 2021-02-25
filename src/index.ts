import _ from 'lodash';
import './style.css';
import Buttons from './buttons.png';
import REGL from "regl";

const regl = REGL(); // default fullscreen behavior

regl.frame(function () {
    regl.clear({
        color: [0.5, 0.5, 0.5, 1]
    })
})

function component() {
    const element = document.createElement('div');

    // Lodash, now imported by this script
    element.innerHTML = _.join(['Hello', 'webpack'], ' ');

    // Add the image to our existing div.
    const buttons = new Image();
    buttons.src = Buttons;

    element.appendChild(buttons); // how to get images rendered on top?

    return element;
}

document.body.appendChild(component());
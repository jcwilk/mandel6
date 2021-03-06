import './controls.css';

const controlNames = ['plus', 'minus', 'up', 'down', 'left', 'right'] as const;
type Control = typeof controlNames[number];

type ControlState = {
    element: HTMLDivElement,
    isDown: boolean
}

export class Controls {
    parent: HTMLDivElement;
    buttons: ControlState[];

    constructor(document: Document) {
        this.parent = document.createElement("div");
        this.parent.id = 'buttons-container';
        this.parent.className = 'container-landscape';
        document.body.appendChild(this.parent);

        const arrowsContainer = document.createElement("div");
        arrowsContainer.id = 'arrows-container';
        this.parent.appendChild(arrowsContainer);

        const plusMinusContainer = document.createElement("div");
        plusMinusContainer.id = 'plus-minus-container';
        this.parent.appendChild(plusMinusContainer);

        const sizers = controlNames.map((name) => {
            const sizer = document.createElement("div");
            sizer.className = `button-sizer sizer-${name}`;
            if (name == "plus" || name == "minus") {
                plusMinusContainer.appendChild(sizer);
            } else {
                arrowsContainer.appendChild(sizer);
            }
            return sizer;
        });

        this.buttons = controlNames.map((name, index) => {
            const button = document.createElement("div");
            button.className = `button button-${name}`;
            sizers[index].appendChild(button);
            return {
                element: button,
                isDown: false
            }
        });
    }

    isDown(name: Control) {
        const index = controlNames.indexOf(name);
        return this.buttons[index].isDown;
    }

    set layout(layout: 'portrait' | 'landscape') {
        this.parent.setAttribute('class', `container-${layout}`);
    }
}
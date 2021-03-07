const debounce = (fn: Function, delay: number) => {
    let waiting = false;
    let pending = false;

    let expire = () => {
        if (pending) {
            pending = false;
            setTimeout(expire, delay);

            fn();
        } else {
            waiting = false;
        }
    }

    return () => {
        if (waiting) {
            pending = true;
        } else {
            waiting = true;
            setTimeout(expire, delay);

            fn();
        }
    }
}

export class Resizer {
    container: Window;

    // NB: These get set indirectly in the initializer, `0` is just compilershutup
    graphWidth: number = 0;
    graphHeight: number = 0;
    _screenSize: number = 0;
    onResize: undefined | Function;

    constructor(container: Window, screenSize: number) {
        this.container = container;
        this.screenSize = screenSize; // implicitly calls onResize
        const self = this;
        container.addEventListener("resize", debounce(() => {
            self.update();
            if (this.onResize) this.onResize();
        }, 500));
    }

    update(): void {
        if (this.isPortrait()) {
            this.graphWidth = this.screenSize;
            this.graphHeight = (this.screenSize * this.container.innerHeight) / this.container.innerWidth;
        } else {
            this.graphWidth = (this.screenSize * this.container.innerWidth) / this.container.innerHeight;
            this.graphHeight = this.screenSize;
        }
    }

    set screenSize(screenSize: number) {
        this._screenSize = screenSize;
        this.update();
    }

    get screenSize() {
        return this._screenSize;
    }

    isPortrait(): boolean {
        return this.container.innerWidth < this.container.innerHeight;
    }
}
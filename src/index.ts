//import _ from 'lodash';
import './index.css';
import REGL, { Framebuffer } from 'regl'
import { Resizer } from './resizer'
import { Controls } from './controls'

const debounceTailOnly = (fn: Function, delay: number) => {
    let waiting = false;

    let expire = () => {
        waiting = false;
        fn();
    }

    return () => {
        if (!waiting) {
            waiting = true;
            setTimeout(expire, delay);
        }
    }
}

const regl = REGL({
    // TODO: why do these seem to do nothing?
    extensions: ['OES_texture_float'],
    // optionalExtensions: ['oes_texture_float_linear'],
});

const RADIUS = 2048 // TODO - make this not just square
const MAX_ITERATIONS = 1000;
const INITIAL_CONDITIONS = (Array(RADIUS * RADIUS * 4)).fill(0)
const FIRST_ITERATIONS = 1;
const COLOR_CYCLES = 5;

let state: Array<REGL.Framebuffer2D>;

const rebuildBuffers = () => {
    state = (Array(2)).fill(0).map(() =>
        regl.framebuffer({
            color: regl.texture({
                radius: RADIUS,
                data: INITIAL_CONDITIONS,
                wrap: 'repeat',
                format: 'rgba',
                type: 'float'
            }),
            depthStencil: false
        }))
}

const updateFractal = regl({
    frag: `
    precision mediump float;

    varying vec2 uv;
    varying vec2 coords;
    uniform sampler2D prevState;
    uniform float graphWidth;
    uniform float graphHeight;
    uniform float graphX;
    uniform float graphY;

    void main()
    {
        vec4 data = texture2D(prevState, uv);
        float x = data.x+data.x;
        float y = data.y+data.y;
        int i = int(data.z*${MAX_ITERATIONS}.);
        float signs = data.a;

        //coords = vec2(position.x * graphWidth / 2. + graphX, position.y * graphHeight / 2. + graphY);
        //gl_Position = vec4(position, 0, 1);

        vec2 c = (uv - .5) * vec2(graphWidth, graphHeight) + vec2(graphX, graphY);

        //vec2 c = coords;
        int iterTodo = 1;

        if (i == 0) {
            x = 0.;
            y = 0.;
            signs = 0.;
            iterTodo = int(min(${MAX_ITERATIONS}.,${FIRST_ITERATIONS}.));
        }

        if (signs > .5) {
            x = -x;
            signs-=.5;
        }
        if (signs > .25) {
            y = -y;
        }

        if (i >= ${MAX_ITERATIONS}) {
            i = ${MAX_ITERATIONS};
        } else {
            if (i == 0) {
                for(int j=0;j<${FIRST_ITERATIONS};j++) {
                    //COPY OF BELOW!
                    if (x*x + y*y < 4.) {
                        float zx = x*x - y*y + c.x;
                        y = (x+x)*y + c.y;
                        x = zx;
                        i++;
                    } else {
                        x = 2.;
                        y = 2.;
                    }
                }
            } else {
                //COPY OF ABOVE!
                if (x*x + y*y < 4.) {
                    float zx = x*x - y*y + c.x;
                    y = (x+x)*y + c.y;
                    x = zx;
                    i++;
                } else {
                    x = 2.;
                    y = 2.;
                }
            }
        } 
        signs = 0.;
        if (x < 0.) {
            signs+=.6;
            x=-x;
        }
        if (y < 0.) {
            signs+=.3;
            y=-y;
        }
        gl_FragColor = vec4(x/2.,y/2.,float(i)/${MAX_ITERATIONS}.,signs);
    }`,

    framebuffer: ({ tick }, props) => (props as any).dataBuffers[(tick + 1) % 2],
})

const setupQuad = regl({
    frag: `
  precision mediump float;
  uniform sampler2D prevState;
  varying vec2 uv;
  varying vec2 coords;

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    float state = texture2D(prevState, uv).z * ${MAX_ITERATIONS}.;
    float scaled=log(float(state))/log(${MAX_ITERATIONS}.);
    gl_FragColor = vec4(
        hsv2rgb(
            vec3(
                mod(scaled, 1./${COLOR_CYCLES}.) * ${COLOR_CYCLES}.,
                .2+scaled*1.5, // tops out at 1
                scaled*1.5
            )
        ), 1.0
    );
  }`,

    vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  varying vec2 coords;
  uniform float graphWidth;
  uniform float graphHeight;
  uniform float graphX;
  uniform float graphY;
  void main() {
    uv = (position + 1.) / 2.;
    coords = vec2(position.x * graphWidth / 2. + graphX, position.y * graphHeight / 2. + graphY);
    gl_Position = vec4(position, 0, 1);
  }`,

    attributes: {
        position: regl.buffer([
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1]
        ])
    },

    uniforms: {
        prevState: ({ tick }, props) => (props as any).dataBuffers[tick % 2],
        graphWidth: (context, props) => (props as any).graphWidth,
        graphHeight: (context, props) => (props as any).graphHeight,
        graphX: (context, props) => (props as any).graphX,
        graphY: (context, props) => (props as any).graphY
    },

    depth: { enable: false },

    count: 4,

    primitive: 'triangle strip'
})

document.addEventListener('DOMContentLoaded', function () {
    const urlParams = new URLSearchParams(window.location.search);
    const myParam = urlParams.get('myParam');

    let graphX = -0.5;
    let graphY = 0;
    let graphZoom = 1;

    let inX = urlParams.get('x');
    let inY = urlParams.get('y');
    let inZ = urlParams.get('z');

    if (inX && inY && inZ) {
        graphX = parseFloat(inX);
        graphY = parseFloat(inY);
        graphZoom = parseFloat(inZ);
    }

    const controls = new Controls(document);

    const resizer = new Resizer(window, 2 / graphZoom);

    const onResize = () => {
        if (resizer.isPortrait()) {
            controls.layout = 'portrait';
        } else {
            controls.layout = 'landscape';
        }

        rebuildBuffers();
    }
    onResize();
    resizer.onResize = onResize;

    const updateQueryParams = debounceTailOnly(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('x', graphX.toString());
        url.searchParams.set('y', graphY.toString());
        url.searchParams.set('z', graphZoom.toString());
        window.history.pushState({}, '', url.toString());
    }, 1000);

    const updateGraphParams = () => {
        updateQueryParams();
        rebuildBuffers();
    }

    let seenFocus = false;
    regl.frame(() => {
        // It burns a lot of juice running this thing so cool it while it's not in the very foreground
        if (document.hasFocus() && document.visibilityState == "visible") {
            seenFocus = true;
        } else if (seenFocus) {
            // only skip rendering if focus has been confirmed at least once
            return;
        }

        if (controls.isDown('plus')) {
            graphZoom *= 1.05;
            resizer.screenSize = 2 / graphZoom;
            updateGraphParams();
        }
        if (controls.isDown('minus')) {
            graphZoom /= 1.05;
            resizer.screenSize = 2 / graphZoom;
            updateGraphParams();
        }
        if (controls.isDown('up')) {
            graphY += .05 / graphZoom;
            updateGraphParams();
        }
        if (controls.isDown('down')) {
            graphY -= .05 / graphZoom;
            updateGraphParams();
        }
        if (controls.isDown('left')) {
            graphX -= .05 / graphZoom;
            updateGraphParams();
        }
        if (controls.isDown('right')) {
            graphX += .05 / graphZoom;
            updateGraphParams();
        }

        setupQuad({
            graphWidth: resizer.graphWidth,
            graphHeight: resizer.graphHeight,
            graphX: graphX,
            graphY: graphY,
            dataBuffers: state
        }, () => {
            regl.draw()
            updateFractal({ dataBuffers: state }) // wonder why this isn't sharing the same props...
        })
    })
}, false);


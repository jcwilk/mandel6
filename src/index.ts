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
    extensions: ['OES_texture_float'],
    optionalExtensions: ['oes_texture_float_linear'],
});

// TODO - make this not just square
// leaving it as a square generally works fine, however for the best efficiency ratio in terms of visual
// quality to computation time we would want this to be either exactly matching the screen resolution or
// at least proportional. Leaving it square is the simplest option and requires the least javascript cpu
// time... Ideally we'd figure out how to give it a new sized texture array without having to iterate over it.
const RADIUS = 2048

// Maximum 32bit int size... But can a float
const MAX_ITERATIONS = 16777216;

// used for scaling iterations into colors
const COLOR_CYCLES = 3;
const ITERATION_CEILING_SCALE = 500;

// this is how many iterations it does in the first frame after clearing the buffer
const FIRST_ITERATIONS = 100;

const INITIAL_CONDITIONS = (Array(RADIUS * RADIUS * 4)).fill(0)
let state: Array<REGL.Framebuffer2D>;

const rebuildBuffers = () => {
    state = (Array(2)).fill(0).map(() =>
        regl.framebuffer({
            color: regl.texture({
                radius: RADIUS,
                data: INITIAL_CONDITIONS,
                wrap: 'repeat',
                format: 'rgba', // there's room to add a whole extra channel here wew!
                type: 'float',

                // These two seemingly have no effect on the texture <-> texture loop since the sizes match (good)
                // but for rendering the texture to the screen it means it smooths out the noise a bit (also good)
                mag: 'linear',
                min: 'linear'
            }),
            depthStencil: false
        }))
}
rebuildBuffers();

const updateFractal = regl({
    frag: `
    precision mediump float;

    varying vec2 uv;
    uniform sampler2D prevState;
    uniform float graphWidth;
    uniform float graphHeight;
    uniform float graphX;
    uniform float graphY;
    uniform bool resetBuffer;

    void main()
    {
        vec4 data = texture2D(prevState, uv);
        float x = data.x;
        float y = data.y;
        int i = int(data.z);
        vec2 c = (uv - .5) * vec2(graphWidth, graphHeight) + vec2(graphX, graphY);

        if (resetBuffer || i == 0) {
            x = 0.;
            y = 0.;
            i = 0;
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
        gl_FragColor = vec4(x,y,float(i),1.);
    }`,

    framebuffer: ({ tick }, props) => (props as any).dataBuffers[(tick + 1) % 2],

    uniforms: {
        prevState: ({ tick }, props) => (props as any).dataBuffers[tick % 2]
    }
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
    vec4 state = texture2D(prevState, uv);
    if (abs(state.x) < 2. && abs(state.y) < 2.) {
        gl_FragColor = vec4(0., 0., 0., 1.);
        return;
    }

    float iterations = texture2D(prevState, uv).z;
    float scaled=log(float(iterations))/log(${ITERATION_CEILING_SCALE}.);
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
  void main() {
    uv = (position + 1.) / 2.;
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
        prevState: ({ tick }, props) => (props as any).dataBuffers[(tick + 1) % 2],
        graphWidth: (context, props) => (props as any).graphWidth,
        graphHeight: (context, props) => (props as any).graphHeight,
        graphX: (context, props) => (props as any).graphX,
        graphY: (context, props) => (props as any).graphY,
        resetBuffer: (context, props) => (props as any).resetBuffer
    },

    depth: { enable: false },

    count: 4,

    primitive: 'triangle strip'
})

document.addEventListener('DOMContentLoaded', function () {
    const urlParams = new URLSearchParams(window.location.search);
    const myParam = urlParams.get('myParam');
    let inX = urlParams.get('x');
    let inY = urlParams.get('y');
    let inZ = urlParams.get('z');

    let graphX = -0.5;
    let graphY = 0;
    let graphZoom = 1;
    let resetBuffer = false;

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

        resetBuffer = true;
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
        resetBuffer = true;
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
            dataBuffers: state,
            resetBuffer: resetBuffer
        }, () => {
            // wonder why this isn't sharing the same props...
            // maybe because uniforms, context are shared but props are not?
            // the overlapping framebuffers are a bit of a mess but it works for now
            // it may make sense to try to separate these three entities (setupQuad, updateFractal, draw)?
            updateFractal({ dataBuffers: state });
            regl.draw();
        })

        resetBuffer = false;
    })
}, false);


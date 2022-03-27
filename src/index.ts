//import _ from 'lodash';
import './index.css';
import REGL from 'regl'
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
    //extensions: ['OES_texture_float'],
    // optionalExtensions: ['oes_texture_float_linear'],
});

const MAX_ITERATIONS = 200;
const MAX_DRAW_RANGE = 10;
const MAX_DRAW_RANGE_SQ = MAX_DRAW_RANGE * MAX_DRAW_RANGE;
const MAX_MANDELS = 6;

// used for scaling iterations into colors
const COLOR_CYCLES = 2;

document.addEventListener('DOMContentLoaded', function () {
    const urlParams = new URLSearchParams(window.location.search);
    let inX = urlParams.get('x');
    let inY = urlParams.get('y');
    let inZ = urlParams.get('z');

    let graphX = -0.5;
    let graphY = 0;
    let graphZoom = 1;

    if (inX && inY && inZ) {
        graphX = parseFloat(inX);
        graphY = parseFloat(inY);
        graphZoom = parseFloat(inZ);
    }

    const controls = new Controls(document);

    const resizer = new Resizer(window, 2 / graphZoom);

    let needsRender = true;

    const onResize = () => {
        if (resizer.isPortrait()) {
            controls.layout = 'portrait';
        } else {
            controls.layout = 'landscape';
        }
        needsRender = true;
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
        needsRender = true;
    }

    const draw = regl({
        frag: `
    precision highp float;
    uniform float graphWidth;
    uniform float graphHeight;
    uniform float graphX;
    uniform float graphY;
    uniform vec3 mandels[${MAX_MANDELS}];
    varying vec2 uv;

    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    float distanceSq(vec2 diff) {
        return diff.x*diff.x+diff.y*diff.y;
    }

    int closestMandel(vec2 pos) {
        int index = -1;
        float minDist = -1.;
        float currDist;
        for(int i=0; i < ${MAX_MANDELS}; i++) {
            currDist = distanceSq(pos - mandels[i].xy)/mandels[i].z/mandels[i].z;
            if (currDist <= ${MAX_DRAW_RANGE_SQ}. && (currDist < minDist || minDist < 0.)) {
                index = i;
                minDist = currDist;
            }
        }
        return index;
    }

    int multiMandel(vec2 c) {
        vec2 z = c;
        int mandelIndex;
        vec3 man;
        vec2 zc;

        for(int i=1; i <= ${MAX_ITERATIONS}; i++) {
            mandelIndex = closestMandel(z);

            if (mandelIndex == -1) return i;

            for(int j=0; j < ${MAX_MANDELS}; j++) {
                if(j == mandelIndex) {
                    man = mandels[j];
                    z = (z - man.xy)/man.z;
                    zc = (c - man.xy)/man.z;

                    z = vec2(z.x*z.x - z.y*z.y + zc.x, (z.x+z.x)*z.y + zc.y);

                    z = z*man.z + man.xy;
                }
            }

        }

        return 0;
    }

    void main() {
        // These transformations can hypothetically happen in the vertex, but that means when you're running up against the
        // lower bounds of floats you'll get the edges wobbling back and forth as you zoom because the rounding errors are
        // happening during the plane interpolation step. Keeping the vertex ranging from -0.5 to 0.5 dodges that issue.
        vec2 c = vec2(graphX, graphY) + uv * vec2(graphWidth, graphHeight);
        int iterations = multiMandel(c);

        // if still alive...
        if (iterations == 0) {
            gl_FragColor = vec4(0., 0., 0., 1.);
            return;
        }

        float scaled=log(float(iterations))/log(${MAX_ITERATIONS}.);
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
    precision highp float;
    attribute vec2 position;
    varying vec2 uv;
    void main() {
        uv = position / 2.;
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
            graphWidth: (context, props) => (props as any).graphWidth,
            graphHeight: (context, props) => (props as any).graphHeight,
            graphX: (context, props) => (props as any).graphX,
            graphY: (context, props) => (props as any).graphY,
            mandels: (context, props) => (props as any).mandels,
        },

        depth: { enable: false },

        count: 4,

        primitive: 'triangle strip'
    })

    //let seenFocus = false;
    let lastTime = performance.now();
    regl.frame(() => {
        const thisTime = performance.now();

        // dTime always assumes between 30 and 144 fps
        const dTime = Math.min(1000 / 30, Math.max(1000 / 144, thisTime - lastTime));

        lastTime = thisTime;

        // It burns a lot of juice running this thing so cool it while it's not in the very foreground
        // if (document.hasFocus() && document.visibilityState == "visible") {
        //     seenFocus = true;
        // } else if (seenFocus) {
        //     // only skip rendering if focus has been confirmed at least once
        //     return;
        // }

        if (controls.isDown('plus')) {
            graphZoom *= 1 + (.002 * dTime);
            resizer.screenSize = 2 / graphZoom;
            updateGraphParams();
        }
        if (controls.isDown('minus')) {
            graphZoom /= 1 + (.002 * dTime);
            resizer.screenSize = 2 / graphZoom;
            updateGraphParams();
        }
        if (controls.isDown('up')) {
            graphY += .002 * dTime / graphZoom;
            updateGraphParams();
        }
        if (controls.isDown('down')) {
            graphY -= .002 * dTime / graphZoom;
            updateGraphParams();
        }
        if (controls.isDown('left')) {
            graphX -= .002 * dTime / graphZoom;
            updateGraphParams();
        }
        if (controls.isDown('right')) {
            graphX += .002 * dTime / graphZoom;
            updateGraphParams();
        }

        if (needsRender) {
            draw({
                graphWidth: resizer.graphWidth,
                graphHeight: resizer.graphHeight,
                graphX: graphX,
                graphY: graphY,
                'mandels': [
                    0.0, 0.0, 0.4,
                    5, 5, 1.5,
                    3, -2, .1,
                    -1, -6, 2,
                    -7, -2, 1,
                    -3, 2, 0.3,
                ],
            })
        }
        needsRender = false;
    })
}, false);

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

const MANDELS = [
    2.5, 2, .1,
    0, 0, 1,
    4, 1, 1
]
const initialGraphX = 2.734;
const initialGraphY = 0.937;
const initialZoom = 1 / .03;

const MAX_ITERATIONS = 100;
const MAX_DRAW_RANGE = 10;
const MAX_DRAW_RANGE_SQ = MAX_DRAW_RANGE * MAX_DRAW_RANGE;
const MAX_MANDELS = MANDELS.length / 3;
const MAX_ORBITS = 4;

// used for scaling iterations into colors
const COLOR_CYCLES = 2;

document.addEventListener('DOMContentLoaded', function () {
    const urlParams = new URLSearchParams(window.location.search);
    let inX = urlParams.get('x');
    let inY = urlParams.get('y');
    let inZ = urlParams.get('z');

    let graphX = initialGraphX;
    let graphY = initialGraphY;
    let graphZoom = initialZoom;

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

    bool checkWithinDraw(vec2 v, float scale) {
        // 1 dimensional distance is always <= than 2 dimensional distance
        if (abs(v.x)/scale > ${MAX_DRAW_RANGE}. || abs(v.y)/scale > ${MAX_DRAW_RANGE}.) return false;
        // diamond distance is always >= direct distance
        if ((abs(v.x)+abs(v.y))/scale <= ${MAX_DRAW_RANGE}.) return true;
        // it's too close to use shortcuts, so fallback to a^2+b^2
        return ((v.x*v.x + v.y*v.y)/scale/scale <= ${MAX_DRAW_RANGE_SQ}.);
    }

    // errs on the side of being too inclusive
    bool quickCheckWithinRange(vec2 v, float scale, float range) {
        return (abs(v.x)/scale <= ${MAX_DRAW_RANGE}. && abs(v.y)/scale <= ${MAX_DRAW_RANGE}.);
    }

    int multiPrecheckMandel(vec2 c) {
        vec2 znext = c;
        vec2 z, ztemp;
        int mandelIndex;
        vec3 man;
        vec2 zc;
        vec2 dv;
        float minDistance, distance;
        bool found;

        for(int i=1; i <= ${MAX_ITERATIONS}; i++) {
            minDistance = ${MAX_DRAW_RANGE}.;
            z = znext;
            found = false;

            for(int j=0; j < ${MAX_MANDELS}; j++) {
                // TODO: This check is slightly redundant - we already determined which mandels
                // were in range once when we were finding last round's eventual minDistance
                if (checkWithinDraw(z - mandels[j].xy, mandels[j].z)) {
                    man = mandels[j];
                    ztemp = (z - man.xy)/man.z;
                    zc = (c - man.xy)/man.z;

                    ztemp = vec2(ztemp.x*ztemp.x - ztemp.y*ztemp.y + zc.x, (ztemp.x+ztemp.x)*ztemp.y + zc.y);

                    ztemp = ztemp*man.z + man.xy;

                    for(int k=0; k < ${MAX_MANDELS}; k++) {
                        dv = mandels[k].xy - ztemp;
                        if(quickCheckWithinRange(dv, mandels[k].z, minDistance)) {
                            distance = (dv.x*dv.x+dv.y*dv.y)/mandels[k].z/mandels[k].z;
                            if (distance <= minDistance) {
                                minDistance = distance;
                                znext = ztemp;
                                found = true;
                            }
                        }
                    }
                }
            }

            if (!found) return i;
        }

        return 0;
    }

    void main() {
        // These transformations can hypothetically happen in the vertex, but that means when you're running up against the
        // lower bounds of floats you'll get the edges wobbling back and forth as you zoom because the rounding errors are
        // happening during the plane interpolation step. Keeping the vertex ranging from -0.5 to 0.5 dodges that issue.
        vec2 c = vec2(graphX, graphY) + uv * vec2(graphWidth, graphHeight);
        int iterations = multiPrecheckMandel(c);

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
                'mandels': MANDELS,
            })
        }
        needsRender = false;
    })
}, false);

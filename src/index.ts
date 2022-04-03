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





const initialGraphX = -0.5;
const initialGraphY = 0;
const initialZoom = 0.4;

const MAX_ITERATIONS = 100;
const MAX_DRAW_RANGE = 8;
const MAX_DRAW_RANGE_SQ = MAX_DRAW_RANGE * MAX_DRAW_RANGE;
const MAX_MANDELS = 100;
const MAX_ORBITS = 10;

// used for scaling iterations into colors
const COLOR_CYCLES = 2;

document.addEventListener('DOMContentLoaded', function () {
    const regl = REGL({
        //extensions: ['OES_texture_float'],
        // optionalExtensions: ['oes_texture_float_linear'],
    });

    const mandels = [
        0, 0, 1
    ]

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

    let enabled = false;

    let isClicking = false;

    const updatePosition = (e: any) => {
        let eventX, eventY;

        if (e.changedTouches && e.changedTouches.length > 0) {
            eventX = e.changedTouches[0].clientX;
            eventY = e.changedTouches[0].clientY;
        }
        else {
            eventX = e.clientX;
            eventY = e.clientY;
        }

        const x = (eventX / resizer.screenWidth - 0.5) * resizer.graphWidth + graphX;
        const y = -(eventY / resizer.screenHeight - 0.5) * resizer.graphHeight + graphY;
        mandels[mandels.length - 3] = x;
        mandels[mandels.length - 2] = y;

        needsRender = true;
    }

    const enableIt = (e: any) => {
        e.preventDefault();
        enabled = true;

        if (!isClicking) {
            isClicking = true;
            mandels.push(0);
            mandels.push(0);
            mandels.push(0.01 / graphZoom);

            updatePosition(e);
        }
    };
    const disableIt = (e: any) => {
        isClicking = false;
        e.preventDefault();
        enabled = false
    };
    const moveIt = (e: any) => {
        e.preventDefault();
        if (!enabled) return false;

        updatePosition(e);
    };

    document.body.addEventListener('mousedown', enableIt);
    document.body.addEventListener('touchstart', enableIt);

    document.body.addEventListener('mouseout', disableIt);
    document.body.addEventListener('mouseup', disableIt);
    document.body.addEventListener('touchend', disableIt);
    document.body.addEventListener('touchleave', disableIt);
    document.body.addEventListener('touchcancel', disableIt);

    document.body.addEventListener('mousemove', moveIt);
    document.body.addEventListener('touchmove', moveIt);

    const draw = regl({
        frag: `
    precision highp float;
    uniform float graphWidth;
    uniform float graphHeight;
    uniform float graphX;
    uniform float graphY;
    uniform int mandelsLength;
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

    void insertOrbit(inout vec3 orbits[${MAX_ORBITS}], inout vec3 fromMandels[${MAX_ORBITS}], int nextOrbitCount, vec3 orbit, vec3 fromMandel) {
        for(int i=${MAX_ORBITS}-1; i >= 0; i--) {
            if (i <= nextOrbitCount) {
                if (i == nextOrbitCount || i == 0 || orbits[i-1].z < orbit.z) {
                    orbits[i] = orbit;
                    fromMandels[i] = fromMandel;
                    return;
                }

                orbits[i] = orbits[i-1];
                fromMandels[i] = fromMandels[i-1];
            }
        }
    }

    int multiOrbitMandel(vec2 c) {
        vec2 ztemp;
        int mandelIndex;
        vec3 man;
        vec2 zc;
        vec2 dv;
        float distanceSq;

        vec3 orbits[${MAX_ORBITS}];
        vec3 nextOrbits[${MAX_ORBITS}];

        vec3 fromMandels[${MAX_ORBITS}];
        vec3 nextFromMandels[${MAX_ORBITS}];

        vec3 orbit;
        int orbitCount;
        int nextOrbitCount = 0;

        for(int i=0; i<${MAX_MANDELS}; i++) {
            if(i >= mandelsLength) break;

            // TODO: almost entirely copypasta from below
            dv = mandels[i].xy - c;
            if(quickCheckWithinRange(dv, mandels[i].z, ${MAX_DRAW_RANGE}.)) {
                distanceSq = (dv.x*dv.x+dv.y*dv.y)/mandels[i].z/mandels[i].z;
                if (distanceSq <= ${MAX_DRAW_RANGE_SQ}.) {
                    insertOrbit(nextOrbits, nextFromMandels, nextOrbitCount, vec3(c, distanceSq), mandels[i]);
                    if (nextOrbitCount < ${MAX_ORBITS}) nextOrbitCount++;
                }
            }
        }

        for(int i=1; i <= ${MAX_ITERATIONS}; i++) {
            orbitCount = nextOrbitCount;

            for(int j=0; j < ${MAX_ORBITS}; j++) {
                if (j >= nextOrbitCount) break;

                orbits[j] = nextOrbits[j];
                fromMandels[j] = nextFromMandels[j];
            }

            nextOrbitCount = 0;
            for(int j=0; j < ${MAX_ORBITS}; j++) {
                if (j >= orbitCount) break;

                orbit = orbits[j];
                man = fromMandels[j];

                ztemp = (orbit.xy - man.xy)/man.z;
                zc = (c - man.xy)/man.z;
                ztemp = vec2(ztemp.x*ztemp.x - ztemp.y*ztemp.y + zc.x, (ztemp.x+ztemp.x)*ztemp.y + zc.y);
                ztemp = ztemp*man.z + man.xy;

                for(int k=0; k < ${MAX_MANDELS}; k++) {
                    if(k >= mandelsLength) break;

                    dv = mandels[k].xy - ztemp;
                    if(quickCheckWithinRange(dv, mandels[k].z, ${MAX_DRAW_RANGE}.)) {
                        distanceSq = (dv.x*dv.x+dv.y*dv.y)/mandels[k].z/mandels[k].z;
                        if (distanceSq <= ${MAX_DRAW_RANGE_SQ}.) {
                            insertOrbit(nextOrbits, nextFromMandels, nextOrbitCount, vec3(ztemp, distanceSq), mandels[k]);
                            if (nextOrbitCount < ${MAX_ORBITS}) nextOrbitCount++;
                        }
                    }
                }
            }

            if (nextOrbitCount == 0) return i;
        }

        return 0;
    }

    void main() {
        // These transformations can hypothetically happen in the vertex, but that means when you're running up against the
        // lower bounds of floats you'll get the edges wobbling back and forth as you zoom because the rounding errors are
        // happening during the plane interpolation step. Keeping the vertex ranging from -0.5 to 0.5 dodges that issue.
        vec2 c = vec2(graphX, graphY) + uv * vec2(graphWidth, graphHeight);
        int iterations = multiOrbitMandel(c);

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
            mandelsLength: (context, props) => (props as any).mandels.length
        },

        depth: { enable: false },

        count: 4,

        primitive: 'triangle strip'
    })

    //let seenFocus = false;
    let lastTime = performance.now();
    regl.frame(() => {
        const thisTime = performance.now();

        // dTime always assumes between 1 and 144 fps
        const dTime = Math.min(1000, Math.max(1000 / 144, thisTime - lastTime));

        lastTime = thisTime;

        // It burns a lot of juice running this thing so cool it while it's not in the very foreground
        // if (document.hasFocus() && document.visibilityState == "visible") {
        //     seenFocus = true;
        // } else if (seenFocus) {
        //     // only skip rendering if focus has been confirmed at least once
        //     return;
        // }

        if (isClicking) {
            mandels[mandels.length - 1] *= 1 + (0.001 * dTime);
            needsRender = true;
        }

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
                mandels: mandels,
                mandelsLength: mandels.length
            })
        }
        needsRender = false;
    })
}, false);

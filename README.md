# Mandel4

[![ezgif-4-193528e37b59_big](https://user-images.githubusercontent.com/39782/112776741-5160f400-8ff5-11eb-85c8-a52d64bd3105.gif)](https://jcwilk.github.io/mandel4/?x=-1.4009384862973393&y=0.000025278329139181267&z=202.47925091691644)

The fourth iteration of my mandelbrot explorers, this time giving `regl` with VSCode a shot. The driving feature of this one is continuous iteration. While you're moving around it keeps you at a minimum iteration level (currently 100) and then while you sit still it continues increasing the iterations by 1 every frame indefinitely. It also automatically keeps track of your location in the browser's URL bar for easy deep linking.

As far as I know, it works on every modern browser and platform that has a reasonable amount of WebGL 1.0 support. Mobile browsers tend to have a bit more of a limitation around how much precision they're willing to use with offscreen rendering so you'll run out of "zoom" quicker on mobile and may see some interesting artifacts at high zoom and iteration levels.

It's configured to build into `docs` which is under version control for the purposes of being able to easily serve this from github pages.

## Commands:

-   `npm run build` - starts build procedure for production and deletes all old builds (these are checked in for Github Pages under /docs)
-   `npm run dev` - start watching for files and serving from localhost:8000

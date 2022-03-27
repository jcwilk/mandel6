# Mandel6

The 6th iteration of my mandelbrot fiddlings. This time I'm taking the overlapping stuff I arrived at in mandel5 and bringing it into webgl ideally with being able to click/tap to create mandels arbitrarily.

At time of writing I'm still stripping down stuff from mandel4. Added auto-building via [James Ives' excellent gh pages deploy action](https://github.com/JamesIves/github-pages-deploy-action) yay free, effortless github hosting

## Commands:

-   `npm run build` - starts build procedure for production and deletes all old builds (these are checked in for Github Pages under /docs)
-   `npm run dev` - start watching for files and serving from localhost:8000

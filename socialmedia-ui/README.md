# socialmedia-ui

> **Note:** the React frontend source for this project is **not present in this
> repository.** Only the Firebase Hosting configuration (`firebase.json`) is
> retained here to document how the frontend was deployed.

The original client was a Create React App project (React 16, Material-UI v3,
Redux, `axios`) that talked to the Cloud Functions API in
[`../socialmedia-functions`](../socialmedia-functions). Its source was never
committed to this repository — only its `package.json` and `package-lock.json`
were, and those have been removed because a lockfile with no code behind it
produced ~170 false Dependabot security alerts for a dependency tree that is
never installed, built, or served.

The backend in `../socialmedia-functions` is complete and is the working part of
this project.

## Deployment (historical)

`firebase.json` configures Firebase Hosting to serve a production build from a
`build/` directory and rewrite all routes to `index.html` for client-side
routing:

```sh
npm run build
firebase deploy --only hosting
```

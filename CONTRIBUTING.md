## Code style

### EditorConfig

This project has a [.editorconfig file](.editorconfig). See [http://editorconfig.org/](http://editorconfig.org/) for details and to install the plugin for your editor / IDE.

### Running the tests

1. `npm run deps` to install all dependencies
2. `npm test` to actually run the tests

## Docs generation

[README.md](README.md) is generated based on [docs/README.hbs](docs/README.hbs) and the JSDoc comments in [app/updater.js](app/updater.js). When changing the readme / API, make sure to run `grunt docs` before committing.

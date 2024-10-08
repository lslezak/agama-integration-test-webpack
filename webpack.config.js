const path = require("path");
const fs = require("fs");
const webpack = require("webpack");

// process all ./src/test_*.ts files
const entry = {}
fs.readdirSync("./src").filter(f => f.startsWith("test_") && f.endsWith(".ts")).forEach(
  (f) => { entry[path.basename(f, ".ts")] = "./src/" + f }
);

module.exports = {
  target: "node",
  entry,
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "dist"),
    clean: true
  },
  devtool: "source-map",
  optimization: {
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: "vendor",
          chunks: "all",
        },
      },
    },
  },
  plugins: [
    // ignore the webpack warnings about the dynamic imports in yargs module,
    // it is used in the browser download code in puppeteer which is never used
    // by the integration tests as we use the system browser
    new webpack.ContextReplacementPlugin(
      /\/(yargs|yargs-parser)\//,
      (data) => {
        data.dependencies.forEach((d) => delete d.critical);
        return data;
      },
    ),
    // prepend a hashbang at the beginning of the generated file
    new webpack.BannerPlugin({ banner: "#! /usr/bin/env node", raw: true, test: /^test_.*\.js$/ }),
    // make the test JS files executable
    function() {
      this.hooks.done.tap("Change permissions", (data) => {
        Object.keys(data.compilation.assets).forEach((file) => {
          if (file.match(/^test_.*\.js$/)) {
            fs.chmodSync(`${__dirname}/dist/${file}`, 0o755);
          }
        });
      });
    },
  ],
};

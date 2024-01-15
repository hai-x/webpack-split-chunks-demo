const path = require("path");
const fs = require("fs");
const pLimit = require("p-limit");
const arg = require("arg");
const webpack = require("webpack");
const colors = require('colors')
require('del').sync(['dist/*'])

const combs = {
  'disable': false, 'default': undefined, 'chunksAll': {
    chunks: 'all',
  },
  'reuseExistingChunk': {
    cacheGroups: {
      reuseExistingChunk: {
        test: /src[\\/]reuseExistingChunk[\\/]a/,
        minChunks: 1,
        priority: 1,
        minSize: 1,
        reuseExistingChunk: false
      }
    }
  },
  'maxAsyncRequests': {
    maxAsyncRequests: 1,
  }
}

function createConfig(k, v) {
  /** @type {import("webpack").Configuration} */
  const config = {
    entry: {
      main: `./src/${k}/index.js`,
    },
    plugins: [
    ],
    module: {
      rules: [

      ],
    },
    output: {
      filename: "[name].[contenthash].js",
      chunkFilename: "[name].[contenthash].chunk.js",
      path: path.resolve(__dirname, `dist/${k}`),
    },
    optimization: {
      runtimeChunk: false,
      minimize: false,
      splitChunks: v
    },
  };
  return config;
}

const limit = pLimit(10);

const run = (k,
  /** @type {import("webpack").Compiler} */
  compiler
) => {
  compiler.run((err, stats) => {
    if (err) {
      console.log(colors.red(`${k} splitChunks bundle failed`));
      console.error(err)
    } else {
      console.log(colors.green(`🚀 ${k} splitChunks bundle success`));
    }
  })
}

(async function main() {
  const args = arg({ "--single": String });
  const single = args["--single"];

  if (single) {
    const comb = combs[single];
    const compiler = webpack(createConfig(single, comb));
    run(single, compiler)
  } else {
    const results = await Promise.all(
      Object.entries(combs).map(([k, v], index) =>
        limit(async () => {
          const compiler = webpack(createConfig(k, v));
          run(k, compiler)
        })
      )
    );
  }
})();


const path = require("path");

const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const FileManagerPlugin = require("filemanager-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");

const buildPath = path.resolve(__dirname, "docs");

const pages = require("./pages");

module.exports = (env, argv) => {

    return {

        // This option controls if and how source maps are generated.
        // https://webpack.js.org/configuration/devtool/
        devtool: argv.mode == "production" ? "source-map" : "inline-source-map",

        // https://webpack.js.org/concepts/entry-points/#multi-page-application
        entry: (() => {
            const entries = {};
            for (let page of pages) {
                const { name } = page;
                entries[name] = `./src/js/${name}.js`;
            }
            return entries;
        })(),

        // how to write the compiled files to disk
        // https://webpack.js.org/concepts/output/
        output: {
            filename: argv.mode == "production" ? `js/[name].[contenthash].min.js` : `js/[name].js`,
            path: `${buildPath}`,
            clean: true
        },

        // https://webpack.js.org/concepts/loaders/
        module: {
            rules: [
                {
                    // https://webpack.js.org/loaders/css-loader/#root
                    test: /\.css$/i,
                    use: [
                        MiniCssExtractPlugin.loader,
                        "css-loader"
                    ]
                },
                {
                    // https://webpack.js.org/guides/asset-modules/#resource-assets
                    test: /\.(png|jpe?g|gif|svg)$/i,
                    type: "asset/resource"
                },
                {
                    // https://webpack.js.org/guides/asset-modules/#replacing-inline-loader-syntax
                    resourceQuery: /raw/,
                    type: "asset/source"
                },
                {
                    // https://webpack.js.org/loaders/html-loader/#usage
                    resourceQuery: /template/,
                    loader: "html-loader"
                }
            ]
        },

        // https://webpack.js.org/concepts/plugins/
        plugins: (() => {
            const plugins = [new MiniCssExtractPlugin({
                filename: `css/[name].css`
            })];
            for (let page of pages) {
                const { name } = page;
                plugins.push(new HtmlWebpackPlugin({
                    template: `./src/pages/${name}.html`,
                    inject: true,
                    chunks: [name],
                    filename: `${name}.html`
                }));
            };

            plugins.push(new CopyPlugin({
                patterns: [
                    { from: "./src/data", to: "data" },
                    { from: "./src/templates", to: "templates" },
                ],
            })
            );


            plugins.push(new FileManagerPlugin({
                events: {
                    onStart: {
                        delete: ["./docs"]
                    },
                    /*
                    onEnd: {
                        copy: [
                            { source: "./src/data/**", destination: "./docs/data" },
                            { source: "./src/template/**", destination: "./docs/template" },
                        ]
                    }*/
                },
                runTasksInSeries: true,
                runOnceInWatchMode: true
            }));
            return plugins;
        })(),
        // https://webpack.js.org/configuration/optimization/
        optimization: {
            minimize: argv.mode == "production",
            minimizer: [
                // https://webpack.js.org/plugins/terser-webpack-plugin/
                new TerserPlugin({
                    parallel: true
                }),
                // https://webpack.js.org/plugins/mini-css-extract-plugin/#minimizing-for-production
                new CssMinimizerPlugin()
            ]
        },
        devServer: {
            allowedHosts: "all",
            client: {
                overlay: true,
                progress: true,
                reconnect: true
            },
            devMiddleware: {
                index: true,
                writeToDisk: true
            },
            static: ["docs"],
            watchFiles: { paths: ["src/**/*"]}
        }
    }
};
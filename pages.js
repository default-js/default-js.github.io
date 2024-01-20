const config = [
    { 
        "type": "page",
        "name": "docu-app",
        "preBuildStep" : "pre-build-step/index.js"

    },
    { 
        "type": "page",
        "name": "example-dogspage",
        "path" : "examples/dogspage"
    }
];

export default config;
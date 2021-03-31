const path = require('path');

module.exports = {
    entry: './assets/index.js',
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, './polls/static/polls'),
    },
    resolve: {
        modules: [
            path.resolve(__dirname, 'node_modules')
        ]
    }
};

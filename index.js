
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var express = require('express');
var getRawBody = require('raw-body');

var config = require('./config');
var driver = require('./driver');

config.init('./state');

var app = express();

var port = process.env.PORT || 3015;
var local_addr = process.env.BINDIP || '127.0.0.1';

var router = express.Router();

app.use(function (req, res, next) {
    getRawBody(req, {
            length: req.headers['content-length'],
            limit: '1mb',
            encoding: 'utf8',
        }, function (err, string) {
            if (err) return next(err)
            try {
                req.body = JSON.parse(string);
            } catch (e) {
                req.body = null;
            }
            next();
        });
});

app.use(function (req, res, next) {
    console.log('');
    console.log('url:    ', req.url);
    console.log('body:   ', req.body);
    next()
});

app.use(function (req, res, next) {
    var json = res.json;

    res.json = function () {
        console.log('res:    ', arguments[0]);
        json.apply(res, arguments);
    };

    next();
});


Object.keys(driver.call_map).forEach(function (call) {
    var func = driver.call_map[call];

    app.post(call, function(req, res) {
        func(req.body)
            .then(function (res_data) {
                res.json(res_data);
            })
            .catch(function (err) {
                res.json({Err: err.toString()});
            });
    });
});

app.use(function (req, res, next) {
    res.status(404).json({});
})

app.listen(port, function () {
    console.log('started ' + port);
});




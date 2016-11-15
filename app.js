'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var db = mongoose.connection;

//Database init
mongoose.connect('mongodb://localhost/concly-api');

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
	console.log("Connected to database");

});

// Webserver parameter - doesn't really matter with iisnode
const PORT = process.env.PORT || 8445;

var app = express();
app.use(bodyParser.json());
require('./routes')(app);

app.listen(PORT);
console.log('Listening on: ' + PORT );

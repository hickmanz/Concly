var express = require('express');
var bodyParser = require('body-parser');

module.exports = function (app) {
	
	app.use(bodyParser.json());

	app.use(express.static(__dirname + "/public"));
	app.use('/js', express.static(__dirname + '/public/js'));
	app.use('/dist', express.static(__dirname + '/../dist'));
	app.use('/css', express.static(__dirname + '/public/css'));
	app.use('/assets', express.static(__dirname + '/public/assets'));
	app.use('/components', express.static(__dirname + '/public/components'));
	app.use('/images', express.static(__dirname + '/public/images'));
	app.use('/partials', express.static(__dirname + '/public/partials'));

	app.all('/', function (req, res, next) {
		// Just send the index.html for other files to support HTML5Mode
		res.sendFile('/public/index.html', { root: __dirname });
	});
}